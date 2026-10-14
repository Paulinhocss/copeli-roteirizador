const { sql, obterPool } = require('../infrastructure/deak');

async function listarEntregas({ empresa } = {}) {
  const pool = await obterPool();
  const request = pool.request();

  request.input('empresa', sql.NVarChar(30), empresa || null);

  const resultado = await request.query(`
    SELECT
      Empresa,
      Status,
      CodVendedor_ID AS VENDEDOR,
      CodOrcamento_ID AS PEDIDO,
      NumNF,
      Nome AS CLIENTE,
      NomeFantasia,
      DataEntrega,
      Observacoes AS Observacao,
      TipoEnt,
      ENDENT,
      BAIENT AS BAIRRO,
      CIDENT AS CIDADE,
      CEPENT AS CEP,
      NumEnt,
      Valor_Pedido AS VALOR,
      Prioridade,
      StatusPedido
    FROM dbo.vw_copeli_Entrega
    WHERE (@empresa IS NULL OR Empresa = @empresa)
    ORDER BY DataEntrega, CodOrcamento_ID
  `);

  return resultado.recordset;
}

module.exports = { listarEntregas };
