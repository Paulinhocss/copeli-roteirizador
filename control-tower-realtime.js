(function () {
  'use strict';

  const apiBase = typeof API !== 'undefined'
    ? API
    : (window.ROTEIRIZADOR_API || window.location.origin);

  const markers = new Map();
  let source = null;
  let ultimoEvento = null;

  function garantirBadge() {
    if (document.getElementById('contele-live-badge')) return;
    const nav = document.querySelector('.topnav');
    if (!nav) return;

    const badge = document.createElement('span');
    badge.id = 'contele-live-badge';
    badge.style.cssText =
      'margin-left:auto;font-size:10px;padding:4px 8px;border:1px solid var(--border);' +
      'border-radius:14px;background:#fff;color:var(--muted);white-space:nowrap';
    badge.textContent = 'Contele · conectando';
    nav.appendChild(badge);
  }

  function badge(texto, ok) {
    garantirBadge();
    const el = document.getElementById('contele-live-badge');
    if (!el) return;
    el.textContent = texto;
    el.style.color = ok ? 'var(--green)' : 'var(--muted)';
  }

  function idade(ts) {
    if (!ts) return 'sem horário';
    const ms = Date.now() - new Date(ts).getTime();
    if (!Number.isFinite(ms)) return 'horário indisponível';
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'min';
    return Math.floor(s / 3600) + 'h';
  }

  function criarIcone(posicao) {
    const ligado = Number(posicao.ignition) === 1;
    const label = ligado ? '●' : '○';
    return L.divIcon({
      className: '',
      html:
        '<div style="min-width:30px;height:24px;border-radius:12px;background:#111;color:#fff;' +
        'border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.28);display:flex;' +
        'align-items:center;justify-content:center;padding:0 7px;font-size:10px;font-weight:700">' +
        label + '&nbsp;🚚</div>',
      iconSize: [38, 24],
      iconAnchor: [19, 12],
    });
  }

  function popup(posicao) {
    const nome = posicao.vehicle_name || posicao.plate_number || 'Veículo';
    const placa = posicao.plate_number ? '<br>Placa: ' + posicao.plate_number : '';
    const motorista = posicao.driver_name ? '<br>Motorista: ' + posicao.driver_name : '';
    const velocidade = posicao.speed !== null && posicao.speed !== undefined
      ? '<br>Velocidade: ' + Math.round(Number(posicao.speed)) + ' km/h'
      : '';
    const atualizado = posicao.rastreador_atualizado_em || posicao.sincronizado_em;
    return '<b>' + nome + '</b>' + placa + motorista + velocidade +
      '<br><span style="font-size:10px;color:#777">Última posição: há ' + idade(atualizado) + '</span>';
  }

  function atualizarPosicoes(posicoes) {
    if (typeof mapa === 'undefined' || !mapa || typeof L === 'undefined') return;

    const recebidos = new Set();

    (posicoes || []).forEach((p) => {
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const chave = p.contele_vehicle_key || p.contele_vehicle_id || p.plate_number || p.vehicle_name;
      if (!chave) return;
      recebidos.add(String(chave));

      let marker = markers.get(String(chave));
      if (!marker) {
        marker = L.marker([lat, lng], {
          icon: criarIcone(p),
          zIndexOffset: 1000,
        }).addTo(mapa);
        markers.set(String(chave), marker);
      } else {
        marker.setLatLng([lat, lng]);
        marker.setIcon(criarIcone(p));
      }
      marker.bindPopup(popup(p));
    });

    for (const [chave, marker] of markers.entries()) {
      if (!recebidos.has(chave)) {
        mapa.removeLayer(marker);
        markers.delete(chave);
      }
    }
  }

  function conectar() {
    if (!window.EventSource) {
      badge('Contele · SSE indisponível', false);
      return;
    }
    if (source) source.close();

    source = new EventSource(apiBase + '/api/integracoes/contele/stream');

    source.addEventListener('conectado', () => {
      badge('Contele · ao vivo', true);
    });

    source.addEventListener('posicoes', (evento) => {
      try {
        const dados = JSON.parse(evento.data);
        ultimoEvento = dados.sincronizado_em || new Date().toISOString();
        atualizarPosicoes(dados.posicoes || []);
        badge('Contele · ao vivo · ' + (dados.total || 0) + ' veículos', true);
      } catch (erro) {
        console.warn('Falha ao processar posições Contele:', erro.message);
      }
    });

    source.addEventListener('erro', (evento) => {
      try {
        const dados = JSON.parse(evento.data);
        badge('Contele · erro de sincronização', false);
        console.warn('Contele realtime:', dados);
      } catch {
        badge('Contele · erro de sincronização', false);
      }
    });

    source.onerror = function () {
      badge('Contele · reconectando', false);
    };
  }

  window.ControlTowerRealtime = {
    conectar,
    atualizarPosicoes,
    get ultimoEvento() { return ultimoEvento; },
  };

  window.addEventListener('load', function () {
    garantirBadge();
    setTimeout(conectar, 500);
  });
})();
