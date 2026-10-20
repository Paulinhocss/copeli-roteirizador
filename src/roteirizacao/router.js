const express = require('express');
const configuracoes = require('./configuracoes.repository');
const planejamento = require('./planejamento.service');

const router = express.Router();

function responderErro(res, erro) {
  const codigos400 = new Set([
    'MODO_INVALIDO',
    'CONFIGURACAO_INVALIDA',
    'FAIXA_CEP_INVALIDA',
    'FAIXA_CEP_SOBREPOSTA',
    'SEM_ENTREGAS',
    'SEM_VEICULOS',
    'SEM_VEICULOS_ATIVOS',
    'TOUR_PLANNING_LIMITE_SINCRONO',
    'DESTINO_DESPACHO_OBRIGATORIO',
  ]);

  const status = erro.code === 'POSTGRES_NAO_CONFIGURADO'
    ? 503
    : erro.code === 'HERE_NAO_CONFIGURADO'
      ? 503
      : codigos400.has(erro.code)
        ? 400
        : 500;

  res.status(status).json({
    ok: false,
    error: erro.message,
    code: erro.code || 'ERRO_ROTEIRIZACAO',
    detail: erro.detail,
  });
}

router.get('/configuracoes', async (_req, res) => {
  try {
    res.json({ ok: true, configuracao: await configuracoes.obterConfiguracao() });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.put('/configuracoes', async (req, res) => {
  try {
    const configuracao = await configuracoes.atualizarConfiguracao(req.body || {});
    res.json({ ok: true, configuracao });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.get('/motoristas', async (_req, res) => {
  try {
    res.json({ ok: true, motoristas: await configuracoes.listarMotoristas() });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.post('/motoristas', async (req, res) => {
  try {
    const motorista = await configuracoes.criarMotorista(req.body || {});
    res.status(201).json({ ok: true, motorista });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.patch('/motoristas/:id', async (req, res) => {
  try {
    const motorista = await configuracoes.atualizarMotorista(
      Number(req.params.id),
      req.body || {}
    );
    if (!motorista) return res.status(404).json({ ok: false, error: 'Motorista nao encontrado.' });
    res.json({ ok: true, motorista });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.get('/veiculos', async (_req, res) => {
  try {
    res.json({ ok: true, veiculos: await configuracoes.listarVeiculos() });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.post('/veiculos', async (req, res) => {
  try {
    const veiculo = await configuracoes.criarVeiculo(req.body || {});
    res.status(201).json({ ok: true, veiculo });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.patch('/veiculos/:id', async (req, res) => {
  try {
    const veiculo = await configuracoes.atualizarVeiculo(
      Number(req.params.id),
      req.body || {}
    );
    if (!veiculo) return res.status(404).json({ ok: false, error: 'Veiculo nao encontrado.' });
    res.json({ ok: true, veiculo });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.get('/faixas-cep', async (_req, res) => {
  try {
    res.json({ ok: true, faixas: await configuracoes.listarFaixasCep() });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.post('/faixas-cep', async (req, res) => {
  try {
    const faixa = await configuracoes.criarFaixaCep(req.body || {});
    res.status(201).json({ ok: true, faixa });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.patch('/faixas-cep/:id', async (req, res) => {
  try {
    const faixa = await configuracoes.atualizarFaixaCep(
      Number(req.params.id),
      req.body || {}
    );
    if (!faixa) return res.status(404).json({ ok: false, error: 'Faixa de CEP nao encontrada.' });
    res.json({ ok: true, faixa });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.post('/planejar', async (req, res) => {
  try {
    const resultado = await planejamento.planejar(
      req.body && req.body.entregas,
      {
        data_planejamento: req.body && req.body.data_planejamento,
        veiculo_ids: req.body && req.body.veiculo_ids,
      }
    );
    res.json({ ok: true, ...resultado });
  } catch (erro) {
    responderErro(res, erro);
  }
});

module.exports = router;
