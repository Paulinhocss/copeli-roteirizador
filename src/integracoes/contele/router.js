const express = require('express');
const service = require('./service');
const repository = require('./repository');
const realtime = require('./realtime');

const router = express.Router();

function responderErro(res, erro) {
  const status = erro.code === 'CONTELE_NAO_CONFIGURADO'
    ? 503
    : erro.code === 'CONTELE_PARAMETRO_INVALIDO'
      ? 400
      : erro.status || 502;

  res.status(status).json({
    ok: false,
    error: erro.message,
    code: erro.code || 'ERRO_CONTELE',
    detail: erro.detail,
  });
}

router.get('/status', (_req, res) => {
  res.json({
    ok: true,
    configurado: service.configurado(),
    integracao: 'Contele Fleet',
    realtime: realtime.obterStatus(),
  });
});


router.get('/stream', (req, res) => {
  realtime.registrarCliente(req, res);
});

router.post('/sincronizar-agora', async (_req, res) => {
  try {
    await realtime.ciclo();
    res.json({ ok: true, realtime: realtime.obterStatus() });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.get('/veiculos', async (_req, res) => {
  try {
    const dados = await service.listarVeiculos();
    res.json({ ok: true, ...dados });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.get('/posicoes', async (req, res) => {
  try {
    const dados = await service.listarPosicoesAtuais({
      limit: req.query.limit,
    });
    const sync = await repository.sincronizarPosicoes(dados);
    res.json({ ok: true, ...dados, sync });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.get('/posicoes/cache', async (_req, res) => {
  try {
    const posicoes = await repository.listarPosicoesCache();
    res.json({ ok: true, posicoes });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.get('/trackings', async (req, res) => {
  try {
    const dados = await service.listarTrackings({
      startDate: req.query.start_date,
      endDate: req.query.end_date,
      vehicleId: req.query.vehicle_id,
      imei: req.query.imei,
    });
    res.json({ ok: true, ...dados });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.get('/km', async (req, res) => {
  try {
    const dados = await service.obterRelatorioKm({
      startDate: req.query.start_date,
      endDate: req.query.end_date,
      vehicleId: req.query.vehicle_id,
    });
    res.json({ ok: true, ...dados });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.get('/motoristas/:driverId/rotas', async (req, res) => {
  try {
    const dados = await service.obterRotasMotorista({
      startDate: req.query.start_date,
      endDate: req.query.end_date,
      driverId: req.params.driverId,
    });
    res.json({ ok: true, ...dados });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.post('/rotas-planejadas', async (req, res) => {
  try {
    const dados = await service.criarRotaPlanejada(req.body || {});
    res.json({ ok: true, dados });
  } catch (erro) {
    responderErro(res, erro);
  }
});

module.exports = router;
