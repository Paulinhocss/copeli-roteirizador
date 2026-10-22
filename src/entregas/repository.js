const { sql, obterPool } = require('../infrastructure/deak');

async function listarEntregas({ empresa } = {}) {
  const pool = await obterPool();
  const request = pool.request();

  request.input('empresa', sql.NVarChar(30), empresa || null);

  const resultado = await request.query(
    "SELECT " +
    "CASE WHEN o.Filial='01' THEN 'COPELI' WHEN o.Filial='02' THEN 'CPAINEL' " +
    "WHEN o.Filial='03' THEN 'IZAURA' WHEN o.Filial='04' THEN 'AUTONOMISTAS' ELSE o.Filial END AS Empresa, " +
    "o.Status, o.CodVendedor_ID AS VENDEDOR, o.CodOrcamento_ID AS PEDIDO, nf.NumNF, " +
    "c.Nome AS CLIENTE, ISNULL(c.Apelido,'') AS NomeFantasia, o.DataEntrega, " +
    "o.Observacoes AS Observacao, o.TipoEnt, o.ENDENT, o.BAIENT AS BAIRRO, " +
    "o.CIDENT AS CIDADE, o.CEPENT AS CEP, o.NumEnt, " +
    "SUM(ISNULL(oi.PrecoDesconto,0)) + MAX(ISNULL(o.VlrFrete,0)) AS VALOR, " +
    "CASE WHEN o.Prioridade='31' THEN 'ENTREGA PRÓPRIA' " +
    "WHEN o.Prioridade='32' THEN 'ENTREGA TRANSPORTADORA' " +
    "WHEN o.Prioridade='23' THEN 'SEDEX' END AS Prioridade, " +
    "o.Prioridade AS PrioridadeCodigo, " +
    "CASE WHEN o.Prioridade='31' THEN 'PROPRIA' WHEN o.Prioridade='32' THEN 'TRANSPORTADORA' " +
    "WHEN o.Prioridade='23' THEN 'SEDEX' END AS Modalidade, " +
    "CASE WHEN o.Prioridade IN ('32','23') THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS RequerDestinoOperacional, " +
    "status_fluxo.Status AS StatusLogistico, " +
    "status_especiais.Status AS StatusLogisticoAberto, " +
    "ultimo_4a.Status AS UltimoStatus4A, " +
    "ultimo_4a.DataFim AS UltimoDataFim4A, " +
    "canhoto_aberto.Status AS StatusCanhoto, " +
    "ultimo_evento.Status AS UltimoEventoStatus " +
    "FROM Orcamento o " +
    "INNER JOIN Clientes c ON c.CGC=o.CGC " +
    "INNER JOIN OrcamentoItem oi ON oi.CodOrcamento_ID=o.CodOrcamento_ID AND oi.Status<>'C' " +
    "OUTER APPLY (SELECT TOP 1 nfo.NumNF FROM NFiscalOrcamento nfo " +
    "WHERE nfo.CodOrcamento_ID=o.CodOrcamento_ID ORDER BY nfo.NumNF DESC) nf " +
    "OUTER APPLY (SELECT TOP 1 sp.Status FROM StatusPedido sp " +
    "WHERE sp.CodOrcamento_ID=o.CodOrcamento_ID ORDER BY sp.DataInicio DESC) ultimo_evento " +
    "OUTER APPLY (SELECT TOP 1 sp.Status FROM StatusPedido sp " +
    "WHERE sp.CodOrcamento_ID=o.CodOrcamento_ID " +
    "AND sp.Status IN ('3A','3E','40','4A') ORDER BY sp.DataInicio DESC) status_fluxo " +
    "OUTER APPLY (SELECT TOP 1 sp.Status FROM StatusPedido sp " +
    "WHERE sp.CodOrcamento_ID=o.CodOrcamento_ID AND sp.DataFim IS NULL " +
    "AND sp.Status IN ('3A','3E','40') ORDER BY sp.DataInicio DESC) status_especiais " +
    "OUTER APPLY (SELECT TOP 1 sp.Status, sp.DataFim FROM StatusPedido sp " +
    "WHERE sp.CodOrcamento_ID=o.CodOrcamento_ID AND sp.Status='4A' " +
    "ORDER BY sp.DataInicio DESC) ultimo_4a " +
    "OUTER APPLY (SELECT TOP 1 sp.Status FROM StatusPedido sp " +
    "WHERE sp.CodOrcamento_ID=o.CodOrcamento_ID AND sp.DataFim IS NULL " +
    "AND sp.Status='4C' ORDER BY sp.DataInicio DESC) canhoto_aberto " +
    "WHERE o.DataEntrega>=DATEADD(DAY,-90,GETDATE()) " +
    "AND o.Status IN ('PE','PP','PF','pe','pp','pf') " +
    "AND o.Prioridade IN ('31','32','23') " +
    "AND o.noper NOT IN ('5.922','6.922','6.923','5.923') " +
    "AND ((o.Prioridade IN ('31','32') AND (status_especiais.Status IN ('3A','3E','40') " +
    "OR (ultimo_4a.Status='4A' AND ultimo_4a.DataFim IS NULL))) " +
    "OR (o.Prioridade='23' AND (status_especiais.Status IN ('3A','3E','40') " +
    "OR (ultimo_4a.Status='4A' AND ultimo_4a.DataFim IS NULL) " +
    "OR (canhoto_aberto.Status='4C' AND status_fluxo.Status='40')))) " +
    "AND (@empresa IS NULL OR " +
    "CASE WHEN o.Filial='01' THEN 'COPELI' WHEN o.Filial='02' THEN 'CPAINEL' " +
    "WHEN o.Filial='03' THEN 'IZAURA' WHEN o.Filial='04' THEN 'AUTONOMISTAS' ELSE o.Filial END=@empresa) " +
    "GROUP BY o.Filial,o.Status,o.CodVendedor_ID,o.CodOrcamento_ID,nf.NumNF,c.Nome,c.Apelido, " +
    "o.DataEntrega,o.Observacoes,o.TipoEnt,o.ENDENT,o.BAIENT,o.CIDENT,o.CEPENT,o.NumEnt, " +
    "o.Prioridade,status_fluxo.Status,status_especiais.Status,ultimo_4a.Status,ultimo_4a.DataFim,canhoto_aberto.Status,ultimo_evento.Status " +
    "ORDER BY o.DataEntrega,o.CodOrcamento_ID"
  );

  return resultado.recordset;
}

module.exports = { listarEntregas };
