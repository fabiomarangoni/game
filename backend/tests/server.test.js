'use strict';

/**
 * Testes dos webservices com simuladores dos dois sites.
 *
 * Os simuladores reproduzem o comportamento observado nos sites reais em 10/10/2026:
 *  - Rei dos Coins: a página cria uma sessão (cookie) e um token "tp" ligado a ela; a rota de
 *    recálculo só devolve o preço com o cookie e o tp da mesma sessão, senão responde
 *    "Não autorizado! (B)". Preço real observado para 250 TC: R$52,08.
 *  - TibiaTrade: /trpc/tibiaCoinPrice.list devolve a tabela de todos os servidores
 *    (fixture com dados reais capturados).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../src/server');
const { parseBRL } = require('../src/services/reiDosCoinsService');

const TT_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'tibiatrade-prices.json'), 'utf8');

function listen(handlerOrApp) {
  return new Promise((resolve) => {
    const server = http.createServer(handlerOrApp);
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}
const close = (s) => new Promise((r) => s.close(r));
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });

/** Simulador do Rei dos Coins. mode: 'normal' | 'sempre_nao_autorizado' | 'layout_alterado' | 'erro_500' */
function reiDosCoinsMock(state) {
  const sessions = new Map(); // sid -> tp
  return async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/Tibia/Tibia-Coins') {
      state.pageHits++;
      if (state.mode === 'erro_500') { res.writeHead(500); return res.end('erro'); }
      const sid = crypto.randomBytes(8).toString('hex');
      const tp = crypto.randomBytes(16).toString('hex');
      sessions.set(sid, tp);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': [`OCSESSID=${sid}; path=/; HttpOnly`, 'language=pt-br; path=/'],
      });
      const produto = state.mode === 'layout_alterado'
        ? '<div>página nova</div>'
        : `<h2 id="code_price">R$5,22</h2><span id="code_product_id" value = "195"></span>
           <input type="text" name="option[431]" value="" placeholder="Nome Do Personagem" id="input-option431" class="form-control" />
           <input type="text" name="quantity" value="25" id="quantity_bar" class="irs-hidden-input" />
           <input type="hidden" id="code520_tp" value="${tp}" />`;
      return res.end(`<!doctype html><html><body><div id="product">${produto}</div></body></html>`);
    }
    if (req.method === 'POST' && url.pathname === '/index.php' && url.searchParams.get('route') === 'product/product/code_atualizar') {
      state.postHits++;
      const form = new URLSearchParams(await readBody(req));
      state.lastForm = Object.fromEntries(form);
      const sid = (/OCSESSID=([0-9a-f]+)/.exec(req.headers.cookie || '') || [])[1];
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (state.mode === 'sempre_nao_autorizado' || !sid || sessions.get(sid) !== form.get('tp') || form.get('product_id') !== '195') {
        return res.end('Não autorizado! (B)');
      }
      const qtd = Number(form.get('quantity'));
      const preco = qtd === 250 ? 'R$52,08' : qtd === 25 ? 'R$5,21' : 'R$0,00';
      return res.end(JSON.stringify(state.special ? { price: 'R$60,00', special: preco, preco_unidade: 0 } : { price: preco, preco_unidade: 0 }));
    }
    res.writeHead(404); res.end();
  };
}

function tibiaTradeMock(state) {
  return (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/trpc/tibiaCoinPrice.list') {
      state.hits++;
      if (state.mode === 'vazio') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('[{"result":{"data":{"prices":[]}}}]'); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(TT_FIXTURE);
    }
    res.writeHead(404); res.end();
  };
}

async function setup({ rdc = {}, tt = {}, cfg = {} } = {}) {
  const rdcState = { mode: 'normal', pageHits: 0, postHits: 0, ...rdc };
  const ttState = { mode: 'normal', hits: 0, ...tt };
  const rdcSrv = await listen(reiDosCoinsMock(rdcState));
  const ttSrv = await listen(tibiaTradeMock(ttState));
  const app = createApp({ reiDosCoinsBase: rdcSrv.base, tibiaTradeBase: ttSrv.base, timeoutMs: 3000, ...cfg });
  const appSrv = await listen(app);
  const get = async (p) => {
    const r = await fetch(appSrv.base + p);
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, headers: r.headers, body: ct.includes('json') ? await r.json() : await r.text() };
  };
  const teardown = () => Promise.all([close(rdcSrv.server), close(ttSrv.server), close(appSrv.server)]);
  return { get, rdcState, ttState, teardown };
}

/* ------------------------------------------------------------ Rei dos Coins */

test('tibialegado_getTCValue (Rei dos Coins): devolve o preço de 250 TC usando a sessão e o token da página', async () => {
  const t = await setup();
  try {
    const r = await t.get('/api/tibialegado_getTCValue');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.valor, 52.08);
    assert.equal(r.body.quantidade, 250);
    assert.equal(r.body.valorTexto, 'R$52,08');
    assert.equal(r.body.fonte, 'Rei dos Coins');
    assert.equal(r.body.cache, false);
    assert.equal(t.rdcState.lastForm.quantity, '250');
    assert.equal(t.rdcState.lastForm.product_id, '195');
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
  } finally { await t.teardown(); }
});

test('tibialegado_getTCValue (Rei dos Coins): segunda consulta vem do cache, sem acessar o site', async () => {
  const t = await setup();
  try {
    await t.get('/api/tibialegado_getTCValue');
    const r = await t.get('/api/tibialegado_getTCValue');
    assert.equal(r.body.cache, true);
    assert.equal(r.body.valor, 52.08);
    assert.equal(t.rdcState.pageHits, 1);
    assert.equal(t.rdcState.postHits, 1);
  } finally { await t.teardown(); }
});

test('tibialegado_getTCValue (Rei dos Coins): usa o preço promocional quando existe', async () => {
  const t = await setup({ rdc: { special: true } });
  try {
    const r = await t.get('/api/tibialegado_getTCValue');
    assert.equal(r.body.valor, 52.08);
  } finally { await t.teardown(); }
});

test('tibialegado_getTCValue (Rei dos Coins): "Não autorizado" tenta uma vez com sessão nova e depois devolve erro claro', async () => {
  const t = await setup({ rdc: { mode: 'sempre_nao_autorizado' } });
  try {
    const r = await t.get('/api/tibialegado_getTCValue');
    assert.equal(r.status, 502);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.codigo, 'nao_autorizado');
    assert.match(r.body.erro, /recusou/);
    assert.equal(t.rdcState.pageHits, 2);
  } finally { await t.teardown(); }
});

test('tibialegado_getTCValue (Rei dos Coins): página sem os dados do produto → layout_alterado', async () => {
  const t = await setup({ rdc: { mode: 'layout_alterado' } });
  try {
    const r = await t.get('/api/tibialegado_getTCValue');
    assert.equal(r.status, 502);
    assert.equal(r.body.codigo, 'layout_alterado');
  } finally { await t.teardown(); }
});

test('tibialegado_getTCValue (Rei dos Coins): site com erro 500 → site_indisponivel', async () => {
  const t = await setup({ rdc: { mode: 'erro_500' } });
  try {
    const r = await t.get('/api/tibialegado_getTCValue');
    assert.equal(r.status, 502);
    assert.equal(r.body.codigo, 'site_indisponivel');
  } finally { await t.teardown(); }
});

/* --------------------------------------------------------------- TibiaTrade */

test('tibialegado_getAvgCoinValue (TibiaTrade): devolve a Média Preço Venda do servidor', async () => {
  const t = await setup();
  try {
    const r = await t.get('/api/tibialegado_getAvgCoinValue?servidor=Descubra');
    assert.equal(r.status, 200);
    assert.deepEqual(
      { ok: r.body.ok, servidor: r.body.servidor, valor: r.body.mediaPrecoVenda, data: r.body.atualizadoEm },
      { ok: true, servidor: 'Descubra', valor: 44610, data: '2026-10-10T10:01:11.823Z' },
    );
  } finally { await t.teardown(); }
});

test('tibialegado_getAvgCoinValue (TibiaTrade): nome do servidor sem diferenciar maiúsculas e com cache da tabela', async () => {
  const t = await setup();
  try {
    const a = await t.get('/api/tibialegado_getAvgCoinValue?servidor=descubra');
    const b = await t.get('/api/tibialegado_getAvgCoinValue?servidor=Ombra');
    assert.equal(a.body.mediaPrecoVenda, 44610);
    assert.equal(b.body.mediaPrecoVenda, 44234);
    assert.equal(b.body.cache, true);
    assert.equal(t.ttState.hits, 1);
  } finally { await t.teardown(); }
});

test('tibialegado_getAvgCoinValue (TibiaTrade): servidor que não está na tabela → 404', async () => {
  const t = await setup();
  try {
    const r = await t.get('/api/tibialegado_getAvgCoinValue?servidor=Zunera');
    assert.equal(r.status, 404);
    assert.equal(r.body.codigo, 'servidor_nao_encontrado');
    assert.match(r.body.erro, /Zunera/);
  } finally { await t.teardown(); }
});

test('tibialegado_getAvgCoinValue (TibiaTrade): servidor inválido ou ausente → 400', async () => {
  const t = await setup();
  try {
    assert.equal((await t.get('/api/tibialegado_getAvgCoinValue')).status, 400);
    assert.equal((await t.get('/api/tibialegado_getAvgCoinValue?servidor=' + encodeURIComponent('<script>'))).status, 400);
  } finally { await t.teardown(); }
});

test('tibialegado_getAvgCoinValue (TibiaTrade): tabela vazia → layout_alterado', async () => {
  const t = await setup({ tt: { mode: 'vazio' } });
  try {
    const r = await t.get('/api/tibialegado_getAvgCoinValue?servidor=Descubra');
    assert.equal(r.status, 502);
    assert.equal(r.body.codigo, 'layout_alterado');
  } finally { await t.teardown(); }
});

test('tibialegado_getAvgCoinValue (TibiaTrade): site fora do ar → site_indisponivel', async () => {
  const t = await setup({ cfg: { tibiaTradeBase: 'http://127.0.0.1:1' } });
  try {
    const r = await t.get('/api/tibialegado_getAvgCoinValue?servidor=Descubra');
    assert.equal(r.status, 502);
    assert.equal(r.body.codigo, 'site_indisponivel');
  } finally { await t.teardown(); }
});

/* ------------------------------------------------------------------ geral */

test('Raiz, verificação de saúde e rota inexistente', async () => {
  const t = await setup();
  try {
    const root = await t.get('/');
    assert.equal(root.status, 200);
    assert.ok(root.body.rotas.includes('/api/tibialegado_getTCValue'));
    assert.deepEqual((await t.get('/api/health')).body, { ok: true });
    assert.equal((await t.get('/api/preco-250tc')).status, 404);
    assert.equal((await t.get('/src/server.js')).status, 404);
  } finally { await t.teardown(); }
});

test('parseBRL', () => {
  assert.equal(parseBRL('R$52,08'), 52.08);
  assert.equal(parseBRL('<span>R$ 1.052,08</span>'), 1052.08);
  assert.ok(Number.isNaN(parseBRL('sem preço')));
});
