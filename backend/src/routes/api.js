'use strict';

/** Endpoints da API. */

const express = require('express');

function createApiRouter(controller, cfg) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (cfg.allowOrigin) res.set('Access-Control-Allow-Origin', cfg.allowOrigin);
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Preço de 250 Tibia Coins em R$ no Rei dos Coins.
  router.get('/tibialegado_getTCValue', controller.getTCValue);

  // "Média Preço Venda" (gold por TC) de um servidor no TibiaTrade. Ex.: ?servidor=Descubra
  router.get('/tibialegado_getAvgCoinValue', controller.getAvgCoinValue);

  router.get('/health', controller.health);

  router.use((req, res) => res.status(404).json({ ok: false, codigo: 'rota_inexistente', erro: 'Rota não encontrada.' }));

  return router;
}

module.exports = { createApiRouter };
