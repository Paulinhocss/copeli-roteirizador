-- Control Tower - uma parada fisica pode conter varias entregas/pedidos.
-- Ex.: 8 pedidos SEDEX = 1 parada nos Correios + 8 entregas vinculadas.

ALTER TABLE ct_parada
  ADD COLUMN IF NOT EXISTS quantidade_entregas INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS ct_parada_entrega (
  id BIGSERIAL PRIMARY KEY,
  parada_id BIGINT NOT NULL REFERENCES ct_parada(id) ON DELETE CASCADE,
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
  endereco_final TEXT,
  numero_final VARCHAR(40),
  bairro_final VARCHAR(140),
  cidade_final VARCHAR(140),
  uf_final CHAR(2),
  cep_final VARCHAR(8),
  lat_final NUMERIC(10,7),
  lng_final NUMERIC(10,7),
  valor NUMERIC(18,2) NOT NULL DEFAULT 0,
  modalidade VARCHAR(24) NOT NULL
    CHECK (modalidade IN ('PROPRIA','TRANSPORTADORA','SEDEX')),
  status_externo VARCHAR(30) NOT NULL DEFAULT 'NAO_APLICAVEL'
    CHECK (status_externo IN (
      'NAO_APLICAVEL','AGUARDANDO_DESPACHO','DESPACHADO',
      'EM_TRANSITO','ENTREGUE','EXCECAO'
    )),
  codigo_rastreio VARCHAR(120),
  despachada_em TIMESTAMPTZ,
  entregue_final_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_ct_parada_entrega_parada
  ON ct_parada_entrega (parada_id);

CREATE INDEX IF NOT EXISTS ix_ct_parada_entrega_pedido
  ON ct_parada_entrega (pedido);

CREATE INDEX IF NOT EXISTS ix_ct_parada_entrega_externo
  ON ct_parada_entrega (modalidade, status_externo);
