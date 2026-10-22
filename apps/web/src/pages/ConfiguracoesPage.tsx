import { FormEvent, useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { api } from '../lib/api';
import type { ConfiguracaoRoteirizacao, FaixaCep, Motorista, PontoDespacho, Veiculo } from '../types';

type Data = {
  config: ConfiguracaoRoteirizacao | null;
  motoristas: Motorista[];
  veiculos: Veiculo[];
  faixas: FaixaCep[];
  pontos: PontoDespacho[];
};

export function ConfiguracoesPage() {
  const [data, setData] = useState<Data>({ config: null, motoristas: [], veiculos: [], faixas: [], pontos: [] });
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
      setData({ config: c.configuracao, motoristas: m.motoristas || [], veiculos: v.veiculos || [], faixas: f.faixas || [], pontos: p.pontos || [] });
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Falha ao carregar configurações.');
    }
  };

  useEffect(() => { void carregar(); }, []);

  const salvarConfig = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data.config) return;
    const response = await api<{ configuracao: ConfiguracaoRoteirizacao }>('/api/roteirizacao/configuracoes', {
      method: 'PUT',
      body: JSON.stringify(data.config),
    });
    setData((old) => ({ ...old, config: response.configuracao }));
    setMensagem('Configurações salvas.');
  };

  const adicionarMotorista = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api('/api/roteirizacao/motoristas', { method: 'POST', body: JSON.stringify({ nome: form.get('nome') }) });
    event.currentTarget.reset();
    await carregar();
  };

  const adicionarPonto = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const corpo = {
      tipo: form.get('tipo'),
      codigo_externo: form.get('codigo_externo') || null,
      nome: form.get('nome'),
      endereco: form.get('endereco'),
      numero: form.get('numero'),
      bairro: form.get('bairro'),
      cidade: form.get('cidade'),
      uf: form.get('uf') || 'SP',
      cep: form.get('cep'),
      lat: Number(form.get('lat')),
      lng: Number(form.get('lng')),
      padrao: form.get('padrao') === 'on',
    };
    await api('/api/roteirizacao/pontos-despacho', { method: 'POST', body: JSON.stringify(corpo) });
    event.currentTarget.reset();
    await carregar();
  };

  return (
    <div className="page">
      <header className="page-header">
        <div><span className="eyebrow">Administração logística</span><h1>Configurações</h1><p>Parâmetros, equipe, frota, faixas de CEP e pontos externos.</p></div>
      </header>

      {mensagem && <div className="banner">{mensagem}</div>}

      {data.config && (
        <form className="panel form-panel" onSubmit={salvarConfig}>
          <div className="panel-header"><div><span className="eyebrow">Motor de roteirização</span><h2>Parâmetros operacionais</h2></div><button className="button primary"><Save size={16} /> Salvar</button></div>
          <div className="form-grid">
            <label>Modo<select value={data.config.modo} onChange={(e) => setData((d) => ({ ...d, config: d.config ? { ...d.config, modo: e.target.value as ConfiguracaoRoteirizacao['modo'] } : null }))}><option value="OTIMIZADA">Otimização por frota</option><option value="CEP">Faixas de CEP</option></select></label>
            <label>Depósito<input value={data.config.deposito_endereco} onChange={(e) => setData((d) => ({ ...d, config: d.config ? { ...d.config, deposito_endereco: e.target.value } : null }))} /></label>
            <label>Latitude<input type="number" step="0.0000001" value={data.config.deposito_lat} onChange={(e) => setData((d) => ({ ...d, config: d.config ? { ...d.config, deposito_lat: Number(e.target.value) } : null }))} /></label>
            <label>Longitude<input type="number" step="0.0000001" value={data.config.deposito_lng} onChange={(e) => setData((d) => ({ ...d, config: d.config ? { ...d.config, deposito_lng: Number(e.target.value) } : null }))} /></label>
            <label>Início<input type="time" value={data.config.inicio_jornada} onChange={(e) => setData((d) => ({ ...d, config: d.config ? { ...d.config, inicio_jornada: e.target.value } : null }))} /></label>
            <label>Fim<input type="time" value={data.config.fim_jornada} onChange={(e) => setData((d) => ({ ...d, config: d.config ? { ...d.config, fim_jornada: e.target.value } : null }))} /></label>
          </div>
        </form>
      )}

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><div><span className="eyebrow">Equipe</span><h2>Motoristas</h2></div><span>{data.motoristas.filter((m) => m.ativo).length} ativos</span></div>
          <form className="inline-form" onSubmit={adicionarMotorista}><input name="nome" placeholder="Nome do motorista" required /><button className="button primary compact"><Plus size={15} /> Adicionar</button></form>
          <div className="stack compact-stack">{data.motoristas.map((m) => <div className="health-row" key={m.id}><div><strong>{m.nome}</strong><span>{m.ativo ? 'Ativo' : 'Inativo'}</span></div><span className={`badge ${m.ativo ? 'success' : 'neutral'}`}>{m.ativo ? 'ATIVO' : 'INATIVO'}</span></div>)}</div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><span className="eyebrow">Frota</span><h2>Veículos</h2></div><span>{data.veiculos.filter((v) => v.ativo).length} ativos</span></div>
          <div className="stack compact-stack">{data.veiculos.map((v) => <div className="health-row" key={v.id}><div><strong>{v.nome}{v.placa ? ` · ${v.placa}` : ''}</strong><span>{v.perfil} · {v.max_paradas} paradas · {v.motorista_nome || 'sem motorista padrão'}</span></div><span className={`badge ${v.ativo ? 'success' : 'neutral'}`}>{v.ativo ? 'ATIVO' : 'INATIVO'}</span></div>)}</div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header"><div><span className="eyebrow">Despacho externo</span><h2>Transportadoras e Correios</h2></div><span>{data.pontos.length} pontos</span></div>
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
          <label>Latitude<input name="lat" type="number" step="0.0000001" required /></label>
          <label>Longitude<input name="lng" type="number" step="0.0000001" required /></label>
          <label className="check-label"><input name="padrao" type="checkbox" /> Ponto padrão</label>
          <button className="button primary"><Plus size={15} /> Adicionar ponto</button>
        </form>
        <div className="table-wrap">
          <table><thead><tr><th>Tipo</th><th>Nome</th><th>Código</th><th>Cidade</th><th>Status</th></tr></thead>
          <tbody>{data.pontos.map((p) => <tr key={p.id}><td>{p.tipo}</td><td><strong>{p.nome}</strong>{p.padrao && <small>Padrão</small>}</td><td>{p.codigo_externo || '—'}</td><td>{p.cidade || '—'}</td><td><span className={`badge ${p.ativo ? 'success' : 'neutral'}`}>{p.ativo ? 'ATIVO' : 'INATIVO'}</span></td></tr>)}</tbody></table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><span className="eyebrow">Modo CEP</span><h2>Faixas cadastradas</h2></div><span>{data.faixas.length}</span></div>
        <div className="table-wrap"><table><thead><tr><th>CEP inicial</th><th>CEP final</th><th>Motorista</th><th>Status</th></tr></thead><tbody>{data.faixas.map((f) => <tr key={f.id}><td>{f.cep_inicial}</td><td>{f.cep_final}</td><td>{f.motorista_nome}</td><td><span className={`badge ${f.ativo ? 'success' : 'neutral'}`}>{f.ativo ? 'ATIVA' : 'INATIVA'}</span></td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}
