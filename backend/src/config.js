'use strict';

/** Configuração do backend, lida das variáveis de ambiente (veja .env.example). */
module.exports = {
  port: Number(process.env.PORT) || 3000,
  reiDosCoinsBase: process.env.REIDOSCOINS_BASE || 'https://www.reidoscoins.com.br',
  tibiaTradeBase: process.env.TIBIATRADE_BASE || 'https://tibiatrade.gg',
  cacheTtlMs: Number(process.env.CACHE_TTL_MS) || 10 * 60 * 1000,
  timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS) || 20 * 1000,
  allowOrigin: process.env.ALLOW_ORIGIN || '*',
};
