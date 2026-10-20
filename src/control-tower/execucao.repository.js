const fs = require('fs');
const path = require('path');
const postgres = require('../infrastructure/postgres');

function campo(obj, ...nomes) {
  for (const nome of nomes) {
    if (obj && obj[nome] !== undefined && obj[nome] !== null) return obj[nome];
  }
  return null;
}

function texto(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

async function garantirEstrutura() {
  if (!postgres.configurado()) return false;
  for (const relativo of [
    '../../sql/004_control_tower_execucao.sql',
    '../../sql/006_parada_multientrega.sql',
  ]) {
    const arquivo = path.resolve(__dirname, relativo);
    await postgres.query(fs.readFileSync(arquivo, 'utf8'));
  }
  return true;
}

function modalidade(entrega) {
  const p = String(campo(entrega, 'prioridade', 'Prioridade') || '').toUpperCase();
  const c = String(campo(entrega, 'prioridade_codigo', 'PrioridadeCodigo') || '');
  if (c === '32' || p.includes('TRANSPORTADORA')) return 'TRANSPORTADORA';
  if (c === '23' || p.includes('SEDEX')) return 'SEDEX';
  return 'PROPRIA';
}

function destino(entrega, mod) {
  const d = campo(entrega, 'destino_operacional', 'destinoOperacional');
  if (mod === 'PROPRIA') {
    return {
      tipo: 'CLIENTE',
      nome: texto(campo(entrega, 'cliente', 'CLIENTE')),
      endereco: texto(campo(entrega, 'endereco', 'ENDENT')),
      numero: texto(campo(entrega, 'numero', 'NumEnt')),
      bairro: texto(campo(entrega, 'bairro', 'BAIRRO')),
      cidade: texto(campo(entrega, 'cidade', 'CIDADE')),
      uf: texto(campo(entrega, 'uf', 'UF')) || 'SP',
      cep: texto(campo(entrega, 'cep', 'CEP')),
      lat: numero(campo(entrega, 'lat')),
      lng: numero(campo(entrega, 'lng')),
    };
  }
  if (!d || numero(d.lat) === null || numero(d.lng) === null) {
    const erro = new Error(mod === 'SEDEX'
      ? 'Pedido SEDEX exige ponto dos Correios antes da liberacao.'
      : 'Pedido de transportadora exige ponto de despacho antes da liberacao.');
    erro.code = 'DESTINO_DESPACHO_OBRIGATORIO';
    throw erro;
  }
  return {
    id: d.id || null,
    codigo_externo: texto(d.codigo_externo),
    tipo: mod === 'SEDEX' ? 'CORREIOS' : 'TRANSPORTADORA',
    nome: texto(d.nome),
    endereco: texto(d.endereco),
    numero: texto(d.numero),
    bairro: texto(d.bairro),
    cidade: texto(d.cidade),
    uf: texto(d.uf) || 'SP',
    cep: texto(d.cep),
    lat: numero(d.lat),
    lng: numero(d.lng),
  };
}


function agruparParadas(entregas) {
  const grupos = [];
  const mapa = new Map();

  entregas.forEach((entrega, indice) => {
    const mod = modalidade(entrega);
    const d = destino(entrega, mod);
    const chave = mod === 'PROPRIA'
      ? 'PROPRIA|' + indice
      : [
          mod,
          d.id || '',
          d.codigo_externo || '',
          d.nome || '',
          d.lat === null ? '' : d.lat,
          d.lng === null ? '' : d.lng,
        ].join('|');

    let grupo = mapa.get(chave);
    if (!grupo) {
      grupo = { modalidade: mod, destino: d, entregas: [], primeiraOrdem: indice };
      mapa.set(chave, grupo);
      grupos.push(grupo);
    }
    grupo.entregas.push(entrega);
  });

  return grupos.sort((a, b) => a.primeiraOrdem - b.primeiraOrdem);
}

function validar(dados) {
  const data = texto(dados.data_operacao || dados.dataOperacao);
  const modo = String(dados.modo || dados.modo_roteirizacao || '').toUpperCase();
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !['CEP','OTIMIZADA','MANUAL'].includes(modo)) {
    const erro = new Error('Planejamento invalido.');
    erro.code = 'PLANEJAMENTO_INVALIDO';
    throw erro;
  }
  if (!Array.isArray(dados.rotas) || !dados.rotas.length) {
    const erro = new Error('Nenhuma rota informada para liberacao.');
    erro.code = 'PLANEJAMENTO_INVALIDO';
    throw erro;
  }
  dados.rotas.forEach((r) => {
    if (!Array.isArray(r.entregas) || !r.entregas.length) {
      const erro = new Error('Existe rota sem entregas.');
      erro.code = 'PLANEJAMENTO_INVALIDO';
      throw erro;
    }
    r.entregas.forEach((e) => destino(e, modalidade(e)));
  });
  return { data, modo };
}

async function liberarPlanejamento(dados) {
  const { data, modo } = validar(dados);
  const origem = dados.origem || {};
  const usuario = texto(dados.liberado_por || dados.usuario);
  const rotasPreparadas = dados.rotas.map((r) => ({
    ...r,
    paradasFisicas: agruparParadas(r.entregas),
  }));

  return postgres.transacao(async (db) => {
    const totalEntregas = rotasPreparadas.reduce((s, r) => s + r.entregas.length, 0);
    const totalParadas = rotasPreparadas.reduce((s, r) => s + r.paradasFisicas.length, 0);
    const valorTotal = rotasPreparadas.reduce((s, r) => s + r.entregas.reduce(
      (x, e) => x + (numero(campo(e, 'valor', 'VALOR')) || 0), 0), 0);

    const p = (await db.query(
      'INSERT INTO ct_planejamento ' +
      '(data_operacao,modo_roteirizacao,status,total_rotas,total_paradas,total_entregas,valor_total,' +
      'origem_endereco,origem_lat,origem_lng,snapshot,liberado_por,liberado_em) ' +
      "VALUES ($1,$2,'LIBERADO',$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,NOW()) RETURNING *",
      [data, modo, rotasPreparadas.length, totalParadas, totalEntregas, valorTotal,
       texto(origem.endereco), numero(origem.lat), numero(origem.lng), JSON.stringify(dados), usuario]
    )).rows[0];

    const codigoPlanejamento = 'PL-' + data.replace(/-/g, '') + '-' + p.id;
    await db.query('UPDATE ct_planejamento SET codigo=$2 WHERE id=$1', [p.id, codigoPlanejamento]);

    const rotas = [];
    for (const r of rotasPreparadas) {
      const valorRota = r.entregas.reduce((s, e) => s + (numero(campo(e, 'valor', 'VALOR')) || 0), 0);
      const veiculoId = numero(campo(r.veiculo || {}, 'id'));

      const rota = (await db.query(
        'INSERT INTO ct_rota ' +
        '(planejamento_id,data_operacao,modo_roteirizacao,status,motorista_id,veiculo_id,' +
        'origem_endereco,origem_lat,origem_lng,total_entregas,total_paradas,valor_total,km_planejado,' +
        'duracao_planejada_segundos,planejada_em,liberada_em,criada_por,atualizada_em) ' +
        "VALUES ($1,$2,$3,'LIBERADA',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW(),$14,NOW()) RETURNING *",
        [p.id, data, modo, numero(campo(r, 'motorista_id', 'motoristaId')), veiculoId,
         texto(origem.endereco), numero(origem.lat), numero(origem.lng),
         r.entregas.length, r.paradasFisicas.length, valorRota,
         numero(campo(r, 'distKm', 'km_planejado')),
         numero(campo(r, 'duracaoSegundos', 'duracao_planejada_segundos')), usuario]
      )).rows[0];

      const codigoRota = 'CT-' + data.replace(/-/g, '') + '-' + rota.id;
      await db.query('UPDATE ct_rota SET codigo=$2 WHERE id=$1', [rota.id, codigoRota]);

      const paradas = [];
      for (let i = 0; i < r.paradasFisicas.length; i += 1) {
        const grupo = r.paradasFisicas[i];
        const e = grupo.entregas[0];
        const mod = grupo.modalidade;
        const d = grupo.destino;
        const externo = mod === 'PROPRIA' ? 'NAO_APLICAVEL' : 'AGUARDANDO_DESPACHO';
        const valorParada = grupo.entregas.reduce(
          (s, item) => s + (numero(campo(item, 'valor', 'VALOR')) || 0), 0);
        const consolidada = grupo.entregas.length > 1;

        const q = [
          'INSERT INTO ct_parada (rota_id,ordem_planejada,empresa,pedido,num_nf,cliente,nome_fantasia,',
          'data_prometida,prioridade,vendedor,observacao,tipo_logradouro,endereco,numero,bairro,cidade,uf,cep,',
          'lat,lng,valor,eta_planejado,status,modalidade,tipo_destino_operacional,destino_operacional_nome,',
          'destino_operacional_endereco,destino_operacional_numero,destino_operacional_bairro,',
          'destino_operacional_cidade,destino_operacional_uf,destino_operacional_cep,',
          'destino_operacional_lat,destino_operacional_lng,status_externo,quantidade_entregas) ',
          "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'PENDENTE',",
          '$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35) RETURNING *'
        ].join('');

        const parada = (await db.query(q, [
          rota.id, i + 1,
          texto(campo(e, 'empresa', 'Empresa')),
          consolidada ? null : texto(campo(e, 'pedido', 'PEDIDO')),
          consolidada ? null : texto(campo(e, 'num_nf', 'NumNF')),
          mod === 'PROPRIA' ? texto(campo(e, 'cliente', 'CLIENTE')) : d.nome,
          mod === 'PROPRIA' ? texto(campo(e, 'nome_fantasia', 'NomeFantasia')) : d.nome,
          texto(campo(e, 'dataEntrega', 'DataEntrega', 'data_prometida')),
          texto(campo(e, 'prioridade', 'Prioridade')),
          consolidada ? null : texto(campo(e, 'vendedor', 'VENDEDOR')),
          consolidada ? ('Parada consolidada com ' + grupo.entregas.length + ' entregas.') :
            texto(campo(e, 'obs', 'observacao', 'Observacao')),
          mod === 'PROPRIA' ? texto(campo(e, 'tipo_logradouro', 'TipoEnt')) : null,
          d.endereco, d.numero, d.bairro, d.cidade, d.uf, d.cep, d.lat, d.lng,
          valorParada, texto(campo(e, 'chegadaPrevista', 'eta_planejado')),
          mod, d.tipo, d.nome, d.endereco, d.numero, d.bairro, d.cidade, d.uf, d.cep, d.lat, d.lng,
          externo, grupo.entregas.length
        ])).rows[0];

        const entregasParada = [];
        for (const item of grupo.entregas) {
          const childExterno = mod === 'PROPRIA' ? 'NAO_APLICAVEL' : 'AGUARDANDO_DESPACHO';
          const child = (await db.query(
            'INSERT INTO ct_parada_entrega ' +
            '(parada_id,empresa,pedido,num_nf,cliente,nome_fantasia,data_prometida,prioridade,vendedor,observacao,' +
            'tipo_logradouro,endereco_final,numero_final,bairro_final,cidade_final,uf_final,cep_final,lat_final,lng_final,' +
            'valor,modalidade,status_externo) ' +
            'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *',
            [
              parada.id,
              texto(campo(item, 'empresa', 'Empresa')), texto(campo(item, 'pedido', 'PEDIDO')),
              texto(campo(item, 'num_nf', 'NumNF')), texto(campo(item, 'cliente', 'CLIENTE')),
              texto(campo(item, 'nome_fantasia', 'NomeFantasia')),
              texto(campo(item, 'dataEntrega', 'DataEntrega', 'data_prometida')),
              texto(campo(item, 'prioridade', 'Prioridade')), texto(campo(item, 'vendedor', 'VENDEDOR')),
              texto(campo(item, 'obs', 'observacao', 'Observacao')),
              texto(campo(item, 'tipo_logradouro', 'TipoEnt')), texto(campo(item, 'endereco', 'ENDENT')),
              texto(campo(item, 'numero', 'NumEnt')), texto(campo(item, 'bairro', 'BAIRRO')),
              texto(campo(item, 'cidade', 'CIDADE')), texto(campo(item, 'uf', 'UF')) || 'SP',
              texto(campo(item, 'cep', 'CEP')),
              numero(campo(item, 'latCliente', 'lat_final', 'lat')),
              numero(campo(item, 'lngCliente', 'lng_final', 'lng')),
              numero(campo(item, 'valor', 'VALOR')) || 0, mod, childExterno
            ]
          )).rows[0];
          entregasParada.push(child);
        }

        paradas.push(Object.assign({}, parada, { entregas: entregasParada }));
      }

      await db.query(
        "INSERT INTO ct_evento (rota_id,tipo,fonte,usuario,dados) VALUES ($1,'ROTA_LIBERADA','CONTROL_TOWER',$2,$3::jsonb)",
        [rota.id, usuario, JSON.stringify({
          planejamento_id: p.id,
          planejamento_codigo: codigoPlanejamento,
          total_entregas: r.entregas.length,
          total_paradas: r.paradasFisicas.length
        })]
      );

      rotas.push(Object.assign({}, rota, { codigo: codigoRota, paradas }));
    }

    return { planejamento: Object.assign({}, p, { codigo: codigoPlanejamento }), rotas };
  });
}

async function listarRotas({ data, status, limite = 100 } = {}) {
  const { rows } = await postgres.query(
    'SELECT r.*,p.codigo AS planejamento_codigo,m.nome AS motorista_nome,v.nome AS veiculo_nome,v.placa AS veiculo_placa,' +
    'COUNT(pa.id)::int AS total_paradas_atual,' +
    "COUNT(pa.id) FILTER (WHERE pa.status='ENTREGUE')::int AS paradas_entregues," +
    "COUNT(pa.id) FILTER (WHERE pa.status='NAO_ENTREGUE')::int AS paradas_nao_entregues " +
    'FROM ct_rota r LEFT JOIN ct_planejamento p ON p.id=r.planejamento_id ' +
    'LEFT JOIN roteirizacao_motorista m ON m.id=r.motorista_id ' +
    'LEFT JOIN roteirizacao_veiculo v ON v.id=r.veiculo_id LEFT JOIN ct_parada pa ON pa.rota_id=r.id ' +
    'WHERE ($1::date IS NULL OR r.data_operacao=$1::date) AND ($2::varchar IS NULL OR r.status=$2) ' +
    'GROUP BY r.id,p.codigo,m.nome,v.nome,v.placa ORDER BY r.data_operacao DESC,r.id DESC LIMIT $3',
    [data || null, status ? String(status).toUpperCase() : null, Math.min(Math.max(Number(limite) || 100, 1), 500)]
  );
  return rows;
}

async function obterRota(id) {
  const r = (await postgres.query(
    'SELECT r.*,p.codigo AS planejamento_codigo,m.nome AS motorista_nome,v.nome AS veiculo_nome,v.placa AS veiculo_placa ' +
    'FROM ct_rota r LEFT JOIN ct_planejamento p ON p.id=r.planejamento_id ' +
    'LEFT JOIN roteirizacao_motorista m ON m.id=r.motorista_id LEFT JOIN roteirizacao_veiculo v ON v.id=r.veiculo_id ' +
    'WHERE r.id=$1', [id])).rows[0];
  if (!r) return null;
  const [p, e] = await Promise.all([
    postgres.query('SELECT * FROM ct_parada WHERE rota_id=$1 ORDER BY ordem_planejada', [id]),
    postgres.query('SELECT * FROM ct_evento WHERE rota_id=$1 ORDER BY ocorreu_em,id', [id]),
  ]);
  return Object.assign({}, r, { paradas: p.rows, eventos: e.rows });
}

const rotaPermitida = {
  PLANEJADA: ['LIBERADA','CANCELADA'],
  LIBERADA: ['EM_ROTA','CANCELADA'],
  EM_ROTA: ['FINALIZADA','CANCELADA'],
  FINALIZADA: [],
  CANCELADA: [],
};

async function atualizarStatusRota(id, novo, op = {}) {
  const status = String(novo || '').toUpperCase();
  return postgres.transacao(async (db) => {
    const atual = (await db.query('SELECT * FROM ct_rota WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!atual) return null;
    if (!(rotaPermitida[atual.status] || []).includes(status)) {
      const erro = new Error('Transicao de rota ' + atual.status + ' -> ' + status + ' nao permitida.');
      erro.code = 'TRANSICAO_INVALIDA';
      throw erro;
    }
    const r = (await db.query(
      "UPDATE ct_rota SET status=$2,liberada_em=CASE WHEN $2='LIBERADA' THEN COALESCE(liberada_em,NOW()) ELSE liberada_em END," +
      "iniciada_em=CASE WHEN $2='EM_ROTA' THEN COALESCE(iniciada_em,NOW()) ELSE iniciada_em END," +
      "finalizada_em=CASE WHEN $2='FINALIZADA' THEN COALESCE(finalizada_em,NOW()) ELSE finalizada_em END,atualizada_em=NOW() " +
      'WHERE id=$1 RETURNING *', [id, status])).rows[0];
    await db.query(
      "INSERT INTO ct_evento (rota_id,tipo,fonte,usuario,dados) VALUES ($1,'ROTA_STATUS_ALTERADO',$2,$3,$4::jsonb)",
      [id, op.fonte || 'CONTROL_TOWER', texto(op.usuario), JSON.stringify({ de: atual.status, para: status })]
    );
    return r;
  });
}

const paradaPermitida = {
  PENDENTE: ['EM_DESLOCAMENTO','NO_CLIENTE','ENTREGUE','NAO_ENTREGUE','REAGENDADA','CANCELADA'],
  EM_DESLOCAMENTO: ['NO_CLIENTE','ENTREGUE','NAO_ENTREGUE','REAGENDADA','CANCELADA'],
  NO_CLIENTE: ['ENTREGUE','NAO_ENTREGUE','REAGENDADA','CANCELADA'],
  NAO_ENTREGUE: ['REAGENDADA'],
  REAGENDADA: [], ENTREGUE: [], CANCELADA: [],
};

async function atualizarStatusParada(id, novo, op = {}) {
  const status = String(novo || '').toUpperCase();
  return postgres.transacao(async (db) => {
    const atual = (await db.query('SELECT * FROM ct_parada WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!atual) return null;
    if (!(paradaPermitida[atual.status] || []).includes(status)) {
      const erro = new Error('Transicao de parada ' + atual.status + ' -> ' + status + ' nao permitida.');
      erro.code = 'TRANSICAO_INVALIDA';
      throw erro;
    }
    const motivo = texto(op.motivo_nao_entrega);
    if (status === 'NAO_ENTREGUE' && !motivo) {
      const erro = new Error('Motivo da nao entrega e obrigatorio.');
      erro.code = 'PARADA_INVALIDA';
      throw erro;
    }
    const externo = status === 'ENTREGUE' && atual.modalidade !== 'PROPRIA' ? 'DESPACHADO' : atual.status_externo;
    const r = (await db.query(
      "UPDATE ct_parada SET status=$2,chegada_em=CASE WHEN $2='NO_CLIENTE' THEN COALESCE(chegada_em,NOW()) ELSE chegada_em END," +
      "conclusao_em=CASE WHEN $2 IN ('ENTREGUE','NAO_ENTREGUE','REAGENDADA','CANCELADA') THEN COALESCE(conclusao_em,NOW()) ELSE conclusao_em END," +
      "motivo_nao_entrega=CASE WHEN $2='NAO_ENTREGUE' THEN $3 ELSE motivo_nao_entrega END,status_externo=$4," +
      "despachada_em=CASE WHEN $4='DESPACHADO' THEN COALESCE(despachada_em,NOW()) ELSE despachada_em END,atualizado_em=NOW() " +
      'WHERE id=$1 RETURNING *', [id, status, motivo, externo])).rows[0];
    await db.query(
      "INSERT INTO ct_evento (rota_id,parada_id,tipo,fonte,usuario,dados) VALUES ($1,$2,'PARADA_STATUS_ALTERADO',$3,$4,$5::jsonb)",
      [atual.rota_id, id, op.fonte || 'CONTROL_TOWER', texto(op.usuario),
       JSON.stringify({ de: atual.status, para: status, modalidade: atual.modalidade, status_externo: externo })]
    );
    return r;
  });
}

async function atualizarStatusExterno(id, novo, op = {}) {
  const status = String(novo || '').toUpperCase();
  if (!['AGUARDANDO_DESPACHO','DESPACHADO','EM_TRANSITO','ENTREGUE','EXCECAO'].includes(status)) {
    const erro = new Error('Status externo invalido.');
    erro.code = 'PARADA_INVALIDA';
    throw erro;
  }
  return postgres.transacao(async (db) => {
    const atual = (await db.query('SELECT * FROM ct_parada WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!atual) return null;
    if (atual.modalidade === 'PROPRIA') {
      const erro = new Error('Entrega propria nao possui acompanhamento externo.');
      erro.code = 'PARADA_INVALIDA';
      throw erro;
    }
    const r = (await db.query(
      "UPDATE ct_parada SET status_externo=$2,codigo_rastreio=COALESCE($3,codigo_rastreio)," +
      "despachada_em=CASE WHEN $2='DESPACHADO' THEN COALESCE(despachada_em,NOW()) ELSE despachada_em END," +
      "entregue_final_em=CASE WHEN $2='ENTREGUE' THEN COALESCE(entregue_final_em,NOW()) ELSE entregue_final_em END,atualizado_em=NOW() " +
      'WHERE id=$1 RETURNING *', [id, status, texto(op.codigo_rastreio)])).rows[0];
    await db.query(
      "INSERT INTO ct_evento (rota_id,parada_id,tipo,fonte,usuario,dados) VALUES ($1,$2,'STATUS_EXTERNO_ALTERADO',$3,$4,$5::jsonb)",
      [atual.rota_id, id, op.fonte || 'CONTROL_TOWER', texto(op.usuario),
       JSON.stringify({ de: atual.status_externo, para: status, codigo_rastreio: texto(op.codigo_rastreio) })]
    );
    return r;
  });
}

module.exports = {
  garantirEstrutura,
  liberarPlanejamento,
  listarRotas,
  obterRota,
  atualizarStatusRota,
  atualizarStatusParada,
  atualizarStatusExterno,
  modalidade,
};
