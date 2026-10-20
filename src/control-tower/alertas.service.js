const postgres = require('../infrastructure/postgres');

const TIPOS_GERENCIADOS = [
  'ROTA_SEM_MOTORISTA',
  'ROTA_SEM_VEICULO',
  'VEICULO_SEM_CONTELE',
  'CONTELE_POSICAO_DESATUALIZADA',
  'PARADA_NAO_ENTREGUE',
  'EXTERNO_EXCECAO',
  'EXTERNO_SEM_RASTREIO',
];

let timer = null;
let executando = false;
let ultimaExecucao = null;
let ultimoErro = null;

async function registrar(alerta) {
  const update = await postgres.query(
    "UPDATE ct_alerta SET tipo=$2,severidade=$3,entidade_tipo=$4,entidade_id=$5," +
    "titulo=$6,descricao=$7,dados=$8::jsonb,detectado_em=LEAST(detectado_em,NOW()) " +
    "WHERE fingerprint=$1 AND status<>'RESOLVIDO' RETURNING *",
    [
      alerta.fingerprint,
      alerta.tipo,
      alerta.severidade,
      alerta.entidade_tipo || null,
      alerta.entidade_id || null,
      alerta.titulo,
      alerta.descricao || null,
      JSON.stringify(alerta.dados || {}),
    ]
  );
  if (update.rows[0]) return update.rows[0];

  const insert = await postgres.query(
    "INSERT INTO ct_alerta " +
    "(fingerprint,tipo,severidade,entidade_tipo,entidade_id,titulo,descricao,status,dados) " +
    "VALUES ($1,$2,$3,$4,$5,$6,$7,'ABERTO',$8::jsonb) RETURNING *",
    [
      alerta.fingerprint,
      alerta.tipo,
      alerta.severidade,
      alerta.entidade_tipo || null,
      alerta.entidade_id || null,
      alerta.titulo,
      alerta.descricao || null,
      JSON.stringify(alerta.dados || {}),
    ]
  );
  return insert.rows[0];
}

async function coletarCondicoes() {
  const alertas = [];

  const rotas = await postgres.query(
    "SELECT r.id,r.codigo,r.status,r.motorista_id,r.veiculo_id,v.placa,v.nome AS veiculo_nome," +
    "v.contele_vehicle_id,cp.rastreador_atualizado_em,cp.sincronizado_em " +
    "FROM ct_rota r " +
    "LEFT JOIN roteirizacao_veiculo v ON v.id=r.veiculo_id " +
    "LEFT JOIN ct_contele_posicao_atual cp ON cp.contele_vehicle_id=v.contele_vehicle_id " +
    "WHERE r.status IN ('LIBERADA','EM_ROTA')"
  );

  rotas.rows.forEach((r) => {
    if (!r.motorista_id) {
      alertas.push({
        fingerprint: 'ROTA_SEM_MOTORISTA:' + r.id,
        tipo: 'ROTA_SEM_MOTORISTA',
        severidade: 'ALTA',
        entidade_tipo: 'ROTA',
        entidade_id: r.id,
        titulo: (r.codigo || ('Rota ' + r.id)) + ' sem motorista',
        descricao: 'A rota oficial esta liberada ou em execucao sem motorista vinculado.',
      });
    }

    if (!r.veiculo_id) {
      alertas.push({
        fingerprint: 'ROTA_SEM_VEICULO:' + r.id,
        tipo: 'ROTA_SEM_VEICULO',
        severidade: 'ALTA',
        entidade_tipo: 'ROTA',
        entidade_id: r.id,
        titulo: (r.codigo || ('Rota ' + r.id)) + ' sem veiculo',
        descricao: 'A rota oficial esta liberada ou em execucao sem veiculo vinculado.',
      });
    }

    if (r.status === 'EM_ROTA' && r.veiculo_id && !r.contele_vehicle_id) {
      alertas.push({
        fingerprint: 'VEICULO_SEM_CONTELE:' + r.veiculo_id,
        tipo: 'VEICULO_SEM_CONTELE',
        severidade: 'MEDIA',
        entidade_tipo: 'VEICULO',
        entidade_id: r.veiculo_id,
        titulo: 'Veiculo em rota sem vinculo Contele',
        descricao: (r.placa || r.veiculo_nome || ('Veiculo ' + r.veiculo_id)) +
          ' nao possui contele_vehicle_id configurado.',
        dados: { rota_id: r.id, rota_codigo: r.codigo || null },
      });
    }

    if (r.status === 'EM_ROTA' && r.contele_vehicle_id) {
      const referencia = r.rastreador_atualizado_em || r.sincronizado_em;
      const idade = referencia ? Date.now() - new Date(referencia).getTime() : Infinity;
      if (!Number.isFinite(idade) || idade > 5 * 60 * 1000) {
        alertas.push({
          fingerprint: 'CONTELE_POSICAO_DESATUALIZADA:' + r.contele_vehicle_id,
          tipo: 'CONTELE_POSICAO_DESATUALIZADA',
          severidade: 'ALTA',
          entidade_tipo: 'VEICULO',
          entidade_id: r.veiculo_id,
          titulo: 'Posicao Contele desatualizada',
          descricao: (r.placa || r.veiculo_nome || 'Veiculo') +
            ' esta em rota sem posicao recente ha mais de 5 minutos.',
          dados: {
            rota_id: r.id,
            rota_codigo: r.codigo || null,
            contele_vehicle_id: r.contele_vehicle_id,
            ultima_posicao: referencia || null,
          },
        });
      }
    }
  });

  const paradas = await postgres.query(
    "SELECT p.id,p.rota_id,p.cliente,p.motivo_nao_entrega,r.codigo " +
    "FROM ct_parada p INNER JOIN ct_rota r ON r.id=p.rota_id " +
    "WHERE p.status='NAO_ENTREGUE'"
  );

  paradas.rows.forEach((p) => {
    alertas.push({
      fingerprint: 'PARADA_NAO_ENTREGUE:' + p.id,
      tipo: 'PARADA_NAO_ENTREGUE',
      severidade: 'ALTA',
      entidade_tipo: 'PARADA',
      entidade_id: p.id,
      titulo: 'Entrega nao realizada',
      descricao: (p.codigo || 'Rota') + ' · ' + (p.cliente || 'parada') +
        (p.motivo_nao_entrega ? ' · ' + p.motivo_nao_entrega : ''),
      dados: { rota_id: p.rota_id },
    });
  });

  const externos = await postgres.query(
    "SELECT pe.id,pe.parada_id,pe.pedido,pe.cliente,pe.modalidade,pe.status_externo," +
    "pe.codigo_rastreio,p.rota_id,r.codigo " +
    "FROM ct_parada_entrega pe " +
    "INNER JOIN ct_parada p ON p.id=pe.parada_id " +
    "INNER JOIN ct_rota r ON r.id=p.rota_id " +
    "WHERE pe.modalidade IN ('TRANSPORTADORA','SEDEX') " +
    "AND pe.status_externo IN ('EM_TRANSITO','EXCECAO')"
  );

  externos.rows.forEach((e) => {
    if (e.status_externo === 'EXCECAO') {
      alertas.push({
        fingerprint: 'EXTERNO_EXCECAO:' + e.id,
        tipo: 'EXTERNO_EXCECAO',
        severidade: 'ALTA',
        entidade_tipo: 'ENTREGA',
        entidade_id: e.id,
        titulo: 'Excecao no transporte externo',
        descricao: (e.modalidade || '') + ' · pedido ' + (e.pedido || '—') +
          ' · ' + (e.cliente || 'cliente'),
        dados: { rota_id: e.rota_id, parada_id: e.parada_id, rota_codigo: e.codigo || null },
      });
    }

    if (e.status_externo === 'EM_TRANSITO' && !e.codigo_rastreio) {
      alertas.push({
        fingerprint: 'EXTERNO_SEM_RASTREIO:' + e.id,
        tipo: 'EXTERNO_SEM_RASTREIO',
        severidade: 'MEDIA',
        entidade_tipo: 'ENTREGA',
        entidade_id: e.id,
        titulo: 'Despacho externo sem rastreio',
        descricao: (e.modalidade || '') + ' · pedido ' + (e.pedido || '—') +
          ' esta em transito sem codigo de rastreio/referencia.',
        dados: { rota_id: e.rota_id, parada_id: e.parada_id, rota_codigo: e.codigo || null },
      });
    }
  });

  return alertas;
}

async function avaliar() {
  if (executando || !postgres.configurado()) return { executado: false };
  executando = true;

  try {
    const encontrados = await coletarCondicoes();
    const fingerprints = [];

    for (const alerta of encontrados) {
      await registrar(alerta);
      fingerprints.push(alerta.fingerprint);
    }

    await postgres.query(
      "UPDATE ct_alerta SET status='RESOLVIDO',resolvido_em=NOW() " +
      "WHERE tipo=ANY($1::varchar[]) AND status<>'RESOLVIDO' " +
      "AND NOT (fingerprint=ANY($2::varchar[]))",
      [TIPOS_GERENCIADOS, fingerprints]
    );

    ultimaExecucao = new Date().toISOString();
    ultimoErro = null;

    return {
      executado: true,
      encontrados: encontrados.length,
      ultima_execucao: ultimaExecucao,
    };
  } catch (erro) {
    ultimoErro = {
      em: new Date().toISOString(),
      code: erro.code || 'ERRO_ALERTAS',
      error: erro.message,
    };
    throw erro;
  } finally {
    executando = false;
  }
}

async function listar({ status, limite = 100 } = {}) {
  const statusNormalizado = status ? String(status).toUpperCase() : null;
  const limiteSeguro = Math.min(Math.max(Number(limite) || 100, 1), 500);
  const { rows } = await postgres.query(
    "SELECT * FROM ct_alerta WHERE ($1::varchar IS NULL OR status=$1) " +
    "ORDER BY CASE severidade WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 " +
    "WHEN 'MEDIA' THEN 3 WHEN 'BAIXA' THEN 4 ELSE 5 END, detectado_em DESC LIMIT $2",
    [statusNormalizado, limiteSeguro]
  );
  return rows;
}

function iniciar() {
  if (timer || !postgres.configurado()) return false;

  const executar = async () => {
    try {
      await avaliar();
    } catch (erro) {
      console.error('[CONTROL_TOWER] Falha ao avaliar alertas:', erro.message);
    }
  };

  executar();
  timer = setInterval(executar, 60000);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return true;
}

function statusServico() {
  return {
    ativo: Boolean(timer),
    executando,
    ultima_execucao: ultimaExecucao,
    ultimo_erro: ultimoErro,
  };
}

module.exports = {
  TIPOS_GERENCIADOS,
  avaliar,
  listar,
  iniciar,
  statusServico,
};