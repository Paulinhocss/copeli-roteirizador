const express = require('express');
const repository = require('./repository');

const router = express.Router();

function responderErro(res, erro) {
  const erros400 = new Set([
    'OCORRENCIA_INVALIDA',
    'MELHORIA_INVALIDA',
  ]);

  const status = erro.code === 'POSTGRES_NAO_CONFIGURADO'
    ? 503
    : erros400.has(erro.code)
      ? 400
      : 500;

  res.status(status).json({
    ok: false,
    error: erro.message,
    code: erro.code || 'ERRO_CONTROL_TOWER',
  });
}

router.get('/resumo', async (req, res) => {
  try {
    const resumo = await repository.obterResumo(
      req.query.data || repository.hojeSaoPaulo()
    );
    res.json({ ok: true, resumo });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.get('/ocorrencias', async (req, res) => {
  try {
    const ocorrencias = await repository.listarOcorrencias({
      status: req.query.status,
      limite: req.query.limite,
    });
    res.json({ ok: true, ocorrencias });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.post('/ocorrencias', async (req, res) => {
  try {
    const ocorrencia = await repository.criarOcorrencia(req.body || {});
    res.status(201).json({ ok: true, ocorrencia });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.get('/melhorias', async (req, res) => {
  try {
    const melhorias = await repository.listarMelhorias({
      status: req.query.status,
      limite: req.query.limite,
    });
    res.json({ ok: true, melhorias });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.post('/melhorias', async (req, res) => {
  try {
    const melhoria = await repository.criarMelhoria(req.body || {});
    res.status(201).json({ ok: true, melhoria });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.post('/melhorias/:id/acoes', async (req, res) => {
  try {
    const acao = await repository.criarAcaoMelhoria(
      Number(req.params.id),
      req.body || {}
    );
    res.status(201).json({ ok: true, acao });
  } catch (erro) {
    responderErro(res, erro);
  }
});

module.exports = router;
