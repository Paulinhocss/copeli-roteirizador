const fs = require('fs');
const path = require('path');
const postgres = require('../infrastructure/postgres');
const ctSql = require('../infrastructure/control-tower-sqlserver');
const store = require('../infrastructure/control-tower-store');
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

async function garantirEstrutura() {
  if (store.driver() === 'postgres') return true;
  if (store.driver() !== 'mssql') return false;

  const arquivo = path.resolve(__dirname, '../../sql/mssql/007_demandas_snapshot.sql');
  const sql = fs.readFileSync(arquivo, 'utf8');
  const pool = await ctSql.obterPool();
  await pool.request().batch(sql);
  return true;
}

async function sincronizarPostgres(entregas, demandas, empresa) {
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
      persistencia: 'postgres',
      lidas_deak: entregas.length,
      novas,
      atualizadas,
      marcadas_fora_fila: ausentes || 0,
    };
  });
}

function bindDemanda(request, d) {
  const sql = ctSql.sql;
  request.input('empresa', sql.VarChar(40), d.empresa);
  request.input('pedido', sql.VarChar(60), d.pedido);
  request.input('num_nf', sql.VarChar(60), d.num_nf);
  request.input('modalidade', sql.VarChar(24), d.modalidade);
  request.input('prioridade', sql.VarChar(120), d.prioridade);
  request.input('prioridade_codigo', sql.VarChar(12), d.prioridade_codigo);
  request.input('status_deak_orcamento', sql.VarChar(12), d.status_deak_orcamento);
  request.input('status_logistico', sql.VarChar(12), d.status_logistico);
  request.input('vendedor', sql.VarChar(120), d.vendedor);
  request.input('cliente', sql.VarChar(220), d.cliente);
  request.input('nome_fantasia', sql.VarChar(220), d.nome_fantasia);
  request.input('data_prometida', sql.Date, d.data_prometida);
  request.input('observacao', sql.NVarChar(sql.MAX), d.observacao);
  request.input('tipo_logradouro', sql.VarChar(40), d.tipo_logradouro);
  request.input('endereco', sql.NVarChar(500), d.endereco);
  request.input('numero', sql.VarChar(40), d.numero);
  request.input('bairro', sql.VarChar(140), d.bairro);
  request.input('cidade', sql.VarChar(140), d.cidade);
  request.input('uf', sql.Char(2), d.uf);
  request.input('cep', sql.VarChar(8), d.cep);
  request.input('valor', sql.Decimal(18, 2), d.valor);
  request.input('snapshot', sql.NVarChar(sql.MAX), JSON.stringify(d.snapshot));
}

async function sincronizarMssql(entregas, demandas, empresa) {
  return ctSql.transacao(async (transaction) => {
    let novas = 0;
    let atualizadas = 0;

    for (const demanda of demandas) {
      if (!demanda.empresa || !demanda.pedido) continue;

      const request = new ctSql.sql.Request(transaction);
      bindDemanda(request, demanda);
      const resultado = await request.query(`
        DECLARE @existia BIT = CASE WHEN EXISTS (
          SELECT 1 FROM dbo.ct_demanda WITH (UPDLOCK, HOLDLOCK)
          WHERE empresa=@empresa AND pedido=@pedido
        ) THEN 1 ELSE 0 END;

        IF @existia = 1
        BEGIN
          UPDATE dbo.ct_demanda
          SET num_nf=@num_nf,
              modalidade=@modalidade,
              prioridade=@prioridade,
              prioridade_codigo=@prioridade_codigo,
              status_deak_orcamento=@status_deak_orcamento,
              status_logistico=@status_logistico,
              vendedor=@vendedor,
              cliente=@cliente,
              nome_fantasia=@nome_fantasia,
              data_prometida=@data_prometida,
              observacao=@observacao,
              tipo_logradouro=@tipo_logradouro,
              endereco=@endereco,
              numero=@numero,
              bairro=@bairro,
              cidade=@cidade,
              uf=@uf,
              cep=@cep,
              valor=@valor,
              presente_fila_deak=1,
              ultima_vez_fila_deak_em=SYSDATETIME(),
              saiu_fila_deak_em=NULL,
              snapshot=@snapshot,
              atualizado_em=SYSDATETIME()
          WHERE empresa=@empresa AND pedido=@pedido;
        END
        ELSE
        BEGIN
          INSERT INTO dbo.ct_demanda (
            empresa,pedido,num_nf,modalidade,prioridade,prioridade_codigo,
            status_deak_orcamento,status_logistico,vendedor,cliente,nome_fantasia,
            data_prometida,observacao,tipo_logradouro,endereco,numero,bairro,cidade,uf,cep,
            valor,presente_fila_deak,status_control_tower,capturada_em,
            ultima_vez_fila_deak_em,saiu_fila_deak_em,snapshot,atualizado_em
          )
          VALUES (
            @empresa,@pedido,@num_nf,@modalidade,@prioridade,@prioridade_codigo,
            @status_deak_orcamento,@status_logistico,@vendedor,@cliente,@nome_fantasia,
            @data_prometida,@observacao,@tipo_logradouro,@endereco,@numero,@bairro,@cidade,@uf,@cep,
            @valor,1,'CAPTURADA',SYSDATETIME(),SYSDATETIME(),NULL,@snapshot,SYSDATETIME()
          );
        END;

        SELECT @existia AS existia;
      `);

      if (resultado.recordset[0] && resultado.recordset[0].existia) atualizadas += 1;
      else novas += 1;
    }

    const chaves = demandas
      .filter((d) => d.empresa && d.pedido)
      .map((d) => ({ empresa: d.empresa, pedido: d.pedido }));

    const request = new ctSql.sql.Request(transaction);
    request.input('chaves', ctSql.sql.NVarChar(ctSql.sql.MAX), JSON.stringify(chaves));
    request.input('empresaFiltro', ctSql.sql.VarChar(40), empresa ? String(empresa) : null);
    const ausentes = await request.query(`
      UPDATE d
      SET presente_fila_deak=0,
          saiu_fila_deak_em=COALESCE(d.saiu_fila_deak_em,SYSDATETIME()),
          atualizado_em=SYSDATETIME()
      FROM dbo.ct_demanda d
      WHERE d.presente_fila_deak=1
        AND d.status_control_tower NOT IN ('ENCERRADA','CANCELADA')
        AND (@empresaFiltro IS NULL OR d.empresa=@empresaFiltro)
        AND NOT EXISTS (
          SELECT 1
          FROM OPENJSON(@chaves)
          WITH (
            empresa VARCHAR(40) '$.empresa',
            pedido VARCHAR(60) '$.pedido'
          ) atual
          WHERE atual.empresa=d.empresa
            AND atual.pedido=d.pedido
        );
    `);

    return {
      persistencia: 'mssql',
      lidas_deak: entregas.length,
      novas,
      atualizadas,
      marcadas_fora_fila: (ausentes.rowsAffected && ausentes.rowsAffected[0]) || 0,
    };
  });
}

async function sincronizar({ empresa } = {}) {
  const entregas = await listarEntregas({ empresa });
  const demandas = entregas.map(normalizarDemanda);

  const driver = store.driver();
  if (driver === 'postgres') return sincronizarPostgres(entregas, demandas, empresa);
  if (driver === 'mssql') return sincronizarMssql(entregas, demandas, empresa);

  const erro = new Error('Persistencia do Control Tower nao configurada.');
  erro.code = 'CT_STORE_NAO_CONFIGURADO';
  throw erro;
}

function filtrosLista({ status, modalidade: filtroModalidade, presente, limite = 200 } = {}) {
  return {
    status: status ? String(status).toUpperCase() : null,
    modalidade: filtroModalidade ? String(filtroModalidade).toUpperCase() : null,
    presente:
      presente === undefined || presente === null || presente === ''
        ? null
        : presente === true || presente === '1' || presente === 'true',
    limite: Math.min(Math.max(Number(limite) || 200, 1), 1000),
  };
}

async function listarPostgres(filtros) {
  const { rows } = await postgres.query(
    `SELECT *
     FROM ct_demanda
     WHERE ($1::varchar IS NULL OR status_control_tower=$1)
       AND ($2::varchar IS NULL OR modalidade=$2)
       AND ($3::boolean IS NULL OR presente_fila_deak=$3)
     ORDER BY data_prometida NULLS LAST, id
     LIMIT $4`,
    [filtros.status, filtros.modalidade, filtros.presente, filtros.limite]
  );
  return rows;
}

async function listarMssql(filtros) {
  const pool = await ctSql.obterPool();
  const request = pool.request();
  request.input('status', ctSql.sql.VarChar(24), filtros.status);
  request.input('modalidade', ctSql.sql.VarChar(24), filtros.modalidade);
  request.input('presente', ctSql.sql.Bit, filtros.presente);
  request.input('limite', ctSql.sql.Int, filtros.limite);

  const resultado = await request.query(`
    SELECT TOP (@limite) *
    FROM dbo.ct_demanda
    WHERE (@status IS NULL OR status_control_tower=@status)
      AND (@modalidade IS NULL OR modalidade=@modalidade)
      AND (@presente IS NULL OR presente_fila_deak=@presente)
    ORDER BY CASE WHEN data_prometida IS NULL THEN 1 ELSE 0 END, data_prometida, id;
  `);
  return resultado.recordset;
}

async function listar(opcoes = {}) {
  const filtros = filtrosLista(opcoes);
  const driver = store.driver();
  if (driver === 'postgres') return listarPostgres(filtros);
  if (driver === 'mssql') return listarMssql(filtros);

  const erro = new Error('Persistencia do Control Tower nao configurada.');
  erro.code = 'CT_STORE_NAO_CONFIGURADO';
  throw erro;
}

module.exports = {
  normalizarDemanda,
  garantirEstrutura,
  sincronizar,
  listar,
};
