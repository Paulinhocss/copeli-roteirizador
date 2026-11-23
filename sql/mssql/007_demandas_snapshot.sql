-- Control Tower local - caixa persistente de demandas
-- SQL Server local. Nao executar no Deak oficial.

IF OBJECT_ID('dbo.ct_demanda', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ct_demanda (
    id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    empresa VARCHAR(40) NOT NULL,
    pedido VARCHAR(60) NOT NULL,
    num_nf VARCHAR(60) NULL,
    modalidade VARCHAR(24) NOT NULL,
    prioridade VARCHAR(120) NULL,
    prioridade_codigo VARCHAR(12) NULL,
    status_deak_orcamento VARCHAR(12) NULL,
    status_logistico VARCHAR(12) NULL,
    vendedor VARCHAR(120) NULL,
    cliente VARCHAR(220) NULL,
    nome_fantasia VARCHAR(220) NULL,
    data_prometida DATE NULL,
    observacao NVARCHAR(MAX) NULL,
    tipo_logradouro VARCHAR(40) NULL,
    endereco NVARCHAR(500) NULL,
    numero VARCHAR(40) NULL,
    bairro VARCHAR(140) NULL,
    cidade VARCHAR(140) NULL,
    uf CHAR(2) NULL CONSTRAINT DF_ct_demanda_uf DEFAULT 'SP',
    cep VARCHAR(8) NULL,
    valor DECIMAL(18,2) NOT NULL CONSTRAINT DF_ct_demanda_valor DEFAULT 0,
    presente_fila_deak BIT NOT NULL CONSTRAINT DF_ct_demanda_presente DEFAULT 1,
    status_control_tower VARCHAR(24) NOT NULL CONSTRAINT DF_ct_demanda_status DEFAULT 'CAPTURADA',
    capturada_em DATETIME2(3) NOT NULL CONSTRAINT DF_ct_demanda_capturada DEFAULT SYSDATETIME(),
    ultima_vez_fila_deak_em DATETIME2(3) NOT NULL CONSTRAINT DF_ct_demanda_ultima DEFAULT SYSDATETIME(),
    saiu_fila_deak_em DATETIME2(3) NULL,
    planejada_em DATETIME2(3) NULL,
    encerrada_em DATETIME2(3) NULL,
    snapshot NVARCHAR(MAX) NOT NULL CONSTRAINT DF_ct_demanda_snapshot DEFAULT '{}',
    atualizado_em DATETIME2(3) NOT NULL CONSTRAINT DF_ct_demanda_atualizado DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_ct_demanda_empresa_pedido UNIQUE (empresa, pedido),
    CONSTRAINT CK_ct_demanda_modalidade CHECK (modalidade IN ('PROPRIA','TRANSPORTADORA','SEDEX')),
    CONSTRAINT CK_ct_demanda_status_control_tower CHECK (
      status_control_tower IN ('CAPTURADA','PLANEJADA','EM_ROTA','ENCERRADA','CANCELADA')
    ),
    CONSTRAINT CK_ct_demanda_snapshot_json CHECK (ISJSON(snapshot) = 1)
  );
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_ct_demanda_status'
    AND object_id = OBJECT_ID('dbo.ct_demanda')
)
BEGIN
  CREATE INDEX IX_ct_demanda_status
    ON dbo.ct_demanda (status_control_tower, presente_fila_deak, data_prometida);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_ct_demanda_modalidade'
    AND object_id = OBJECT_ID('dbo.ct_demanda')
)
BEGIN
  CREATE INDEX IX_ct_demanda_modalidade
    ON dbo.ct_demanda (modalidade, status_control_tower);
END;
