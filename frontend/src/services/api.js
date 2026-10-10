/**
 * Integração com o Web Service (backend).
 *
 * O endereço da API vem de window.TIBIA_API_BASE, definido em config.js,
 * que o build gera a partir da variável API_BASE_URL (veja .env.example).
 */

const API_BASE = String(window.TIBIA_API_BASE || '').replace(/\/$/, '');
const API_TIMEOUT_MS = 90000; // o plano gratuito do Render pode levar ~1 min para "acordar"

/** Chama uma rota da API e devolve o JSON. Em falha, lança Error com uma mensagem para o usuário. */
async function callApi(pathAndQuery) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(API_BASE + pathAndQuery, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('O servidor não respondeu em 90 segundos. Tente de novo em instantes.');
    throw new Error('Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.');
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await resp.json(); } catch (e) { /* resposta sem JSON */ }
  if (!resp.ok || !data || data.ok !== true) {
    throw new Error(data && data.erro ? data.erro : `O servidor respondeu com erro ${resp.status}.`);
  }
  return data;
}

/** tibialegado_getTCValue — preço de 250 TC no Rei dos Coins. */
export function getTCValue() {
  return callApi('/api/tibialegado_getTCValue');
}

/** tibialegado_getAvgCoinValue — "Média Preço Venda" do servidor no TibiaTrade. */
export function getAvgCoinValue(servidor) {
  return callApi('/api/tibialegado_getAvgCoinValue?servidor=' + encodeURIComponent(servidor));
}
