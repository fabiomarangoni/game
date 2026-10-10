'use strict';

/** Utilidades de acesso HTTP aos sites de origem. */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

/** Erro de um site de origem, com status HTTP e código estável para a resposta da API. */
class UpstreamError extends Error {
  constructor(status, codigo, message) {
    super(message);
    this.status = status;
    this.codigo = codigo;
  }
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

module.exports = { USER_AGENT, UpstreamError, fetchWithTimeout, cookieHeaderFrom };
