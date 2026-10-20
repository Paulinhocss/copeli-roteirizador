-- Pontos fisicos de despacho para Transportadoras e Correios
-- PostgreSQL proprio do Copeli Roteirizador.

CREATE TABLE IF NOT EXISTS roteirizacao_ponto_despacho (
  id BIGSERIAL PRIMARY KEY,
  tipo VARCHAR(20) NOT NULL
    CHECK (tipo IN ('TRANSPORTADORA','CORREIOS')),
  codigo_externo VARCHAR(80),
  nome VARCHAR(180) NOT NULL,
  endereco TEXT NOT NULL,
  numero VARCHAR(40),
  bairro VARCHAR(140),
  cidade VARCHAR(140),
  uf CHAR(2) NOT NULL DEFAULT 'SP',
  cep VARCHAR(8),
  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  padrao BOOLEAN NOT NULL DEFAULT FALSE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ponto_despacho_codigo
  ON roteirizacao_ponto_despacho (tipo, codigo_externo)
  WHERE codigo_externo IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ponto_despacho_padrao_ativo
  ON roteirizacao_ponto_despacho (tipo)
  WHERE padrao = TRUE AND ativo = TRUE;

CREATE INDEX IF NOT EXISTS ix_ponto_despacho_tipo_ativo
  ON roteirizacao_ponto_despacho (tipo, ativo, nome);
