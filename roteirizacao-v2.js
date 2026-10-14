(function () {
  'use strict';

  const apiBase = typeof API !== 'undefined'
    ? API
    : (window.ROTEIRIZADOR_API || window.location.origin);

  let modoAtual = null;

  function inserirIntegracaoDeak() {
    const bloco = document.getElementById('input-xlsx');
    if (!bloco || document.getElementById('btn-carregar-deak')) return;

    const box = document.createElement('div');
    box.style.marginBottom = '9px';
    box.innerHTML = `
      <button id="btn-carregar-deak" class="btn btn-primary" onclick="carregarEntregasDeak()" style="margin-bottom:5px">
        Carregar entregas diretamente do Deak
      </button>
      <div id="deak-status" style="font-size:10px;color:var(--muted);line-height:1.5">
        Usa a view dbo.vw_copeli_Entrega em modo somente leitura.
      </div>
    `;
    bloco.insertBefore(box, bloco.firstChild);
  }

  function inserirBannerModo() {
    const alvo = document.getElementById('zonas-result');
    if (!alvo || document.getElementById('modo-roteirizacao-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'modo-roteirizacao-banner';
    banner.className = 'info info-blue';
    banner.style.marginBottom = '8px';
    banner.textContent = 'Modo de roteirização: carregando...';
    alvo.insertBefore(banner, alvo.firstChild);
  }

  function atualizarBanner(cfg) {
    modoAtual = cfg && cfg.modo;
    if (cfg) {
      window.__roteirizacaoConfiguracao = cfg;
      const depositoInput = document.getElementById('deposito');
      if (depositoInput && cfg.deposito_endereco) depositoInput.value = cfg.deposito_endereco;
      if (Number.isFinite(Number(cfg.deposito_lat)) && Number.isFinite(Number(cfg.deposito_lng))) {
        depGlobal = {
          lat: Number(cfg.deposito_lat),
          lng: Number(cfg.deposito_lng),
        };
      }
    }

    const banner = document.getElementById('modo-roteirizacao-banner');
    if (!banner) return;

    if (modoAtual === 'CEP') {
      banner.textContent = 'Modo ativo: faixas de CEP. O motorista é definido pelo cadastro administrativo e a sequência é otimizada pela HERE.';
    } else if (modoAtual === 'OTIMIZADA') {
      banner.textContent = 'Modo ativo: otimização por frota. As entregas são distribuídas entre os veículos ativos e as rotas são otimizadas pela HERE.';
    } else {
      banner.textContent = 'Modo de roteirização ainda não carregado.';
    }
  }

  async function carregarConfiguracao() {
    try {
      const resposta = await fetch(apiBase + '/api/roteirizacao/configuracoes');
      const dados = await resposta.json();
      if (resposta.ok && dados.ok) atualizarBanner(dados.configuracao);
    } catch (erro) {
      console.warn('Nao foi possivel carregar o modo de roteirizacao:', erro.message);
    }
  }

  function deduplicarPorPedido(lista) {
    const vistos = new Set();
    return lista.filter((item) => {
      if (!item.pedido) return true;
      if (vistos.has(item.pedido)) return false;
      vistos.add(item.pedido);
      return true;
    });
  }

  window.carregarEntregasDeak = async function () {
    const botao = document.getElementById('btn-carregar-deak');
    const status = document.getElementById('deak-status');

    try {
      botao.disabled = true;
      botao.textContent = 'Carregando entregas...';
      status.textContent = 'Consultando dbo.vw_copeli_Entrega...';

      const resposta = await fetch(apiBase + '/api/entregas');
      const dados = await resposta.json();
      if (!resposta.ok || !dados.ok) throw new Error(dados.error || 'Falha ao consultar o Deak.');

      const brutas = (dados.entregas || []).map((row) => montarEntrada(row));
      entregas = deduplicarPorPedido(brutas);
      window._dupRemovidasCount = brutas.length - entregas.length;
      mostrarPreview();

      status.textContent = entregas.length + ' entregas carregadas diretamente do Deak.';
    } catch (erro) {
      status.textContent = 'Erro: ' + erro.message;
      status.style.color = 'var(--red)';
    } finally {
      botao.disabled = false;
      botao.textContent = 'Carregar entregas diretamente do Deak';
    }
  };

  function coletarPontos() {
    const resultado = [];
    const vistos = new Set();

    function adicionar(ponto) {
      if (!ponto || !Number.isFinite(Number(ponto.lat)) || !Number.isFinite(Number(ponto.lng))) return;
      const chave = [ponto.pedido || '', ponto.lat, ponto.lng].join('|');
      if (vistos.has(chave)) return;
      vistos.add(chave);
      resultado.push(ponto);
    }

    Object.values(rotasJaOtimizadas || {}).forEach((rota) => {
      (rota.rotaOtimizada || rota.pontos || []).forEach(adicionar);
    });

    (zonasComEntregas || []).forEach((zona) => {
      (zona.pontos || []).forEach(adicionar);
    });

    (entregasParaAgendar || []).forEach(adicionar);
    return resultado;
  }

  function zonaFallback() {
    return {
      id: 'planejamento',
      nome: 'Planejamento profissional',
      lat: depGlobal ? depGlobal.lat : -23.55,
      lng: depGlobal ? depGlobal.lng : -46.65,
      cor: '#1a5fa8',
      corL: '#e8f0fb',
    };
  }

  function montarRotasParaTela(dados) {
    const usados = new Set();

    return (dados.rotas || []).map((rota, indice) => {
      let nomeBase = rota.motorista || (rota.veiculo && rota.veiculo.nome) || ('Rota ' + (indice + 1));
      let nome = nomeBase;
      if (usados.has(nome)) {
        nome = nomeBase + ' · ' + ((rota.veiculo && rota.veiculo.nome) || (indice + 1));
      }
      usados.add(nome);

      const pontos = (rota.entregas || []).map((ponto) => ({
        ...ponto,
        motoristaPlanejado: rota.motorista || null,
        veiculoPlanejado: rota.veiculo || null,
        zona: ponto.zona || zonaFallback(),
      }));

      const zonas = [...new Set(
        pontos.map((p) => p.zona && p.zona.nome).filter(Boolean)
      )];
      if (!zonas.length) zonas.push('Planejamento profissional');

      return {
        motorista: nome,
        motoristaReal: rota.motorista || null,
        veiculo: rota.veiculo || null,
        pontos,
        rotaOtimizada: pontos,
        zonas,
        cor: getCorMot(nome),
        distKm: rota.distKm || 0,
        duracaoSegundos: rota.duracaoSegundos || 0,
      };
    });
  }

  function montarPendencias(dados) {
    const itens = (dados.naoAtribuidas || [])
      .map((item) => item.entrega || item)
      .filter((item) => item && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)));

    if (!itens.length) return [];

    return [{
      zona: {
        id: 'nao_atribuidas',
        nome: 'Não atribuídas',
        lat: depGlobal ? depGlobal.lat : -23.55,
        lng: depGlobal ? depGlobal.lng : -46.65,
        cor: '#993c1d',
        corL: '#fceae8',
      },
      pontos: itens,
      motorista: '',
    }];
  }

  async function planejarNoBackend(pontos) {
    const resposta = await fetch(apiBase + '/api/roteirizacao/planejar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entregas: pontos }),
    });

    const dados = await resposta.json();
    if (!resposta.ok || !dados.ok) {
      const erro = new Error(dados.error || 'Falha no planejamento de rotas.');
      erro.code = dados.code;
      erro.detail = dados.detail;
      throw erro;
    }
    return dados;
  }

  window.otimizarRotas = async function () {
    const pontos = coletarPontos();
    if (!pontos.length) {
      alert('Geocodifique as entregas antes de planejar as rotas.');
      return;
    }

    const botao = document.getElementById('btn-otimizar');
    const textoAnterior = botao ? botao.textContent : '';

    try {
      if (botao) {
        botao.disabled = true;
        botao.textContent = 'Planejando rotas...';
      }

      const timerEl = document.getElementById('timer-box');
      if (timerEl) {
        timerEl.style.background = 'var(--blue-l)';
        timerEl.style.color = 'var(--blue)';
      }
      iniciarTimer();

      await carregarConfiguracao();
      const cfg = window.__roteirizacaoConfiguracao;
      if (cfg && Number.isFinite(Number(cfg.deposito_lat)) && Number.isFinite(Number(cfg.deposito_lng))) {
        depGlobal = { lat: Number(cfg.deposito_lat), lng: Number(cfg.deposito_lng) };
      }

      const dados = await planejarNoBackend(pontos);
      modoAtual = dados.modo || modoAtual;

      const rotas = montarRotasParaTela(dados);
      rotasJaOtimizadas = {};
      rotas.forEach((rota) => {
        rotasJaOtimizadas[rota.motorista] = rota;
      });

      zonasComEntregas = [
        ...rotas.map((rota) => ({
          zona: rota.pontos[0] && rota.pontos[0].zona ? rota.pontos[0].zona : zonaFallback(),
          pontos: rota.pontos,
          motorista: rota.motorista,
        })),
        ...montarPendencias(dados),
      ];

      entregasParaAgendar = [];
      renderizarZonas();

      if (rotas.length) {
        await reotimizarMapa(rotas);
        renderizarRotasFundidas(rotas);
      } else {
        renderizarMapaZonas(depGlobal);
      }

      atualizarBanner({ modo: dados.modo });

      if (dados.naoAtribuidas && dados.naoAtribuidas.length) {
        alert(
          dados.naoAtribuidas.length +
          ' entrega(s) ficaram sem rota. Consulte a seção de pendências antes de liberar o planejamento.'
        );
      }
    } catch (erro) {
      console.error('Planejamento v2 falhou:', erro);
      let mensagem = erro.message;
      if (erro.code === 'HERE_TOUR_PLANNING_ERRO') {
        mensagem += '\nVerifique se a chave HERE possui acesso ao Tour Planning API.';
      }
      alert(mensagem);
    } finally {
      pararTimer();
      if (botao) {
        botao.disabled = false;
        botao.textContent = textoAnterior || 'Otimizar rotas';
      }
    }
  };

  window.addEventListener('roteirizador:configuracao', (evento) => {
    atualizarBanner(evento.detail);
  });

  window.addEventListener('load', () => {
    inserirIntegracaoDeak();
    inserirBannerModo();
    carregarConfiguracao();
  });
})();
