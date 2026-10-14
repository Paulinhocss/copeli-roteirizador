function normalizarCep(cep) {
  const somenteNumeros = String(cep || '').replace(/\D/g, '');
  if (!somenteNumeros) return '';
  return somenteNumeros.padStart(8, '0').slice(-8);
}

function encontrarFaixa(cep, faixas) {
  const normalizado = normalizarCep(cep);
  if (!/^\d{8}$/.test(normalizado)) return null;

  return (faixas || []).find(
    (faixa) => normalizado >= faixa.cep_inicial && normalizado <= faixa.cep_final
  ) || null;
}

module.exports = { normalizarCep, encontrarFaixa };
