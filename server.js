require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { ambiente } = require('./src/config/ambiente');
const postgres = require('./src/infrastructure/postgres');
const deak = require('./src/infrastructure/deak');
const configuracoes = require('./src/roteirizacao/configuracoes.repository');
const despachosRepository = require('./src/roteirizacao/despachos.repository');
const { geocodificar, calcularRota } = require('./src/roteirizacao/here.service');
const { listarEntregas } = require('./src/entregas/repository');
const entregasRouter = require('./src/entregas/router');
const roteirizacaoRouter = require('./src/roteirizacao/router');
const controlTowerRepository = require('./src/control-tower/repository');
const controlTowerExecucao = require('./src/control-tower/execucao.repository');
const controlTowerRouter = require('./src/control-tower/router');
const conteleService = require('./src/integracoes/contele/service');
const conteleRepository = require('./src/integracoes/contele/repository');
const conteleRouter = require('./src/integracoes/contele/router');
const conteleRealtime = require('./src/integracoes/contele/realtime');

const app = express();

app.use(cors({
  origin: ambiente.corsOrigin === '*' ? true : ambiente.corsOrigin,
}));
app.use(express.json({ limit: '3mb' }));

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Copeli Roteirizador API v4',
    integracoes: {
      here: Boolean(ambiente.hereApiKey),
      deak: deak.configurado(),
      postgres: postgres.configurado(),
      contele: conteleService.configurado(),
    },
  });
});

app.get('/geocode', async (req, res) => {
  try {
    const resultado = await geocodificar(req.query);
    res.json(resultado);
  } catch (erro) {
    const status = erro.code === 'HERE_NAO_CONFIGURADO' ? 503 : 400;
    res.status(status).json({ found: false, error: erro.message, code: erro.code });
  }
});

app.get('/route', async (req, res) => {
  try {
    if (!req.query.waypoints) {
      return res.status(400).json({ ok: false, error: 'waypoints obrigatorio' });
    }

    const pontos = String(req.query.waypoints).split('|').map((item) => {
      const [lat, lng] = item.split(',');
      return { lat: Number(lat), lng: Number(lng) };
    });

    const invalidos = pontos.some(
      (ponto) => !Number.isFinite(ponto.lat) || !Number.isFinite(ponto.lng)
    );
    if (invalidos) {
      return res.status(400).json({ ok: false, error: 'waypoints invalidos' });
    }

    res.json(await calcularRota(pontos));
  } catch (erro) {
    const status = erro.code === 'HERE_NAO_CONFIGURADO' ? 503 : 500;
    res.status(status).json({
      ok: false,
      error: erro.message,
      code: erro.code || 'ERRO_ROTA',
    });
  }
});

app.post('/api/mapas/rota', async (req, res) => {
  try {
    const pontos = req.body && req.body.pontos;
    if (!Array.isArray(pontos) || pontos.length < 2) {
      return res.status(400).json({ ok: false, error: 'Informe ao menos 2 pontos.' });
    }

    const normalizados = pontos.map((ponto) => ({
      lat: Number(ponto.lat),
      lng: Number(ponto.lng),
    }));
    const invalidos = normalizados.some(
      (ponto) => !Number.isFinite(ponto.lat) || !Number.isFinite(ponto.lng)
    );
    if (invalidos) {
      return res.status(400).json({ ok: false, error: 'Coordenadas invalidas.' });
    }

    res.json(await calcularRota(normalizados));
  } catch (erro) {
    const status = erro.code === 'HERE_NAO_CONFIGURADO' ? 503 : 500;
    res.status(status).json({
      ok: false,
      error: erro.message,
      code: erro.code || 'ERRO_ROTA',
    });
  }
});

// Compatibilidade com a versao anterior. A fonte agora e a view real do Deak.
app.get('/fila', async (req, res) => {
  try {
    const entregas = await listarEntregas({ empresa: req.query.empresa });
    res.json({ ok: true, total: entregas.length, entregas });
  } catch (erro) {
    const status = erro.code === 'DEAK_NAO_CONFIGURADO' ? 503 : 500;
    res.status(status).json({
      ok: false,
      error: erro.message,
      code: erro.code || 'ERRO_FILA',
    });
  }
});

app.use('/api/entregas', entregasRouter);
app.use('/api/roteirizacao', roteirizacaoRouter);
app.use('/api/control-tower', controlTowerRouter);
app.use('/api/integracoes/contele', conteleRouter);

app.use((erro, _req, res, _next) => {
  console.error('[HTTP] Erro nao tratado:', erro.message);
  res.status(500).json({ ok: false, error: 'Erro interno do roteirizador.' });
});

async function iniciar() {
  if (postgres.configurado()) {
    try {
      await configuracoes.garantirEstrutura();
      await despachosRepository.garantirEstrutura();
      await controlTowerRepository.garantirEstrutura();
      await controlTowerExecucao.garantirEstrutura();
      await conteleRepository.garantirEstrutura();
      console.log('[POSTGRES] Estrutura de roteirizacao, Control Tower e Contele validada.');
    } catch (erro) {
      console.error('[POSTGRES] Nao foi possivel validar a estrutura:', erro.message);
    }
  } else {
    console.warn('[POSTGRES] DATABASE_URL nao configurada. Painel administrativo ficara indisponivel.');
  }

  if (!ambiente.hereApiKey) {
    console.warn('[HERE] HERE_API_KEY nao configurada. Geocodificacao e roteirizacao ficarao indisponiveis.');
  }

  if (!conteleService.configurado()) {
    console.warn('[CONTELE] CONTELE_API_KEY nao configurada. Telemetria em tempo real ficara indisponivel.');
  } else if (postgres.configurado()) {
    conteleRealtime.iniciar()
      .then(() => console.log('[CONTELE] Sincronizacao em tempo real iniciada.'))
      .catch((erro) => console.error('[CONTELE] Falha ao iniciar sincronizacao:', erro.message));
  }

  if (!deak.configurado()) {
    console.warn('[DEAK] Credenciais somente leitura nao configuradas. /fila e /api/entregas ficarao indisponiveis.');
  }

  app.listen(ambiente.port, () => {
    console.log(`Copeli Roteirizador API v4 rodando na porta ${ambiente.port}`);
  });
}

iniciar().catch((erro) => {
  console.error('[STARTUP] Falha ao iniciar:', erro);
  process.exitCode = 1;
});
