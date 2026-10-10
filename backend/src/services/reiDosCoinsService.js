'use strict';

/**
 * Rei dos Coins — preço em R$ de 250 Tibia Coins.
 *
 * Reproduz o que a página do produto faz ao mudar a quantidade:
 *  1. abre a página (o site cria uma sessão e um token "tp" ligado a ela);
 *  2. envia quantity=250 para a rota interna de recálculo, com o mesmo cookie de sessão.
 */

const { USER_AGENT, UpstreamError, fetchWithTimeout, cookieHeaderFrom } = require('./httpClient');

const QTD_TC = 250;

/** "R$52,08" ou "R$ 1.052,08" → 52.08 / 1052.08 */
function parseBRL(text) {
  const clean = String(text || '').replace(/<[^>]*>/g, ' ');
  const m = /R\$\s*([\d.]+,\d{2})/.exec(clean);
  if (!m) return NaN;
  return Number(m[1].replace(/\./g, '').replace(',', '.'));
}

async function getTCValue(cfg) {
  const pageUrl = `${cfg.reiDosCoinsBase}/Tibia/Tibia-Coins`;
  const baseHeaders = { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' };

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

module.exports = { getTCValue, parseBRL, QTD_TC };
