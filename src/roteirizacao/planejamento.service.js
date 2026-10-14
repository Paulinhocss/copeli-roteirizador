const configuracoes = require('./configuracoes.repository');
const { encontrarFaixa } = require('./faixas-cep');
const { planejarTours } = require('./here.service');

function validarEntregas(entregas) {
  if (!Array.isArray(entregas) || !entregas.length) {
    const erro = new Error('Informe ao menos uma entrega para planejar.');
    erro.code = 'SEM_ENTREGAS';
    throw erro;
  }

  return entregas.map((entrega, indice) => ({
    ...entrega,
    _indicePlanejamento: indice,
    lat: Number(entrega.lat),
    lng: Number(entrega.lng),
  }));
}

function criarVeiculoVirtual(motorista, quantidade) {
  return {
    id: null,
    nome: `Rota ${motorista.nome}`,
    placa: null,
    perfil: 'car',
    max_paradas: Math.max(quantidade, 100),
    motorista_id: motorista.id,
    motorista_nome: motorista.nome,
    virtual: true,
  };
}

async function planejarPorCep(entregas, contexto, opcoes) {
  const { configuracao, faixas, motoristas, veiculos } = contexto;
  const motoristasMap = new Map(motoristas.map((m) => [Number(m.id), m]));
  const grupos = new Map();
  const naoAtribuidas = [];

  entregas.forEach((entrega) => {
    const faixa = encontrarFaixa(entrega.cep, faixas);
    if (!faixa) {
      naoAtribuidas.push({
        entrega,
        motivo: 'CEP_SEM_FAIXA',
      });
      return;
    }

    const motorista = motoristasMap.get(Number(faixa.motorista_id));
    if (!motorista) {
      naoAtribuidas.push({
        entrega,
        motivo: 'MOTORISTA_INDISPONIVEL',
      });
      return;
    }

    const chave = String(motorista.id);
    if (!grupos.has(chave)) grupos.set(chave, { motorista, entregas: [] });
    grupos.get(chave).entregas.push(entrega);
  });

  const rotas = [];
  const falhasHere = [];

  for (const grupo of grupos.values()) {
    const veiculo = veiculos.find(
      (item) => Number(item.motorista_id) === Number(grupo.motorista.id)
    ) || criarVeiculoVirtual(grupo.motorista, grupo.entregas.length);

    try {
      const resultado = await planejarTours({
        entregas: grupo.entregas,
        veiculos: [veiculo],
        configuracao,
        dataPlanejamento: opcoes.data_planejamento,
      });
      rotas.push(...resultado.rotas);
      naoAtribuidas.push(...resultado.naoAtribuidas.map((item) => ({
        ...item,
        motivo: 'HERE_NAO_ATRIBUIU',
      })));
    } catch (erro) {
      falhasHere.push({
        motorista: grupo.motorista.nome,
        code: erro.code,
        error: erro.message,
      });
    }
  }

  if (falhasHere.length) {
    const erro = new Error('Falha ao otimizar uma ou mais rotas por CEP na HERE.');
    erro.code = 'FALHA_ROTEIRIZACAO_CEP';
    erro.detail = falhasHere;
    throw erro;
  }

  return {
    modo: 'CEP',
    rotas,
    naoAtribuidas,
    resumo: {
      entregasRecebidas: entregas.length,
      entregasRoteirizadas: rotas.reduce((soma, rota) => soma + rota.entregas.length, 0),
      naoAtribuidas: naoAtribuidas.length,
      rotas: rotas.length,
    },
  };
}

async function planejarOtimizado(entregas, contexto, opcoes) {
  let veiculos = contexto.veiculos;

  if (Array.isArray(opcoes.veiculo_ids) && opcoes.veiculo_ids.length) {
    const ids = new Set(opcoes.veiculo_ids.map(Number));
    veiculos = veiculos.filter((v) => ids.has(Number(v.id)));
  }

  if (!veiculos.length) {
    const erro = new Error('Cadastre e ative ao menos um veiculo para o modo otimizado.');
    erro.code = 'SEM_VEICULOS_ATIVOS';
    throw erro;
  }

  const resultado = await planejarTours({
    entregas,
    veiculos,
    configuracao: contexto.configuracao,
    dataPlanejamento: opcoes.data_planejamento,
  });

  return {
    modo: 'OTIMIZADA',
    ...resultado,
    resumo: {
      entregasRecebidas: entregas.length,
      entregasRoteirizadas: resultado.rotas.reduce(
        (soma, rota) => soma + rota.entregas.length,
        0
      ),
      naoAtribuidas: resultado.naoAtribuidas.length,
      rotas: resultado.rotas.length,
      veiculosConsiderados: veiculos.length,
    },
  };
}

async function planejar(entregasBrutas, opcoes = {}) {
  const entregas = validarEntregas(entregasBrutas);

  const [configuracao, faixas, motoristas, veiculos] = await Promise.all([
    configuracoes.obterConfiguracao(),
    configuracoes.listarFaixasCep({ somenteAtivas: true }),
    configuracoes.listarMotoristas({ somenteAtivos: true }),
    configuracoes.listarVeiculos({ somenteAtivos: true }),
  ]);

  const contexto = { configuracao, faixas, motoristas, veiculos };

  if (configuracao.modo === 'CEP') {
    return planejarPorCep(entregas, contexto, opcoes);
  }

  return planejarOtimizado(entregas, contexto, opcoes);
}

module.exports = {
  encontrarFaixa,
  validarEntregas,
  planejar,
};
