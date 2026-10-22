const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizarDemanda } = require('../src/control-tower/demandas.repository');

test('fotografia normaliza campos principais da entrega Deak', () => {
  const demanda = normalizarDemanda({
    Empresa: 'COPELI',
    PEDIDO: 825594,
    NumNF: 328621,
    Prioridade: 'ENTREGA PRÓPRIA',
    PrioridadeCodigo: '31',
    Status: 'PF',
    StatusLogistico: '4A',
    VENDEDOR: 'KELLY CRIS',
    CLIENTE: 'APESEG TECNOLOGIA E SEGURANCA LTDA',
    NomeFantasia: 'APESEG TECNOLOGIA E SEGURANCA',
    DataEntrega: '2026-10-23T00:00:00.000Z',
    Observacao: 'ENTREGA PREFERENCIALMENTE PARTE DA MANHA',
    TipoEnt: 'R',
    ENDENT: 'R SANTO UBALDO',
    NumEnt: '15',
    BAIRRO: 'VILA PALMEIRAS',
    CIDADE: 'SAO PAULO',
    CEP: '02725050',
    VALOR: 5316.61,
  });

  assert.equal(demanda.empresa, 'COPELI');
  assert.equal(demanda.pedido, '825594');
  assert.equal(demanda.num_nf, '328621');
  assert.equal(demanda.modalidade, 'PROPRIA');
  assert.equal(demanda.data_prometida, '2026-10-23');
  assert.equal(demanda.cep, '02725050');
  assert.equal(demanda.valor, 5316.61);
  assert.equal(demanda.status_logistico, '4A');
});

test('fotografia identifica modalidades externas', () => {
  assert.equal(normalizarDemanda({
    Empresa: 'COPELI', PEDIDO: 1, PrioridadeCodigo: '23', Prioridade: 'SEDEX'
  }).modalidade, 'SEDEX');

  assert.equal(normalizarDemanda({
    Empresa: 'COPELI', PEDIDO: 2, PrioridadeCodigo: '32', Prioridade: 'ENTREGA TRANSPORTADORA'
  }).modalidade, 'TRANSPORTADORA');
});
