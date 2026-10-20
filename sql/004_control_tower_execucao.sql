-- Control Tower Logistica - liberacao oficial, modalidades e execucao
-- PostgreSQL proprio do Copeli Roteirizador.
-- Nao executar no banco Deak.

CREATE TABLE IF NOT EXISTS ct_planejamento (
  id BIGSERIAL PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE,
  data_operacao DATE NOT NULL,
  modo_roteirizacao VARCHAR(20) NOT NULL
    CHECK (modo_roteirizacao IN ('CEP','OTIMIZADA','MANUAL')),
  status VARCHAR(20) NOT NULL DEFAULT 'LIBERADO'
    CHECK (status IN ('LIBERADO','CANCELADO')),
  total_rotas INTEGER NOT NULL DEFAULT 0,
  total_paradas INTEGER NOT NULL DEFAULT 0,
  valor_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  origem_endereco TEXT,
  origem_lat NUMERIC(10,7),
  origem_lng NUMERIC(10,7),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  liberado_por VARCHAR(120),
  liberado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelado_em TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_ct_planejamento_data
  ON ct_planejamento (data_operacao, status);

ALTER TABLE ct_rota
  ADD COLUMN IF NOT EXISTS planejamento_id BIGINT REFERENCES ct_planejamento(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_ct_rota_planejamento
  ON ct_rota (planejamento_id);

ALTER TABLE ct_parada
  ADD COLUMN IF NOT EXISTS modalidade VARCHAR(24) NOT NULL DEFAULT 'PROPRIA',
  ADD COLUMN IF NOT EXISTS tipo_destino_operacional VARCHAR(24) NOT NULL DEFAULT 'CLIENTE',
  ADD COLUMN IF NOT EXISTS destino_operacional_nome VARCHAR(220),
  ADD COLUMN IF NOT EXISTS destino_operacional_endereco TEXT,
  ADD COLUMN IF NOT EXISTS destino_operacional_numero VARCHAR(40),
  ADD COLUMN IF NOT EXISTS destino_operacional_bairro VARCHAR(140),
  ADD COLUMN IF NOT EXISTS destino_operacional_cidade VARCHAR(140),
  ADD COLUMN IF NOT EXISTS destino_operacional_uf CHAR(2),
  ADD COLUMN IF NOT EXISTS destino_operacional_cep VARCHAR(8),
  ADD COLUMN IF NOT EXISTS destino_operacional_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS destino_operacional_lng NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS status_externo VARCHAR(30) NOT NULL DEFAULT 'NAO_APLICAVEL',
  ADD COLUMN IF NOT EXISTS despachada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS entregue_final_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS codigo_rastreio VARCHAR(120);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_ct_parada_modalidade'
  ) THEN
    ALTER TABLE ct_parada
      ADD CONSTRAINT ck_ct_parada_modalidade
      CHECK (modalidade IN ('PROPRIA','TRANSPORTADORA','SEDEX'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_ct_parada_destino_operacional'
  ) THEN
    ALTER TABLE ct_parada
      ADD CONSTRAINT ck_ct_parada_destino_operacional
      CHECK (tipo_destino_operacional IN ('CLIENTE','TRANSPORTADORA','CORREIOS'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_ct_parada_status_externo'
  ) THEN
    ALTER TABLE ct_parada
      ADD CONSTRAINT ck_ct_parada_status_externo
      CHECK (status_externo IN (
        'NAO_APLICAVEL','AGUARDANDO_DESPACHO','DESPACHADO',
        'EM_TRANSITO','ENTREGUE','EXCECAO'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_ct_parada_modalidade
  ON ct_parada (modalidade, status_externo, status);
