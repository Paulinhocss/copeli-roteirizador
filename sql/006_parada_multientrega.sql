-- Control Tower - uma parada fisica pode conter varias entregas/pedidos.
-- Ex.: 8 pedidos SEDEX = 1 parada nos Correios + 8 entregas vinculadas.

ALTER TABLE ct_planejamento
  ADD COLUMN IF NOT EXISTS total_entregas INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ct_rota
  ADD COLUMN IF NOT EXISTS total_paradas INTEGER NOT NULL DEFAULT 0;

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


-- Backfill das paradas existentes criadas antes deste modelo.
INSERT INTO ct_parada_entrega (
  parada_id, empresa, pedido, num_nf, cliente, nome_fantasia,
  data_prometida, prioridade, vendedor, observacao, tipo_logradouro,
  endereco_final, numero_final, bairro_final, cidade_final, uf_final,
  cep_final, lat_final, lng_final, valor, modalidade, status_externo,
  codigo_rastreio, despachada_em, entregue_final_em
)
SELECT
  p.id, p.empresa, p.pedido, p.num_nf, p.cliente, p.nome_fantasia,
  p.data_prometida, p.prioridade, p.vendedor, p.observacao, p.tipo_logradouro,
  p.endereco, p.numero, p.bairro, p.cidade, p.uf,
  p.cep, p.lat, p.lng, p.valor, p.modalidade, p.status_externo,
  p.codigo_rastreio, p.despachada_em, p.entregue_final_em
FROM ct_parada p
WHERE NOT EXISTS (
  SELECT 1 FROM ct_parada_entrega pe WHERE pe.parada_id = p.id
);
