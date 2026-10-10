'use strict';

/**
 * Tibia Legado — Web Service do Conversor de Tibia Coins.
 *
 *   GET /api/tibialegado_getTCValue                       → preço de 250 TC no Rei dos Coins (R$)
 *   GET /api/tibialegado_getAvgCoinValue?servidor=Descubra → "Média Preço Venda" no TibiaTrade (gold por TC)
 *   GET /api/health                                       → verificação de saúde
 */

const express = require('express');
const defaults = require('./config');
const { createCoinController } = require('./controllers/coinController');
const { createApiRouter } = require('./routes/api');

function createApp(overrides = {}) {
  const cfg = { ...defaults, ...overrides };
  const app = express();
  app.disable('x-powered-by');

  app.use('/api', createApiRouter(createCoinController(cfg), cfg));

  app.get('/', (req, res) => res.json({
    servico: 'Tibia Legado — Conversor de Tibia Coins (API)',
    rotas: ['/api/tibialegado_getTCValue', '/api/tibialegado_getAvgCoinValue?servidor=Descubra', '/api/health'],
  }));

  return app;
}

if (require.main === module) {
  createApp().listen(defaults.port, () => {
    console.log(`API ouvindo na porta ${defaults.port}`);
  });
}

module.exports = { createApp };
