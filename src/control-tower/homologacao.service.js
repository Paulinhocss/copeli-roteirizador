const postgres = require('../infrastructure/postgres');
const deak = require('../infrastructure/deak');
const { ambiente } = require('../config/ambiente');
const contele = require('../integracoes/contele/service');

const TABELAS_POSTGRES = [
  'roteirizacao_configuracao',
  'roteirizacao_motorista',
  'roteirizacao_veiculo',
  'roteirizacao_faixa_cep',
  'roteirizacao_ponto_despacho',
  'ct_planejamento',
  'ct_rota',
  'ct_parada',
  'ct_parada_entrega',
  'ct_evento',
  'ct_ocorrencia',
  'ct_alerta',
  'ct_melhoria',
  'ct_melhoria_acao',
  'ct_meta_kpi',
  'ct_contele_posicao_atual',
];

function item(nome, status, detalhe, obrigatorio = true) {
  return { nome, status, detalhe: detalhe || null, obrigatorio };
}

async function verificarPostgres() {
  if (!postgres.configurado()) {
    return {
      ok: false,
      itens: [
        item('PostgreSQL', 'NAO_CONFIGURADO', 'DATABASE_URL/ROTEIRIZADOR_DATABASE_URL ausente.'),
      ],
      tabelas: [],
    };
  }

  try {
    const { rows } = await postgres.query(
      "SELECT current_database() AS database_name, NOW() AS servidor_em"
    );

    const tabelaResult = await postgres.query(
      "SELECT c.relname AS tabela " +
      "FROM pg_class c INNER JOIN pg_namespace n ON n.oid=c.relnamespace " +
      "WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])",
      [TABELAS_POSTGRES]
    );

    const existentes = new Set(tabelaResult.rows.map((r) => r.tabela));
    const tabelas = TABELAS_POSTGRES.map((nome) => ({
      nome,
      existe: existentes.has(nome),
    }));
    const faltantes = tabelas.filter((t) => !t.existe).map((t) => t.nome);

    return {
      ok: faltantes.length === 0,
      itens: [
        item(
          'PostgreSQL',
          faltantes.length ? 'MIGRACAO_INCOMPLETA' : 'OK',
          faltantes.length
            ? 'Faltam ' + faltantes.length + ' tabela(s) do Control Tower.'
            : 'Conexao e estrutura principal disponiveis.'
        ),
      ],
      banco: rows[0] ? rows[0].database_name : null,
      servidor_em: rows[0] ? rows[0].servidor_em : null,
      tabelas,
      faltantes,
    };
  } catch (erro) {
    return {
      ok: false,
      itens: [item('PostgreSQL', 'ERRO', erro.message)],
      tabelas: [],
    };
  }
}

async function verificarDeak(profundo) {
  if (!deak.configurado()) {
    return {
      ok: false,
      itens: [
        item(
          'Deak SQL Server',
          'NAO_CONFIGURADO',
          'DEAK_DB_SERVER/USER/PASSWORD nao configurados.'
        ),
      ],
    };
  }

  if (!profundo) {
    return {
      ok: true,
      itens: [item('Deak SQL Server', 'CONFIGURADO', 'Credenciais presentes; teste profundo nao solicitado.')],
    };
  }

  try {
    const pool = await deak.obterPool();
    const resultado = await pool.request().query(
      "SELECT " +
      "(SELECT COUNT_BIG(*) FROM Orcamento " +
      " WHERE DataEntrega>=DATEADD(DAY,-90,GETDATE()) " +
      " AND Prioridade IN ('31','32','23')) AS Demandas90Dias, " +
      "(SELECT COUNT_BIG(*) FROM StatusPedido WHERE DataInicio>=DATEADD(DAY,-1,GETDATE())) AS Eventos24h"
    );

    const row = resultado.recordset && resultado.recordset[0] ? resultado.recordset[0] : {};
    return {
      ok: true,
      itens: [item('Deak SQL Server', 'OK', 'Conexao somente leitura validada.')],
      amostra: {
        demandas_90_dias: Number(row.Demandas90Dias || 0),
        eventos_status_24h: Number(row.Eventos24h || 0),
      },
    };
  } catch (erro) {
    return {
      ok: false,
      itens: [item('Deak SQL Server', 'ERRO', erro.message)],
    };
  }
}

async function verificarContele(profundo) {
  if (!contele.configurado()) {
    return {
      ok: false,
      itens: [
        item(
          'Contele Fleet',
          'NAO_CONFIGURADO',
          'CONTELE_API_KEY ausente. Planejamento funciona, mas telemetria ao vivo fica indisponivel.',
          false
        ),
      ],
    };
  }

  if (!profundo) {
    return {
      ok: true,
      itens: [item('Contele Fleet', 'CONFIGURADO', 'API key presente; teste profundo nao solicitado.', false)],
    };
  }

  try {
    const dados = await contele.listarVeiculos();
    let total = null;
    if (Array.isArray(dados)) total = dados.length;
    else if (dados && Array.isArray(dados.vehicles)) total = dados.vehicles.length;
    else if (dados && Array.isArray(dados.data)) total = dados.data.length;

    return {
      ok: true,
      itens: [item('Contele Fleet', 'OK', 'API respondeu ao teste de veiculos.', false)],
      total_veiculos_detectado: total,
    };
  } catch (erro) {
    return {
      ok: false,
      itens: [item('Contele Fleet', 'ERRO', erro.message, false)],
    };
  }
}

function verificarHere() {
  const ok = Boolean(ambiente.hereApiKey);
  return {
    ok,
    itens: [
      item(
        'HERE',
        ok ? 'CONFIGURADO' : 'NAO_CONFIGURADO',
        ok
          ? 'HERE_API_KEY presente. Geocodificacao, Routing e Tour Planning podem ser homologados.'
          : 'HERE_API_KEY ausente.'
      ),
    ],
  };
}

function verificarAmbiente() {
  const obrigatorias = [
    ['DATABASE_URL', Boolean(ambiente.postgres.url)],
    ['HERE_API_KEY', Boolean(ambiente.hereApiKey)],
    ['DEAK_DB_SERVER', Boolean(ambiente.deak.server)],
    ['DEAK_DB_USER', Boolean(ambiente.deak.user)],
    ['DEAK_DB_PASSWORD', Boolean(ambiente.deak.password)],
  ];

  const opcionais = [
    ['CONTELE_API_KEY', Boolean(ambiente.contele.apiKey)],
  ];

  return {
    obrigatorias: obrigatorias.map(([nome, presente]) => ({ nome, presente })),
    opcionais: opcionais.map(([nome, presente]) => ({ nome, presente })),
    faltantes_obrigatorias: obrigatorias.filter(([, presente]) => !presente).map(([nome]) => nome),
  };
}

async function executar({ profundo = false } = {}) {
  const [pg, dk, ct] = await Promise.all([
    verificarPostgres(),
    verificarDeak(profundo),
    verificarContele(profundo),
  ]);
  const here = verificarHere();
  const ambienteStatus = verificarAmbiente();

  const itens = [
    ...(pg.itens || []),
    ...(dk.itens || []),
    ...(here.itens || []),
    ...(ct.itens || []),
  ];

  const bloqueios = itens.filter((i) => i.obrigatorio && !['OK','CONFIGURADO'].includes(i.status));

  return {
    pronto_para_homologar: bloqueios.length === 0,
    profundo: Boolean(profundo),
    gerado_em: new Date().toISOString(),
    bloqueios,
    ambiente: ambienteStatus,
    postgres: pg,
    deak: dk,
    here,
    contele: ct,
  };
}

module.exports = {
  executar,
  verificarPostgres,
  verificarDeak,
  verificarContele,
  verificarHere,
};