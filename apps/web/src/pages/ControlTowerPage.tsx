import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Route as RouteIcon, Truck } from 'lucide-react';
import { api, formatCurrency, todaySaoPaulo } from '../lib/api';
import { OperationsMap } from '../components/OperationsMap';
import type {
  Alerta,
  ControlTowerResumo,
  Homologacao,
  Ocorrencia,
  PosicaoContele,
  Rota,
} from '../types';

type ResumoResponse = { ok: boolean; resumo: ControlTowerResumo };
type RotasResponse = { ok: boolean; rotas: Rota[] };
type RotaResponse = { ok: boolean; rota: Rota };
type AlertasResponse = { ok: boolean; alertas: Alerta[] };
type OcorrenciasResponse = { ok: boolean; ocorrencias: Ocorrencia[] };
type HomologacaoResponse = { ok: boolean; homologacao: Homologacao };

const vazio: ControlTowerResumo = {
  rotas_total: 0,
  rotas_liberadas: 0,
  rotas_em_rota: 0,
  rotas_finalizadas: 0,
  paradas_total: 0,
  paradas_pendentes: 0,
  entregas_total: 0,
  entregas_pendentes: 0,
  entregas_concluidas_copeli: 0,
  modalidade_propria: 0,
  modalidade_transportadora: 0,
  modalidade_sedex: 0,
  externos_aguardando_despacho: 0,
  externos_em_acompanhamento: 0,
  externos_entregues_final: 0,
  externos_excecao: 0,
  valor_total: 0,
  km_planejado: 0,
  km_real: 0,
};

function statusTone(status: string) {
  const value = status.toUpperCase();
  if (['ENTREGUE', 'FINALIZADA', 'OK', 'CONFIGURADO'].includes(value)) return 'success';
  if (['EM_ROTA', 'EM_TRANSITO', 'DESPACHADO'].includes(value)) return 'info';
  if (['EXCECAO', 'NAO_ENTREGUE', 'CRITICA', 'ALTA'].includes(value)) return 'danger';
  if (['MEDIA', 'AGUARDANDO_DESPACHO', 'LIBERADA'].includes(value)) return 'warning';
  return 'neutral';
}

export function ControlTowerPage() {
  const [data, setData] = useState(todaySaoPaulo());
  const [resumo, setResumo] = useState(vazio);
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [rota, setRota] = useState<Rota | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [homologacao, setHomologacao] = useState<Homologacao | null>(null);
  const [posicoes, setPosicoes] = useState<PosicaoContele[]>([]);
  const [loading, setLoading] = useState(false);
  const [testandoIntegracoes, setTestandoIntegracoes] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [r, rs, a, o, h] = await Promise.all([
        api<ResumoResponse>(`/api/control-tower/resumo?data=${encodeURIComponent(data)}`),
        api<RotasResponse>(`/api/control-tower/rotas?data=${encodeURIComponent(data)}`),
        api<AlertasResponse>('/api/control-tower/alertas?status=ABERTO&limite=50'),
        api<OcorrenciasResponse>('/api/control-tower/ocorrencias?status=ABERTA&limite=50'),
        api<HomologacaoResponse>('/api/control-tower/homologacao'),
      ]);
      setResumo(r.resumo || vazio);
      setRotas(rs.rotas || []);
      setAlertas(a.alertas || []);
      setOcorrencias(o.ocorrencias || []);
      setHomologacao(h.homologacao || null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar o cockpit.');
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    void carregar();
    const timer = window.setInterval(() => void carregar(), 30000);
    return () => window.clearInterval(timer);
  }, [carregar]);

  useEffect(() => {
    const stream = new EventSource('/api/integracoes/contele/stream');
    const onPosicoes = (event: MessageEvent) => {
      try {
        const body = JSON.parse(event.data);
        setPosicoes(body.posicoes || []);
      } catch {
        // Mantem ultimo snapshot valido.
      }
    };
    stream.addEventListener('posicoes', onPosicoes as EventListener);
    return () => stream.close();
  }, []);

  const testarIntegracoes = async () => {
    setTestandoIntegracoes(true);
    setErro(null);
    try {
      const response = await api<HomologacaoResponse>('/api/control-tower/homologacao?profundo=1');
      setHomologacao(response.homologacao || null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao testar integrações.');
    } finally {
      setTestandoIntegracoes(false);
    }
  };

  const abrirRota = async (id: number) => {
    const response = await api<RotaResponse>(`/api/control-tower/rotas/${id}`);
    setRota(response.rota);
  };

  const alterarStatusRota = async (status: string) => {
    if (!rota) return;
    await api(`/api/control-tower/rotas/${rota.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await carregar();
    await abrirRota(rota.id);
  };

  const alterarStatusParada = async (id: number, status: string, motivo?: string) => {
    await api(`/api/control-tower/paradas/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, motivo_nao_entrega: motivo }),
    });
    await carregar();
    if (rota) await abrirRota(rota.id);
  };

  const alterarExterno = async (id: number, status: string) => {
    const codigo = status === 'EM_TRANSITO'
      ? window.prompt('Código de rastreio/referência (opcional):') || undefined
      : undefined;
    await api(`/api/control-tower/entregas/${id}/status-externo`, {
      method: 'PATCH',
      body: JSON.stringify({ status, codigo_rastreio: codigo }),
    });
    await carregar();
    if (rota) await abrirRota(rota.id);
  };

  const itensHomologacao = useMemo(() => {
    if (!homologacao) return [];
    return [
      ...(homologacao.postgres?.itens || []),
      ...(homologacao.deak?.itens || []),
      ...(homologacao.here?.itens || []),
      ...(homologacao.contele?.itens || []),
    ];
  }, [homologacao]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Operação em tempo real</span>
          <h1>Control Tower</h1>
          <p>Planejado, executado, exceções e despacho externo em uma única visão.</p>
        </div>
        <div className="header-actions">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <button className="button secondary" onClick={() => void carregar()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Atualizar
          </button>
        </div>
      </header>

      {erro && <div className="banner danger">{erro}</div>}

      <section className="kpi-grid">
        <Kpi label="Rotas" value={resumo.rotas_total} detail={`${resumo.rotas_em_rota} em rota`} icon={<RouteIcon size={18} />} />
        <Kpi label="Paradas físicas" value={resumo.paradas_total} detail={`${resumo.paradas_pendentes} pendentes`} />
        <Kpi label="Entregas" value={resumo.entregas_total} detail={formatCurrency(resumo.valor_total)} />
        <Kpi label="KM planejado" value={Number(resumo.km_planejado || 0).toFixed(1)} detail={resumo.km_real ? `${Number(resumo.km_real).toFixed(1)} km real` : 'aguardando realizado'} />
        <Kpi label="Própria" value={resumo.modalidade_propria} detail="cliente final" />
        <Kpi label="Transportadora" value={resumo.modalidade_transportadora} detail="despacho externo" />
        <Kpi label="SEDEX" value={resumo.modalidade_sedex} detail="despacho Correios" />
        <Kpi label="Externo" value={resumo.externos_em_acompanhamento} detail={`${resumo.externos_excecao} exceções`} icon={<Truck size={18} />} />
      </section>

      <div className="dashboard-grid">
        <section className="panel map-panel">
          <div className="panel-header">
            <div><span className="eyebrow">Mapa operacional</span><h2>{rota?.codigo || 'Selecione uma rota'}</h2></div>
            <span className="live-dot">{posicoes.length} veículos</span>
          </div>
          <OperationsMap rota={rota} posicoes={posicoes} />
        </section>

        <section className="panel">
          <div className="panel-header"><div><span className="eyebrow">Hoje</span><h2>Rotas oficiais</h2></div><span>{rotas.length}</span></div>
          <div className="stack">
            {rotas.length === 0 && <Empty text="Nenhuma rota liberada nesta data." />}
            {rotas.map((item) => (
              <button key={item.id} className={rota?.id === item.id ? 'route-row selected' : 'route-row'} onClick={() => void abrirRota(item.id)}>
                <div>
                  <strong>{item.codigo || `Rota ${item.id}`}</strong>
                  <span>{item.motorista_nome || 'Motorista não definido'} · {item.veiculo_placa || item.veiculo_nome || 'sem veículo'}</span>
                  <small>{item.total_entregas} entregas · {item.total_paradas} paradas · {Number(item.km_planejado || 0).toFixed(1)} km</small>
                </div>
                <Badge tone={statusTone(item.status)}>{item.status}</Badge>
              </button>
            ))}
          </div>
        </section>
      </div>

      {rota && (
        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Execução</span><h2>{rota.codigo || `Rota ${rota.id}`}</h2></div>
            <div className="inline-actions">
              {rota.status === 'LIBERADA' && <button className="button primary" onClick={() => void alterarStatusRota('EM_ROTA')}>Iniciar rota</button>}
              {rota.status === 'EM_ROTA' && <button className="button primary" onClick={() => void alterarStatusRota('FINALIZADA')}>Finalizar rota</button>}
            </div>
          </div>
          <div className="stops">
            {(rota.paradas || []).map((p) => (
              <article className="stop-card" key={p.id}>
                <div className="stop-number">{p.ordem_planejada}</div>
                <div className="stop-body">
                  <div className="stop-title">
                    <div>
                      <strong>{p.destino_operacional_nome || p.cliente || 'Parada'}</strong>
                      <span>{[p.endereco, p.numero, p.bairro, p.cidade].filter(Boolean).join(', ')}</span>
                    </div>
                    <div className="badge-group">
                      <Badge tone={p.modalidade === 'PROPRIA' ? 'success' : 'warning'}>{p.modalidade}</Badge>
                      <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                    </div>
                  </div>
                  <div className="inline-actions">
                    {p.status === 'PENDENTE' && <button className="button compact" onClick={() => void alterarStatusParada(p.id, 'EM_DESLOCAMENTO')}>Em deslocamento</button>}
                    {['PENDENTE', 'EM_DESLOCAMENTO'].includes(p.status) && <button className="button compact" onClick={() => void alterarStatusParada(p.id, 'NO_CLIENTE')}>Chegou</button>}
                    {!['ENTREGUE', 'CANCELADA', 'REAGENDADA'].includes(p.status) && (
                      <>
                        <button className="button compact primary" onClick={() => void alterarStatusParada(p.id, 'ENTREGUE')}>
                          {p.modalidade === 'PROPRIA' ? 'Entregue ao cliente' : 'Entregue no despacho'}
                        </button>
                        <button className="button compact danger" onClick={() => {
                          const motivo = window.prompt('Motivo da não realização:');
                          if (motivo?.trim()) void alterarStatusParada(p.id, 'NAO_ENTREGUE', motivo.trim());
                        }}>Não realizado</button>
                      </>
                    )}
                  </div>
                  {(p.entregas || []).map((e) => (
                    <div className="delivery-row" key={e.id}>
                      <div><strong>#{e.pedido || '—'}</strong><span>{e.cliente || 'Cliente'} · {formatCurrency(e.valor)}</span></div>
                      {e.modalidade !== 'PROPRIA' && (
                        <div className="inline-actions">
                          <Badge tone={statusTone(e.status_externo)}>{e.status_externo}</Badge>
                          {e.status_externo === 'DESPACHADO' && <button className="button compact" onClick={() => void alterarExterno(e.id, 'EM_TRANSITO')}>Em trânsito</button>}
                          {['DESPACHADO', 'EM_TRANSITO', 'EXCECAO'].includes(e.status_externo) && <button className="button compact primary" onClick={() => void alterarExterno(e.id, 'ENTREGUE')}>Entregue final</button>}
                          {e.status_externo !== 'ENTREGUE' && e.status_externo !== 'EXCECAO' && <button className="button compact danger" onClick={() => void alterarExterno(e.id, 'EXCECAO')}>Exceção</button>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div><span className="eyebrow">Saúde técnica</span><h2>Homologação</h2></div>
            <div className="inline-actions">
              <button className="button compact" onClick={() => void testarIntegracoes()} disabled={testandoIntegracoes}>
                <RefreshCw size={14} className={testandoIntegracoes ? 'spin' : ''} />
                {testandoIntegracoes ? 'Testando...' : 'Testar integrações'}
              </button>
              {homologacao?.pronto_para_homologar ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            </div>
          </div>
          <div className="stack compact-stack">
            {itensHomologacao.map((item) => (
              <div className="health-row" key={item.nome}>
                <div><strong>{item.nome}</strong><span>{item.detalhe}</span></div>
                <Badge tone={statusTone(item.status)}>{item.status}</Badge>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><span className="eyebrow">Exceções</span><h2>Alertas e ocorrências</h2></div><span>{alertas.length + ocorrencias.length}</span></div>
          <div className="stack compact-stack">
            {alertas.length === 0 && ocorrencias.length === 0 && <Empty text="Nenhuma exceção aberta." />}
            {alertas.slice(0, 10).map((a) => <div className="exception-row" key={`a-${a.id}`}><Badge tone={statusTone(a.severidade)}>{a.severidade}</Badge><div><strong>{a.titulo}</strong><span>{a.descricao}</span></div></div>)}
            {ocorrencias.slice(0, 10).map((o) => <div className="exception-row" key={`o-${o.id}`}><Badge tone={statusTone(o.severidade)}>{o.severidade}</Badge><div><strong>{o.motivo}</strong><span>{o.categoria}{o.pedido ? ` · pedido ${o.pedido}` : ''}</span></div></div>)}
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, detail, icon }: { label: string; value: string | number; detail: string; icon?: ReactNode }) {
  return <article className="kpi-card"><div className="kpi-top"><span>{label}</span>{icon}</div><strong>{value}</strong><small>{detail}</small></article>;
}

function Badge({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
