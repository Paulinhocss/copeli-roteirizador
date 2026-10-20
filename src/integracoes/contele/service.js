const fetch = require('node-fetch');
const { ambiente } = require('../../config/ambiente');

const BASE_TRACKINGS = 'https://cgv-prd-trackings-api.contele.io/api/v1';
const BASE_LAST_POINTS = 'https://cgv-prd-last-tracking-points-api.contele.io/api/v1';

function configurado() {
  return Boolean(ambiente.contele && ambiente.contele.apiKey);
}

function exigirConfiguracao() {
  if (!configurado()) {
    const erro = new Error('CONTELE_API_KEY nao configurada.');
    erro.code = 'CONTELE_NAO_CONFIGURADO';
    throw erro;
  }
}

function montarUrl(base, caminho, query = {}) {
  const url = new URL(base + caminho);
  Object.entries(query).forEach(([chave, valor]) => {
    if (valor === undefined || valor === null || valor === '') return;
    url.searchParams.set(chave, String(valor));
  });
  return url.toString();
}

async function requisitar(base, caminho, { method = 'GET', query, body, timeoutMs } = {}) {
  exigirConfiguracao();

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs || ambiente.contele.timeoutMs || 20000
  );

  try {
    const resposta = await fetch(montarUrl(base, caminho, query), {
      method,
      headers: {
        'x-api-key': ambiente.contele.apiKey,
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const texto = await resposta.text();
    let dados = {};
    try {
      dados = texto ? JSON.parse(texto) : {};
    } catch {
      dados = { raw: texto };
    }

    if (!resposta.ok) {
      const erro = new Error(
        dados.message || dados.error || dados.detail || `Contele respondeu HTTP ${resposta.status}.`
      );
      erro.code = 'CONTELE_HTTP_ERRO';
      erro.status = resposta.status;
      erro.detail = dados;
      throw erro;
    }

    return dados;
  } catch (erro) {
    if (erro.name === 'AbortError') {
      const timeoutErro = new Error('Timeout ao consultar a Contele.');
      timeoutErro.code = 'CONTELE_TIMEOUT';
      throw timeoutErro;
    }
    throw erro;
  } finally {
    clearTimeout(timeout);
  }
}

async function listarVeiculos() {
  return requisitar(BASE_TRACKINGS, '/list-vehicles');
}

async function listarPosicoesAtuais({ limit } = {}) {
  return requisitar(BASE_LAST_POINTS, '/last-points', {
    query: { limit: limit || 500 },
  });
}

async function listarTrackings({ startDate, endDate, vehicleId, imei }) {
  if (!startDate || !endDate) {
    const erro = new Error('start_date e end_date sao obrigatorios.');
    erro.code = 'CONTELE_PARAMETRO_INVALIDO';
    throw erro;
  }

  return requisitar(BASE_TRACKINGS, '/audit-trackings', {
    query: {
      start_date: startDate,
      end_date: endDate,
      vehicle_id: vehicleId,
      imei,
    },
  });
}

async function obterRelatorioKm({ startDate, endDate, vehicleId }) {
  if (!startDate || !endDate || !vehicleId) {
    const erro = new Error('start_date, end_date e vehicle_id sao obrigatorios.');
    erro.code = 'CONTELE_PARAMETRO_INVALIDO';
    throw erro;
  }

  return requisitar(BASE_TRACKINGS, '/report-km', {
    query: {
      start_date: startDate,
      end_date: endDate,
      vehicle_id: vehicleId,
    },
  });
}

async function obterRotasMotorista({ startDate, endDate, driverId }) {
  if (!startDate || !endDate || !driverId) {
    const erro = new Error('start_date, end_date e driver_id sao obrigatorios.');
    erro.code = 'CONTELE_PARAMETRO_INVALIDO';
    throw erro;
  }

  return requisitar(BASE_TRACKINGS, '/driver-per-route', {
    query: {
      start_date: startDate,
      end_date: endDate,
      driver_id: driverId,
    },
  });
}

async function criarRotaPlanejada(payload) {
  if (!payload || typeof payload !== 'object') {
    const erro = new Error('Payload da rota planejada e obrigatorio.');
    erro.code = 'CONTELE_PARAMETRO_INVALIDO';
    throw erro;
  }

  return requisitar(BASE_TRACKINGS, '/create-planned-route', {
    method: 'POST',
    body: payload,
    timeoutMs: 30000,
  });
}

module.exports = {
  configurado,
  listarVeiculos,
  listarPosicoesAtuais,
  listarTrackings,
  obterRelatorioKm,
  obterRotasMotorista,
  criarRotaPlanejada,
};
