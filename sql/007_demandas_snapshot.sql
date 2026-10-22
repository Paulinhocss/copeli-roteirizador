-- Control Tower Logistica - caixa de entrada persistente de demandas
-- PostgreSQL proprio do Copeli Roteirizador.
-- Nao executar no banco Deak.

CREATE TABLE IF NOT EXISTS ct_demanda (
  id BIGSERIAL PRIMARY KEY,
  empresa VARCHAR(40) NOT NULL,
  pedido VARCHAR(60) NOT NULL,
  num_nf VARCHAR(60),
  modalidade VARCHAR(24) NOT NULL
    CHECK (modalidade IN ('PROPRIA','TRANSPORTADORA','SEDEX')),
  prioridade VARCHAR(120),
  prioridade_codigo VARCHAR(12),
  status_deak_orcamento VARCHAR(12),
  status_logistico VARCHAR(12),
  vendedor VARCHAR(120),
  cliente VARCHAR(220),
  nome_fantasia VARCHAR(220),
  data_prometida DATE,
  observacao TEXT,
  tipo_logradouro VARCHAR(40),
  endereco TEXT,
  numero VARCHAR(40),
  bairro VARCHAR(140),
  cidade VARCHAR(140),
  uf CHAR(2) DEFAULT 'SP',
  cep VARCHAR(8),
  valor NUMERIC(18,2) NOT NULL DEFAULT 0,
  presente_fila_deak BOOLEAN NOT NULL DEFAULT TRUE,
  status_control_tower VARCHAR(24) NOT NULL DEFAULT 'CAPTURADA'
    CHECK (status_control_tower IN (
      'CAPTURADA','PLANEJADA','EM_ROTA','ENCERRADA','CANCELADA'
    )),
  capturada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultima_vez_fila_deak_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  saiu_fila_deak_em TIMESTAMPTZ,
  planejada_em TIMESTAMPTZ,
  encerrada_em TIMESTAMPTZ,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa, pedido)
);

CREATE INDEX IF NOT EXISTS ix_ct_demanda_status
  ON ct_demanda (status_control_tower, presente_fila_deak, data_prometida);

CREATE INDEX IF NOT EXISTS ix_ct_demanda_modalidade
  ON ct_demanda (modalidade, status_control_tower);

CREATE INDEX IF NOT EXISTS ix_ct_demanda_pedido
  ON ct_demanda (pedido);
