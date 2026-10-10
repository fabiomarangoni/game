'use strict';

/**
 * Conversor de Tibia Coins — servidor web.
 *
 * Entrega a página (index.html) e duas rotas que buscam preços em outros sites:
 *   GET /api/preco-250tc              → preço de 250 Tibia Coins no Rei dos Coins (R$)
 *   GET /api/tc-servidor?servidor=X   → "Média Preço Venda" do servidor X no TibiaTrade (gold por TC)
 *   GET /api/health                   → verificação de saúde (usada pelo Render)
 *
 * O navegador não consegue ler esses sites diretamente (bloqueio entre domínios),
 * por isso a busca é feita aqui no servidor.
 */

const path = require('node:path');
const express = require('express');

const DEFAULTS = {
  port: Number(process.env.PORT) || 3000,
  reiDosCoinsBase: process.env.REIDOSCOINS_BASE || 'https://www.reidoscoins.com.br',
  tibiaTradeBase: process.env.TIBIATRADE_BASE || 'https://tibiatrade.gg',
  cacheTtlMs: Number(process.env.CACHE_TTL_MS) || 10 * 60 * 1000,
  timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS) || 20 * 1000,
  allowOrigin: process.env.ALLOW_ORIGIN || '*',
};

const QTD_TC = 250;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

/* ---------------------------------------------------------------- utilidades */

class UpstreamError extends Error {
  constructor(status, codigo, message) {
    super(message);
    this.status = status;
    this.codigo = codigo;
  }
}

/** "R$52,08" ou "R$ 1.052,08" → 52.08 / 1052.08 */
function parseBRL(text) {
  const clean = String(text || '').replace(/<[^>]*>/g, ' ');
  const m = /R\$\s*([\d.]+,\d{2})/.exec(clean);
  if (!m) return NaN;
  return Number(m[1].replace(/\./g, '').replace(',', '.'));
}

/** Junta os cookies de uma resposta no formato do cabeçalho "Cookie". */
function cookieHeaderFrom(response) {
  const list = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') || '').split(/,(?=\s*[^;,=\s]+=)/);
  return list
    .map((c) => c.split(';')[0].trim())
    .filter((c) => c && c.includes('='))
    .join('; ');
}

async function fetchWithTimeout(url, options, timeoutMs) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new UpstreamError(504, 'tempo_esgotado', 'O site demorou demais para responder.');
    }
    throw new UpstreamError(502, 'site_indisponivel', 'Não foi possível conectar ao site.');
  }
}

/** Cache em memória com deduplicação de buscas simultâneas. */
function createCache(ttlMs) {
  const store = new Map();
  return async function cached(key, loader) {
    const hit = store.get(key);
    const now = Date.now();
    if (hit && hit.value && now - hit.at < ttlMs) return { ...hit.value, cache: true };
    if (hit && hit.pending) return { ...(await hit.pending), cache: false };
    const pending = loader();
    store.set(key, { pending });
    try {
      const value = await pending;
      store.set(key, { value, at: Date.now() });
      return { ...value, cache: false };
    } catch (err) {
      store.delete(key);
      throw err;
    }
  };
}

/* ------------------------------------------------------------ Rei dos Coins */

/**
 * Reproduz o que a página do Rei dos Coins faz ao mudar a quantidade:
 *  1. abre a página do produto (gera uma sessão e um token "tp" ligado a ela);
 *  2. envia quantidade=250 para a rota interna de recálculo, com o mesmo cookie de sessão.
 */
async function buscarPrecoReiDosCoins(cfg) {
  const pageUrl = `${cfg.reiDosCoinsBase}/Tibia/Tibia-Coins`;
  const baseHeaders = {
    'User-Agent': USER_AGENT,
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  };

  const page = await fetchWithTimeout(pageUrl, {
    headers: { ...baseHeaders, Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
  }, cfg.timeoutMs);
  if (!page.ok) {
    throw new UpstreamError(502, 'site_indisponivel', `O Rei dos Coins respondeu com erro ${page.status}.`);
  }
  const html = await page.text();
  const cookie = cookieHeaderFrom(page);

  const tp = (/id=["']code520_tp["'][^>]*value=["']([^"']+)["']/i.exec(html) ||
              /value=["']([^"']+)["'][^>]*id=["']code520_tp["']/i.exec(html) || [])[1];
  const productId = (/id=["']code_product_id["'][^>]*value\s*=\s*["'](\d+)["']/i.exec(html) ||
                     /name=["']product_id["'][^>]*value=["'](\d+)["']/i.exec(html) || [])[1];
  if (!tp || !productId) {
    throw new UpstreamError(502, 'layout_alterado',
      'Não encontrei os dados do produto na página do Rei dos Coins. O site pode ter mudado.');
  }

  const body = new URLSearchParams({ options: '', quantity: String(QTD_TC), product_id: productId, tp });
  const resp = await fetchWithTimeout(`${cfg.reiDosCoinsBase}/index.php?route=product/product/code_atualizar`, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: cfg.reiDosCoinsBase,
      Referer: pageUrl,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body.toString(),
  }, cfg.timeoutMs);
  const text = await resp.text();

  if (/n[ãa]o autorizado/i.test(text)) {
    throw new UpstreamError(502, 'nao_autorizado', 'O Rei dos Coins recusou a consulta de preço (sessão não autorizada).');
  }
  let json;
  try { json = JSON.parse(text); } catch {
    throw new UpstreamError(502, 'resposta_invalida', 'O Rei dos Coins devolveu uma resposta inesperada.');
  }
  const precoTexto = json.special || json.price;
  const valor = parseBRL(precoTexto);
  if (!(valor > 0)) {
    throw new UpstreamError(502, 'preco_nao_encontrado', 'O Rei dos Coins não informou o preço.');
  }
  if (valor < 10 || valor > 500) {
    throw new UpstreamError(502, 'valor_fora_do_esperado',
      `O valor lido (R$ ${valor.toFixed(2).replace('.', ',')}) parece fora do esperado para 250 TC.`);
  }
  return {
    ok: true,
    fonte: 'Rei dos Coins',
    quantidade: QTD_TC,
    valor,
    valorTexto: String(precoTexto).replace(/<[^>]*>/g, '').trim(),
    consultadoEm: new Date().toISOString(),
  };
}

/* --------------------------------------------------------------- TibiaTrade */

/** Lista de preços de todos os servidores, como a página tc-to-gold carrega. */
async function buscarTabelaTibiaTrade(cfg) {
  const url = `${cfg.tibiaTradeBase}/trpc/tibiaCoinPrice.list?batch=1&input=%7B%7D`;
  const resp = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      Referer: `${cfg.tibiaTradeBase}/pt/tc-to-gold`,
    },
  }, cfg.timeoutMs);
  if (!resp.ok) {
    throw new UpstreamError(502, 'site_indisponivel', `O TibiaTrade respondeu com erro ${resp.status}.`);
  }
  let json;
  try { json = await resp.json(); } catch {
    throw new UpstreamError(502, 'resposta_invalida', 'O TibiaTrade devolveu uma resposta inesperada.');
  }
  const root = Array.isArray(json) ? json[0] : json;
  const prices = root && root.result && root.result.data && root.result.data.prices;
  if (!Array.isArray(prices) || prices.length === 0) {
    throw new UpstreamError(502, 'layout_alterado', 'A tabela de preços do TibiaTrade veio vazia ou em outro formato.');
  }
  return { prices, consultadoEm: new Date().toISOString() };
}

/* ------------------------------------------------------------------ app */

function createApp(overrides = {}) {
  const cfg = { ...DEFAULTS, ...overrides };
  const cached = createCache(cfg.cacheTtlMs);
  const app = express();
  app.disable('x-powered-by');

  app.use('/api', (req, res, next) => {
    if (cfg.allowOrigin) res.set('Access-Control-Allow-Origin', cfg.allowOrigin);
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.get('/api/preco-250tc', async (req, res) => {
    try {
      let result;
      try {
        result = await cached('reidoscoins', () => buscarPrecoReiDosCoins(cfg));
      } catch (err) {
        // Sessão recusada: tenta uma vez com uma sessão nova.
        if (err instanceof UpstreamError && err.codigo === 'nao_autorizado') {
          result = await cached('reidoscoins', () => buscarPrecoReiDosCoins(cfg));
        } else {
          throw err;
        }
      }
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/tc-servidor', async (req, res) => {
    const servidor = String(req.query.servidor || '').trim();
    if (!/^[A-Za-zÀ-ÿ]{2,30}$/.test(servidor)) {
      return res.status(400).json({ ok: false, codigo: 'servidor_invalido', erro: 'Informe o nome do servidor (ex.: Descubra).' });
    }
    try {
      const tabela = await cached('tibiatrade', () => buscarTabelaTibiaTrade(cfg));
      const linha = tabela.prices.find((p) => String(p.world_name).toLowerCase() === servidor.toLowerCase());
      if (!linha) {
        return res.status(404).json({ ok: false, codigo: 'servidor_nao_encontrado', erro: `O servidor ${servidor} não aparece na tabela do TibiaTrade.` });
      }
      const valor = Number(linha.sell_average_price);
      if (!(valor >= 1000 && valor <= 500000)) {
        throw new UpstreamError(502, 'valor_fora_do_esperado', `O valor lido para ${linha.world_name} (${valor}) parece fora do esperado.`);
      }
      res.json({
        ok: true,
        fonte: 'TibiaTrade',
        servidor: linha.world_name,
        mediaPrecoVenda: valor,
        atualizadoEm: linha.created_at || null,
        consultadoEm: tabela.consultadoEm,
        cache: tabela.cache,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.use('/api', (req, res) => res.status(404).json({ ok: false, codigo: 'rota_inexistente', erro: 'Rota não encontrada.' }));

  // Página
  const pagePath = path.join(__dirname, 'index.html');
  app.get(['/', '/index.html'], (req, res) => res.sendFile(pagePath));

  return app;
}

function sendError(res, err) {
  if (err instanceof UpstreamError) {
    return res.status(err.status).json({ ok: false, codigo: err.codigo, erro: err.message });
  }
  console.error(err);
  res.status(500).json({ ok: false, codigo: 'erro_interno', erro: 'Erro interno no servidor.' });
}

if (require.main === module) {
  const app = createApp();
  app.listen(DEFAULTS.port, () => {
    console.log(`Conversor de Tibia Coins ouvindo na porta ${DEFAULTS.port}`);
  });
}

module.exports = { createApp, parseBRL, cookieHeaderFrom };
