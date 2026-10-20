(function () {
  'use strict';

  const apiBase = typeof API !== 'undefined'
    ? API
    : (window.ROTEIRIZADOR_API || window.location.origin);

  var rotaAbertaId = null;
  var autoRefresh = null;
  var camadasCockpit = [];

  async function api(caminho, opcoes) {
    opcoes = opcoes || {};
    var resposta = await fetch(apiBase + caminho, {
      method: opcoes.method || 'GET',
      headers: Object.assign({ 'content-type': 'application/json' }, opcoes.headers || {}),
      body: opcoes.body
    });
    var dados = await resposta.json().catch(function () { return {}; });
    if (!resposta.ok || dados.ok === false) {
      var erro = new Error(dados.error || 'Falha na operacao.');
      erro.code = dados.code;
      throw erro;
    }
    return dados;
  }

  function hoje() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
    } catch (_) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function esc(valor) {
    return String(valor === null || valor === undefined ? '' : valor)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function num(valor) {
    var n = Number(valor || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function moeda(valor) {
    return num(valor).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function duracao(segundos) {
    var total = Math.max(0, Math.round(num(segundos)));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    if (h) return h + 'h ' + String(m).padStart(2, '0') + 'min';
    return m + 'min';
  }

  function hora(data) {
    if (!data) return '—';
    var d = new Date(data);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function statusClasse(status) {
    var s = String(status || '').toUpperCase();
    if (['FINALIZADA','ENTREGUE'].includes(s)) return 'ok';
    if (['EM_ROTA','NO_CLIENTE','EM_TRANSITO','DESPACHADO'].includes(s)) return 'info';
    if (['NAO_ENTREGUE','EXCECAO','CANCELADA'].includes(s)) return 'erro';
    if (['REAGENDADA'].includes(s)) return 'aviso';
    return 'neutro';
  }

  function modalidadeClasse(modalidade) {
    var m = String(modalidade || 'PROPRIA').toUpperCase();
    if (m === 'SEDEX') return 'sedex';
    if (m === 'TRANSPORTADORA') return 'transportadora';
    return 'propria';
  }

  function instalarEstilos() {
    if (document.getElementById('ct-cockpit-styles')) return;
    var style = document.createElement('style');
    style.id = 'ct-cockpit-styles';
    style.textContent =
      '.ct-toolbar{display:flex;gap:6px;align-items:flex-end;margin-bottom:9px}' +
      '.ct-toolbar .fg{margin:0;flex:1}' +
      '.ct-toolbar .btn{width:auto;white-space:nowrap}' +
      '.ct-live{font-size:9px;padding:4px 7px;border:1px solid var(--border);border-radius:12px;color:var(--muted);background:#fff;margin-bottom:9px}' +
      '.ct-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:9px}' +
      '.ct-kpi{background:#fff;border:1px solid var(--border);border-radius:9px;padding:8px 9px;min-width:0}' +
      '.ct-kpi small{display:block;font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ct-kpi strong{display:block;font-size:18px;line-height:1.15;margin-top:3px}' +
      '.ct-kpi span{display:block;font-size:9px;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ct-alerta{font-size:10px;padding:7px 8px;border-radius:8px;background:var(--amber-l);color:var(--amber);margin-bottom:9px;line-height:1.4}' +
      '.ct-bloco{background:#fff;border:1px solid var(--border);border-radius:9px;margin-bottom:9px;overflow:hidden}' +
      '.ct-bloco-titulo{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 9px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}' +
      '.ct-rota{padding:8px 9px;border-bottom:1px solid var(--border);cursor:pointer}' +
      '.ct-rota:last-child{border-bottom:none}' +
      '.ct-rota:hover{background:#fafaf8}' +
      '.ct-rota-topo{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}' +
      '.ct-rota strong{font-size:11px}' +
      '.ct-rota small{display:block;font-size:9px;color:var(--muted);line-height:1.45;margin-top:2px}' +
      '.ct-badge{display:inline-block;padding:2px 6px;border-radius:10px;font-size:8px;font-weight:700;white-space:nowrap}' +
      '.ct-status-ok{background:var(--green-l);color:var(--green)}' +
      '.ct-status-info{background:var(--blue-l);color:var(--blue)}' +
      '.ct-status-erro{background:var(--red-l);color:var(--red)}' +
      '.ct-status-aviso{background:var(--amber-l);color:var(--amber)}' +
      '.ct-status-neutro{background:#f1f1ee;color:#666}' +
      '.ct-mod-propria{background:#eaf6ef;color:#21834a}' +
      '.ct-mod-transportadora{background:#fff2df;color:#9a5a00}' +
      '.ct-mod-sedex{background:#e8f0fb;color:#1a5fa8}' +
      '.ct-detalhe-head{padding:9px;border-bottom:1px solid var(--border);background:#fafaf8}' +
      '.ct-detalhe-head strong{font-size:12px;display:block}' +
      '.ct-detalhe-head small{font-size:9px;color:var(--muted);display:block;margin-top:2px}' +
      '.ct-acoes{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}' +
      '.ct-acoes button{font-size:9px;padding:4px 7px;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;font-family:var(--font)}' +
      '.ct-acoes button.primary{background:var(--blue);color:#fff;border-color:var(--blue)}' +
      '.ct-acoes button.danger{background:var(--red-l);color:var(--red);border-color:var(--red)}' +
      '.ct-parada{padding:8px 9px;border-top:1px solid var(--border)}' +
      '.ct-parada:first-child{border-top:none}' +
      '.ct-parada-topo{display:flex;justify-content:space-between;gap:8px}' +
      '.ct-parada strong{font-size:10px;display:block}' +
      '.ct-parada small{font-size:9px;color:var(--muted);display:block;line-height:1.4;margin-top:2px}' +
      '.ct-entregas{margin-top:6px;padding-left:7px;border-left:2px solid var(--border)}' +
      '.ct-entrega{padding:5px 0;border-bottom:1px dashed var(--border);font-size:9px;line-height:1.45}' +
      '.ct-entrega:last-child{border-bottom:none}' +
      '.ct-vazio{padding:16px;text-align:center;color:var(--muted);font-size:10px}' +
      '.ct-ocorrencia{padding:7px 9px;border-bottom:1px solid var(--border);font-size:9px;line-height:1.4}' +
      '.ct-ocorrencia:last-child{border-bottom:none}' +
      '.ct-ocorrencia b{display:block;font-size:10px;margin-bottom:2px}';
    document.head.appendChild(style);
  }

  function instalarPainel() {
    var nav = document.querySelector('.topnav');
    var sidebar = document.querySelector('.sidebar');
    if (!nav || !sidebar || document.getElementById('tab-control-tower')) return;

    var botao = document.createElement('button');
    botao.className = 'tab';
    botao.textContent = 'Control Tower';
    botao.onclick = function () {
      switchTab('control-tower', this);
      carregarTudo();
      iniciarAutoRefresh();
    };
    nav.appendChild(botao);

    var painel = document.createElement('div');
    painel.id = 'tab-control-tower';
    painel.className = 'tab-content';
    painel.innerHTML =
      '<div class="ct-toolbar">' +
        '<div class="fg"><label>Data operacional</label><input id="ct-data" type="date"/></div>' +
        '<button class="btn btn-primary" id="ct-btn-atualizar">Atualizar</button>' +
      '</div>' +
      '<div id="ct-live" class="ct-live">Control Tower · aguardando dados</div>' +
      '<div id="ct-alerta"></div>' +
      '<div id="ct-kpis" class="ct-grid"></div>' +
      '<div class="ct-bloco">' +
        '<div class="ct-bloco-titulo"><span>Rotas oficiais</span><span id="ct-rotas-contagem"></span></div>' +
        '<div id="ct-rotas"></div>' +
      '</div>' +
      '<div id="ct-detalhe"></div>' +
      '<div class="ct-bloco">' +
        '<div class="ct-bloco-titulo"><span>Alertas operacionais</span><span id="ct-alertas-contagem"></span></div>' +
        '<div id="ct-alertas"></div>' +
      '</div>' +
      '<div class="ct-bloco">' +
        '<div class="ct-bloco-titulo"><span>Ocorrencias abertas</span><span id="ct-ocorrencias-contagem"></span></div>' +
        '<div id="ct-ocorrencias"></div>' +
      '</div>';

    sidebar.appendChild(painel);

    document.getElementById('ct-data').value = hoje();
    document.getElementById('ct-data').onchange = carregarTudo;
    document.getElementById('ct-btn-atualizar').onclick = carregarTudo;
  }

  function kpi(titulo, valor, detalhe) {
    return '<div class="ct-kpi">' +
      '<small>' + esc(titulo) + '</small>' +
      '<strong>' + esc(valor) + '</strong>' +
      '<span>' + esc(detalhe || '') + '</span>' +
      '</div>';
  }

  function renderResumo(r) {
    var el = document.getElementById('ct-kpis');
    if (!el) return;

    el.innerHTML =
      kpi('Rotas', num(r.rotas_total), num(r.rotas_em_rota) + ' em rota') +
      kpi('Paradas fisicas', num(r.paradas_total), num(r.paradas_pendentes) + ' pendentes') +
      kpi('Entregas', num(r.entregas_total), moeda(r.valor_total)) +
      kpi('KM planejado', num(r.km_planejado).toFixed(1), r.km_real ? num(r.km_real).toFixed(1) + ' km realizado' : 'real ainda nao consolidado') +
      kpi('Entrega propria', num(r.modalidade_propria), 'destino cliente') +
      kpi('Transportadora', num(r.modalidade_transportadora), 'despacho externo') +
      kpi('SEDEX', num(r.modalidade_sedex), 'despacho Correios') +
      kpi('Externo em transito', num(r.externos_em_acompanhamento), num(r.externos_excecao) + ' excecao(oes)');

    var externos = num(r.modalidade_transportadora) + num(r.modalidade_sedex);
    var alerta = document.getElementById('ct-alerta');
    if (alerta) {
      if (externos > 0) {
        alerta.innerHTML =
          '<div class="ct-alerta"><b>' + externos + ' entrega(s) com despacho externo.</b> ' +
          'Elas continuam na rota Copeli ate Transportadora/Correios e depois seguem em acompanhamento externo.</div>';
      } else {
        alerta.innerHTML = '';
      }
    }

    var live = document.getElementById('ct-live');
    if (live) {
      live.textContent =
        'Atualizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
        ' · ' + num(r.rotas_em_rota) + ' rota(s) em execucao';
    }
  }

  function renderRotas(rotas) {
    var el = document.getElementById('ct-rotas');
    var cont = document.getElementById('ct-rotas-contagem');
    if (!el) return;
    if (cont) cont.textContent = rotas.length;

    if (!rotas.length) {
      el.innerHTML = '<div class="ct-vazio">Nenhuma rota oficial nesta data.</div>';
      return;
    }

    el.innerHTML = rotas.map(function (r) {
      var classe = statusClasse(r.status);
      return '<div class="ct-rota" onclick="ControlTowerCockpit.abrirRota(' + r.id + ')">' +
        '<div class="ct-rota-topo">' +
          '<div><strong>' + esc(r.codigo || ('Rota ' + r.id)) + '</strong>' +
            '<small>' + esc(r.motorista_nome || 'Motorista nao definido') + ' · ' +
            esc(r.veiculo_placa || r.veiculo_nome || 'veiculo nao definido') + '</small></div>' +
          '<span class="ct-badge ct-status-' + classe + '">' + esc(r.status) + '</span>' +
        '</div>' +
        '<small>' + num(r.total_entregas) + ' entregas · ' + num(r.total_paradas) + ' paradas · ' +
          num(r.km_planejado).toFixed(1) + ' km · ' + duracao(r.duracao_planejada_segundos) + '</small>' +
        '</div>';
    }).join('');
  }


  function renderAlertas(alertas) {
    var el = document.getElementById('ct-alertas');
    var cont = document.getElementById('ct-alertas-contagem');
    if (!el) return;
    if (cont) cont.textContent = alertas.length;

    if (!alertas.length) {
      el.innerHTML = '<div class="ct-vazio">Nenhum alerta operacional aberto.</div>';
      return;
    }

    el.innerHTML = alertas.slice(0, 30).map(function (a) {
      return '<div class="ct-ocorrencia">' +
        '<b>' + esc(a.titulo) + '</b>' +
        '<span class="ct-badge ct-status-' + statusClasse(a.severidade === 'ALTA' || a.severidade === 'CRITICA' ? 'EXCECAO' : 'PENDENTE') + '">' +
          esc(a.severidade) + '</span> ' +
        esc(a.descricao || '') +
        '</div>';
    }).join('');
  }

  function renderOcorrencias(ocorrencias) {
    var el = document.getElementById('ct-ocorrencias');
    var cont = document.getElementById('ct-ocorrencias-contagem');
    if (!el) return;
    if (cont) cont.textContent = ocorrencias.length;

    if (!ocorrencias.length) {
      el.innerHTML = '<div class="ct-vazio">Nenhuma ocorrencia aberta.</div>';
      return;
    }

    el.innerHTML = ocorrencias.slice(0, 20).map(function (o) {
      return '<div class="ct-ocorrencia">' +
        '<b>' + esc(o.motivo) + '</b>' +
        esc(o.categoria) + ' · ' + esc(o.severidade) +
        (o.rota_codigo ? ' · ' + esc(o.rota_codigo) : '') +
        (o.pedido ? ' · pedido ' + esc(o.pedido) : '') +
        '</div>';
    }).join('');
  }

  function botaoRota(rota) {
    if (rota.status === 'LIBERADA') {
      return '<button class="primary" onclick="ControlTowerCockpit.statusRota(' + rota.id + ',\'EM_ROTA\')">Iniciar rota</button>';
    }
    if (rota.status === 'EM_ROTA') {
      return '<button class="primary" onclick="ControlTowerCockpit.statusRota(' + rota.id + ',\'FINALIZADA\')">Finalizar rota</button>';
    }
    return '';
  }

  function botoesParada(p) {
    if (['ENTREGUE','CANCELADA','REAGENDADA'].includes(p.status)) return '';

    var html = '<div class="ct-acoes">';
    if (p.status === 'PENDENTE') {
      html += '<button onclick="ControlTowerCockpit.statusParada(' + p.id + ',\'EM_DESLOCAMENTO\')">Em deslocamento</button>';
    }
    if (['PENDENTE','EM_DESLOCAMENTO'].includes(p.status)) {
      html += '<button onclick="ControlTowerCockpit.statusParada(' + p.id + ',\'NO_CLIENTE\')">Chegou</button>';
    }
    html += '<button class="primary" onclick="ControlTowerCockpit.statusParada(' + p.id + ',\'ENTREGUE\')">' +
      (p.modalidade === 'PROPRIA' ? 'Entregue ao cliente' : 'Entregue no despacho') + '</button>';
    html += '<button class="danger" onclick="ControlTowerCockpit.naoEntregue(' + p.id + ')">Nao realizado</button>';
    html += '</div>';
    return html;
  }

  function botoesExterno(e) {
    if (e.modalidade === 'PROPRIA' || e.status_externo === 'ENTREGUE') return '';

    var html = '<div class="ct-acoes">';
    if (e.status_externo === 'DESPACHADO') {
      html += '<button onclick="ControlTowerCockpit.statusExterno(' + e.id + ',\'EM_TRANSITO\')">Em transito</button>';
    }
    if (['DESPACHADO','EM_TRANSITO','EXCECAO'].includes(e.status_externo)) {
      html += '<button class="primary" onclick="ControlTowerCockpit.statusExterno(' + e.id + ',\'ENTREGUE\')">Entregue final</button>';
    }
    if (e.status_externo !== 'EXCECAO') {
      html += '<button class="danger" onclick="ControlTowerCockpit.statusExterno(' + e.id + ',\'EXCECAO\')">Excecao</button>';
    }
    html += '</div>';
    return html;
  }

  function mapaRota(rota) {
    if (typeof mapa === 'undefined' || !mapa || typeof L === 'undefined') return;

    camadasCockpit.forEach(function (layer) {
      try { mapa.removeLayer(layer); } catch (_) {}
    });
    camadasCockpit = [];

    var pontos = [];
    (rota.paradas || []).forEach(function (p) {
      var lat = Number(p.destino_operacional_lat !== null && p.destino_operacional_lat !== undefined ? p.destino_operacional_lat : p.lat);
      var lng = Number(p.destino_operacional_lng !== null && p.destino_operacional_lng !== undefined ? p.destino_operacional_lng : p.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      pontos.push([lat, lng]);
      var cor = p.modalidade === 'SEDEX' ? '#1a5fa8' : (p.modalidade === 'TRANSPORTADORA' ? '#9a5a00' : '#21834a');
      var icon = L.divIcon({
        className: '',
        html: '<div style="width:24px;height:24px;border-radius:50%;background:' + cor +
          ';border:2px solid white;color:white;font-weight:700;font-size:9px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,.25)">' +
          p.ordem_planejada + '</div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      var marker = L.marker([lat, lng], { icon: icon }).addTo(mapa)
        .bindPopup('<b>' + esc(p.destino_operacional_nome || p.cliente || 'Parada') + '</b><br>' +
          esc(p.modalidade) + ' · ' + num(p.quantidade_entregas) + ' entrega(s)');
      camadasCockpit.push(marker);
    });

    if (Number.isFinite(Number(rota.origem_lat)) && Number.isFinite(Number(rota.origem_lng))) {
      pontos.unshift([Number(rota.origem_lat), Number(rota.origem_lng)]);
    }

    if (pontos.length) {
      mapa.fitBounds(pontos, { padding: [35, 35] });
    }
  }

  function renderRota(rota) {
    rotaAbertaId = rota.id;
    var detalhe = document.getElementById('ct-detalhe');
    if (!detalhe) return;

    var html = '<div class="ct-bloco">' +
      '<div class="ct-detalhe-head">' +
        '<strong>' + esc(rota.codigo || ('Rota ' + rota.id)) + '</strong>' +
        '<small>' + esc(rota.motorista_nome || 'Motorista nao definido') + ' · ' +
          esc(rota.veiculo_placa || rota.veiculo_nome || 'veiculo nao definido') +
          ' · ' + num(rota.km_planejado).toFixed(1) + ' km · ' + duracao(rota.duracao_planejada_segundos) + '</small>' +
        '<div class="ct-acoes">' + botaoRota(rota) + '</div>' +
      '</div>';

    (rota.paradas || []).forEach(function (p) {
      html += '<div class="ct-parada">' +
        '<div class="ct-parada-topo">' +
          '<div><strong>' + p.ordem_planejada + 'ª · ' + esc(p.destino_operacional_nome || p.cliente || 'Parada') + '</strong>' +
            '<small>' + esc([p.endereco, p.numero, p.bairro, p.cidade].filter(Boolean).join(', ')) + '</small>' +
            '<small>ETA ' + hora(p.eta_planejado) + ' · ' + num(p.quantidade_entregas) + ' entrega(s)</small></div>' +
          '<span class="ct-badge ct-status-' + statusClasse(p.status) + '">' + esc(p.status) + '</span>' +
        '</div>' +
        '<div style="margin-top:5px"><span class="ct-badge ct-mod-' + modalidadeClasse(p.modalidade) + '">' + esc(p.modalidade) + '</span>' +
          (p.modalidade !== 'PROPRIA' ? ' <span class="ct-badge ct-status-' + statusClasse(p.status_externo) + '">' + esc(p.status_externo) + '</span>' : '') +
        '</div>' +
        botoesParada(p);

      if ((p.entregas || []).length) {
        html += '<div class="ct-entregas">';
        p.entregas.forEach(function (e) {
          html += '<div class="ct-entrega">' +
            '<b>#' + esc(e.pedido || '—') + '</b> · ' + esc(e.cliente || '—') + ' · ' + moeda(e.valor);
          if (e.modalidade !== 'PROPRIA') {
            html += '<br>Externo: <b>' + esc(e.status_externo) + '</b>' +
              (e.codigo_rastreio ? ' · rastreio ' + esc(e.codigo_rastreio) : '') +
              botoesExterno(e);
          }
          html += '</div>';
        });
        html += '</div>';
      }

      html += '</div>';
    });

    html += '</div>';
    detalhe.innerHTML = html;
    mapaRota(rota);
  }

  async function carregarTudo() {
    var dataEl = document.getElementById('ct-data');
    var data = dataEl && dataEl.value ? dataEl.value : hoje();

    try {
      var resultados = await Promise.all([
        api('/api/control-tower/resumo?data=' + encodeURIComponent(data)),
        api('/api/control-tower/rotas?data=' + encodeURIComponent(data)),
        api('/api/control-tower/alertas?status=ABERTO&limite=50'),
        api('/api/control-tower/ocorrencias?status=ABERTA&limite=50')
      ]);

      renderResumo(resultados[0].resumo || {});
      renderRotas(resultados[1].rotas || []);
      renderAlertas(resultados[2].alertas || []);
      renderOcorrencias(resultados[3].ocorrencias || []);

      if (rotaAbertaId) {
        var existe = (resultados[1].rotas || []).some(function (r) {
          return Number(r.id) === Number(rotaAbertaId);
        });
        if (existe) await abrirRota(rotaAbertaId);
      }
    } catch (erro) {
      var alerta = document.getElementById('ct-alerta');
      if (alerta) alerta.innerHTML = '<div class="ct-alerta">' + esc(erro.message) + '</div>';
    }
  }

  async function abrirRota(id) {
    try {
      var dados = await api('/api/control-tower/rotas/' + id);
      renderRota(dados.rota);
    } catch (erro) {
      alert(erro.message);
    }
  }

  async function statusRota(id, status) {
    try {
      await api('/api/control-tower/rotas/' + id + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: status })
      });
      await carregarTudo();
      await abrirRota(id);
    } catch (erro) {
      alert(erro.message);
    }
  }

  async function statusParada(id, status, extra) {
    try {
      var corpo = Object.assign({ status: status }, extra || {});
      await api('/api/control-tower/paradas/' + id + '/status', {
        method: 'PATCH',
        body: JSON.stringify(corpo)
      });
      await carregarTudo();
      if (rotaAbertaId) await abrirRota(rotaAbertaId);
    } catch (erro) {
      alert(erro.message);
    }
  }

  async function naoEntregue(id) {
    var motivo = prompt('Motivo da nao realizacao:');
    if (!motivo || !motivo.trim()) return;
    await statusParada(id, 'NAO_ENTREGUE', { motivo_nao_entrega: motivo.trim() });
  }

  async function statusExterno(id, status) {
    try {
      var corpo = { status: status };
      if (status === 'EM_TRANSITO') {
        var rastreio = prompt('Codigo de rastreio / referencia (opcional):');
        if (rastreio && rastreio.trim()) corpo.codigo_rastreio = rastreio.trim();
      }

      await api('/api/control-tower/entregas/' + id + '/status-externo', {
        method: 'PATCH',
        body: JSON.stringify(corpo)
      });
      await carregarTudo();
      if (rotaAbertaId) await abrirRota(rotaAbertaId);
    } catch (erro) {
      alert(erro.message);
    }
  }

  function iniciarAutoRefresh() {
    clearInterval(autoRefresh);
    autoRefresh = setInterval(function () {
      var painel = document.getElementById('tab-control-tower');
      if (painel && painel.classList.contains('active')) carregarTudo();
    }, 30000);
  }

  window.ControlTowerCockpit = {
    carregar: carregarTudo,
    abrirRota: abrirRota,
    statusRota: statusRota,
    statusParada: statusParada,
    naoEntregue: naoEntregue,
    statusExterno: statusExterno
  };

  window.addEventListener('control-tower:planejamento-liberado', function () {
    carregarTudo();
  });

  window.addEventListener('load', function () {
    instalarEstilos();
    instalarPainel();
  });
})();