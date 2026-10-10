'use strict';

/**
 * TibiaTrade — tabela de preço da Tibia Coin em gold por servidor.
 * Usa a mesma fonte que a página https://tibiatrade.gg/pt/tc-to-gold carrega.
 */

const { USER_AGENT, UpstreamError, fetchWithTimeout } = require('./httpClient');

/** Lista de preços de todos os servidores. */
async function getPriceTable(cfg) {
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

/**
 * "Média Preço Venda" (sell_average_price) de um servidor, a partir da tabela.
 * Devolve null quando o servidor não está na tabela.
 */
function findAvgCoinValue(table, servidor) {
  const linha = table.prices.find((p) => String(p.world_name).toLowerCase() === servidor.toLowerCase());
  if (!linha) return null;
  const valor = Number(linha.sell_average_price);
  if (!(valor >= 1000 && valor <= 500000)) {
    throw new UpstreamError(502, 'valor_fora_do_esperado', `O valor lido para ${linha.world_name} (${valor}) parece fora do esperado.`);
  }
  return {
    ok: true,
    fonte: 'TibiaTrade',
    servidor: linha.world_name,
    mediaPrecoVenda: valor,
    atualizadoEm: linha.created_at || null,
    consultadoEm: table.consultadoEm,
  };
}

module.exports = { getPriceTable, findAvgCoinValue };
