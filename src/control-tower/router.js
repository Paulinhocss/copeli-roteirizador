const express = require('express');
const repository = require('./repository');
const execucao = require('./execucao.repository');

const router = express.Router();

function responderErro(res, erro) {
  const erros400 = new Set([
    'OCORRENCIA_INVALIDA',
    'MELHORIA_INVALIDA',
    'PLANEJAMENTO_INVALIDO',
    'DESTINO_DESPACHO_OBRIGATORIO',
    'TRANSICAO_INVALIDA',
    'PARADA_INVALIDA',
    'ROTA_PENDENTE',
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


router.post('/planejamentos/liberar', async (req, res) => {
  try {
    const resultado = await execucao.liberarPlanejamento(req.body || {});
    res.status(201).json({ ok: true, ...resultado });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.get('/rotas', async (req, res) => {
  try {
    const rotas = await execucao.listarRotas({
      data: req.query.data,
      status: req.query.status,
      limite: req.query.limite,
    });
    res.json({ ok: true, rotas });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.get('/rotas/:id', async (req, res) => {
  try {
    const rota = await execucao.obterRota(Number(req.params.id));
    if (!rota) return res.status(404).json({ ok: false, error: 'Rota nao encontrada.' });
    res.json({ ok: true, rota });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.patch('/rotas/:id/status', async (req, res) => {
  try {
    const rota = await execucao.atualizarStatusRota(
      Number(req.params.id),
      req.body && req.body.status,
      req.body || {}
    );
    if (!rota) return res.status(404).json({ ok: false, error: 'Rota nao encontrada.' });
    res.json({ ok: true, rota });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.patch('/paradas/:id/status', async (req, res) => {
  try {
    const parada = await execucao.atualizarStatusParada(
      Number(req.params.id),
      req.body && req.body.status,
      req.body || {}
    );
    if (!parada) return res.status(404).json({ ok: false, error: 'Parada nao encontrada.' });
    res.json({ ok: true, parada });
  } catch (erro) {
    responderErro(res, erro);
  }
});

router.patch('/entregas/:id/status-externo', async (req, res) => {
  try {
    const entrega = await execucao.atualizarStatusExternoEntrega(
      Number(req.params.id),
      req.body && req.body.status,
      req.body || {}
    );
    if (!entrega) return res.status(404).json({ ok: false, error: 'Entrega nao encontrada.' });
    res.json({ ok: true, entrega });
  } catch (erro) {
    responderErro(res, erro);
  }
});

// Compatibilidade e operacao em lote: atualiza todas as entregas da parada.
router.patch('/paradas/:id/status-externo', async (req, res) => {
  try {
    const parada = await execucao.atualizarStatusExternoParada(
      Number(req.params.id),
      req.body && req.body.status,
      req.body || {}
    );
    if (!parada) return res.status(404).json({ ok: false, error: 'Parada nao encontrada.' });
    res.json({ ok: true, parada });
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
