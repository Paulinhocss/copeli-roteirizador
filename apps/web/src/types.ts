export type Modalidade = 'PROPRIA' | 'TRANSPORTADORA' | 'SEDEX';

export interface ControlTowerResumo {
  rotas_total: number;
  rotas_liberadas: number;
  rotas_em_rota: number;
  rotas_finalizadas: number;
  paradas_total: number;
  paradas_pendentes: number;
  entregas_total: number;
  entregas_pendentes: number;
  entregas_concluidas_copeli: number;
  modalidade_propria: number;
  modalidade_transportadora: number;
  modalidade_sedex: number;
  externos_aguardando_despacho: number;
  externos_em_acompanhamento: number;
  externos_entregues_final: number;
  externos_excecao: number;
  valor_total: number;
  km_planejado: number;
  km_real: number;
}

export interface EntregaRota {
  id: number;
  parada_id: number;
  pedido?: string | null;
  num_nf?: string | null;
  cliente?: string | null;
  valor: number;
  modalidade: Modalidade;
  status_externo: string;
  codigo_rastreio?: string | null;
}

export interface Parada {
  id: number;
  ordem_planejada: number;
  cliente?: string | null;
  modalidade: Modalidade;
  status: string;
  status_externo: string;
  quantidade_entregas: number;
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  destino_operacional_nome?: string | null;
  destino_operacional_lat?: number | null;
  destino_operacional_lng?: number | null;
  lat?: number | null;
  lng?: number | null;
  eta_planejado?: string | null;
  entregas: EntregaRota[];
}

export interface Rota {
  id: number;
  codigo?: string | null;
  status: string;
  motorista_nome?: string | null;
  veiculo_nome?: string | null;
  veiculo_placa?: string | null;
  total_entregas: number;
  total_paradas: number;
  km_planejado: number;
  km_real?: number | null;
  duracao_planejada_segundos?: number | null;
  origem_lat?: number | null;
  origem_lng?: number | null;
  paradas?: Parada[];
}

export interface Alerta {
  id: number;
  titulo: string;
  descricao?: string | null;
  severidade: string;
  tipo: string;
}

export interface Ocorrencia {
  id: number;
  categoria: string;
  motivo: string;
  severidade: string;
  pedido?: string | null;
  rota_codigo?: string | null;
}

export interface HomologacaoItem {
  nome: string;
  status: string;
  detalhe?: string | null;
  obrigatorio: boolean;
}

export interface Homologacao {
  pronto_para_homologar: boolean;
  postgres?: { itens?: HomologacaoItem[] };
  deak?: { itens?: HomologacaoItem[] };
  here?: { itens?: HomologacaoItem[] };
  contele?: { itens?: HomologacaoItem[] };
}

export interface PontoDespacho {
  id: number;
  tipo: 'TRANSPORTADORA' | 'CORREIOS';
  codigo_externo?: string | null;
  nome: string;
  endereco: string;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  lat: number;
  lng: number;
  padrao: boolean;
  ativo: boolean;
}

export interface EntregaPlanejamento {
  Empresa?: string;
  PEDIDO?: string | number;
  NumNF?: string | number | null;
  CLIENTE?: string;
  NomeFantasia?: string;
  DataEntrega?: string;
  Prioridade?: string;
  PrioridadeCodigo?: string;
  Modalidade?: Modalidade;
  RequerDestinoOperacional?: boolean;
  ENDENT?: string;
  NumEnt?: string;
  BAIRRO?: string;
  CIDADE?: string;
  CEP?: string;
  VALOR?: number;
  VENDEDOR?: string;
  Observacao?: string;
  lat?: number;
  lng?: number;
  destino_operacional?: PontoDespacho;
}

export interface ConfiguracaoRoteirizacao {
  id: number;
  modo: 'CEP' | 'OTIMIZADA';
  deposito_endereco: string;
  deposito_lat: number;
  deposito_lng: number;
  inicio_jornada: string;
  fim_jornada: string;
  tempo_parada_segundos: number;
}

export interface Motorista {
  id: number;
  nome: string;
  ativo: boolean;
}

export interface Veiculo {
  id: number;
  nome: string;
  placa?: string | null;
  perfil: string;
  max_paradas: number;
  motorista_id?: number | null;
  motorista_nome?: string | null;
  ativo: boolean;
}

export interface FaixaCep {
  id: number;
  cep_inicial: string;
  cep_final: string;
  motorista_id: number;
  motorista_nome: string;
  ativo: boolean;
}

export interface PosicaoContele {
  contele_vehicle_key?: string | null;
  contele_vehicle_id?: string | number | null;
  vehicle_name?: string | null;
  plate_number?: string | null;
  driver_name?: string | null;
  lat: number;
  lng: number;
  speed?: number | null;
  ignition?: number | boolean | null;
  rastreador_atualizado_em?: string | null;
  sincronizado_em?: string | null;
}

export interface RotaPlanejada {
  motorista_id?: number | null;
  motorista?: string | null;
  veiculo?: Veiculo | null;
  distKm?: number | null;
  duracaoSegundos?: number | null;
  entregas: EntregaPlanejamento[];
}

export interface PlanejamentoResultado {
  ok: boolean;
  modo: 'CEP' | 'OTIMIZADA';
  rotas: RotaPlanejada[];
  naoAtribuidas: Array<{ entrega: EntregaPlanejamento; motivo: string }>;
  resumo: {
    entregasRecebidas: number;
    entregasRoteirizadas: number;
    paradasPlanejadas: number;
    naoAtribuidas: number;
    rotas: number;
    veiculosConsiderados?: number;
  };
}
