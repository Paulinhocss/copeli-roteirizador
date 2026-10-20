const postgres = require('../../infrastructure/postgres');
const service = require('./service');
const repository = require('./repository');

const clientes = new Set();
let timer = null;
let sincronizando = false;
let ultimaExecucao = null;
let ultimoSucesso = null;
let ultimoErro = null;
let proximaEmMs = null;

function enviar(res, evento, dados) {
  res.write('event: ' + evento + '\n');
  res.write('data: ' + JSON.stringify(dados) + '\n\n');
}

function broadcast(evento, dados) {
  for (const cliente of clientes) {
    try {
      enviar(cliente.res, evento, dados);
    } catch {
      clientes.delete(cliente);
    }
  }
}

async function existeRotaAtiva() {
  if (!postgres.configurado()) return false;
  try {
    const { rows } = await postgres.query(
      "SELECT EXISTS(SELECT 1 FROM ct_rota WHERE status='EM_ROTA') AS ativa"
    );
    return Boolean(rows[0] && rows[0].ativa);
  } catch {
    return false;
  }
}

async function ciclo() {
  if (sincronizando || !service.configurado() || !postgres.configurado()) return;
  sincronizando = true;
  ultimaExecucao = new Date().toISOString();

  try {
    const payload = await service.listarPosicoesAtuais({ limit: 500 });
    const sync = await repository.sincronizarPosicoes(payload);
    const posicoes = await repository.listarPosicoesCache();
    ultimoSucesso = new Date().toISOString();
    ultimoErro = null;
    broadcast('posicoes', {
      sincronizado_em: ultimoSucesso,
      total: posicoes.length,
      sync,
      posicoes,
    });
  } catch (erro) {
    ultimoErro = {
      em: new Date().toISOString(),
      code: erro.code || 'ERRO_CONTELE_REALTIME',
      error: erro.message,
    };
    broadcast('erro', ultimoErro);
  } finally {
    sincronizando = false;
  }
}

async function agendar() {
  clearTimeout(timer);
  const ativa = await existeRotaAtiva();

  // Durante uma rota ativa, aproximamos o mapa da cadencia do rastreador.
  // Fora de rota, reduzimos chamadas desnecessarias na API.
  proximaEmMs = ativa ? 30000 : 180000;

  timer = setTimeout(async () => {
    await ciclo();
    await agendar();
  }, proximaEmMs);

  if (timer && typeof timer.unref === 'function') timer.unref();
}

async function iniciar() {
  if (!service.configurado() || !postgres.configurado()) return false;
  await ciclo();
  await agendar();
  return true;
}

function registrarCliente(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  const cliente = { res, keepAlive: null };
  clientes.add(cliente);

  enviar(res, 'conectado', {
    ok: true,
    conectado_em: new Date().toISOString(),
  });

  repository.listarPosicoesCache()
    .then((posicoes) => enviar(res, 'posicoes', {
      sincronizado_em: ultimoSucesso,
      total: posicoes.length,
      posicoes,
    }))
    .catch(() => {});

  cliente.keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(cliente.keepAlive);
      clientes.delete(cliente);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(cliente.keepAlive);
    clientes.delete(cliente);
  });
}

function obterStatus() {
  return {
    ativo: Boolean(timer),
    clientes: clientes.size,
    sincronizando,
    ultima_execucao: ultimaExecucao,
    ultimo_sucesso: ultimoSucesso,
    ultimo_erro: ultimoErro,
    proxima_em_ms: proximaEmMs,
  };
}

module.exports = {
  iniciar,
  ciclo,
  registrarCliente,
  obterStatus,
};
