const postgres = require('../infrastructure/postgres');
const { listarEntregas } = require('../entregas/repository');

function campo(obj, ...nomes) {
  for (const nome of nomes) {
    if (obj && obj[nome] !== undefined && obj[nome] !== null) return obj[nome];
  }
  return null;
}

function texto(valor) {
  if (valor === null || valor === undefined) return null;
  const normalizado = String(valor).trim();
  return normalizado || null;
}

function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  const n = Number(String(valor).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function dataPrometida(valor) {
  const s = texto(valor);
  if (!s) return null;
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function modalidade(entrega) {
  const codigo = String(campo(entrega, 'PrioridadeCodigo', 'prioridade_codigo') || '');
  const descricao = String(campo(entrega, 'Prioridade', 'prioridade') || '').toUpperCase();
  if (codigo === '32' || descricao.includes('TRANSPORTADORA')) return 'TRANSPORTADORA';
  if (codigo === '23' || descricao.includes('SEDEX')) return 'SEDEX';
  return 'PROPRIA';
}

function normalizarDemanda(entrega) {
  return {
    empresa: texto(campo(entrega, 'Empresa', 'empresa')),
    pedido: texto(campo(entrega, 'PEDIDO', 'pedido')),
    num_nf: texto(campo(entrega, 'NumNF', 'num_nf')),
    modalidade: modalidade(entrega),
    prioridade: texto(campo(entrega, 'Prioridade', 'prioridade')),
    prioridade_codigo: texto(campo(entrega, 'PrioridadeCodigo', 'prioridade_codigo')),
    status_deak_orcamento: texto(campo(entrega, 'Status', 'status')),
    status_logistico: texto(campo(entrega, 'StatusLogistico', 'status_logistico')),
    vendedor: texto(campo(entrega, 'VENDEDOR', 'vendedor')),
    cliente: texto(campo(entrega, 'CLIENTE', 'cliente')),
    nome_fantasia: texto(campo(entrega, 'NomeFantasia', 'nome_fantasia')),
    data_prometida: dataPrometida(campo(entrega, 'DataEntrega', 'data_prometida')),
    observacao: texto(campo(entrega, 'Observacao', 'observacao')),
    tipo_logradouro: texto(campo(entrega, 'TipoEnt', 'tipo_logradouro')),
    endereco: texto(campo(entrega, 'ENDENT', 'endereco')),
    numero: texto(campo(entrega, 'NumEnt', 'numero')),
    bairro: texto(campo(entrega, 'BAIRRO', 'bairro')),
    cidade: texto(campo(entrega, 'CIDADE', 'cidade')),
    uf: texto(campo(entrega, 'UF', 'uf')) || 'SP',
    cep: texto(campo(entrega, 'CEP', 'cep')),
    valor: numero(campo(entrega, 'VALOR', 'valor')),
    snapshot: entrega,
  };
}

async function sincronizar({ empresa } = {}) {
  const entregas = await listarEntregas({ empresa });
  const demandas = entregas.map(normalizarDemanda);

  return postgres.transacao(async (db) => {
    let novas = 0;
    let atualizadas = 0;

    for (const demanda of demandas) {
      if (!demanda.empresa || !demanda.pedido) continue;

      const { rows } = await db.query(
        `INSERT INTO ct_demanda (
          empresa,pedido,num_nf,modalidade,prioridade,prioridade_codigo,
          status_deak_orcamento,status_logistico,vendedor,cliente,nome_fantasia,
          data_prometida,observacao,tipo_logradouro,endereco,numero,bairro,cidade,uf,cep,
          valor,presente_fila_deak,status_control_tower,capturada_em,
          ultima_vez_fila_deak_em,saiu_fila_deak_em,snapshot,atualizado_em
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,TRUE,'CAPTURADA',NOW(),NOW(),NULL,$22::jsonb,NOW()
        )
        ON CONFLICT (empresa,pedido) DO UPDATE SET
          num_nf=EXCLUDED.num_nf,
          modalidade=EXCLUDED.modalidade,
          prioridade=EXCLUDED.prioridade,
          prioridade_codigo=EXCLUDED.prioridade_codigo,
          status_deak_orcamento=EXCLUDED.status_deak_orcamento,
          status_logistico=EXCLUDED.status_logistico,
          vendedor=EXCLUDED.vendedor,
          cliente=EXCLUDED.cliente,
          nome_fantasia=EXCLUDED.nome_fantasia,
          data_prometida=EXCLUDED.data_prometida,
          observacao=EXCLUDED.observacao,
          tipo_logradouro=EXCLUDED.tipo_logradouro,
          endereco=EXCLUDED.endereco,
          numero=EXCLUDED.numero,
          bairro=EXCLUDED.bairro,
          cidade=EXCLUDED.cidade,
          uf=EXCLUDED.uf,
          cep=EXCLUDED.cep,
          valor=EXCLUDED.valor,
          presente_fila_deak=TRUE,
          ultima_vez_fila_deak_em=NOW(),
          saiu_fila_deak_em=NULL,
          snapshot=EXCLUDED.snapshot,
          atualizado_em=NOW()
        RETURNING (xmax = 0) AS inserida`,
        [
          demanda.empresa, demanda.pedido, demanda.num_nf, demanda.modalidade,
          demanda.prioridade, demanda.prioridade_codigo, demanda.status_deak_orcamento,
          demanda.status_logistico, demanda.vendedor, demanda.cliente, demanda.nome_fantasia,
          demanda.data_prometida, demanda.observacao, demanda.tipo_logradouro,
          demanda.endereco, demanda.numero, demanda.bairro, demanda.cidade, demanda.uf,
          demanda.cep, demanda.valor, JSON.stringify(demanda.snapshot),
        ]
      );

      if (rows[0] && rows[0].inserida) novas += 1;
      else atualizadas += 1;
    }

    const chaves = demandas
      .filter((d) => d.empresa && d.pedido)
      .map((d) => ({ empresa: d.empresa, pedido: d.pedido }));

    const { rowCount: ausentes } = await db.query(
      `UPDATE ct_demanda d
       SET presente_fila_deak=FALSE,
           saiu_fila_deak_em=COALESCE(d.saiu_fila_deak_em,NOW()),
           atualizado_em=NOW()
       WHERE d.presente_fila_deak=TRUE
         AND d.status_control_tower NOT IN ('ENCERRADA','CANCELADA')
         AND ($2::varchar IS NULL OR d.empresa=$2)
         AND NOT EXISTS (
           SELECT 1
           FROM jsonb_to_recordset($1::jsonb) AS atual(empresa text,pedido text)
           WHERE atual.empresa=d.empresa AND atual.pedido=d.pedido
         )`,
      [JSON.stringify(chaves), empresa ? String(empresa) : null]
    );

    return {
      lidas_deak: entregas.length,
      novas,
      atualizadas,
      marcadas_fora_fila: ausentes || 0,
    };
  });
}

async function listar({ status, modalidade: filtroModalidade, presente, limite = 200 } = {}) {
  const statusNormalizado = status ? String(status).toUpperCase() : null;
  const modalidadeNormalizada = filtroModalidade ? String(filtroModalidade).toUpperCase() : null;
  const presenteNormalizado =
    presente === undefined || presente === null || presente === ''
      ? null
      : presente === true || presente === '1' || presente === 'true';

  const { rows } = await postgres.query(
    `SELECT *
     FROM ct_demanda
     WHERE ($1::varchar IS NULL OR status_control_tower=$1)
       AND ($2::varchar IS NULL OR modalidade=$2)
       AND ($3::boolean IS NULL OR presente_fila_deak=$3)
     ORDER BY data_prometida NULLS LAST, id
     LIMIT $4`,
    [
      statusNormalizado,
      modalidadeNormalizada,
      presenteNormalizado,
      Math.min(Math.max(Number(limite) || 200, 1), 1000),
    ]
  );

  return rows;
}

module.exports = {
  normalizarDemanda,
  sincronizar,
  listar,
};
