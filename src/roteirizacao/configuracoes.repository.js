const postgres = require('../infrastructure/postgres');

const MODOS_VALIDOS = new Set(['CEP', 'OTIMIZADA']);

function normalizarCep(cep) {
  const somenteNumeros = String(cep || '').replace(/\D/g, '');
  return somenteNumeros.padStart(8, '0').slice(-8);
}

async function garantirEstrutura() {
  if (!postgres.configurado()) return false;

  await postgres.query(`
    CREATE TABLE IF NOT EXISTS roteirizacao_configuracao (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      modo VARCHAR(20) NOT NULL DEFAULT 'OTIMIZADA'
        CHECK (modo IN ('CEP', 'OTIMIZADA')),
      deposito_endereco TEXT NOT NULL DEFAULT 'Av. Yara, 75 - Vila Yara, Osasco - SP, 06028-110',
      deposito_lat NUMERIC(10,7) NOT NULL DEFAULT -23.5468900,
      deposito_lng NUMERIC(10,7) NOT NULL DEFAULT -46.7631000,
      inicio_jornada VARCHAR(5) NOT NULL DEFAULT '07:00',
      fim_jornada VARCHAR(5) NOT NULL DEFAULT '18:00',
      tempo_parada_segundos INTEGER NOT NULL DEFAULT 300 CHECK (tempo_parada_segundos >= 0),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO roteirizacao_configuracao (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS roteirizacao_motorista (
      id BIGSERIAL PRIMARY KEY,
      nome VARCHAR(120) NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_roteirizacao_motorista_nome
      ON roteirizacao_motorista (LOWER(nome));

    CREATE TABLE IF NOT EXISTS roteirizacao_veiculo (
      id BIGSERIAL PRIMARY KEY,
      nome VARCHAR(120) NOT NULL,
      placa VARCHAR(20),
      perfil VARCHAR(20) NOT NULL DEFAULT 'car'
        CHECK (perfil IN ('car', 'truck', 'scooter', 'bicycle')),
      max_paradas INTEGER NOT NULL DEFAULT 100 CHECK (max_paradas > 0),
      motorista_id BIGINT REFERENCES roteirizacao_motorista(id),
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_roteirizacao_veiculo_nome
      ON roteirizacao_veiculo (LOWER(nome));

    CREATE TABLE IF NOT EXISTS roteirizacao_faixa_cep (
      id BIGSERIAL PRIMARY KEY,
      cep_inicial CHAR(8) NOT NULL,
      cep_final CHAR(8) NOT NULL,
      motorista_id BIGINT NOT NULL REFERENCES roteirizacao_motorista(id),
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (cep_inicial <= cep_final)
    );

    CREATE INDEX IF NOT EXISTS ix_roteirizacao_faixa_cep_intervalo
      ON roteirizacao_faixa_cep (cep_inicial, cep_final)
      WHERE ativo = TRUE;
  `);

  return true;
}

async function obterConfiguracao() {
  const { rows } = await postgres.query(`
    SELECT id, modo, deposito_endereco,
           deposito_lat::float8 AS deposito_lat,
           deposito_lng::float8 AS deposito_lng,
           inicio_jornada, fim_jornada, tempo_parada_segundos,
           atualizado_em
    FROM roteirizacao_configuracao
    WHERE id = 1
  `);
  return rows[0];
}

async function atualizarConfiguracao(dados) {
  const atual = await obterConfiguracao();
  const modo = String(dados.modo || atual.modo).toUpperCase();
  if (!MODOS_VALIDOS.has(modo)) {
    const erro = new Error('Modo de roteirizacao invalido. Use CEP ou OTIMIZADA.');
    erro.code = 'MODO_INVALIDO';
    throw erro;
  }

  const depositoEndereco = dados.deposito_endereco ?? atual.deposito_endereco;
  const depositoLat = Number(dados.deposito_lat ?? atual.deposito_lat);
  const depositoLng = Number(dados.deposito_lng ?? atual.deposito_lng);
  const inicioJornada = dados.inicio_jornada ?? atual.inicio_jornada;
  const fimJornada = dados.fim_jornada ?? atual.fim_jornada;
  const tempoParada = Number.parseInt(
    dados.tempo_parada_segundos ?? atual.tempo_parada_segundos,
    10
  );

  if (!Number.isFinite(depositoLat) || !Number.isFinite(depositoLng)) {
    throw new Error('Latitude e longitude do deposito sao obrigatorias.');
  }

  const { rows } = await postgres.query(`
    UPDATE roteirizacao_configuracao
    SET modo = $1,
        deposito_endereco = $2,
        deposito_lat = $3,
        deposito_lng = $4,
        inicio_jornada = $5,
        fim_jornada = $6,
        tempo_parada_segundos = $7,
        atualizado_em = NOW()
    WHERE id = 1
    RETURNING id, modo, deposito_endereco,
              deposito_lat::float8 AS deposito_lat,
              deposito_lng::float8 AS deposito_lng,
              inicio_jornada, fim_jornada, tempo_parada_segundos,
              atualizado_em
  `, [modo, depositoEndereco, depositoLat, depositoLng, inicioJornada, fimJornada, tempoParada]);

  return rows[0];
}

async function listarMotoristas({ somenteAtivos = false } = {}) {
  const { rows } = await postgres.query(`
    SELECT id, nome, ativo, criado_em, atualizado_em
    FROM roteirizacao_motorista
    ${somenteAtivos ? 'WHERE ativo = TRUE' : ''}
    ORDER BY ativo DESC, nome
  `);
  return rows;
}

async function criarMotorista({ nome, ativo = true }) {
  const nomeLimpo = String(nome || '').trim();
  if (!nomeLimpo) throw new Error('Nome do motorista e obrigatorio.');

  const { rows } = await postgres.query(`
    INSERT INTO roteirizacao_motorista (nome, ativo)
    VALUES ($1, $2)
    RETURNING id, nome, ativo, criado_em, atualizado_em
  `, [nomeLimpo, Boolean(ativo)]);

  return rows[0];
}

async function atualizarMotorista(id, { nome, ativo }) {
  const { rows } = await postgres.query(`
    UPDATE roteirizacao_motorista
    SET nome = COALESCE($2, nome),
        ativo = COALESCE($3, ativo),
        atualizado_em = NOW()
    WHERE id = $1
    RETURNING id, nome, ativo, criado_em, atualizado_em
  `, [id, nome === undefined ? null : String(nome).trim(), ativo === undefined ? null : Boolean(ativo)]);
  return rows[0];
}

async function listarVeiculos({ somenteAtivos = false } = {}) {
  const { rows } = await postgres.query(`
    SELECT v.id, v.nome, v.placa, v.perfil, v.max_paradas, v.motorista_id,
           m.nome AS motorista_nome, v.ativo, v.criado_em, v.atualizado_em
    FROM roteirizacao_veiculo v
    LEFT JOIN roteirizacao_motorista m ON m.id = v.motorista_id
    ${somenteAtivos ? 'WHERE v.ativo = TRUE' : ''}
    ORDER BY v.ativo DESC, v.nome
  `);
  return rows;
}

async function criarVeiculo(dados) {
  const nome = String(dados.nome || '').trim();
  if (!nome) throw new Error('Nome do veiculo e obrigatorio.');

  const perfil = String(dados.perfil || 'car').toLowerCase();
  const perfis = new Set(['car', 'truck', 'scooter', 'bicycle']);
  if (!perfis.has(perfil)) throw new Error('Perfil de veiculo invalido.');

  const maxParadas = Number.parseInt(dados.max_paradas || 100, 10);
  const motoristaId = dados.motorista_id ? Number(dados.motorista_id) : null;

  const { rows } = await postgres.query(`
    INSERT INTO roteirizacao_veiculo
      (nome, placa, perfil, max_paradas, motorista_id, ativo)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, nome, placa, perfil, max_paradas, motorista_id, ativo,
              criado_em, atualizado_em
  `, [
    nome,
    dados.placa ? String(dados.placa).trim().toUpperCase() : null,
    perfil,
    maxParadas,
    motoristaId,
    dados.ativo === undefined ? true : Boolean(dados.ativo),
  ]);

  return rows[0];
}

async function atualizarVeiculo(id, dados) {
  const { rows } = await postgres.query(`
    UPDATE roteirizacao_veiculo
    SET nome = COALESCE($2, nome),
        placa = CASE WHEN $3::boolean THEN $4 ELSE placa END,
        perfil = COALESCE($5, perfil),
        max_paradas = COALESCE($6, max_paradas),
        motorista_id = CASE WHEN $7::boolean THEN $8 ELSE motorista_id END,
        ativo = COALESCE($9, ativo),
        atualizado_em = NOW()
    WHERE id = $1
    RETURNING id, nome, placa, perfil, max_paradas, motorista_id, ativo,
              criado_em, atualizado_em
  `, [
    id,
    dados.nome === undefined ? null : String(dados.nome).trim(),
    dados.placa !== undefined,
    dados.placa ? String(dados.placa).trim().toUpperCase() : null,
    dados.perfil === undefined ? null : String(dados.perfil).toLowerCase(),
    dados.max_paradas === undefined ? null : Number.parseInt(dados.max_paradas, 10),
    dados.motorista_id !== undefined,
    dados.motorista_id ? Number(dados.motorista_id) : null,
    dados.ativo === undefined ? null : Boolean(dados.ativo),
  ]);

  return rows[0];
}

async function listarFaixasCep({ somenteAtivas = false } = {}) {
  const { rows } = await postgres.query(`
    SELECT f.id, f.cep_inicial, f.cep_final, f.motorista_id,
           m.nome AS motorista_nome, f.ativo, f.criado_em, f.atualizado_em
    FROM roteirizacao_faixa_cep f
    INNER JOIN roteirizacao_motorista m ON m.id = f.motorista_id
    ${somenteAtivas ? 'WHERE f.ativo = TRUE AND m.ativo = TRUE' : ''}
    ORDER BY f.cep_inicial, f.cep_final
  `);
  return rows;
}

async function validarSobreposicaoFaixa(cepInicial, cepFinal, ignorarId = null) {
  const { rows } = await postgres.query(`
    SELECT id, cep_inicial, cep_final, motorista_id
    FROM roteirizacao_faixa_cep
    WHERE ativo = TRUE
      AND ($3::bigint IS NULL OR id <> $3)
      AND NOT ($2 < cep_inicial OR $1 > cep_final)
    LIMIT 1
  `, [cepInicial, cepFinal, ignorarId]);

  if (rows[0]) {
    const erro = new Error(
      `A faixa informada se sobrepoe a faixa existente ${rows[0].cep_inicial}-${rows[0].cep_final}.`
    );
    erro.code = 'FAIXA_CEP_SOBREPOSTA';
    throw erro;
  }
}

async function criarFaixaCep(dados) {
  const cepInicial = normalizarCep(dados.cep_inicial);
  const cepFinal = normalizarCep(dados.cep_final);
  if (cepInicial > cepFinal) throw new Error('CEP inicial nao pode ser maior que o CEP final.');

  await validarSobreposicaoFaixa(cepInicial, cepFinal);

  const { rows } = await postgres.query(`
    INSERT INTO roteirizacao_faixa_cep
      (cep_inicial, cep_final, motorista_id, ativo)
    VALUES ($1, $2, $3, $4)
    RETURNING id, cep_inicial, cep_final, motorista_id, ativo,
              criado_em, atualizado_em
  `, [
    cepInicial,
    cepFinal,
    Number(dados.motorista_id),
    dados.ativo === undefined ? true : Boolean(dados.ativo),
  ]);
  return rows[0];
}

async function atualizarFaixaCep(id, dados) {
  const atual = (await postgres.query(
    'SELECT * FROM roteirizacao_faixa_cep WHERE id = $1',
    [id]
  )).rows[0];
  if (!atual) return null;

  const cepInicial = dados.cep_inicial === undefined
    ? atual.cep_inicial
    : normalizarCep(dados.cep_inicial);
  const cepFinal = dados.cep_final === undefined
    ? atual.cep_final
    : normalizarCep(dados.cep_final);

  if (cepInicial > cepFinal) throw new Error('CEP inicial nao pode ser maior que o CEP final.');
  await validarSobreposicaoFaixa(cepInicial, cepFinal, Number(id));

  const { rows } = await postgres.query(`
    UPDATE roteirizacao_faixa_cep
    SET cep_inicial = $2,
        cep_final = $3,
        motorista_id = COALESCE($4, motorista_id),
        ativo = COALESCE($5, ativo),
        atualizado_em = NOW()
    WHERE id = $1
    RETURNING id, cep_inicial, cep_final, motorista_id, ativo,
              criado_em, atualizado_em
  `, [
    id,
    cepInicial,
    cepFinal,
    dados.motorista_id === undefined ? null : Number(dados.motorista_id),
    dados.ativo === undefined ? null : Boolean(dados.ativo),
  ]);

  return rows[0];
}

module.exports = {
  MODOS_VALIDOS,
  normalizarCep,
  garantirEstrutura,
  obterConfiguracao,
  atualizarConfiguracao,
  listarMotoristas,
  criarMotorista,
  atualizarMotorista,
  listarVeiculos,
  criarVeiculo,
  atualizarVeiculo,
  listarFaixasCep,
  criarFaixaCep,
  atualizarFaixaCep,
};
