import { useEffect, useMemo, useState } from 'react';
import { MapPinned, Play, RefreshCw, Save, WandSparkles } from 'lucide-react';
import { api, formatCurrency, todaySaoPaulo } from '../lib/api';
import type {
  ConfiguracaoRoteirizacao,
  EntregaPlanejamento,
  PlanejamentoResultado,
  PontoDespacho,
} from '../types';

type EntregasResponse = { ok: boolean; entregas: EntregaPlanejamento[] };
type PontosResponse = { ok: boolean; pontos: PontoDespacho[] };
type ConfigResponse = { ok: boolean; configuracao: ConfiguracaoRoteirizacao };

function modalidade(e: EntregaPlanejamento) {
  return e.Modalidade || (e.PrioridadeCodigo === '32' ? 'TRANSPORTADORA' : e.PrioridadeCodigo === '23' ? 'SEDEX' : 'PROPRIA');
}

async function geocodificar(entrega: EntregaPlanejamento) {
  if (Number.isFinite(entrega.lat) && Number.isFinite(entrega.lng)) return entrega;
  const params = new URLSearchParams({
    q: entrega.ENDENT || '',
    numero: entrega.NumEnt || '',
    bairro: entrega.BAIRRO || '',
    cidade: entrega.CIDADE || '',
    uf: 'SP',
    cep: entrega.CEP || '',
  });
  const resposta = await api<{ found: boolean; lat: number; lng: number; error?: string }>(`/geocode?${params}`);
  if (!resposta.found) throw new Error(`Não foi possível geocodificar o pedido ${entrega.PEDIDO || '—'}.`);
  return { ...entrega, lat: Number(resposta.lat), lng: Number(resposta.lng) };
}

export function PlanejamentoPage() {
  const [entregas, setEntregas] = useState<EntregaPlanejamento[]>([]);
  const [pontos, setPontos] = useState<PontoDespacho[]>([]);
  const [config, setConfig] = useState<ConfiguracaoRoteirizacao | null>(null);
  const [resultado, setResultado] = useState<PlanejamentoResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    setMensagem(null);
    try {
      const [e, p, c] = await Promise.all([
        api<EntregasResponse>('/api/entregas'),
        api<PontosResponse>('/api/roteirizacao/pontos-despacho?ativos=1'),
        api<ConfigResponse>('/api/roteirizacao/configuracoes'),
      ]);

      const correiosPadrao = (p.pontos || []).find((x) => x.tipo === 'CORREIOS' && x.padrao);
      setPontos(p.pontos || []);
      setConfig(c.configuracao);
      setEntregas((e.entregas || []).map((item) => {
        const mod = modalidade(item);
        if (mod === 'SEDEX' && correiosPadrao) return { ...item, Modalidade: mod, destino_operacional: correiosPadrao };
        return { ...item, Modalidade: mod };
      }));
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Falha ao carregar as entregas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void carregar(); }, []);

  const externasPendentes = useMemo(
    () => entregas.filter((e) => modalidade(e) !== 'PROPRIA' && !e.destino_operacional).length,
    [entregas],
  );

  const geocodificarTudo = async () => {
    setLoading(true);
    setMensagem('Geocodificando entregas...');
    try {
      const copia = [...entregas];
      for (let i = 0; i < copia.length; i += 4) {
        const lote = await Promise.all(copia.slice(i, i + 4).map(geocodificar));
        lote.forEach((item, offset) => { copia[i + offset] = item; });
      }
      setEntregas(copia);
      setMensagem(`${copia.length} entregas geocodificadas/validadas.`);
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Falha na geocodificação.');
    } finally {
      setLoading(false);
    }
  };

  const planejar = async () => {
    setLoading(true);
    setMensagem('Otimizando rotas na HERE...');
    try {
      const preparadas: EntregaPlanejamento[] = [];
      for (let i = 0; i < entregas.length; i += 4) {
        const lote = await Promise.all(entregas.slice(i, i + 4).map(geocodificar));
        preparadas.push(...lote);
      }
      setEntregas(preparadas);
      const body = await api<PlanejamentoResultado>('/api/roteirizacao/planejar', {
        method: 'POST',
        body: JSON.stringify({
          entregas: preparadas.map((e) => ({
            ...e,
            empresa: e.Empresa,
            pedido: e.PEDIDO,
            num_nf: e.NumNF,
            cliente: e.CLIENTE,
            nome_fantasia: e.NomeFantasia,
            dataEntrega: e.DataEntrega,
            prioridade: e.Prioridade,
            prioridade_codigo: e.PrioridadeCodigo,
            modalidade: modalidade(e),
            requerDestinoOperacional: Boolean(e.RequerDestinoOperacional),
            endereco: e.ENDENT,
            numero: e.NumEnt,
            bairro: e.BAIRRO,
            cidade: e.CIDADE,
            cep: e.CEP,
            valor: e.VALOR,
            vendedor: e.VENDEDOR,
            obs: e.Observacao,
          })),
          data_planejamento: todaySaoPaulo(),
        }),
      });
      setResultado(body);
      setMensagem(`${body.resumo.entregasRoteirizadas} entregas distribuídas em ${body.resumo.rotas} rota(s).`);
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Falha na roteirização.');
    } finally {
      setLoading(false);
    }
  };

  const liberar = async () => {
    if (!resultado || !config) return;
    setLoading(true);
    try {
      const resposta = await api<{ ok: boolean; planejamento: { codigo: string } }>('/api/control-tower/planejamentos/liberar', {
        method: 'POST',
        body: JSON.stringify({
          data_operacao: todaySaoPaulo(),
          modo: resultado.modo,
          origem: {
            endereco: config.deposito_endereco,
            lat: config.deposito_lat,
            lng: config.deposito_lng,
          },
          rotas: resultado.rotas,
        }),
      });
      setMensagem(`Planejamento ${resposta.planejamento.codigo} liberado oficialmente.`);
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Falha ao liberar o planejamento.');
    } finally {
      setLoading(false);
    }
  };

  const definirPonto = (index: number, id: string) => {
    const ponto = pontos.find((p) => String(p.id) === id);
    setEntregas((atual) => atual.map((e, i) => i === index ? { ...e, destino_operacional: ponto } : e));
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Roteirização</span>
          <h1>Planejamento</h1>
          <p>Demanda do Deak, geocodificação, despacho externo e otimização HERE.</p>
        </div>
        <div className="header-actions">
          <button className="button secondary" onClick={() => void carregar()} disabled={loading}><RefreshCw size={16} /> Recarregar</button>
          <button className="button secondary" onClick={() => void geocodificarTudo()} disabled={loading || !entregas.length}><MapPinned size={16} /> Geocodificar</button>
          <button className="button primary" onClick={() => void planejar()} disabled={loading || !entregas.length || externasPendentes > 0}><WandSparkles size={16} /> Otimizar</button>
        </div>
      </header>

      {mensagem && <div className="banner">{mensagem}</div>}
      {externasPendentes > 0 && <div className="banner warning">{externasPendentes} entrega(s) de Transportadora/SEDEX ainda estão sem ponto de despacho e não podem ser liberadas.</div>}

      <section className="kpi-grid planning-kpis">
        <Kpi label="Demandas" value={entregas.length} />
        <Kpi label="Própria" value={entregas.filter((e) => modalidade(e) === 'PROPRIA').length} />
        <Kpi label="Transportadora" value={entregas.filter((e) => modalidade(e) === 'TRANSPORTADORA').length} />
        <Kpi label="SEDEX" value={entregas.filter((e) => modalidade(e) === 'SEDEX').length} />
      </section>

      <section className="panel">
        <div className="panel-header"><div><span className="eyebrow">Fila operacional</span><h2>Entregas elegíveis</h2></div><span>{config?.modo || '—'}</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Pedido</th><th>Cliente</th><th>Modalidade</th><th>Cidade</th><th>Valor</th><th>Ponto de despacho</th></tr></thead>
            <tbody>
              {entregas.map((e, index) => {
                const mod = modalidade(e);
                const candidatos = pontos.filter((p) => p.tipo === (mod === 'SEDEX' ? 'CORREIOS' : 'TRANSPORTADORA'));
                return (
                  <tr key={`${e.PEDIDO}-${e.NumNF || index}`}>
                    <td><strong>#{e.PEDIDO}</strong><small>{e.NumNF ? `NF ${e.NumNF}` : 'sem NF'}</small></td>
                    <td>{e.CLIENTE || '—'}</td>
                    <td><span className={`badge ${mod === 'PROPRIA' ? 'success' : 'warning'}`}>{mod}</span></td>
                    <td>{e.CIDADE || '—'}<small>{e.CEP || ''}</small></td>
                    <td>{formatCurrency(e.VALOR)}</td>
                    <td>
                      {mod === 'PROPRIA' ? 'Cliente final' : (
                        <select value={e.destino_operacional?.id || ''} onChange={(ev) => definirPonto(index, ev.target.value)}>
                          <option value="">Definir...</option>
                          {candidatos.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.padrao ? ' · padrão' : ''}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {resultado && (
        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Simulação</span><h2>Resultado otimizado</h2></div>
            <button className="button primary" onClick={() => void liberar()} disabled={loading}><Save size={16} /> Liberar planejamento</button>
          </div>
          <div className="route-result-grid">
            {resultado.rotas.map((r, index) => (
              <article className="result-card" key={index}>
                <div className="result-icon"><Play size={17} /></div>
                <div><strong>Rota {index + 1}</strong><span>{r.motorista || r.veiculo?.motorista_nome || 'Motorista a definir'}</span><small>{r.entregas.length} parada(s) · {Number(r.distKm || 0).toFixed(1)} km</small></div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return <article className="kpi-card"><div className="kpi-top"><span>{label}</span></div><strong>{value}</strong></article>;
}
