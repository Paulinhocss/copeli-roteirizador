const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizarCep, encontrarFaixa } = require('../src/roteirizacao/faixas-cep');

test('normalizarCep preserva oito digitos e recupera zero inicial', () => {
  assert.equal(normalizarCep('06028-110'), '06028110');
  assert.equal(normalizarCep('6028110'), '06028110');
  assert.equal(normalizarCep(''), '');
});

test('encontrarFaixa considera limites inclusivos', () => {
  const faixas = [
    { id: 1, cep_inicial: '01000000', cep_final: '01999999', motorista_id: 10 },
    { id: 2, cep_inicial: '02000000', cep_final: '02999999', motorista_id: 20 },
  ];

  assert.equal(encontrarFaixa('01000-000', faixas).id, 1);
  assert.equal(encontrarFaixa('01999-999', faixas).id, 1);
  assert.equal(encontrarFaixa('02000-000', faixas).id, 2);
  assert.equal(encontrarFaixa('03000-000', faixas), null);
});

test('encontrarFaixa nao atribui CEP ausente', () => {
  assert.equal(
    encontrarFaixa('', [{ id: 1, cep_inicial: '00000000', cep_final: '09999999' }]),
    null
  );
});


test('CEP curto invalido nao e transformado em faixa valida', () => {
  assert.equal(normalizarCep('12345'), '');
  assert.equal(
    encontrarFaixa('12345', [{ id: 1, cep_inicial: '00000000', cep_final: '99999999' }]),
    null
  );
});
