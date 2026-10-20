-- Control Tower Logistica - fundacao operacional
-- PostgreSQL proprio do Copeli Roteirizador.
-- Nao executar no banco Deak.

CREATE TABLE IF NOT EXISTS ct_rota (
  id BIGSERIAL PRIMARY KEY,
  codigo VARCHAR(40) UNIQUE,
  data_operacao DATE NOT NULL,
  modo_roteirizacao VARCHAR(20) NOT NULL
    CHECK (modo_roteirizacao IN ('CEP', 'OTIMIZADA', 'MANUAL')),
  status VARCHAR(25) NOT NULL DEFAULT 'PLANEJADA'
    CHECK (status IN (
      'PLANEJADA','LIBERADA','EM_ROTA','FINALIZADA','CANCELADA'
    )),
  motorista_id BIGINT REFERENCES roteirizacao_motorista(id),
  veiculo_id BIGINT REFERENCES roteirizacao_veiculo(id),
  origem_endereco TEXT,
  origem_lat NUMERIC(10,7),
  origem_lng NUMERIC(10,7),
  total_entregas INTEGER NOT NULL DEFAULT 0,
  valor_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  km_planejado NUMERIC(12,2),
  duracao_planejada_segundos INTEGER,
  km_real NUMERIC(12,2),
  duracao_real_segundos INTEGER,
  planejada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  liberada_em TIMESTAMPTZ,
  iniciada_em TIMESTAMPTZ,
  finalizada_em TIMESTAMPTZ,
  criada_por VARCHAR(120),
  atualizada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_ct_rota_data_operacao
  ON ct_rota (data_operacao, status);

CREATE INDEX IF NOT EXISTS ix_ct_rota_motorista
  ON ct_rota (motorista_id, data_operacao);

CREATE TABLE IF NOT EXISTS ct_parada (
  id BIGSERIAL PRIMARY KEY,
  rota_id BIGINT NOT NULL REFERENCES ct_rota(id) ON DELETE CASCADE,
  ordem_planejada INTEGER NOT NULL,
  ordem_real INTEGER,
  empresa VARCHAR(40),
  pedido VARCHAR(60),
  num_nf VARCHAR(60),
  cliente VARCHAR(220),
  nome_fantasia VARCHAR(220),
  data_prometida DATE,
  prioridade VARCHAR(120),
  vendedor VARCHAR(120),
  observacao TEXT,
  tipo_logradouro VARCHAR(40),
  endereco TEXT,
  numero VARCHAR(40),
  bairro VARCHAR(140),
  cidade VARCHAR(140),
  uf CHAR(2) DEFAULT 'SP',
  cep VARCHAR(8),
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  valor NUMERIC(18,2) NOT NULL DEFAULT 0,
  eta_planejado TIMESTAMPTZ,
  chegada_em TIMESTAMPTZ,
  inicio_atendimento_em TIMESTAMPTZ,
  conclusao_em TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN (
      'PENDENTE','EM_DESLOCAMENTO','NO_CLIENTE','ENTREGUE',
      'NAO_ENTREGUE','REAGENDADA','CANCELADA'
    )),
  motivo_nao_entrega VARCHAR(160),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rota_id, ordem_planejada)
);

CREATE INDEX IF NOT EXISTS ix_ct_parada_pedido
  ON ct_parada (pedido);

CREATE INDEX IF NOT EXISTS ix_ct_parada_status
  ON ct_parada (status, rota_id);

CREATE INDEX IF NOT EXISTS ix_ct_parada_cep
  ON ct_parada (cep);

CREATE TABLE IF NOT EXISTS ct_evento (
  id BIGSERIAL PRIMARY KEY,
  rota_id BIGINT REFERENCES ct_rota(id) ON DELETE CASCADE,
  parada_id BIGINT REFERENCES ct_parada(id) ON DELETE CASCADE,
  tipo VARCHAR(80) NOT NULL,
  ocorreu_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fonte VARCHAR(40) NOT NULL DEFAULT 'SISTEMA',
  usuario VARCHAR(120),
  dados JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ix_ct_evento_rota_data
  ON ct_evento (rota_id, ocorreu_em);

CREATE INDEX IF NOT EXISTS ix_ct_evento_parada_data
  ON ct_evento (parada_id, ocorreu_em);

CREATE TABLE IF NOT EXISTS ct_ocorrencia (
  id BIGSERIAL PRIMARY KEY,
  rota_id BIGINT REFERENCES ct_rota(id) ON DELETE SET NULL,
  parada_id BIGINT REFERENCES ct_parada(id) ON DELETE SET NULL,
  categoria VARCHAR(80) NOT NULL,
  motivo VARCHAR(160) NOT NULL,
  descricao TEXT,
  severidade VARCHAR(20) NOT NULL DEFAULT 'MEDIA'
    CHECK (severidade IN ('BAIXA','MEDIA','ALTA','CRITICA')),
  status VARCHAR(25) NOT NULL DEFAULT 'ABERTA'
    CHECK (status IN ('ABERTA','EM_ANALISE','TRATADA','ENCERRADA')),
  responsavel VARCHAR(120),
  causa_raiz TEXT,
  acao_corretiva TEXT,
  custo_estimado NUMERIC(18,2),
  reincidente BOOLEAN NOT NULL DEFAULT FALSE,
  aberta_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prazo_em TIMESTAMPTZ,
  encerrada_em TIMESTAMPTZ,
  atualizada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_ct_ocorrencia_status
  ON ct_ocorrencia (status, severidade, aberta_em);

CREATE INDEX IF NOT EXISTS ix_ct_ocorrencia_categoria
  ON ct_ocorrencia (categoria, motivo);

CREATE TABLE IF NOT EXISTS ct_alerta (
  id BIGSERIAL PRIMARY KEY,
  fingerprint VARCHAR(180),
  tipo VARCHAR(80) NOT NULL,
  severidade VARCHAR(20) NOT NULL DEFAULT 'MEDIA'
    CHECK (severidade IN ('INFO','BAIXA','MEDIA','ALTA','CRITICA')),
  entidade_tipo VARCHAR(40),
  entidade_id BIGINT,
  titulo VARCHAR(220) NOT NULL,
  descricao TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ABERTO'
    CHECK (status IN ('ABERTO','RECONHECIDO','RESOLVIDO')),
  detectado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reconhecido_em TIMESTAMPTZ,
  reconhecido_por VARCHAR(120),
  resolvido_em TIMESTAMPTZ,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ct_alerta_fingerprint_aberto
  ON ct_alerta (fingerprint)
  WHERE fingerprint IS NOT NULL AND status <> 'RESOLVIDO';

CREATE INDEX IF NOT EXISTS ix_ct_alerta_status
  ON ct_alerta (status, severidade, detectado_em);

CREATE TABLE IF NOT EXISTS ct_melhoria (
  id BIGSERIAL PRIMARY KEY,
  titulo VARCHAR(220) NOT NULL,
  categoria VARCHAR(100) NOT NULL,
  problema TEXT NOT NULL,
  hipotese_causa TEXT,
  metrica VARCHAR(120),
  unidade VARCHAR(40),
  linha_base NUMERIC(18,4),
  meta NUMERIC(18,4),
  resultado_atual NUMERIC(18,4),
  economia_estimada NUMERIC(18,2),
  responsavel VARCHAR(120),
  status VARCHAR(30) NOT NULL DEFAULT 'IDENTIFICADA'
    CHECK (status IN (
      'IDENTIFICADA','EM_ANALISE','PLANO_DE_ACAO','EM_EXECUCAO',
      'VALIDACAO','CONCLUIDA','CANCELADA'
    )),
  prioridade VARCHAR(20) NOT NULL DEFAULT 'MEDIA'
    CHECK (prioridade IN ('BAIXA','MEDIA','ALTA','CRITICA')),
  inicio_em DATE,
  prazo_em DATE,
  concluida_em DATE,
  criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_ct_melhoria_status
  ON ct_melhoria (status, prioridade, prazo_em);

CREATE TABLE IF NOT EXISTS ct_melhoria_acao (
  id BIGSERIAL PRIMARY KEY,
  melhoria_id BIGINT NOT NULL REFERENCES ct_melhoria(id) ON DELETE CASCADE,
  o_que TEXT NOT NULL,
  por_que TEXT,
  onde_local VARCHAR(160),
  quando_em DATE,
  quem VARCHAR(120),
  como TEXT,
  quanto NUMERIC(18,2),
  status VARCHAR(25) NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE','EM_ANDAMENTO','CONCLUIDA','CANCELADA')),
  concluida_em TIMESTAMPTZ,
  criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_ct_melhoria_acao_prazo
  ON ct_melhoria_acao (status, quando_em);

CREATE TABLE IF NOT EXISTS ct_meta_kpi (
  id BIGSERIAL PRIMARY KEY,
  codigo VARCHAR(80) NOT NULL,
  nome VARCHAR(160) NOT NULL,
  unidade VARCHAR(40) NOT NULL,
  sentido VARCHAR(15) NOT NULL DEFAULT 'MENOR'
    CHECK (sentido IN ('MENOR','MAIOR','FAIXA')),
  meta NUMERIC(18,4) NOT NULL,
  limite_alerta NUMERIC(18,4),
  vigencia_inicio DATE NOT NULL,
  vigencia_fim DATE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (codigo, vigencia_inicio)
);

CREATE INDEX IF NOT EXISTS ix_ct_meta_kpi_ativo
  ON ct_meta_kpi (codigo, ativo, vigencia_inicio);
