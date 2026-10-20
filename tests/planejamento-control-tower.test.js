const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validarEntregas,
  consolidarParadasFisicas,
} = require('../src/roteirizacao/planejamento.service');

function sedex(pedido, cliente) {
  return {
    pedido,
    cliente,
    modalidade: 'SEDEX',
    prioridade: 'SEDEX',
    prioridade_codigo: '23',
    requerDestinoOperacional: true,
    lat: -21.18,
    lng: -47.81,
    cep: '14024210',
    valor: 100,
    destino_operacional: {
      id: 10,
      tipo: 'CORREIOS',
      nome: 'Correios Vila Yara',
      endereco: 'Avenida Yara',
      numero: '75',
      bairro: 'Vila Yara',
      cidade: 'Osasco',
      uf: 'SP',
      cep: '06028110',
      lat: -23.543,
      lng: -46.767,
    },
  };
}

function transportadora(pedido, pontoId, lat, lng) {
  return {
    pedido,
    cliente: 'Cliente ' + pedido,
    modalidade: 'TRANSPORTADORA',
    prioridade: 'ENTREGA TRANSPORTADORA',
    prioridade_codigo: '32',
    requerDestinoOperacional: true,
    lat: -23.6,
    lng: -46.7,
    valor: 50,
    destino_operacional: {
      id: pontoId,
      tipo: 'TRANSPORTADORA',
      nome: 'Transportadora ' + pontoId,
      endereco: 'Endereco ' + pontoId,
      numero: '100',
      bairro: 'Centro',
      cidade: 'Osasco',
      uf: 'SP',
      cep: '06000000',
      lat,
      lng,
    },
  };
}

test('SEDEX troca o destino de roteirizacao para o ponto dos Correios', () => {
  const entrada = sedex('1001', 'Cliente A');
  const [validada] = validarEntregas([entrada]);

  assert.equal(validada.lat, entrada.destino_operacional.lat);
  assert.equal(validada.lng, entrada.destino_operacional.lng);
  assert.equal(validada.latCliente, entrada.lat);
  assert.equal(validada.lngCliente, entrada.lng);
  assert.equal(validada.cepCliente, entrada.cep);
  assert.equal(validada.cep, entrada.destino_operacional.cep);
});

test('oito pedidos SEDEX para a mesma agencia viram uma parada fisica', () => {
  const entradas = Array.from({ length: 8 }, (_, i) =>
    sedex(String(2000 + i), 'Cliente ' + (i + 1))
  );

  const validadas = validarEntregas(entradas);
  const paradas = consolidarParadasFisicas(validadas);

  assert.equal(paradas.length, 1);
  assert.equal(paradas[0].paradaFisicaConsolidada, true);
  assert.equal(paradas[0].quantidadeEntregas, 8);
  assert.equal(paradas[0].entregasAgrupadas.length, 8);
  assert.equal(paradas[0].pedido, null);
  assert.equal(paradas[0].cliente, 'Correios Vila Yara');
});

test('transportadoras diferentes continuam como paradas fisicas diferentes', () => {
  const entradas = [
    transportadora('3001', 50, -23.50, -46.70),
    transportadora('3002', 60, -23.60, -46.80),
  ];

  const paradas = consolidarParadasFisicas(validarEntregas(entradas));

  assert.equal(paradas.length, 2);
  assert.equal(paradas[0].quantidadeEntregas, 1);
  assert.equal(paradas[1].quantidadeEntregas, 1);
});

test('entregas proprias nao sao consolidadas por endereco', () => {
  const entregas = [
    {
      pedido: '4001',
      cliente: 'Cliente A',
      modalidade: 'PROPRIA',
      lat: -23.55,
      lng: -46.70,
      cep: '06000000',
      valor: 10,
    },
    {
      pedido: '4002',
      cliente: 'Cliente B',
      modalidade: 'PROPRIA',
      lat: -23.55,
      lng: -46.70,
      cep: '06000000',
      valor: 20,
    },
  ];

  const paradas = consolidarParadasFisicas(validarEntregas(entregas));

  assert.equal(paradas.length, 2);
  assert.equal(paradas[0].quantidadeEntregas, 1);
  assert.equal(paradas[1].quantidadeEntregas, 1);
});

test('SEDEX sem ponto de despacho e bloqueado', () => {
  const entrega = sedex('5001', 'Cliente');
  delete entrega.destino_operacional;

  assert.throws(
    () => validarEntregas([entrega]),
    (erro) => erro && erro.code === 'DESTINO_DESPACHO_OBRIGATORIO'
  );
});