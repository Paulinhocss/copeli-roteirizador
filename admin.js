(function () {
  'use strict';

  const apiBase = typeof API !== 'undefined'
    ? API
    : (window.ROTEIRIZADOR_API || window.location.origin);

  const estado = {
    configuracao: null,
    motoristas: [],
    veiculos: [],
    faixas: [],
    pontosDespacho: [],
  };

  async function requisitar(caminho, opcoes = {}) {
    const resposta = await fetch(apiBase + caminho, {
      ...opcoes,
      headers: {
        'content-type': 'application/json',
        ...(opcoes.headers || {}),
      },
    });

    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok || dados.ok === false) {
      const erro = new Error(dados.error || 'Falha na requisicao.');
      erro.code = dados.code;
      erro.detail = dados.detail;
      throw erro;
    }
    return dados;
  }

  function escapeHtml(valor) {
    return String(valor ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatarCep(cep) {
    const valor = String(cep || '').replace(/\D/g, '').padStart(8, '0');
    return valor.length === 8
      ? valor.slice(0, 5) + '-' + valor.slice(5)
      : valor;
  }

  function sincronizarMotoristasLegados() {
    if (typeof MOTORISTAS === 'undefined' || !Array.isArray(MOTORISTAS)) return;
    estado.motoristas
      .filter((m) => m.ativo)
      .forEach((m) => {
        if (!MOTORISTAS.includes(m.nome)) {
          const posOutro = MOTORISTAS.indexOf('+ Outro...');
          if (posOutro >= 0) MOTORISTAS.splice(posOutro, 0, m.nome);
          else MOTORISTAS.push(m.nome);
        }
      });
  }

  function instalarEstilos() {
    const style = document.createElement('style');
    style.textContent = `
      .admin-card{background:#fff;border:1px solid var(--border);border-radius:10px;padding:11px;margin-bottom:10px}
      .admin-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:9px}
      .admin-mode{display:block;border:1px solid var(--border);border-radius:9px;padding:10px;margin-bottom:7px;cursor:pointer;background:#fff}
      .admin-mode:has(input:checked){border-color:var(--blue);background:var(--blue-l)}
      .admin-mode strong{display:block;font-size:12px;margin-bottom:2px}
      .admin-mode span{display:block;font-size:10px;color:var(--muted);line-height:1.5;margin-left:22px}
      .admin-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
      .admin-row{display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid var(--border);padding:7px 0}
      .admin-row:first-child{border-top:none}
      .admin-row-main{min-width:0;flex:1}
      .admin-row-main strong{font-size:11px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .admin-row-main small{font-size:9px;color:var(--muted)}
      .admin-mini{width:auto;margin:0;padding:4px 8px;font-size:10px}
      .admin-status{font-size:10px;padding:6px 8px;border-radius:7px;margin-bottom:8px;background:var(--blue-l);color:var(--blue)}
      .admin-error{background:var(--red-l);color:var(--red)}
    `;
    document.head.appendChild(style);
  }

  function instalarPainel() {
    const nav = document.querySelector('.topnav');
    const sidebar = document.querySelector('.sidebar');
    if (!nav || !sidebar || document.getElementById('tab-configuracoes')) return;

    const botao = document.createElement('button');
    botao.className = 'tab';
    botao.textContent = 'Configurações';
    botao.onclick = function () {
      switchTab('configuracoes', this);
      carregarTudo();
    };
    nav.appendChild(botao);

    const painel = document.createElement('div');
    painel.id = 'tab-configuracoes';
    painel.className = 'tab-content';
    painel.innerHTML = `
      <div id="admin-status" class="admin-status">Carregando configurações...</div>

      <div class="admin-card">
        <div class="admin-title">Modo de roteirização</div>
        <label class="admin-mode">
          <input type="radio" name="admin-modo" value="CEP"/>
          <strong>Faixas de CEP</strong>
          <span>Cada entrega é vinculada ao motorista responsável pelo intervalo de CEP. A HERE otimiza a sequência dentro da rota desse motorista.</span>
        </label>
        <label class="admin-mode">
          <input type="radio" name="admin-modo" value="OTIMIZADA"/>
          <strong>Otimização por frota</strong>
          <span>O sistema recebe X entregas e Y veículos e a HERE distribui e ordena as paradas buscando uma solução global.</span>
        </label>
        <button class="btn btn-primary" onclick="adminSalvarConfiguracao()">Salvar modo ativo</button>
      </div>

      <div class="admin-card">
        <div class="admin-title">Parâmetros operacionais</div>
        <div class="fg"><label>Depósito</label><input id="admin-deposito-endereco"/></div>
        <div class="admin-grid">
          <div class="fg"><label>Latitude</label><input id="admin-deposito-lat" type="number" step="0.0000001"/></div>
          <div class="fg"><label>Longitude</label><input id="admin-deposito-lng" type="number" step="0.0000001"/></div>
        </div>
        <div class="admin-grid">
          <div class="fg"><label>Início</label><input id="admin-inicio" type="time"/></div>
          <div class="fg"><label>Fim</label><input id="admin-fim" type="time"/></div>
        </div>
        <div class="fg"><label>Tempo médio por parada (segundos)</label><input id="admin-tempo-parada" type="number" min="0"/></div>
        <button class="btn" onclick="adminSalvarConfiguracao()">Salvar parâmetros</button>
      </div>

      <div class="admin-card">
        <div class="admin-title">Motoristas</div>
        <div style="display:flex;gap:6px;margin-bottom:8px">
          <input id="admin-motorista-nome" placeholder="Nome do motorista"/>
          <button class="btn btn-primary admin-mini" onclick="adminAdicionarMotorista()">Adicionar</button>
        </div>
        <div id="admin-lista-motoristas"></div>
      </div>

      <div class="admin-card">
        <div class="admin-title">Veículos disponíveis</div>
        <div class="fg"><label>Identificação</label><input id="admin-veiculo-nome" placeholder="Ex.: Fiorino 01"/></div>
        <div class="admin-grid">
          <div class="fg"><label>Placa</label><input id="admin-veiculo-placa" placeholder="ABC1D23"/></div>
          <div class="fg"><label>Perfil</label>
            <select id="admin-veiculo-perfil">
              <option value="car">Carro / utilitário leve</option>
              <option value="truck">Caminhão</option>
              <option value="scooter">Moto</option>
            </select>
          </div>
        </div>
        <div class="admin-grid">
          <div class="fg"><label>Máx. paradas</label><input id="admin-veiculo-max" type="number" min="1" value="100"/></div>
          <div class="fg"><label>Motorista padrão</label><select id="admin-veiculo-motorista"></select></div>
        </div>
        <button class="btn btn-primary" onclick="adminAdicionarVeiculo()">Adicionar veículo</button>
        <div id="admin-lista-veiculos"></div>
      </div>

      <div class="admin-card">
        <div class="admin-title">Faixas de CEP por motorista</div>
        <div class="admin-grid">
          <div class="fg"><label>CEP inicial</label><input id="admin-cep-inicial" placeholder="00000-000"/></div>
          <div class="fg"><label>CEP final</label><input id="admin-cep-final" placeholder="00000-000"/></div>
        </div>
        <div class="fg"><label>Motorista</label><select id="admin-faixa-motorista"></select></div>
        <button class="btn btn-primary" onclick="adminAdicionarFaixa()">Adicionar faixa</button>
        <div id="admin-lista-faixas"></div>
      </div>

      <div class="admin-card">
        <div class="admin-title">Pontos de despacho · Transportadoras / Correios</div>
        <div class="admin-grid">
          <div class="fg"><label>Tipo</label>
            <select id="admin-despacho-tipo">
              <option value="CORREIOS">Correios / SEDEX</option>
              <option value="TRANSPORTADORA">Transportadora</option>
            </select>
          </div>
          <div class="fg"><label>Código no Deak (opcional)</label><input id="admin-despacho-codigo" placeholder="Ex.: 608"/></div>
        </div>
        <div class="fg"><label>Nome</label><input id="admin-despacho-nome" placeholder="Ex.: Correios Vila Yara / Transportadora X"/></div>
        <div class="admin-grid">
          <div class="fg"><label>Endereço</label><input id="admin-despacho-endereco"/></div>
          <div class="fg"><label>Número</label><input id="admin-despacho-numero"/></div>
        </div>
        <div class="admin-grid">
          <div class="fg"><label>Bairro</label><input id="admin-despacho-bairro"/></div>
          <div class="fg"><label>Cidade</label><input id="admin-despacho-cidade" value="OSASCO"/></div>
        </div>
        <div class="admin-grid">
          <div class="fg"><label>UF</label><input id="admin-despacho-uf" value="SP" maxlength="2"/></div>
          <div class="fg"><label>CEP</label><input id="admin-despacho-cep"/></div>
        </div>
        <div class="admin-grid">
          <div class="fg"><label>Latitude</label><input id="admin-despacho-lat" type="number" step="0.0000001"/></div>
          <div class="fg"><label>Longitude</label><input id="admin-despacho-lng" type="number" step="0.0000001"/></div>
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:10px;margin:6px 0 9px">
          <input id="admin-despacho-padrao" type="checkbox" style="width:auto"/>
          Ponto padrão desta modalidade
        </label>
        <button class="btn btn-primary" onclick="adminAdicionarPontoDespacho()">Adicionar ponto de despacho</button>
        <div id="admin-lista-pontos-despacho"></div>
      </div>
    `;

    sidebar.appendChild(painel);
  }

  function status(mensagem, erro = false) {
    const el = document.getElementById('admin-status');
    if (!el) return;
    el.textContent = mensagem;
    el.classList.toggle('admin-error', erro);
  }

  function renderizar() {
    const cfg = estado.configuracao;
    if (!cfg) return;

    const radio = document.querySelector('input[name="admin-modo"][value="' + cfg.modo + '"]');
    if (radio) radio.checked = true;

    document.getElementById('admin-deposito-endereco').value = cfg.deposito_endereco || '';
    document.getElementById('admin-deposito-lat').value = cfg.deposito_lat ?? '';
    document.getElementById('admin-deposito-lng').value = cfg.deposito_lng ?? '';
    document.getElementById('admin-inicio').value = cfg.inicio_jornada || '07:00';
    document.getElementById('admin-fim').value = cfg.fim_jornada || '18:00';
    document.getElementById('admin-tempo-parada').value = cfg.tempo_parada_segundos ?? 300;

    const ativos = estado.motoristas.filter((m) => m.ativo);
    const optionsMotoristas =
      '<option value="">Sem motorista padrão</option>' +
      ativos.map((m) => '<option value="' + m.id + '">' + escapeHtml(m.nome) + '</option>').join('');

    document.getElementById('admin-veiculo-motorista').innerHTML = optionsMotoristas;
    document.getElementById('admin-faixa-motorista').innerHTML =
      '<option value="">Selecione</option>' +
      ativos.map((m) => '<option value="' + m.id + '">' + escapeHtml(m.nome) + '</option>').join('');

    document.getElementById('admin-lista-motoristas').innerHTML = estado.motoristas.map((m) => `
      <div class="admin-row">
        <div class="admin-row-main">
          <strong>${escapeHtml(m.nome)}</strong>
          <small>${m.ativo ? 'Ativo' : 'Inativo'}</small>
        </div>
        <button class="btn admin-mini" onclick="adminAlternarMotorista(${m.id},${!m.ativo})">
          ${m.ativo ? 'Desativar' : 'Ativar'}
        </button>
      </div>
    `).join('') || '<small style="color:var(--muted)">Nenhum motorista cadastrado.</small>';

    document.getElementById('admin-lista-veiculos').innerHTML = estado.veiculos.map((v) => `
      <div class="admin-row">
        <div class="admin-row-main">
          <strong>${escapeHtml(v.nome)}${v.placa ? ' · ' + escapeHtml(v.placa) : ''}</strong>
          <small>${escapeHtml(v.perfil)} · até ${v.max_paradas} paradas${v.motorista_nome ? ' · ' + escapeHtml(v.motorista_nome) : ''} · ${v.ativo ? 'ativo' : 'inativo'}</small>
        </div>
        <button class="btn admin-mini" onclick="adminAlternarVeiculo(${v.id},${!v.ativo})">
          ${v.ativo ? 'Desativar' : 'Ativar'}
        </button>
      </div>
    `).join('') || '<small style="color:var(--muted)">Nenhum veículo cadastrado.</small>';

    document.getElementById('admin-lista-faixas').innerHTML = estado.faixas.map((f) => `
      <div class="admin-row">
        <div class="admin-row-main">
          <strong>${formatarCep(f.cep_inicial)} a ${formatarCep(f.cep_final)}</strong>
          <small>${escapeHtml(f.motorista_nome)} · ${f.ativo ? 'ativa' : 'inativa'}</small>
        </div>
        <button class="btn admin-mini" onclick="adminAlternarFaixa(${f.id},${!f.ativo})">
          ${f.ativo ? 'Desativar' : 'Ativar'}
        </button>
      </div>
    `).join('') || '<small style="color:var(--muted)">Nenhuma faixa cadastrada.</small>';

    document.getElementById('admin-lista-pontos-despacho').innerHTML = estado.pontosDespacho.map((p) => `
      <div class="admin-row">
        <div class="admin-row-main">
          <strong>${escapeHtml(p.nome)}${p.padrao ? ' · PADRÃO' : ''}</strong>
          <small>${escapeHtml(p.tipo)}${p.codigo_externo ? ' · Deak ' + escapeHtml(p.codigo_externo) : ''} · ${escapeHtml(p.cidade || '')} · ${p.ativo ? 'ativo' : 'inativo'}</small>
        </div>
        <button class="btn admin-mini" onclick="adminAlternarPontoDespacho(${p.id},${!p.ativo})">
          ${p.ativo ? 'Desativar' : 'Ativar'}
        </button>
      </div>
    `).join('') || '<small style="color:var(--muted)">Nenhum ponto de despacho cadastrado.</small>';

    sincronizarMotoristasLegados();
    status('Modo ativo: ' + (cfg.modo === 'CEP' ? 'Faixas de CEP' : 'Otimização por frota'));
    window.dispatchEvent(new CustomEvent('roteirizador:configuracao', { detail: cfg }));
  }

  async function carregarTudo() {
    try {
      status('Carregando configurações...');
      const [cfg, motoristas, veiculos, faixas, pontosDespacho] = await Promise.all([
        requisitar('/api/roteirizacao/configuracoes'),
        requisitar('/api/roteirizacao/motoristas'),
        requisitar('/api/roteirizacao/veiculos'),
        requisitar('/api/roteirizacao/faixas-cep'),
        requisitar('/api/roteirizacao/pontos-despacho'),
      ]);

      estado.configuracao = cfg.configuracao;
      estado.motoristas = motoristas.motoristas || [];
      estado.veiculos = veiculos.veiculos || [];
      estado.faixas = faixas.faixas || [];
      estado.pontosDespacho = pontosDespacho.pontos || [];
      renderizar();
    } catch (erro) {
      status(erro.message, true);
    }
  }

  window.adminSalvarConfiguracao = async function () {
    try {
      const modo = document.querySelector('input[name="admin-modo"]:checked')?.value;
      const corpo = {
        modo,
        deposito_endereco: document.getElementById('admin-deposito-endereco').value,
        deposito_lat: Number(document.getElementById('admin-deposito-lat').value),
        deposito_lng: Number(document.getElementById('admin-deposito-lng').value),
        inicio_jornada: document.getElementById('admin-inicio').value,
        fim_jornada: document.getElementById('admin-fim').value,
        tempo_parada_segundos: Number(document.getElementById('admin-tempo-parada').value),
      };

      const dados = await requisitar('/api/roteirizacao/configuracoes', {
        method: 'PUT',
        body: JSON.stringify(corpo),
      });
      estado.configuracao = dados.configuracao;
      renderizar();
    } catch (erro) {
      status(erro.message, true);
    }
  };

  window.adminAdicionarMotorista = async function () {
    const input = document.getElementById('admin-motorista-nome');
    const nome = input.value.trim();
    if (!nome) return;
    try {
      await requisitar('/api/roteirizacao/motoristas', {
        method: 'POST',
        body: JSON.stringify({ nome }),
      });
      input.value = '';
      await carregarTudo();
    } catch (erro) {
      status(erro.message, true);
    }
  };

  window.adminAlternarMotorista = async function (id, ativo) {
    try {
      await requisitar('/api/roteirizacao/motoristas/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ ativo }),
      });
      await carregarTudo();
    } catch (erro) {
      status(erro.message, true);
    }
  };

  window.adminAdicionarVeiculo = async function () {
    try {
      await requisitar('/api/roteirizacao/veiculos', {
        method: 'POST',
        body: JSON.stringify({
          nome: document.getElementById('admin-veiculo-nome').value,
          placa: document.getElementById('admin-veiculo-placa').value,
          perfil: document.getElementById('admin-veiculo-perfil').value,
          max_paradas: Number(document.getElementById('admin-veiculo-max').value || 100),
          motorista_id: document.getElementById('admin-veiculo-motorista').value || null,
        }),
      });

      document.getElementById('admin-veiculo-nome').value = '';
      document.getElementById('admin-veiculo-placa').value = '';
      await carregarTudo();
    } catch (erro) {
      status(erro.message, true);
    }
  };

  window.adminAlternarVeiculo = async function (id, ativo) {
    try {
      await requisitar('/api/roteirizacao/veiculos/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ ativo }),
      });
      await carregarTudo();
    } catch (erro) {
      status(erro.message, true);
    }
  };

  window.adminAdicionarFaixa = async function () {
    try {
      const motoristaId = document.getElementById('admin-faixa-motorista').value;
      if (!motoristaId) throw new Error('Selecione um motorista para a faixa.');

      await requisitar('/api/roteirizacao/faixas-cep', {
        method: 'POST',
        body: JSON.stringify({
          cep_inicial: document.getElementById('admin-cep-inicial').value,
          cep_final: document.getElementById('admin-cep-final').value,
          motorista_id: Number(motoristaId),
        }),
      });

      document.getElementById('admin-cep-inicial').value = '';
      document.getElementById('admin-cep-final').value = '';
      await carregarTudo();
    } catch (erro) {
      status(erro.message, true);
    }
  };

  window.adminAlternarFaixa = async function (id, ativo) {
    try {
      await requisitar('/api/roteirizacao/faixas-cep/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ ativo }),
      });
      await carregarTudo();
    } catch (erro) {
      status(erro.message, true);
    }
  };


  async function geocodificarDespacho(corpo) {
    if (Number.isFinite(corpo.lat) && Number.isFinite(corpo.lng)) return corpo;

    const params = new URLSearchParams({
      q: corpo.endereco || corpo.cep || corpo.nome,
      numero: corpo.numero || '',
      bairro: corpo.bairro || '',
      cidade: corpo.cidade || 'OSASCO',
      uf: corpo.uf || 'SP',
      cep: corpo.cep || '',
    });
    const dados = await requisitar('/geocode?' + params.toString(), { headers: {} });
    if (!dados.found) throw new Error('Não foi possível geocodificar o ponto de despacho.');
    corpo.lat = Number(dados.lat);
    corpo.lng = Number(dados.lng);
    return corpo;
  }

  window.adminAdicionarPontoDespacho = async function () {
    try {
      const corpo = {
        tipo: document.getElementById('admin-despacho-tipo').value,
        codigo_externo: document.getElementById('admin-despacho-codigo').value || null,
        nome: document.getElementById('admin-despacho-nome').value,
        endereco: document.getElementById('admin-despacho-endereco').value,
        numero: document.getElementById('admin-despacho-numero').value,
        bairro: document.getElementById('admin-despacho-bairro').value,
        cidade: document.getElementById('admin-despacho-cidade').value,
        uf: document.getElementById('admin-despacho-uf').value || 'SP',
        cep: document.getElementById('admin-despacho-cep').value,
        lat: Number(document.getElementById('admin-despacho-lat').value),
        lng: Number(document.getElementById('admin-despacho-lng').value),
        padrao: document.getElementById('admin-despacho-padrao').checked,
      };

      if (!document.getElementById('admin-despacho-lat').value ||
          !document.getElementById('admin-despacho-lng').value) {
        corpo.lat = NaN;
        corpo.lng = NaN;
        await geocodificarDespacho(corpo);
      }

      await requisitar('/api/roteirizacao/pontos-despacho', {
        method: 'POST',
        body: JSON.stringify(corpo),
      });

      ['admin-despacho-codigo','admin-despacho-nome','admin-despacho-endereco',
       'admin-despacho-numero','admin-despacho-bairro','admin-despacho-cep',
       'admin-despacho-lat','admin-despacho-lng'].forEach((id) => {
        document.getElementById(id).value = '';
      });
      document.getElementById('admin-despacho-padrao').checked = false;
      await carregarTudo();
    } catch (erro) {
      status(erro.message, true);
    }
  };

  window.adminAlternarPontoDespacho = async function (id, ativo) {
    try {
      await requisitar('/api/roteirizacao/pontos-despacho/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ ativo }),
      });
      await carregarTudo();
    } catch (erro) {
      status(erro.message, true);
    }
  };

  window.RoteirizadorAdmin = {
    carregar: carregarTudo,
    estado,
  };

  window.addEventListener('load', () => {
    instalarEstilos();
    instalarPainel();
    carregarTudo();
  });
})();
