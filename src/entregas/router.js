const express = require('express');
const { listarEntregas } = require('./repository');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const entregas = await listarEntregas({ empresa: req.query.empresa });
    res.json({ ok: true, total: entregas.length, entregas });
  } catch (erro) {
    const status = erro.code === 'DEAK_NAO_CONFIGURADO' ? 503 : 500;
    res.status(status).json({ ok: false, error: erro.message, code: erro.code || 'ERRO_ENTREGAS' });
  }
});

module.exports = router;
