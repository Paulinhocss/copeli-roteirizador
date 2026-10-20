-- Integração Contele Fleet
-- PostgreSQL do Control Tower.

ALTER TABLE roteirizacao_veiculo
  ADD COLUMN IF NOT EXISTS contele_vehicle_id BIGINT,
  ADD COLUMN IF NOT EXISTS contele_imei VARCHAR(80);

CREATE UNIQUE INDEX IF NOT EXISTS ux_roteirizacao_veiculo_contele
  ON roteirizacao_veiculo (contele_vehicle_id)
  WHERE contele_vehicle_id IS NOT NULL;

ALTER TABLE roteirizacao_motorista
  ADD COLUMN IF NOT EXISTS contele_driver_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_roteirizacao_motorista_contele
  ON roteirizacao_motorista (contele_driver_id)
  WHERE contele_driver_id IS NOT NULL;

ALTER TABLE ct_rota
  ADD COLUMN IF NOT EXISTS contele_planned_route_id VARCHAR(160),
  ADD COLUMN IF NOT EXISTS contele_vehicle_id BIGINT,
  ADD COLUMN IF NOT EXISTS contele_driver_id BIGINT,
  ADD COLUMN IF NOT EXISTS contele_sincronizada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fonte_km_real VARCHAR(40);

CREATE INDEX IF NOT EXISTS ix_ct_rota_contele_vehicle
  ON ct_rota (contele_vehicle_id, data_operacao);

CREATE TABLE IF NOT EXISTS ct_contele_posicao_atual (
  contele_vehicle_key VARCHAR(160) PRIMARY KEY,
  contele_vehicle_id BIGINT,
  vehicle_name VARCHAR(160),
  plate_number VARCHAR(30),
  driver_name VARCHAR(160),
  driver_code VARCHAR(100),
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  ignition INTEGER,
  speed NUMERIC(12,3),
  odometer NUMERIC(18,3),
  imei VARCHAR(80),
  rastreador_atualizado_em TIMESTAMPTZ,
  sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ct_contele_posicao_vehicle_id
  ON ct_contele_posicao_atual (contele_vehicle_id)
  WHERE contele_vehicle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_ct_contele_posicao_placa
  ON ct_contele_posicao_atual (plate_number);

CREATE TABLE IF NOT EXISTS ct_contele_sync_log (
  id BIGSERIAL PRIMARY KEY,
  recurso VARCHAR(80) NOT NULL,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizado_em TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'INICIADO'
    CHECK (status IN ('INICIADO','SUCESSO','ERRO')),
  registros INTEGER,
  mensagem TEXT,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ix_ct_contele_sync_log_recurso
  ON ct_contele_sync_log (recurso, iniciado_em DESC);
