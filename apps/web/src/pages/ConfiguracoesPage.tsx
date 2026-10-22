import { FormEvent, useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { api } from '../lib/api';
import type {
  ConfiguracaoRoteirizacao,
  FaixaCep,
  Motorista,
  PontoDespacho,
  Veiculo,
} from '../types';

type Data = {
  config: ConfiguracaoRoteirizacao | null;
  motoristas: Motorista[];
  veiculos: Veiculo[];
  faixas: FaixaCep[];
  pontos: PontoDespacho[];
};

export function ConfiguracoesPage() {
  const [data, setData] = useState<Data>({
    config: null,
    motoristas: [],
    veiculos: [],
    faixas: [],
    pontos: [],
  });
  const [mensagem, setMensagem] = useState<string | null>(null);

  const carregar = async () => {
    try {
      const [c, m, v, f, p] = await Promise.all([
        api<{ configuracao: ConfiguracaoRoteirizacao }>('/api/roteirizacao/configuracoes'),
        api<{ motoristas: Motorista[] }>('/api/roteirizacao/motoristas'),
        api<{ veiculos: Veiculo[] }>('/api/roteirizacao/veiculos'),
        api<{ faixas: FaixaCep[] }>('/api/roteirizacao/faixas-cep'),
        api<{ pontos: PontoDespacho[] }>('/api/roteirizacao/pontos-despacho'),
      ]);
      setData({
        config: c.configuracao,
        motoristas: m.motoristas || [],
        veiculos: v.veiculos || [],
        faixas: f.faixas || [],
        pontos: p.pontos || [],
      });
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Falha ao carregar configurações.');
    }
  };

  useEffect(() => { void carregar(); }, []);

  const salvarConfig = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data.config) return;
    try {
      const response = await api<{ configuracao: ConfiguracaoRoteirizacao }>('/api/roteirizacao/configuracoes', {
        method: 'PUT',
        body: JSON.stringify(data.config),
      });
      setData((old) => ({ ...old, config: response.configuracao }));
      setMensagem('Configurações salvas.');
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Falha ao salvar configurações.');
    }
  };

  const adicionarMotorista = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/roteirizacao/motoristas', {
        method: 'POST',
        body: JSON.stringify({ nome: form.get('nome') }),
      });
      event.currentTarget.reset();
      await carregar();
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Falha ao adicionar motorista.');
    }
  };

  const alternarMotorista = async (motorista: Motorista) => {
    await api(`/api/roteirizacao/motoristas/${motorista.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ativo: !motorista.ativo }),
    });
    await carregar();
  };

  const adicionarVeiculo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/roteirizacao/veiculos', {
        method: 'POST',
        body: JSON.stringify({
          nome: form.get('nome'),
          placa: form.get('placa') || null,
          perfil: form.get('perfil') || 'car',
          max_paradas: Number(form.get('max_paradas') || 100),
          motorista_id: form.get('motorista_id') ? Number(form.get('motorista_id')) : null,
        }),
      });
      event.currentTarget.reset();
      await carregar();
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Falha ao adicionar veículo.');
    }
  };

  const alternarVeiculo = async (veiculo: Veiculo) => {
    await api(`/api/roteirizacao/veiculos/${veiculo.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ativo: !veiculo.ativo }),
    });
    await carregar();
  };

  const adicionarFaixa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/roteirizacao/faixas-cep', {
        method: 'POST',
        body: JSON.stringify({
          cep_inicial: form.get('cep_inicial'),
          cep_final: form.get('cep_final'),
          motorista_id: Number(form.get('motorista_id')),
        }),
      });
      event.currentTarget.reset();
      await carregar();
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Falha ao adicionar faixa de CEP.');
    }
  };

  const alternarFaixa = async (faixa: FaixaCep) => {
    await api(`/api/roteirizacao/faixas-cep/${faixa.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ativo: !faixa.ativo }),
    });
    await carregar();
  };

  const adicionarPonto = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      let lat = Number(form.get('lat'));
      let lng = Number(form.get('lng'));
      const endereco = String(form.get('endereco') || '');
      const numero = String(form.get('numero') || '');
      const bairro = String(form.get('bairro') || '');
      const cidade = String(form.get('cidade') || 'Osasco');
      const uf = String(form.get('uf') || 'SP');
      const cep = String(form.get('cep') || '');

      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !form.get('lat') || !form.get('lng')) {
        const params = new URLSearchParams({
          q: endereco,
          numero,
          bairro,
          cidade,
          uf,
          cep,
        });
        const geo = await api<{ found: boolean; lat: number; lng: number; error?: string }>(`/geocode?${params}`);
        if (!geo.found) throw new Error(geo.error || 'Não foi possível geocodificar o ponto.');
        lat = Number(geo.lat);
        lng = Number(geo.lng);
      }

      await api('/api/roteirizacao/pontos-despacho', {
        method: 'POST',
        body: JSON.stringify({
          tipo: form.get('tipo'),
          codigo_externo: form.get('codigo_externo') || null,
          nome: form.get('nome'),
          endereco,
          numero,
          bairro,
          cidade,
          uf,
          cep,
          lat,
          lng,
          padrao: form.get('padrao') === 'on',
        }),
      });
      event.currentTarget.reset();
      await carregar();
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Falha ao adicionar ponto de despacho.');
    }
  };

  const alternarPonto = async (ponto: PontoDespacho) => {
    await api(`/api/roteirizacao/pontos-despacho/${ponto.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ativo: !ponto.ativo }),
    });
    await carregar();
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Administração logística</span>
          <h1>Configurações</h1>
          <p>Parâmetros, equipe, frota, faixas de CEP e pontos externos.</p>
        </div>
      </header>

      {mensagem && <div className="banner">{mensagem}</div>}

      {data.config && (
        <form className="panel form-panel" onSubmit={salvarConfig}>
          <div className="panel-header">
            <div><span className="eyebrow">Motor de roteirização</span><h2>Parâmetros operacionais</h2></div>
            <button className="button primary"><Save size={16} /> Salvar</button>
          </div>
          <div className="form-grid">
            <label>
              Modo
              <select
                value={data.config.modo}
                onChange={(e) => setData((d) => ({
                  ...d,
                  config: d.config
                    ? { ...d.config, modo: e.target.value as ConfiguracaoRoteirizacao['modo'] }
                    : null,
                }))}
              >
                <option value="OTIMIZADA">Otimização por frota</option>
                <option value="CEP">Faixas de CEP</option>
              </select>
            </label>
            <label>
              Depósito
              <input
                value={data.config.deposito_endereco}
                onChange={(e) => setData((d) => ({
                  ...d,
                  config: d.config ? { ...d.config, deposito_endereco: e.target.value } : null,
                }))}
              />
            </label>
            <label>
              Latitude
              <input
                type="number"
                step="0.0000001"
                value={data.config.deposito_lat}
                onChange={(e) => setData((d) => ({
                  ...d,
                  config: d.config ? { ...d.config, deposito_lat: Number(e.target.value) } : null,
                }))}
              />
            </label>
            <label>
              Longitude
              <input
                type="number"
                step="0.0000001"
                value={data.config.deposito_lng}
                onChange={(e) => setData((d) => ({
                  ...d,
                  config: d.config ? { ...d.config, deposito_lng: Number(e.target.value) } : null,
                }))}
              />
            </label>
            <label>
              Início
              <input
                type="time"
                value={data.config.inicio_jornada}
                onChange={(e) => setData((d) => ({
                  ...d,
                  config: d.config ? { ...d.config, inicio_jornada: e.target.value } : null,
                }))}
              />
            </label>
            <label>
              Fim
              <input
                type="time"
                value={data.config.fim_jornada}
                onChange={(e) => setData((d) => ({
                  ...d,
                  config: d.config ? { ...d.config, fim_jornada: e.target.value } : null,
                }))}
              />
            </label>
            <label>
              Tempo médio/parada (s)
              <input
                type="number"
                min={0}
                value={data.config.tempo_parada_segundos}
                onChange={(e) => setData((d) => ({
                  ...d,
                  config: d.config
                    ? { ...d.config, tempo_parada_segundos: Number(e.target.value) }
                    : null,
                }))}
              />
            </label>
          </div>
        </form>
      )}

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Equipe</span><h2>Motoristas</h2></div>
            <span>{data.motoristas.filter((m) => m.ativo).length} ativos</span>
          </div>
          <form className="inline-form" onSubmit={adicionarMotorista}>
            <input name="nome" placeholder="Nome do motorista" required />
            <button className="button primary compact"><Plus size={15} /> Adicionar</button>
          </form>
          <div className="stack compact-stack">
            {data.motoristas.map((m) => (
              <div className="health-row" key={m.id}>
                <div><strong>{m.nome}</strong><span>{m.ativo ? 'Ativo' : 'Inativo'}</span></div>
                <button className="button compact" type="button" onClick={() => void alternarMotorista(m)}>
                  {m.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Frota</span><h2>Veículos</h2></div>
            <span>{data.veiculos.filter((v) => v.ativo).length} ativos</span>
          </div>
          <form className="form-grid compact-form" onSubmit={adicionarVeiculo}>
            <label>Nome<input name="nome" placeholder="Fiorino 01" required /></label>
            <label>Placa<input name="placa" placeholder="ABC1D23" /></label>
            <label>Perfil<select name="perfil" defaultValue="car"><option value="car">Carro</option><option value="truck">Caminhão</option><option value="scooter">Moto</option><option value="bicycle">Bicicleta</option></select></label>
            <label>Máx. paradas<input name="max_paradas" type="number" min={1} defaultValue={100} /></label>
            <label>Motorista padrão<select name="motorista_id" defaultValue=""><option value="">Sem motorista</option>{data.motoristas.filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>
            <button className="button primary"><Plus size={15} /> Adicionar veículo</button>
          </form>
          <div className="stack compact-stack">
            {data.veiculos.map((v) => (
              <div className="health-row" key={v.id}>
                <div>
                  <strong>{v.nome}{v.placa ? ` · ${v.placa}` : ''}</strong>
                  <span>{v.perfil} · {v.max_paradas} paradas · {v.motorista_nome || 'sem motorista padrão'}</span>
                </div>
                <button className="button compact" type="button" onClick={() => void alternarVeiculo(v)}>
                  {v.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div><span className="eyebrow">Modo CEP</span><h2>Faixas por motorista</h2></div>
          <span>{data.faixas.length}</span>
        </div>
        <form className="form-grid compact-form" onSubmit={adicionarFaixa}>
          <label>CEP inicial<input name="cep_inicial" placeholder="00000-000" required /></label>
          <label>CEP final<input name="cep_final" placeholder="99999-999" required /></label>
          <label>Motorista<select name="motorista_id" required defaultValue=""><option value="" disabled>Selecione</option>{data.motoristas.filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>
          <button className="button primary"><Plus size={15} /> Adicionar faixa</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead><tr><th>CEP inicial</th><th>CEP final</th><th>Motorista</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.faixas.map((faixa) => (
                <tr key={faixa.id}>
                  <td>{faixa.cep_inicial}</td>
                  <td>{faixa.cep_final}</td>
                  <td>{faixa.motorista_nome}</td>
                  <td><span className={`badge ${faixa.ativo ? 'success' : 'neutral'}`}>{faixa.ativo ? 'ATIVA' : 'INATIVA'}</span></td>
                  <td><button className="button compact" type="button" onClick={() => void alternarFaixa(faixa)}>{faixa.ativo ? 'Desativar' : 'Ativar'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div><span className="eyebrow">Despacho externo</span><h2>Transportadoras e Correios</h2></div>
          <span>{data.pontos.length} pontos</span>
        </div>
        <form className="form-grid dispatch-form" onSubmit={adicionarPonto}>
          <label>Tipo<select name="tipo"><option value="CORREIOS">Correios / SEDEX</option><option value="TRANSPORTADORA">Transportadora</option></select></label>
          <label>Código Deak<input name="codigo_externo" placeholder="Opcional" /></label>
          <label>Nome<input name="nome" required /></label>
          <label>Endereço<input name="endereco" required /></label>
          <label>Número<input name="numero" /></label>
          <label>Bairro<input name="bairro" /></label>
          <label>Cidade<input name="cidade" defaultValue="Osasco" /></label>
          <label>UF<input name="uf" defaultValue="SP" maxLength={2} /></label>
          <label>CEP<input name="cep" /></label>
          <label>Latitude<input name="lat" type="number" step="0.0000001" /></label>
          <label>Longitude<input name="lng" type="number" step="0.0000001" /></label>
          <label className="check-label"><input name="padrao" type="checkbox" /> Ponto padrão</label>
          <button className="button primary"><Plus size={15} /> Adicionar ponto</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Tipo</th><th>Nome</th><th>Código</th><th>Cidade</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.pontos.map((ponto) => (
                <tr key={ponto.id}>
                  <td>{ponto.tipo}</td>
                  <td><strong>{ponto.nome}</strong>{ponto.padrao && <small>Padrão</small>}</td>
                  <td>{ponto.codigo_externo || '—'}</td>
                  <td>{ponto.cidade || '—'}</td>
                  <td><span className={`badge ${ponto.ativo ? 'success' : 'neutral'}`}>{ponto.ativo ? 'ATIVO' : 'INATIVO'}</span></td>
                  <td><button className="button compact" type="button" onClick={() => void alternarPonto(ponto)}>{ponto.ativo ? 'Desativar' : 'Ativar'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
