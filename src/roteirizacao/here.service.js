const fetch = require('node-fetch');
const { ambiente } = require('../config/ambiente');

function exigirChaveHere() {
  if (!ambiente.hereApiKey) {
    const erro = new Error('HERE_API_KEY nao configurada.');
    erro.code = 'HERE_NAO_CONFIGURADO';
    throw erro;
  }
}

function dentroDeSP(lat, lng) {
  return lat >= -25.3 && lat <= -19.7 && lng >= -53.2 && lng <= -44.2;
}

async function buscarViaCep(cep) {
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    if (!dados || dados.erro) return null;
    return {
      logradouro: dados.logradouro || '',
      bairro: dados.bairro || '',
      cidade: dados.localidade || '',
      uf: dados.uf || 'SP',
    };
  } catch {
    return null;
  }
}

async function buscarHere(query) {
  exigirChaveHere();
  const url = new URL('https://geocode.search.hereapi.com/v1/geocode');
  url.searchParams.set('q', query);
  url.searchParams.set('lang', 'pt-BR');
  url.searchParams.set('in', 'countryCode:BRA');
  url.searchParams.set('apiKey', ambiente.hereApiKey);

  const resposta = await fetch(url.toString());
  if (!resposta.ok) return null;

  const dados = await resposta.json();
  const item = dados.items && dados.items[0];
  if (!item) return null;

  return {
    lat: item.position.lat,
    lng: item.position.lng,
    display: item.address && item.address.label ? item.address.label : query,
  };
}

async function geocodificar({ q, numero, bairro, cidade, uf, cep }) {
  if (!q) {
    const erro = new Error('Parametro q obrigatorio.');
    erro.code = 'GEOCODE_Q_OBRIGATORIO';
    throw erro;
  }

  let cepFmt = String(cep || '').replace(/\D/g, '');
  while (cepFmt.length < 8 && cepFmt.length > 0) cepFmt = '0' + cepFmt;

  const cidadeStr = cidade || 'Sao Paulo';
  const ufStr = uf || 'SP';
  const tentativas = [];

  if (cepFmt.length === 8) tentativas.push(`${cepFmt}, Brasil`);

  if (cepFmt.length === 8) {
    const via = await buscarViaCep(cepFmt);
    if (via && via.logradouro) {
      const completo = `${via.logradouro}${numero ? ' ' + numero : ''}, ${via.bairro}, ${via.cidade}, ${via.uf}, Brasil`;
      tentativas.push(completo);
      tentativas.push(`${via.logradouro}, ${via.bairro}, ${via.cidade}, ${via.uf}, Brasil`);
    }
  }

  const qLimpo = String(q).trim();
  if (qLimpo && bairro && cidadeStr) {
    if (numero) tentativas.push(`${qLimpo} ${numero}, ${bairro}, ${cidadeStr}, ${ufStr}, Brasil`);
    tentativas.push(`${qLimpo}, ${bairro}, ${cidadeStr}, ${ufStr}, Brasil`);
  }

  if (qLimpo && cidadeStr) {
    if (numero) tentativas.push(`${qLimpo} ${numero}, ${cidadeStr}, ${ufStr}, Brasil`);
    tentativas.push(`${qLimpo}, ${cidadeStr}, ${ufStr}, Brasil`);
  }

  if (bairro && cidadeStr) tentativas.push(`${bairro}, ${cidadeStr}, ${ufStr}, Brasil`);
  if (cidadeStr) tentativas.push(`${cidadeStr}, ${ufStr}, Brasil`);

  for (const query of [...new Set(tentativas)]) {
    if (!query || query.length < 5) continue;
    const resultado = await buscarHere(query);
    if (resultado && dentroDeSP(resultado.lat, resultado.lng)) {
      return { found: true, ...resultado, query_used: query };
    }
  }

  return { found: false, query: q };
}

function decodeFlexiblePolyline(encoded) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const decodeChar = (c) => chars.indexOf(c);
  const header2 = decodeChar(encoded[1]);
  const precision = header2 & 0x0f;
  const has3d = (header2 >> 4) & 1;
  const factor = Math.pow(10, precision);
  let i = 2;
  let lat = 0;
  let lng = 0;
  const coords = [];

  while (i < encoded.length) {
    let rv = 0;
    let shift = 0;
    let byte;

    do {
      byte = decodeChar(encoded[i++]);
      rv |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (rv & 1) ? ~(rv >> 1) : (rv >> 1);

    rv = 0;
    shift = 0;
    do {
      byte = decodeChar(encoded[i++]);
      rv |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (rv & 1) ? ~(rv >> 1) : (rv >> 1);

    if (has3d) {
      rv = 0;
      shift = 0;
      do {
        byte = decodeChar(encoded[i++]);
        rv |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
    }

    coords.push([lat / factor, lng / factor]);
  }

  return coords;
}

async function calcularRota(pontos) {
  exigirChaveHere();
  if (!Array.isArray(pontos) || pontos.length < 2) {
    const erro = new Error('Minimo de 2 pontos para calcular uma rota.');
    erro.code = 'ROTA_PONTOS_INSUFICIENTES';
    throw erro;
  }

  const url = new URL('https://router.hereapi.com/v8/routes');
  url.searchParams.set('origin', `${pontos[0].lat},${pontos[0].lng}`);
  pontos.slice(1, -1).forEach((ponto) => {
    url.searchParams.append('via', `${ponto.lat},${ponto.lng}`);
  });
  const destino = pontos[pontos.length - 1];
  url.searchParams.set('destination', `${destino.lat},${destino.lng}`);
  url.searchParams.set('transportMode', 'car');
  url.searchParams.set('return', 'polyline,summary');
  url.searchParams.set('apiKey', ambiente.hereApiKey);

  const resposta = await fetch(url.toString());
  const dados = await resposta.json();
  if (!resposta.ok || !dados.routes || !dados.routes[0]) {
    const erro = new Error('HERE nao retornou uma rota valida.');
    erro.code = 'HERE_ROTA_INVALIDA';
    erro.detail = dados;
    throw erro;
  }

  const coords = [];
  let totalMetros = 0;
  let totalSegundos = 0;

  dados.routes[0].sections.forEach((secao) => {
    if (secao.polyline) coords.push(...decodeFlexiblePolyline(secao.polyline));
    if (secao.summary) {
      totalMetros += Number(secao.summary.length || 0);
      totalSegundos += Number(secao.summary.duration || 0);
    }
  });

  return {
    ok: true,
    coords,
    distKm: Math.round(totalMetros / 100) / 10,
    duracaoSegundos: totalSegundos,
  };
}

function dataSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function horarioComOffset(data, horario) {
  return `${data}T${horario}:00${ambiente.timezoneOffset}`;
}

function validarCoordenada(entrega) {
  return Number.isFinite(Number(entrega.lat)) && Number.isFinite(Number(entrega.lng));
}

async function planejarTours({ entregas, veiculos, configuracao, dataPlanejamento }) {
  exigirChaveHere();

  if (!Array.isArray(entregas) || !entregas.length) {
    return { rotas: [], naoAtribuidas: [] };
  }
  if (!Array.isArray(veiculos) || !veiculos.length) {
    const erro = new Error('Nenhum veiculo disponivel para o planejamento.');
    erro.code = 'SEM_VEICULOS';
    throw erro;
  }
  if (entregas.length > 250 || veiculos.length > 35) {
    const erro = new Error('Planejamento sincrono excede o limite atual. Use fluxo assincrono.');
    erro.code = 'TOUR_PLANNING_LIMITE_SINCRONO';
    throw erro;
  }

  const data = dataPlanejamento || dataSaoPaulo();
  const deposito = {
    lat: Number(configuracao.deposito_lat),
    lng: Number(configuracao.deposito_lng),
  };

  const jobsMap = new Map();
  const jobs = entregas.filter(validarCoordenada).map((entrega, indice) => {
    const jobId = `job_${indice + 1}`;
    jobsMap.set(jobId, entrega);
    return {
      id: jobId,
      tasks: {
        deliveries: [{
          places: [{
            location: { lat: Number(entrega.lat), lng: Number(entrega.lng) },
            duration: Number(configuracao.tempo_parada_segundos || 300),
          }],
          demand: [1],
        }],
      },
    };
  });

  const perfis = new Map();
  const tiposMap = new Map();
  const tipos = veiculos.map((veiculo, indice) => {
    const perfilTipo = veiculo.perfil || 'car';
    const perfilNome = `perfil_${perfilTipo}`;
    if (!perfis.has(perfilNome)) {
      perfis.set(perfilNome, { name: perfilNome, type: perfilTipo });
    }

    const typeId = `veiculo_${indice + 1}`;
    tiposMap.set(typeId, veiculo);

    return {
      id: typeId,
      profile: perfilNome,
      costs: {
        fixed: 10,
        distance: 0.001,
        time: 0.001,
      },
      shifts: [{
        start: {
          time: horarioComOffset(data, configuracao.inicio_jornada || '07:00'),
          location: deposito,
        },
        end: {
          time: horarioComOffset(data, configuracao.fim_jornada || '18:00'),
          location: deposito,
        },
      }],
      capacity: [Math.max(1, Number(veiculo.max_paradas || 100))],
      amount: 1,
    };
  });

  const problema = {
    plan: { jobs },
    fleet: {
      types: tipos,
      profiles: [...perfis.values()],
    },
    configuration: {
      termination: {
        maxTime: 5,
        stagnationTime: 2,
      },
    },
  };

  const url = new URL('https://tourplanning.hereapi.com/v3/problems');
  url.searchParams.set('apikey', ambiente.hereApiKey);

  const resposta = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(problema),
  });

  const solucao = await resposta.json();
  if (!resposta.ok) {
    const erro = new Error(solucao.cause || solucao.title || 'HERE Tour Planning falhou.');
    erro.code = 'HERE_TOUR_PLANNING_ERRO';
    erro.status = resposta.status;
    erro.detail = solucao;
    throw erro;
  }

  const rotas = (solucao.tours || []).map((tour) => {
    const veiculo = tiposMap.get(tour.typeId) || {};
    const entregasRota = [];

    (tour.stops || []).forEach((stop) => {
      (stop.activities || []).forEach((atividade) => {
        if (atividade.type !== 'delivery') return;
        const entrega = jobsMap.get(atividade.jobId);
        if (!entrega) return;
        entregasRota.push({
          ...entrega,
          chegadaPrevista: atividade.time && (atividade.time.arrival || atividade.time.start),
          inicioPrevisto: atividade.time && atividade.time.start,
          fimPrevisto: atividade.time && atividade.time.end,
        });
      });
    });

    return {
      motorista: veiculo.motorista_nome || null,
      motorista_id: veiculo.motorista_id || null,
      veiculo: {
        id: veiculo.id || null,
        nome: veiculo.nome || tour.vehicleId,
        placa: veiculo.placa || null,
        perfil: veiculo.perfil || null,
      },
      entregas: entregasRota,
      distKm: Math.round(Number(tour.statistic && tour.statistic.distance || 0) / 100) / 10,
      duracaoSegundos: Number(tour.statistic && tour.statistic.duration || 0),
      vehicleIdHere: tour.vehicleId,
    };
  });

  const naoAtribuidas = (solucao.unassigned || []).map((item) => ({
    jobId: item.jobId,
    entrega: jobsMap.get(item.jobId) || null,
    reasons: item.reasons || [],
  }));

  return {
    rotas,
    naoAtribuidas,
    estatistica: solucao.statistic || null,
    engine: 'HERE_TOUR_PLANNING_V3',
  };
}

module.exports = {
  geocodificar,
  calcularRota,
  planejarTours,
  dataSaoPaulo,
};
