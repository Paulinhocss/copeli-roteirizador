const fs = require('fs');
const path = require('path');
const postgres = require('../infrastructure/postgres');

function hojeSaoPaulo() {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const mapa = Object.fromEntries(
    partes.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  );
  return `${mapa.year}-${mapa.month}-${mapa.day}`;
}

async function garantirEstrutura() {
  if (!postgres.configurado()) return false;
  for (const relativo of [
    '../../sql/002_control_tower.sql',
    '../../sql/007_demandas_snapshot.sql',
  ]) {
    const arquivo = path.resolve(__dirname, relativo);
    await postgres.query(fs.readFileSync(arquivo, 'utf8'));
  }
  return true;
}

async function obterResumo(dataOperacao = hojeSaoPaulo()) {
  const { rows } = await postgres.query(`
    WITH rotas AS (
      SELECT *
      FROM ct_rota
      WHERE data_operacao = $1::date
    ),
    paradas AS (
      SELECT p.*
      FROM ct_parada p
      INNER JOIN rotas r ON r.id = p.rota_id
    ),
    entregas AS (
      SELECT pe.*, p.status AS status_parada
      FROM ct_parada_entrega pe
      INNER JOIN paradas p ON p.id = pe.parada_id
    ),
    ocorrencias AS (
      SELECT COUNT(*)::int AS abertas
      FROM ct_ocorrencia o
      WHERE o.status IN ('ABERTA','EM_ANALISE')
        AND (
          o.rota_id IN (SELECT id FROM rotas)
          OR o.parada_id IN (SELECT id FROM paradas)
        )
    ),
    alertas AS (
      SELECT COUNT(*)::int AS abertos,
             COUNT(*) FILTER (WHERE severidade IN ('ALTA','CRITICA'))::int AS criticos
      FROM ct_alerta
      WHERE status IN ('ABERTO','RECONHECIDO')
    ),
    melhorias AS (
      SELECT COUNT(*)::int AS abertas,
             COUNT(*) FILTER (
               WHERE prazo_em IS NOT NULL
                 AND prazo_em < CURRENT_DATE
                 AND status NOT IN ('CONCLUIDA','CANCELADA')
             )::int AS atrasadas
      FROM ct_melhoria
      WHERE status NOT IN ('CONCLUIDA','CANCELADA')
    )
    SELECT
      $1::date AS data_operacao,
      (SELECT COUNT(*)::int FROM rotas) AS rotas_total,
      (SELECT COUNT(*) FILTER (WHERE status = 'PLANEJADA')::int FROM rotas) AS rotas_planejadas,
      (SELECT COUNT(*) FILTER (WHERE status = 'LIBERADA')::int FROM rotas) AS rotas_liberadas,
      (SELECT COUNT(*) FILTER (WHERE status = 'EM_ROTA')::int FROM rotas) AS rotas_em_rota,
      (SELECT COUNT(*) FILTER (WHERE status = 'FINALIZADA')::int FROM rotas) AS rotas_finalizadas,
      (SELECT COUNT(*)::int FROM paradas) AS paradas_total,
      (SELECT COUNT(*) FILTER (WHERE status = 'ENTREGUE')::int FROM paradas) AS paradas_concluidas,
      (SELECT COUNT(*) FILTER (WHERE status = 'NAO_ENTREGUE')::int FROM paradas) AS paradas_nao_entregues,
      (SELECT COUNT(*) FILTER (WHERE status = 'REAGENDADA')::int FROM paradas) AS paradas_reagendadas,
      (SELECT COUNT(*) FILTER (
        WHERE status IN ('PENDENTE','EM_DESLOCAMENTO','NO_CLIENTE')
      )::int FROM paradas) AS paradas_pendentes,
      (SELECT COUNT(*)::int FROM entregas) AS entregas_total,
      (SELECT COUNT(*) FILTER (WHERE status_parada = 'ENTREGUE')::int FROM entregas) AS entregas_concluidas_copeli,
      (SELECT COUNT(*) FILTER (WHERE status_parada = 'NAO_ENTREGUE')::int FROM entregas) AS entregas_nao_entregues,
      (SELECT COUNT(*) FILTER (WHERE status_parada = 'REAGENDADA')::int FROM entregas) AS entregas_reagendadas,
      (SELECT COUNT(*) FILTER (
        WHERE status_parada IN ('PENDENTE','EM_DESLOCAMENTO','NO_CLIENTE')
      )::int FROM entregas) AS entregas_pendentes,
      (SELECT COUNT(*) FILTER (WHERE modalidade = 'PROPRIA')::int FROM entregas) AS modalidade_propria,
      (SELECT COUNT(*) FILTER (WHERE modalidade = 'TRANSPORTADORA')::int FROM entregas) AS modalidade_transportadora,
      (SELECT COUNT(*) FILTER (WHERE modalidade = 'SEDEX')::int FROM entregas) AS modalidade_sedex,
      (SELECT COUNT(*) FILTER (
        WHERE modalidade IN ('TRANSPORTADORA','SEDEX')
          AND status_externo = 'AGUARDANDO_DESPACHO'
      )::int FROM entregas) AS externos_aguardando_despacho,
      (SELECT COUNT(*) FILTER (
        WHERE modalidade IN ('TRANSPORTADORA','SEDEX')
          AND status_externo IN ('DESPACHADO','EM_TRANSITO')
      )::int FROM entregas) AS externos_em_acompanhamento,
      (SELECT COUNT(*) FILTER (
        WHERE modalidade IN ('TRANSPORTADORA','SEDEX')
          AND status_externo = 'ENTREGUE'
      )::int FROM entregas) AS externos_entregues_final,
      (SELECT COUNT(*) FILTER (
        WHERE modalidade IN ('TRANSPORTADORA','SEDEX')
          AND status_externo = 'EXCECAO'
      )::int FROM entregas) AS externos_excecao,
      COALESCE((SELECT SUM(valor) FROM entregas), 0)::numeric(18,2) AS valor_total,
      COALESCE((SELECT SUM(km_planejado) FROM rotas), 0)::numeric(12,2) AS km_planejado,
      (SELECT SUM(km_real)::numeric(12,2) FROM rotas WHERE km_real IS NOT NULL) AS km_real,
      (SELECT COUNT(*)::int FROM rotas WHERE km_real IS NOT NULL) AS rotas_com_km_real,
      (SELECT abertas FROM ocorrencias) AS ocorrencias_abertas,
      (SELECT abertos FROM alertas) AS alertas_abertos,
      (SELECT criticos FROM alertas) AS alertas_criticos,
      (SELECT abertas FROM melhorias) AS melhorias_abertas,
      (SELECT atrasadas FROM melhorias) AS melhorias_atrasadas
  `, [dataOperacao]);

  return rows[0];
}

async function listarOcorrencias({ status, limite = 100 } = {}) {
  const statusNormalizado = status ? String(status).toUpperCase() : null;
  const { rows } = await postgres.query(`
    SELECT
      o.id, o.rota_id, o.parada_id, o.categoria, o.motivo, o.descricao,
      o.severidade, o.status, o.responsavel, o.causa_raiz, o.acao_corretiva,
      o.custo_estimado, o.reincidente, o.aberta_em, o.prazo_em,
      o.encerrada_em, o.atualizada_em,
      r.codigo AS rota_codigo,
      p.pedido,
      p.cliente
    FROM ct_ocorrencia o
    LEFT JOIN ct_rota r ON r.id = o.rota_id
    LEFT JOIN ct_parada p ON p.id = o.parada_id
    WHERE ($1::varchar IS NULL OR o.status = $1)
    ORDER BY
      CASE o.severidade
        WHEN 'CRITICA' THEN 1
        WHEN 'ALTA' THEN 2
        WHEN 'MEDIA' THEN 3
        ELSE 4
      END,
      o.aberta_em DESC
    LIMIT $2
  `, [statusNormalizado, Math.min(Math.max(Number(limite) || 100, 1), 500)]);
  return rows;
}

async function criarOcorrencia(dados) {
  const categoria = String(dados.categoria || '').trim();
  const motivo = String(dados.motivo || '').trim();
  if (!categoria || !motivo) {
    const erro = new Error('Categoria e motivo da ocorrencia sao obrigatorios.');
    erro.code = 'OCORRENCIA_INVALIDA';
    throw erro;
  }

  const severidade = String(dados.severidade || 'MEDIA').toUpperCase();
  if (!['BAIXA','MEDIA','ALTA','CRITICA'].includes(severidade)) {
    const erro = new Error('Severidade da ocorrencia invalida.');
    erro.code = 'OCORRENCIA_INVALIDA';
    throw erro;
  }

  const { rows } = await postgres.query(`
    INSERT INTO ct_ocorrencia (
      rota_id, parada_id, categoria, motivo, descricao, severidade,
      responsavel, prazo_em, custo_estimado, reincidente
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
  `, [
    dados.rota_id || null,
    dados.parada_id || null,
    categoria,
    motivo,
    dados.descricao || null,
    severidade,
    dados.responsavel || null,
    dados.prazo_em || null,
    dados.custo_estimado ?? null,
    Boolean(dados.reincidente),
  ]);

  return rows[0];
}

async function listarMelhorias({ status, limite = 100 } = {}) {
  const statusNormalizado = status ? String(status).toUpperCase() : null;
  const { rows } = await postgres.query(`
    SELECT
      m.*,
      COUNT(a.id)::int AS total_acoes,
      COUNT(a.id) FILTER (WHERE a.status = 'CONCLUIDA')::int AS acoes_concluidas,
      COUNT(a.id) FILTER (
        WHERE a.status NOT IN ('CONCLUIDA','CANCELADA')
          AND a.quando_em IS NOT NULL
          AND a.quando_em < CURRENT_DATE
      )::int AS acoes_atrasadas
    FROM ct_melhoria m
    LEFT JOIN ct_melhoria_acao a ON a.melhoria_id = m.id
    WHERE ($1::varchar IS NULL OR m.status = $1)
    GROUP BY m.id
    ORDER BY
      CASE m.prioridade
        WHEN 'CRITICA' THEN 1
        WHEN 'ALTA' THEN 2
        WHEN 'MEDIA' THEN 3
        ELSE 4
      END,
      m.prazo_em NULLS LAST,
      m.criada_em DESC
    LIMIT $2
  `, [statusNormalizado, Math.min(Math.max(Number(limite) || 100, 1), 500)]);
  return rows;
}

async function criarMelhoria(dados) {
  const titulo = String(dados.titulo || '').trim();
  const categoria = String(dados.categoria || '').trim();
  const problema = String(dados.problema || '').trim();

  if (!titulo || !categoria || !problema) {
    const erro = new Error('Titulo, categoria e problema sao obrigatorios.');
    erro.code = 'MELHORIA_INVALIDA';
    throw erro;
  }

  const prioridade = String(dados.prioridade || 'MEDIA').toUpperCase();
  if (!['BAIXA','MEDIA','ALTA','CRITICA'].includes(prioridade)) {
    const erro = new Error('Prioridade da melhoria invalida.');
    erro.code = 'MELHORIA_INVALIDA';
    throw erro;
  }

  const { rows } = await postgres.query(`
    INSERT INTO ct_melhoria (
      titulo, categoria, problema, hipotese_causa, metrica, unidade,
      linha_base, meta, resultado_atual, economia_estimada, responsavel,
      prioridade, inicio_em, prazo_em
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *
  `, [
    titulo,
    categoria,
    problema,
    dados.hipotese_causa || null,
    dados.metrica || null,
    dados.unidade || null,
    dados.linha_base ?? null,
    dados.meta ?? null,
    dados.resultado_atual ?? null,
    dados.economia_estimada ?? null,
    dados.responsavel || null,
    prioridade,
    dados.inicio_em || null,
    dados.prazo_em || null,
  ]);

  return rows[0];
}

async function criarAcaoMelhoria(melhoriaId, dados) {
  const oQue = String(dados.o_que || '').trim();
  if (!oQue) {
    const erro = new Error('O campo "o que" da acao e obrigatorio.');
    erro.code = 'MELHORIA_INVALIDA';
    throw erro;
  }

  const { rows } = await postgres.query(`
    INSERT INTO ct_melhoria_acao (
      melhoria_id, o_que, por_que, onde_local, quando_em, quem, como, quanto
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
  `, [
    melhoriaId,
    oQue,
    dados.por_que || null,
    dados.onde_local || null,
    dados.quando_em || null,
    dados.quem || null,
    dados.como || null,
    dados.quanto ?? null,
  ]);

  return rows[0];
}

module.exports = {
  hojeSaoPaulo,
  garantirEstrutura,
  obterResumo,
  listarOcorrencias,
  criarOcorrencia,
  listarMelhorias,
  criarMelhoria,
  criarAcaoMelhoria,
};
