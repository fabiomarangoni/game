'use strict';

/** Controladores das rotas: validação de entrada, cache e formato das respostas. */

const { UpstreamError } = require('../services/httpClient');
const { createCache } = require('../services/cache');
const reiDosCoins = require('../services/reiDosCoinsService');
const tibiaTrade = require('../services/tibiaTradeService');

function sendError(res, err) {
  if (err instanceof UpstreamError) {
    return res.status(err.status).json({ ok: false, codigo: err.codigo, erro: err.message });
  }
  console.error(err);
  return res.status(500).json({ ok: false, codigo: 'erro_interno', erro: 'Erro interno no servidor.' });
}

function createCoinController(cfg) {
  const cached = createCache(cfg.cacheTtlMs);

  /** tibialegado_getTCValue — preço de 250 TC no Rei dos Coins. */
  async function getTCValue(req, res) {
    try {
      let result;
      try {
        result = await cached('reidoscoins', () => reiDosCoins.getTCValue(cfg));
      } catch (err) {
        // Sessão recusada: tenta uma vez com uma sessão nova.
        if (err instanceof UpstreamError && err.codigo === 'nao_autorizado') {
          result = await cached('reidoscoins', () => reiDosCoins.getTCValue(cfg));
        } else {
          throw err;
        }
      }
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  }

  /** tibialegado_getAvgCoinValue — "Média Preço Venda" do servidor no TibiaTrade. */
  async function getAvgCoinValue(req, res) {
    const servidor = String(req.query.servidor || '').trim();
    if (!/^[A-Za-zÀ-ÿ]{2,30}$/.test(servidor)) {
      return res.status(400).json({ ok: false, codigo: 'servidor_invalido', erro: 'Informe o nome do servidor (ex.: Descubra).' });
    }
    try {
      const table = await cached('tibiatrade', () => tibiaTrade.getPriceTable(cfg));
      const result = tibiaTrade.findAvgCoinValue(table, servidor);
      if (!result) {
        return res.status(404).json({ ok: false, codigo: 'servidor_nao_encontrado', erro: `O servidor ${servidor} não aparece na tabela do TibiaTrade.` });
      }
      res.json({ ...result, cache: table.cache });
    } catch (err) {
      sendError(res, err);
    }
  }

  function health(req, res) {
    res.json({ ok: true });
  }

  return { getTCValue, getAvgCoinValue, health };
}

module.exports = { createCoinController };
