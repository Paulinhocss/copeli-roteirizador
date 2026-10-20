const configuracoes = require('./configuracoes.repository');
const { encontrarFaixa } = require('./faixas-cep');
const { planejarTours } = require('./here.service');
const despachos = require('./despachos.repository');

function validarEntregas(entregas) {
  if (!Array.isArray(entregas) || !entregas.length) {
    const erro = new Error('Informe ao menos uma entrega para planejar.');
    erro.code = 'SEM_ENTREGAS';
    throw erro;
  }

  return entregas.map((entrega, indice) => {
    const modalidade = String(entrega.modalidade || '').toUpperCase();
    const requerDestino = Boolean(
      entrega.requerDestinoOperacional ||
      entrega.requer_destino_operacional ||
      modalidade === 'TRANSPORTADORA' ||
      modalidade === 'SEDEX'
    );

    if (requerDestino) {
      const destino = entrega.destino_operacional || entrega.destinoOperacional;
      const latDestino = destino && Number(destino.lat);
      const lngDestino = destino && Number(destino.lng);

      if (!Number.isFinite(latDestino) || !Number.isFinite(lngDestino)) {
        const erro = new Error(
          modalidade === 'SEDEX'
            ? 'Entrega SEDEX sem ponto dos Correios definido.'
            : 'Entrega de transportadora sem ponto de despacho definido.'
        );
        erro.code = 'DESTINO_DESPACHO_OBRIGATORIO';
        erro.detail = {
          pedido: entrega.pedido || entrega.PEDIDO || null,
          modalidade: modalidade || null,
        };
        throw erro;
      }

      return {
        ...entrega,
        _indicePlanejamento: indice,
        latCliente: Number(entrega.lat),
        lngCliente: Number(entrega.lng),
        cepCliente: entrega.cep,
        lat: latDestino,
        lng: lngDestino,
        cep: destino.cep || entrega.cep,
      };
    }

    return {
      ...entrega,
      _indicePlanejamento: indice,
      lat: Number(entrega.lat),
      lng: Number(entrega.lng),
    };
  });
}


function quantidadeEntregas(item) {
  return Array.isArray(item.entregasAgrupadas) && item.entregasAgrupadas.length
    ? item.entregasAgrupadas.length
    : 1;
}

function consolidarParadasFisicas(entregas) {
  const resultado = [];
  const externos = new Map();

  entregas.forEach((entrega, indice) => {
    const modalidade = String(entrega.modalidade || '').toUpperCase();
    const destino = entrega.destino_operacional || entrega.destinoOperacional;

    if (!['TRANSPORTADORA','SEDEX'].includes(modalidade) || !destino) {
      resultado.push({
        ...entrega,
        entregasAgrupadas: [entrega],
        quantidadeEntregas: 1,
        paradaFisicaConsolidada: false,
      });
      return;
    }

    const chave = [
      modalidade,
      destino.id || '',
      destino.codigo_externo || '',
      destino.nome || '',
      Number(destino.lat).toFixed(6),
      Number(destino.lng).toFixed(6),
    ].join('|');

    if (!externos.has(chave)) {
      const grupo = {
        ...entrega,
        _indicePlanejamento: indice,
        cliente: destino.nome || (modalidade === 'SEDEX' ? 'CORREIOS' : 'TRANSPORTADORA'),
        CLIENTE: destino.nome || (modalidade === 'SEDEX' ? 'CORREIOS' : 'TRANSPORTADORA'),
        endereco: destino.endereco || entrega.endereco,
        ENDENT: destino.endereco || entrega.ENDENT,
        numero: destino.numero || entrega.numero,
        NumEnt: destino.numero || entrega.NumEnt,
        bairro: destino.bairro || entrega.bairro,
        BAIRRO: destino.bairro || entrega.BAIRRO,
        cidade: destino.cidade || entrega.cidade,
        CIDADE: destino.cidade || entrega.CIDADE,
        cep: destino.cep || entrega.cep,
        CEP: destino.cep || entrega.CEP,
        lat: Number(destino.lat),
        lng: Number(destino.lng),
        pedido: null,
        PEDIDO: null,
        num_nf: null,
        NumNF: null,
        valor: 0,
        VALOR: 0,
        entregasAgrupadas: [],
        quantidadeEntregas: 0,
        paradaFisicaConsolidada: true,
      };
      externos.set(chave, grupo);
      resultado.push(grupo);
    }

    const grupo = externos.get(chave);
    grupo.entregasAgrupadas.push(entrega);
    grupo.quantidadeEntregas = grupo.entregasAgrupadas.length;

    const valor = Number(
      String(entrega.valor ?? entrega.VALOR ?? 0).replace(',', '.')
    );
    if (Number.isFinite(valor)) {
      grupo.valor += valor;
      grupo.VALOR += valor;
    }

    grupo.obs = grupo.quantidadeEntregas + ' entrega(s) para despacho externo';
    grupo.Observacao = grupo.obs;
  });

  return resultado;
}

function totalEntregasRotas(rotas) {
  return rotas.reduce(
    (total, rota) => total + (rota.entregas || []).reduce(
      (soma, item) => soma + quantidadeEntregas(item),
      0
    ),
    0
  );
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
      entregasRecebidas: entregas.reduce(
        (soma, item) => soma + quantidadeEntregas(item),
        0
      ),
      entregasRoteirizadas: totalEntregasRotas(rotas),
      paradasPlanejadas: rotas.reduce((soma, rota) => soma + rota.entregas.length, 0),
      naoAtribuidas: naoAtribuidas.reduce(
        (soma, item) => soma + quantidadeEntregas(item.entrega || item),
        0
      ),
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
      entregasRecebidas: entregas.reduce(
        (soma, item) => soma + quantidadeEntregas(item),
        0
      ),
      entregasRoteirizadas: totalEntregasRotas(resultado.rotas),
      paradasPlanejadas: resultado.rotas.reduce(
        (soma, rota) => soma + rota.entregas.length,
        0
      ),
      naoAtribuidas: resultado.naoAtribuidas.reduce(
        (soma, item) => soma + quantidadeEntregas(item.entrega || item),
        0
      ),
      rotas: resultado.rotas.length,
      veiculosConsiderados: veiculos.length,
    },
  };
}

async function planejar(entregasBrutas, opcoes = {}) {
  const entregasComDestinos = await despachos.aplicarDestinosOperacionais(
    Array.isArray(entregasBrutas) ? entregasBrutas : []
  );
  const entregasValidadas = validarEntregas(entregasComDestinos);
  const entregas = consolidarParadasFisicas(entregasValidadas);

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
  consolidarParadasFisicas,
  planejar,
};
