function normalizarCep(cep) {
  const somenteNumeros = String(cep || '').replace(/\D/g, '');
  if (!somenteNumeros) return '';
  if (somenteNumeros.length === 8) return somenteNumeros;
  if (somenteNumeros.length === 7) return '0' + somenteNumeros;
  if (somenteNumeros.length === 6) return '00' + somenteNumeros;
  return '';
}

function encontrarFaixa(cep, faixas) {
  const normalizado = normalizarCep(cep);
  if (!/^\d{8}$/.test(normalizado)) return null;

  return (faixas || []).find(
    (faixa) => normalizado >= faixa.cep_inicial && normalizado <= faixa.cep_final
  ) || null;
}

module.exports = { normalizarCep, encontrarFaixa };
