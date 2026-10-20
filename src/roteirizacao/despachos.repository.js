const fs = require('fs');
const path = require('path');
const postgres = require('../infrastructure/postgres');

function normalizarTipo(valor) {
  const tipo = String(valor || '').toUpperCase();
  if (!['TRANSPORTADORA','CORREIOS'].includes(tipo)) {
    const erro = new Error('Tipo de ponto de despacho invalido.');
    erro.code = 'PONTO_DESPACHO_INVALIDO';
    throw erro;
  }
  return tipo;
}

function normalizarCep(valor) {
  const cep = String(valor || '').replace(/\D/g, '');
  return cep.length === 8 ? cep : null;
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

async function garantirEstrutura() {
  if (!postgres.configurado()) return false;
  const arquivo = path.resolve(__dirname, '../../sql/005_pontos_despacho.sql');
  await postgres.query(fs.readFileSync(arquivo, 'utf8'));
  return true;
}

async function listar({ somenteAtivos = false, tipo } = {}) {
  const tipoNormalizado = tipo ? normalizarTipo(tipo) : null;
  const { rows } = await postgres.query(
    'SELECT * FROM roteirizacao_ponto_despacho ' +
    'WHERE ($1::varchar IS NULL OR tipo=$1) AND ($2::boolean=FALSE OR ativo=TRUE) ' +
    'ORDER BY tipo,padrao DESC,ativo DESC,nome',
    [tipoNormalizado, Boolean(somenteAtivos)]
  );
  return rows.map((r) => ({
    ...r,
    lat: Number(r.lat),
    lng: Number(r.lng),
  }));
}

function validarDados(dados, atual) {
  const tipo = normalizarTipo(dados.tipo === undefined && atual ? atual.tipo : dados.tipo);
  const nome = String(dados.nome === undefined && atual ? atual.nome : (dados.nome || '')).trim();
  const endereco = String(dados.endereco === undefined && atual ? atual.endereco : (dados.endereco || '')).trim();
  const lat = numero(dados.lat === undefined && atual ? atual.lat : dados.lat);
  const lng = numero(dados.lng === undefined && atual ? atual.lng : dados.lng);

  if (!nome || !endereco || lat === null || lng === null ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    const erro = new Error('Nome, endereco e coordenadas validas sao obrigatorios.');
    erro.code = 'PONTO_DESPACHO_INVALIDO';
    throw erro;
  }

  return {
    tipo,
    codigo_externo: dados.codigo_externo === undefined && atual
      ? atual.codigo_externo
      : (dados.codigo_externo ? String(dados.codigo_externo).trim() : null),
    nome,
    endereco,
    numero: dados.numero === undefined && atual ? atual.numero : (dados.numero || null),
    bairro: dados.bairro === undefined && atual ? atual.bairro : (dados.bairro || null),
    cidade: dados.cidade === undefined && atual ? atual.cidade : (dados.cidade || null),
    uf: String(dados.uf === undefined && atual ? (atual.uf || 'SP') : (dados.uf || 'SP')).toUpperCase(),
    cep: dados.cep === undefined && atual ? atual.cep : normalizarCep(dados.cep),
    lat,
    lng,
    padrao: dados.padrao === undefined && atual ? atual.padrao : Boolean(dados.padrao),
    ativo: dados.ativo === undefined && atual ? atual.ativo : (dados.ativo === undefined ? true : Boolean(dados.ativo)),
  };
}

async function criar(dados) {
  const d = validarDados(dados);
  return postgres.transacao(async (db) => {
    if (d.padrao && d.ativo) {
      await db.query('UPDATE roteirizacao_ponto_despacho SET padrao=FALSE,atualizado_em=NOW() WHERE tipo=$1 AND padrao=TRUE', [d.tipo]);
    }
    const { rows } = await db.query(
      'INSERT INTO roteirizacao_ponto_despacho ' +
      '(tipo,codigo_externo,nome,endereco,numero,bairro,cidade,uf,cep,lat,lng,padrao,ativo) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
      [d.tipo,d.codigo_externo,d.nome,d.endereco,d.numero,d.bairro,d.cidade,d.uf,d.cep,d.lat,d.lng,d.padrao,d.ativo]
    );
    return rows[0];
  });
}

async function atualizar(id, dados) {
  const atual = (await postgres.query('SELECT * FROM roteirizacao_ponto_despacho WHERE id=$1', [id])).rows[0];
  if (!atual) return null;
  const d = validarDados(dados, atual);

  return postgres.transacao(async (db) => {
    if (d.padrao && d.ativo) {
      await db.query('UPDATE roteirizacao_ponto_despacho SET padrao=FALSE,atualizado_em=NOW() WHERE tipo=$1 AND id<>$2 AND padrao=TRUE', [d.tipo, id]);
    }
    const { rows } = await db.query(
      'UPDATE roteirizacao_ponto_despacho SET tipo=$2,codigo_externo=$3,nome=$4,endereco=$5,numero=$6,' +
      'bairro=$7,cidade=$8,uf=$9,cep=$10,lat=$11,lng=$12,padrao=$13,ativo=$14,atualizado_em=NOW() ' +
      'WHERE id=$1 RETURNING *',
      [id,d.tipo,d.codigo_externo,d.nome,d.endereco,d.numero,d.bairro,d.cidade,d.uf,d.cep,d.lat,d.lng,d.padrao,d.ativo]
    );
    return rows[0];
  });
}

async function aplicarDestinosOperacionais(entregas) {
  const pontos = await listar({ somenteAtivos: true });
  const correiosPadrao = pontos.find((p) => p.tipo === 'CORREIOS' && p.padrao);
  const transportadoras = new Map(
    pontos.filter((p) => p.tipo === 'TRANSPORTADORA' && p.codigo_externo)
      .map((p) => [String(p.codigo_externo), p])
  );

  return entregas.map((entrega) => {
    if (entrega.destino_operacional || entrega.destinoOperacional) return entrega;
    const modalidade = String(entrega.modalidade || '').toUpperCase();

    let ponto = null;
    if (modalidade === 'SEDEX') {
      ponto = correiosPadrao || null;
    } else if (modalidade === 'TRANSPORTADORA') {
      const codigo = entrega.transportadora_codigo || entrega.transportadoraCodigo;
      ponto = codigo ? transportadoras.get(String(codigo)) || null : null;
    }

    if (!ponto) return entrega;

    return {
      ...entrega,
      destino_operacional: {
        id: ponto.id,
        tipo: ponto.tipo,
        codigo_externo: ponto.codigo_externo,
        nome: ponto.nome,
        endereco: ponto.endereco,
        numero: ponto.numero,
        bairro: ponto.bairro,
        cidade: ponto.cidade,
        uf: ponto.uf,
        cep: ponto.cep,
        lat: Number(ponto.lat),
        lng: Number(ponto.lng),
      },
    };
  });
}

module.exports = {
  garantirEstrutura,
  listar,
  criar,
  atualizar,
  aplicarDestinosOperacionais,
};
