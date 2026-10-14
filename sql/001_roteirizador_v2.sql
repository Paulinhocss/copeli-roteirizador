-- Copeli Roteirizador v2
-- PostgreSQL proprio da aplicacao. Nao executar no Deak.

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
