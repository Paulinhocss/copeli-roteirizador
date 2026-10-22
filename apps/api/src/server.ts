import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';

const repoRoot = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(repoRoot, '.env') });

// Os modulos de dominio atuais continuam em src/ durante a migracao.
// O novo entrypoint ja e TypeScript; a conversao dos modulos de dominio sera incremental.
const { ambiente } = require('../../../src/config/ambiente');
const postgres = require('../../../src/infrastructure/postgres');
const deak = require('../../../src/infrastructure/deak');
const configuracoes = require('../../../src/roteirizacao/configuracoes.repository');
const despachosRepository = require('../../../src/roteirizacao/despachos.repository');
const { geocodificar, calcularRota } = require('../../../src/roteirizacao/here.service');
const { listarEntregas } = require('../../../src/entregas/repository');
const entregasRouter = require('../../../src/entregas/router');
const roteirizacaoRouter = require('../../../src/roteirizacao/router');
const controlTowerRepository = require('../../../src/control-tower/repository');
const controlTowerExecucao = require('../../../src/control-tower/execucao.repository');
const controlTowerAlertas = require('../../../src/control-tower/alertas.service');
const controlTowerRouter = require('../../../src/control-tower/router');
const conteleService = require('../../../src/integracoes/contele/service');
const conteleRepository = require('../../../src/integracoes/contele/repository');
const conteleRouter = require('../../../src/integracoes/contele/router');
const conteleRealtime = require('../../../src/integracoes/contele/realtime');

const app = express();
const webDist = path.join(repoRoot, 'apps/web/dist');

app.disable('x-powered-by');
app.use(cors({
  origin: ambiente.corsOrigin === '*' ? true : ambiente.corsOrigin,
}));
app.use(express.json({ limit: '3mb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Copeli Control Tower API',
    version: '3.0.0',
    stack: 'Node + Express + TypeScript',
    integracoes: {
      here: Boolean(ambiente.hereApiKey),
      deak: deak.configurado(),
      postgres: postgres.configurado(),
      contele: conteleService.configurado(),
    },
  });
});

app.get('/geocode', async (req: Request, res: Response) => {
  try {
    res.json(await geocodificar(req.query));
  } catch (erro: any) {
    const status = erro.code === 'HERE_NAO_CONFIGURADO' ? 503 : 400;
    res.status(status).json({ found: false, error: erro.message, code: erro.code });
  }
});

app.get('/route', async (req: Request, res: Response) => {
  try {
    if (!req.query.waypoints) {
      return res.status(400).json({ ok: false, error: 'waypoints obrigatorio' });
    }

    const pontos = String(req.query.waypoints).split('|').map((item) => {
      const [lat, lng] = item.split(',');
      return { lat: Number(lat), lng: Number(lng) };
    });

    if (pontos.some((ponto) => !Number.isFinite(ponto.lat) || !Number.isFinite(ponto.lng))) {
      return res.status(400).json({ ok: false, error: 'waypoints invalidos' });
    }

    return res.json(await calcularRota(pontos));
  } catch (erro: any) {
    const status = erro.code === 'HERE_NAO_CONFIGURADO' ? 503 : 500;
    return res.status(status).json({
      ok: false,
      error: erro.message,
      code: erro.code || 'ERRO_ROTA',
    });
  }
});

app.post('/api/mapas/rota', async (req: Request, res: Response) => {
  try {
    const pontos = req.body?.pontos;
    if (!Array.isArray(pontos) || pontos.length < 2) {
      return res.status(400).json({ ok: false, error: 'Informe ao menos 2 pontos.' });
    }

    const normalizados = pontos.map((ponto: any) => ({
      lat: Number(ponto.lat),
      lng: Number(ponto.lng),
    }));

    if (normalizados.some((ponto: any) => !Number.isFinite(ponto.lat) || !Number.isFinite(ponto.lng))) {
      return res.status(400).json({ ok: false, error: 'Coordenadas invalidas.' });
    }

    return res.json(await calcularRota(normalizados));
  } catch (erro: any) {
    const status = erro.code === 'HERE_NAO_CONFIGURADO' ? 503 : 500;
    return res.status(status).json({
      ok: false,
      error: erro.message,
      code: erro.code || 'ERRO_ROTA',
    });
  }
});

app.get('/fila', async (req: Request, res: Response) => {
  try {
    const entregas = await listarEntregas({ empresa: req.query.empresa });
    return res.json({ ok: true, total: entregas.length, entregas });
  } catch (erro: any) {
    const status = erro.code === 'DEAK_NAO_CONFIGURADO' ? 503 : 500;
    return res.status(status).json({
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

app.use('/assets', express.static(path.join(webDist, 'assets'), {
  immutable: true,
  maxAge: '1y',
}));
app.use(express.static(webDist, { index: false }));

app.get('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/')) return next();
  return res.sendFile(path.join(webDist, 'index.html'));
});

app.use((erro: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[HTTP] Erro nao tratado:', erro.message);
  res.status(500).json({ ok: false, error: 'Erro interno do Control Tower.' });
});

async function iniciar() {
  if (postgres.configurado()) {
    try {
      await configuracoes.garantirEstrutura();
      await despachosRepository.garantirEstrutura();
      await controlTowerRepository.garantirEstrutura();
      await controlTowerExecucao.garantirEstrutura();
      await conteleRepository.garantirEstrutura();
      controlTowerAlertas.iniciar();
      console.log('[POSTGRES] Estrutura de roteirizacao, Control Tower e Contele validada.');
    } catch (erro: any) {
      console.error('[POSTGRES] Nao foi possivel validar a estrutura:', erro.message);
    }
  } else {
    console.warn('[POSTGRES] DATABASE_URL nao configurada.');
  }

  // A HERE nunca recebe credencial hardcoded. A unica fonte e process.env.HERE_API_KEY,
  // centralizada por src/config/ambiente.js.
  if (!ambiente.hereApiKey) {
    console.warn('[HERE] HERE_API_KEY nao configurada. Geocodificacao e roteirizacao indisponiveis.');
  }

  if (!conteleService.configurado()) {
    console.warn('[CONTELE] CONTELE_API_KEY nao configurada. Telemetria ao vivo indisponivel.');
  } else if (postgres.configurado()) {
    conteleRealtime.iniciar()
      .then(() => console.log('[CONTELE] Sincronizacao em tempo real iniciada.'))
      .catch((erro: Error) => console.error('[CONTELE] Falha ao iniciar sincronizacao:', erro.message));
  }

  if (!deak.configurado()) {
    console.warn('[DEAK] Credenciais somente leitura nao configuradas.');
  }

  app.listen(ambiente.port, () => {
    console.log(`Copeli Control Tower API v3 rodando na porta ${ambiente.port}`);
  });
}

void iniciar().catch((erro) => {
  console.error('[STARTUP] Falha ao iniciar:', erro);
  process.exitCode = 1;
});
