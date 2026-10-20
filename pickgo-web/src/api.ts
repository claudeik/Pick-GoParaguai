// Cliente da API do pickgo-backend (/v1). Valores monetários sempre em centavos.

export type Perfil = 'cliente' | 'lojista' | 'operador' | 'central' | 'admin';

export type Modo = 'RETIRADA_PORTAL' | 'RETIRADA_LOJA' | 'SCAN_GO' | 'ENVIO_BRASIL';

export type EstadoPedido =
  | 'CRIADO'
  | 'AGUARDANDO_PIX'
  | 'PAGO'
  | 'EXPIRADO'
  | 'CANCELADO'
  | 'EM_SEPARACAO'
  | 'EM_COLETA'
  | 'EM_TESTE_LOJA'
  | 'PRONTO_RETIRADA'
  | 'RETIRADO'
  | 'NAO_RETIRADO'
  | 'LIBERADO_SAIDA'
  | 'POSTADO'
  | 'EM_TRANSITO'
  | 'NA_ALFANDEGA'
  | 'ENTREGUE'
  | 'REEMBOLSADO';

export interface Loja {
  id: string;
  nome: string;
  ponto_retirada_tipo: 'DENTRO' | 'ANEXO';
  ponto_retirada_descricao: string | null;
  horario_abertura: string;
  horario_fechamento: string;
}

export interface Produto {
  id: string;
  loja_id: string;
  loja_nome: string;
  nome: string;
  categoria: string;
  preco_usd_centavos: number;
  estoque: number;
  foto_url: string | null;
  fotos?: string[];
  descricao?: string | null;
  codigo_barras: string | null;
  codigo_loja?: string | null;
}

/** Produto como a gestão do catálogo vê: inclui inativos e vendas. */
export interface ProdutoGestao extends Produto {
  ativo: boolean;
  fotos: string[];
  /** Último estoque informado pelo sistema da loja (null se cadastrado à mão). */
  estoque_loja: number | null;
  reservado?: number;
  origem: 'MANUAL' | 'INTEGRACAO' | 'IMPORTACAO';
  sincronizado_em: string | null;
  vendidos?: number;
  criado_em?: string;
  atualizado_em?: string;
}

export interface DadosProduto {
  loja_id?: string;
  nome: string;
  categoria: string;
  preco_usd_centavos: number;
  estoque: number;
  codigo_barras: string | null;
  codigo_loja: string | null;
  descricao: string | null;
  fotos: string[];
  ativo: boolean;
}

/** Item como o sistema da loja (ou a planilha) envia para a lista mestre. */
export interface ItemListaMestre {
  codigo_loja: string;
  nome: string;
  descricao?: string | null;
  categoria: string;
  preco_usd_centavos: number;
  estoque: number;
  codigo_barras?: string | null;
  fotos?: string[];
}

export interface ResultadoSincronizacao {
  id: string;
  recebidos: number;
  criados: number;
  atualizados: number;
  zerados: number;
  erros: { codigo_loja: string; erro: string }[];
}

export interface Sincronizacao extends Omit<ResultadoSincronizacao, 'id'> {
  id: string;
  loja_id: string;
  loja_nome: string;
  origem: 'INTEGRACAO' | 'IMPORTACAO';
  ator: string;
  completo: boolean;
  criado_em: string;
}

export interface EstadoIntegracao {
  id: string;
  nome: string;
  tem_chave: boolean;
  chave_integracao_criada_em: string | null;
  ultima_integracao: string | null;
}

export type SituacaoProduto = 'TODOS' | 'ATIVOS' | 'INATIVOS' | 'SEM_ESTOQUE';

export interface ConfigPublica {
  cotacao_usd_brl: number;
  taxa_pix_bps: number;
  taxa_cambio_bps: number;
  comissao_portal_bps: number;
  comissao_epyx_bps: number;
  cota_usd_centavos: number;
  validade_pix_minutos: number;
}

export interface ItemPedido {
  id: string;
  produto_id: string;
  loja_id: string;
  loja_nome: string;
  nome_produto: string;
  quantidade: number;
  preco_usd_centavos: number;
  subtotal_usd_centavos: number;
  subtotal_brl_centavos: number;
  status: 'PENDENTE' | 'SEPARADO';
  separado_em: string | null;
  teste_resultado: 'APROVADO' | 'DEFEITO' | null;
}

export interface Pagamento {
  id: string;
  txid: string;
  estado: 'PENDENTE' | 'CONFIRMADO' | 'EXPIRADO' | 'ESTORNADO' | 'RECEBIDO_FORA_DO_PRAZO';
  valor_brl_centavos: number;
  copia_e_cola?: string;
  expira_em: string;
  confirmado_em: string | null;
}

export interface Pedido {
  id: string;
  codigo: string;
  estado: EstadoPedido;
  modo: Modo;
  loja_scan_go: string | null;
  janela_chegada: string | null;
  cliente_chegou_em: string | null;
  cliente_nome?: string;
  valores: {
    total_usd_centavos: number;
    cotacao_usd_brl: number;
    subtotal_brl_centavos: number;
    taxa_pix_brl_centavos: number;
    taxa_cambio_brl_centavos: number;
    total_brl_centavos: number;
  };
  itens: ItemPedido[];
  pagamento: Pagamento | null;
  qr: string | null;
  operacao: {
    coletado_por: string | null;
    coletado_em: string | null;
    conferido_portal_por: string | null;
    conferido_portal_em: string | null;
    pronto_em: string | null;
    retirado_por: string | null;
    retirado_em: string | null;
    documento_conferido: boolean | null;
    conferencia_saida: 'AMOSTRAGEM' | 'TOTAL' | null;
  };
  avisos?: { codigo: string; mensagem: string }[];
  criado_em: string;
  atualizado_em: string;
}

export interface PedidoResumo {
  id: string;
  codigo: string;
  modo: Modo;
  estado: EstadoPedido;
  total_brl_centavos: number;
  total_usd_centavos: number;
  criado_em: string;
}

export type TipoOcorrencia = 'ITEM_FALTANTE' | 'ITEM_A_MAIS' | 'DEFEITO_TESTE' | 'DEFEITO_POS_SAIDA' | 'DIVERGENCIA_SAIDA';
export type Responsavel = 'LOJA' | 'PORTAL' | 'LOJA_E_PORTAL' | 'A_DEFINIR';
export type Resolucao = 'ACERTO_FATURA' | 'REPOSICAO' | 'TROCA' | 'DEVOLUCAO' | 'TICKET_LOJA';

export interface Ocorrencia {
  id: string;
  pedido_id: string;
  pedido_codigo?: string;
  item_id: string | null;
  loja_id: string | null;
  tipo: TipoOcorrencia;
  responsavel: Responsavel;
  estado: 'ABERTA' | 'RESOLVIDA';
  descricao: string | null;
  resolucao: Resolucao | null;
  valor_ajuste_centavos: number | null;
  aberta_por: string;
  aberta_em: string;
  resolvida_por: string | null;
  resolvida_em: string | null;
}

export interface FilaCentral {
  pedidos: Pedido[];
  indicadores: {
    por_estado: Partial<Record<EstadoPedido, number>>;
    ocorrencias_abertas: number;
    nao_retirados: number;
    tempo_medio_separacao_min: number | null;
    tempo_medio_entrega_min: number | null;
  };
}

export interface RelatorioLoja {
  bruto_brl_centavos: number;
  comissao_portal_brl_centavos: number;
  comissao_epyx_brl_centavos: number;
  ajustes_brl_centavos: number;
  liquido_brl_centavos: number;
  pedidos_por_modo: Partial<Record<Modo, number>>;
}

export interface RelatorioPlataforma {
  gmv_brl_centavos: number;
  saldos_por_conta: Record<string, number>;
  por_loja: { loja_id: string; loja_nome?: string; bruto_brl_centavos: number; liquido_brl_centavos?: number }[];
  pedidos_por_estado: Partial<Record<EstadoPedido, number>>;
}

export interface Lancamento {
  id: string;
  criado_em: string;
  pedido_codigo?: string;
  pedido_id?: string;
  transacao_id: string;
  conta_debito: string;
  conta_credito: string;
  valor_centavos: number;
  tipo: string;
}

// --- Acesso da equipe (Keycloak) ---

export type Permissao =
  | 'catalogo.ver'
  | 'catalogo.editar'
  | 'catalogo.publicar'
  | 'catalogo.importar'
  | 'integracao.gerenciar'
  | 'pedidos.ver'
  | 'operacao.central'
  | 'operacao.loja'
  | 'retirada.entregar'
  | 'ocorrencias.ver'
  | 'ocorrencias.abrir'
  | 'ocorrencias.resolver'
  | 'financeiro.loja'
  | 'financeiro.plataforma'
  | 'estorno.executar'
  | 'lojas.editar'
  | 'crm.ver'
  | 'crm.editar'
  | 'atendimento.responder'
  | 'mensagens.enviar'
  | 'campanhas.ver'
  | 'campanhas.gerenciar'
  | 'erp.ver'
  | 'erp.fiscal'
  | 'erp.financeiro'
  | 'erp.estoque'
  | 'usuarios.ver'
  | 'usuarios.gerenciar';

export type Organizacao = 'PORTAL' | 'EPYX' | 'LOJA';

export interface QuemSou {
  sub: string;
  nome: string | null;
  email: string | null;
  organizacao: Organizacao | null;
  loja_id: string | null;
  loja_nome: string | null;
  perfis: { id: string; nome: string }[];
  permissoes: Permissao[];
}

export interface PerfilAcesso {
  id: string;
  nome: string;
  organizacao: Organizacao;
  descricao: string;
  permissoes: Permissao[];
  concede: string[];
}

export interface ModeloAcesso {
  permissoes: Record<Permissao, string>;
  perfis: PerfilAcesso[];
  gestor: 'keycloak' | 'memoria';
}

export interface UsuarioEquipe {
  id: string;
  email: string;
  nome: string;
  ativo: boolean;
  organizacao: Organizacao | null;
  loja_id: string | null;
  perfil: string | null;
  criado_em: string | null;
  pode_editar?: boolean;
}

// --- CRM e atendimento ---

export type EtapaFunil = 'LEAD' | 'CONTATO_FEITO' | 'ONBOARDING' | 'CLIENTE_ATIVO' | 'RECORRENTE' | 'PERDIDO';
export type CanalMensagem = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'APP';
export type TipoTicket = 'DUVIDA' | 'CANCELAMENTO' | 'RETIRADA_ATRASADA' | 'RECLAMACAO' | 'DEFEITO' | 'OUTRO';
export type EstadoTicket = 'ABERTO' | 'EM_ATENDIMENTO' | 'AGUARDANDO_CLIENTE' | 'RESOLVIDO';
export type PrioridadeTicket = 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE';

export interface ContatoCrm {
  id: string;
  cliente_id: string | null;
  nome: string;
  email: string | null;
  whatsapp: string | null;
  origem: string;
  etapa: EtapaFunil;
  responsavel: string | null;
  tags: string[];
  optout_canais: string[];
  notas?: string | null;
  ultimo_contato_em: string | null;
  criado_em: string;
  pedidos?: number;
  gasto_brl_centavos?: number;
  ultima_compra?: string | null;
  tickets_abertos?: number;
}

export interface MensagemCrm {
  id: string;
  ticket_id: string | null;
  direcao: 'SAIDA' | 'ENTRADA';
  canal: CanalMensagem;
  finalidade?: string;
  assunto: string | null;
  conteudo: string;
  modelo?: string | null;
  estado: string;
  motivo?: string | null;
  autor?: string;
  criado_em: string;
}

export interface TicketCrm {
  id: string;
  numero: number;
  contato_id: string;
  pedido_id: string | null;
  tipo: TipoTicket;
  estado: EstadoTicket;
  prioridade: PrioridadeTicket;
  canal: string;
  assunto: string;
  responsavel: string | null;
  automatico: boolean;
  responder_ate: string | null;
  criado_em: string;
  atualizado_em: string;
  contato_nome?: string;
  contato_whatsapp?: string | null;
  contato_email?: string | null;
  pedido_codigo?: string | null;
  pedido_estado?: EstadoPedido | null;
  ultima_mensagem?: string | null;
  atrasado?: boolean;
}

export interface FichaContato {
  contato: ContatoCrm;
  canais_permitidos: CanalMensagem[];
  onboarding: { passo: string; feito: boolean }[];
  pedidos: { id: string; codigo: string; estado: EstadoPedido; modo: Modo; total_brl_centavos: number; criado_em: string }[];
  mensagens: MensagemCrm[];
  tickets: TicketCrm[];
}

// --- Campanhas e ofertas ---

export interface Segmento {
  etapas?: EtapaFunil[];
  gasto_minimo_brl_centavos?: number;
  pedidos_minimo?: number;
  sem_compra_ha_dias?: number;
  comprou_categoria?: string;
  comprou_loja?: string;
  interesse?: string;
  tags?: string[];
  somente_clientes?: boolean;
}

export type CanalCampanha = 'WHATSAPP' | 'SMS' | 'EMAIL';
export type PagadorDesconto = 'LOJA' | 'PORTAL' | 'DIVIDIDO';

export interface PreviaPublico {
  total: number;
  alcancaveis: number;
  por_canal: Record<CanalCampanha, number>;
  amostra: { id: string; nome: string; etapa: EtapaFunil; pedidos: number; gasto_brl_centavos: number }[];
}

export interface OfertaVitrine {
  id: string;
  codigo: string;
  titulo: string;
  preco_promocional_usd_centavos: number;
  quantidade_total: number;
  quantidade_restante: number;
  limite_por_cliente: number;
  inicio: string;
  fim: string;
  exclusiva: boolean;
  produto_id: string;
  produto_nome: string;
  categoria: string;
  preco_usd_centavos: number;
  foto_url: string | null;
  loja_id: string;
  loja_nome: string;
}

export interface OfertaGestao extends Omit<OfertaVitrine, 'produto_nome' | 'categoria' | 'foto_url' | 'loja_id'> {
  produto_nome: string;
  loja_nome: string;
  pagador: PagadorDesconto;
  estado: 'ATIVA' | 'ENCERRADA';
  campanha_id: string | null;
  campanha_nome: string | null;
  vendidas: number;
  pedidos: number;
  valendo: boolean;
}

export interface NovaOferta {
  produto_id: string;
  titulo: string;
  preco_promocional_usd_centavos: number;
  quantidade_total: number;
  limite_por_cliente: number;
  inicio?: string;
  fim: string;
  exclusiva?: boolean;
  pagador: PagadorDesconto;
  codigo?: string;
}

export interface MetricasCampanha {
  publico: number;
  sem_canal: number;
  envios_por_estado: Record<string, number>;
  mensagens: { enviadas: number; entregues: number; lidas: number; bloqueadas: number; falhas: number; na_fila: number; por_canal: { canal: string; estado: string; n: number }[] };
  cliques: number;
  compras: number;
  receita_brl_centavos: number;
}

export interface Campanha {
  id: string;
  nome: string;
  segmento: Segmento;
  oferta_id: string | null;
  mensagem: string;
  canais: CanalCampanha[];
  espera_horas: number;
  agendada_para: string | null;
  estado: 'RASCUNHO' | 'AGENDADA' | 'ENVIANDO' | 'CONCLUIDA' | 'CANCELADA';
  criado_por: string;
  criado_em: string;
  disparada_em: string | null;
  concluida_em: string | null;
  oferta_codigo?: string | null;
  oferta_titulo?: string | null;
  quantidade_restante?: number | null;
  quantidade_total?: number | null;
  metricas?: MetricasCampanha;
}

// --- ERP do Portal Paraguai ---

export type MoedaErp = 'PYG' | 'USD';
export type IvaErp = '10' | '5' | 'EXENTO';

export interface EmpresaErp {
  ruc: string;
  dv: number;
  razao_social: string;
  nome_fantasia: string | null;
  endereco: string | null;
  atividade: string | null;
  timbrado: string;
  timbrado_inicio: string;
  timbrado_fim: string;
  estabelecimento: string;
  ponto_expedicao: string;
  proximo_numero: number;
  proximo_numero_nc: number;
}

export interface TerceiroErp {
  id: string;
  tipo_documento: 'RUC' | 'CI' | 'CPF' | 'CNPJ' | 'PASSAPORTE' | 'EXTERIOR';
  documento: string;
  dv: number | null;
  razao_social: string;
  nome_fantasia: string | null;
  email: string | null;
  telefone: string | null;
  cliente: boolean;
  fornecedor: boolean;
  loja_id: string | null;
  loja_nome?: string | null;
  ativo: boolean;
}

export interface ItemErp {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  tipo: 'MERCADORIA' | 'INSUMO' | 'SERVICO';
  iva: IvaErp;
  controla_estoque: boolean;
  estoque_minimo: number;
  custo_medio_pyg: number;
  preco_venda_pyg: number | null;
  ativo: boolean;
  saldo_total?: number;
}

export interface DepositoErp {
  id: string;
  codigo: string;
  nome: string;
  ativo: boolean;
}

export interface SaldoErp {
  item_id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  estoque_minimo: number;
  custo_medio_pyg: number;
  deposito_id: string;
  deposito_nome: string;
  quantidade: number;
  valor_pyg: number;
  total_item: number;
}

export interface MovimentoErp {
  id: string;
  seq: number;
  item_id: string;
  codigo: string;
  descricao: string;
  deposito_nome: string;
  tipo: string;
  quantidade: number;
  custo_unitario_pyg: number;
  saldo_apos: number;
  custo_medio_apos: number;
  documento_tipo: string | null;
  observacao: string | null;
  autor: string;
  criado_em: string;
}

export interface DocumentoFiscal {
  id: string;
  data: string;
  condicao: 'CONTADO' | 'CREDITO';
  moeda: MoedaErp;
  tipo_cambio: number;
  total_10: number;
  iva_10: number;
  total_5: number;
  iva_5: number;
  exento: number;
  total: number;
  estado: string;
  timbrado: string;
}

export interface CompraErp extends DocumentoFiscal {
  numero: string;
  fornecedor: string;
  fornecedor_id: string;
  deposito_nome: string | null;
}

export interface FaturaErp extends DocumentoFiscal {
  tipo: 'FACTURA' | 'NOTA_CREDITO';
  numero_formatado: string;
  cliente: string;
  terceiro_id: string;
  origem: 'MANUAL' | 'COMISSAO';
  periodo: string | null;
  origem_numero: string | null;
  a_receber: number;
  observacao: string | null;
}

export interface LinhaDocumento {
  id: string;
  item_id: string | null;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  iva: IvaErp;
  total: number;
}

export interface TituloErp {
  id: string;
  tipo: 'PAGAR' | 'RECEBER';
  terceiro_id: string;
  razao_social: string;
  descricao: string;
  parcela: number;
  parcelas: number;
  emissao: string;
  vencimento: string;
  moeda: MoedaErp;
  valor: number;
  saldo: number;
  estado: 'ABERTO' | 'PARCIAL' | 'QUITADO' | 'CANCELADO';
  vencido?: boolean;
  dias_atraso?: number;
}

export interface BaixaErp {
  id: string;
  data: string;
  valor: number;
  meio: string;
  observacao: string | null;
  automatica: boolean;
  estornada: boolean;
  autor: string;
}

export interface LinhaPagamentoErp {
  condicao: 'CONTADO' | 'CREDITO';
  meio?: 'TRANSFERENCIA' | 'EFECTIVO' | 'CHEQUE' | 'PIX' | 'TARJETA';
  parcelas?: number;
  primeiro_vencimento?: string;
  intervalo_dias?: number;
}

export interface LivroIva {
  periodo: string;
  linhas: {
    id: string;
    data: string;
    tipo_documento: string;
    documento: string;
    dv: number | null;
    razao_social: string;
    comprovante: string;
    timbrado: string;
    numero: string;
    condicao: string;
    moeda: MoedaErp;
    anulado: boolean;
    pyg: { total_10: number; iva_10: number; total_5: number; iva_5: number; exento: number; total: number };
  }[];
  totais: { total_10: number; iva_10: number; total_5: number; iva_5: number; exento: number; total: number; iva: number };
}

export interface PainelErp {
  periodo: string;
  empresa_configurada: boolean;
  timbrado_fim: string | null;
  titulos: { tipo: 'PAGAR' | 'RECEBER'; moeda: MoedaErp; aberto: number; vencido: number; vence_30: number }[];
  faturado_pyg: number;
  comprado_pyg: number;
  iva_debito_pyg: number;
  iva_credito_pyg: number;
  iva_a_pagar_pyg: number;
  estoque_valor_pyg: number;
  estoque_itens: number;
  itens_abaixo_minimo: number;
}

/** Erro no formato problem+json devolvido pela API. */
// Vídeos do YouTube com produtos e link inteligente (T20 a T22 · RF-31, RF-39 a RF-41)

export type EstadoVideo = 'RASCUNHO' | 'PUBLICADO' | 'ARQUIVADO';

export interface MetricasVideo {
  cliques: number;
  interessados: number;
  pedidos: number;
  receita_brl_centavos: number;
}

export interface VideoResumo {
  id: string;
  youtube_id: string;
  titulo: string;
  canal: string | null;
  estado: EstadoVideo;
  publicado_em: string | null;
  criado_em: string;
  produtos: number;
  metricas: MetricasVideo;
}

export interface ProdutoDoVideo {
  id: string;
  produto_id: string;
  produto_nome: string;
  preco_usd_centavos: number;
  foto_url: string | null;
  loja_id: string;
  loja_nome: string;
  momento_s: number;
  codigo: string;
  oferta_codigo: string | null;
  oferta_titulo: string | null;
  oferta_preco_usd_centavos: number | null;
  oferta_valendo: boolean;
}

export interface VideoDetalhe extends Omit<VideoResumo, 'produtos'> {
  descricao: string | null;
  url_youtube: string;
  produtos: (ProdutoDoVideo & { oferta_id: string | null; link: string; metricas: MetricasVideo })[];
  texto_youtube: { descricao: string; comentario_fixado: string };
}

export interface VideoPublicado {
  id: string;
  youtube_id: string;
  titulo: string;
  canal: string | null;
  descricao: string | null;
  publicado_em: string;
  produtos: ProdutoDoVideo[];
}

export interface ProdutoNoVideo {
  produto_id: string;
  momento?: string | number;
  oferta_id?: string | null;
}

export class ErroApi extends Error {
  status: number;
  codigo: string;
  dados: Record<string, unknown>;

  constructor(status: number, codigo: string, mensagem: string, dados: Record<string, unknown> = {}) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.dados = dados;
  }
}

interface Opcoes {
  token?: string | null;
  corpo?: unknown;
  /** Operações de dinheiro e de pedido exigem Idempotency-Key. */
  idempotente?: boolean;
}

// No navegador a API fica no mesmo endereço (proxy do Vite). O app instalado no celular
// não tem proxy: usa o endereço público em VITE_API_URL (ex.: https://api.pickgo.com.py).
const BASE_API = `${(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')}/v1`;

async function chamar<T>(metodo: string, caminho: string, o: Opcoes = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.corpo !== undefined) headers['content-type'] = 'application/json';
  if (o.idempotente) headers['idempotency-key'] = crypto.randomUUID();

  let resp: Response;
  try {
    resp = await fetch(`${BASE_API}${caminho}`, {
      method: metodo,
      headers,
      body: o.corpo === undefined ? undefined : JSON.stringify(o.corpo),
    });
  } catch {
    throw new ErroApi(0, 'sem-conexao', 'Sem conexão com a API. O backend está rodando na porta 3333?');
  }

  const texto = await resp.text();
  let dados: unknown = undefined;
  if (texto) {
    try {
      dados = JSON.parse(texto);
    } catch {
      dados = texto;
    }
  }
  if (!resp.ok) {
    const p = (typeof dados === 'object' && dados ? dados : {}) as Record<string, unknown>;
    const codigo = String(p.codigo ?? p.type ?? p.code ?? 'erro').replace(/^.*[:/]/, '');
    const msg = String(p.detail ?? p.title ?? p.message ?? (typeof dados === 'string' ? dados : `HTTP ${resp.status}`));
    throw new ErroApi(resp.status, codigo, msg, p);
  }
  return dados as T;
}

const qs = (p: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') s.set(k, String(v));
  const t = s.toString();
  return t ? `?${t}` : '';
};

export function criarApi(token: string | null) {
  const o = (extra: Omit<Opcoes, 'token'> = {}) => ({ ...extra, token });
  return {
    // Catálogo
    config: () => chamar<ConfigPublica>('GET', '/config/publica'),
    lojas: () => chamar<{ lojas: Loja[] }>('GET', '/lojas'),
    produtos: (f: { loja_id?: string; categoria?: string; busca?: string; limite?: number } = {}) =>
      chamar<{ produtos: Produto[]; proximo_cursor: string | null }>('GET', `/produtos${qs({ limite: 100, ...f })}`),
    produtoPorCodigo: (lojaId: string, codigo: string) =>
      chamar<Produto>('GET', `/lojas/${encodeURIComponent(lojaId)}/produtos/codigo/${encodeURIComponent(codigo)}`),

    categorias: () => chamar<{ categorias: string[] }>('GET', '/categorias'),

    // Gestão do catálogo (lojista na própria loja, admin em qualquer loja)
    catalogoGestao: (f: { loja_id?: string; busca?: string; situacao?: SituacaoProduto } = {}) =>
      chamar<{ produtos: ProdutoGestao[]; resumo: { total: number; ativos: number; sem_estoque: number } }>('GET', `/loja/produtos${qs(f)}`, o()),
    criarProduto: (d: DadosProduto) => chamar<ProdutoGestao>('POST', '/loja/produtos', o({ corpo: d })),
    alterarProduto: (id: string, d: Partial<DadosProduto>) => chamar<ProdutoGestao>('PATCH', `/loja/produtos/${id}`, o({ corpo: d })),
    importarCatalogo: (d: { loja_id?: string; completo: boolean; produtos: ItemListaMestre[] }) =>
      chamar<ResultadoSincronizacao>('POST', '/loja/catalogo/importar', o({ corpo: d })),
    sincronizacoes: (lojaId?: string) =>
      chamar<{ sincronizacoes: Sincronizacao[]; lojas: EstadoIntegracao[] }>('GET', `/loja/sincronizacoes${qs({ loja_id: lojaId })}`, o()),
    gerarChaveIntegracao: (lojaId: string) =>
      chamar<{ loja_id: string; chave: string }>('POST', `/lojas/${encodeURIComponent(lojaId)}/chave-integracao`, o({ corpo: {} })),

    // Vídeos (equipe: campanhas.ver e campanhas.gerenciar)
    videos: () => chamar<{ videos: VideoResumo[] }>('GET', '/videos', o()),
    video: (id: string) => chamar<VideoDetalhe>('GET', `/videos/${id}`, o()),
    criarVideo: (d: { url: string; titulo?: string; descricao?: string; produtos?: ProdutoNoVideo[]; publicar?: boolean }) =>
      chamar<VideoDetalhe>('POST', '/videos', o({ corpo: d })),
    alterarVideo: (id: string, d: { titulo?: string; descricao?: string | null; estado?: EstadoVideo }) => chamar<VideoDetalhe>('PATCH', `/videos/${id}`, o({ corpo: d })),
    produtosDoVideo: (id: string, produtos: ProdutoNoVideo[]) => chamar<VideoDetalhe>('PUT', `/videos/${id}/produtos`, o({ corpo: { produtos } })),
    campanhaDoVideo: (id: string, d: { segmento?: Segmento; canais?: CanalCampanha[]; enviar?: 'agora' }) =>
      chamar<{ id: string; nome: string; estado: string }>('POST', `/videos/${id}/campanha`, o({ corpo: d })),
    // Vídeos (turista e público)
    videosPublicados: () => chamar<{ videos: VideoPublicado[] }>('GET', '/videos/publicados'),
    abrirVideo: (codigo: string, clique = true) =>
      chamar<{ video_id: string; produto_id: string; cupom: string | null }>('POST', '/videos/abrir', o({ corpo: { codigo, clique } })),
    produto: (id: string) => chamar<Produto>('GET', `/produtos/${id}`),

    // Identidade
    cadastrar: (d: {
      cpf: string;
      nome: string;
      whatsapp: string;
      email?: string;
      aceite_termos: true;
      aceite_mensagens_whatsapp: boolean;
      aceite_mensagens_email: boolean;
      aceite_mensagens_sms: boolean;
      versao_termos: string;
    }) => chamar<{ cliente_id: string; token: string }>('POST', '/clientes', { corpo: d }),
    /** Envia o código de acesso ao WhatsApp do cadastro; `codigo_dev` só vem em desenvolvimento. */
    pedirCodigo: (cpf: string) =>
      chamar<{ enviado_para: string; validade_min: number; codigo_dev?: string }>('POST', '/clientes/codigo', { corpo: { cpf } }),
    entrar: (cpf: string, codigo: string) => chamar<{ cliente_id: string; token: string }>('POST', '/clientes/entrar', { corpo: { cpf, codigo } }),
    eu: () => chamar<{ id: string; nome: string; cpf_mascarado: string; whatsapp: string; email: string | null }>('GET', '/clientes/eu', o()),
    registrarDispositivo: (d: { plataforma: 'android' | 'ios'; token: string }) => chamar<void>('PUT', '/clientes/eu/dispositivos', o({ corpo: d })),
    removerDispositivo: (t: string) => chamar<void>('POST', '/clientes/eu/dispositivos/remover', o({ corpo: { token: t } })),
    /** Exclui a conta (App Store e LGPD): apaga os dados pessoais; os pedidos ficam anônimos. */
    excluirConta: () => chamar<void>('DELETE', '/clientes/eu', o()),
    devLogin: (d: { perfil?: Perfil; perfil_acesso?: string; sub: string; nome?: string; loja_id?: string }) =>
      chamar<{ token: string }>('POST', '/dev/login', { corpo: d }),

    // Acesso e usuários da equipe
    quemSou: () => chamar<QuemSou>('GET', '/acesso/eu', o()),
    modeloAcesso: () => chamar<ModeloAcesso>('GET', '/acesso/modelo', o()),
    usuarios: (f: { organizacao?: Organizacao; loja_id?: string } = {}) =>
      chamar<{ usuarios: UsuarioEquipe[]; perfis_que_concedo: string[]; escopo: { organizacao?: Organizacao; loja_id?: string } }>('GET', `/usuarios${qs(f)}`, o()),
    criarUsuario: (d: { email: string; nome: string; organizacao: Organizacao; loja_id?: string; perfil: string }) =>
      chamar<{ usuario: UsuarioEquipe; senha_temporaria: string }>('POST', '/usuarios', o({ corpo: d })),
    alterarUsuario: (id: string, d: { nome?: string; ativo?: boolean; perfil?: string }) => chamar<UsuarioEquipe>('PATCH', `/usuarios/${id}`, o({ corpo: d })),
    senhaTemporaria: (id: string) => chamar<{ senha_temporaria: string }>('POST', `/usuarios/${id}/senha-temporaria`, o({ corpo: {} })),

    // CRM e atendimento (equipe)
    funil: () => chamar<{ por_etapa: Partial<Record<EtapaFunil, number>>; tickets: { abertos: number; atrasados: number } }>('GET', '/crm/funil', o()),
    contatos: (f: { etapa?: EtapaFunil; busca?: string } = {}) => chamar<{ contatos: ContatoCrm[] }>('GET', `/crm/contatos${qs(f)}`, o()),
    ficha: (id: string) => chamar<FichaContato>('GET', `/crm/contatos/${id}`, o()),
    criarContato: (d: { nome: string; email?: string; whatsapp?: string; etapa?: EtapaFunil; notas?: string }) => chamar<ContatoCrm>('POST', '/crm/contatos', o({ corpo: d })),
    alterarContato: (id: string, d: { etapa?: EtapaFunil; responsavel?: string | null; tags?: string[]; notas?: string | null }) =>
      chamar<ContatoCrm>('PATCH', `/crm/contatos/${id}`, o({ corpo: d })),
    mensagemAvulsa: (id: string, d: { canal: CanalMensagem; texto: string }) => chamar<MensagemCrm>('POST', `/crm/contatos/${id}/mensagens`, o({ corpo: d })),
    tickets: (f: { estado?: EstadoTicket | 'ABERTOS'; tipo?: TipoTicket } = {}) => chamar<{ tickets: TicketCrm[] }>('GET', `/crm/tickets${qs(f)}`, o()),
    ticket: (id: string) => chamar<{ ticket: TicketCrm; mensagens: MensagemCrm[]; canais_permitidos: CanalMensagem[] }>('GET', `/crm/tickets/${id}`, o()),
    criarTicket: (d: { contato_id: string; pedido_id?: string; tipo: TipoTicket; prioridade?: PrioridadeTicket; assunto: string }) =>
      chamar<{ id: string; numero: number }>('POST', '/crm/tickets', o({ corpo: d })),
    alterarTicket: (id: string, d: { estado?: EstadoTicket; prioridade?: PrioridadeTicket; responsavel?: string | null; tipo?: TipoTicket }) =>
      chamar<TicketCrm>('PATCH', `/crm/tickets/${id}`, o({ corpo: d })),
    responderTicket: (id: string, d: { canal: CanalMensagem; texto: string; aguardar_cliente?: boolean }) => chamar<MensagemCrm>('POST', `/crm/tickets/${id}/mensagens`, o({ corpo: d })),
    enviarLead: (d: { nome: string; whatsapp?: string; email?: string; interesse?: string; aceite_whatsapp: boolean; aceite_sms: boolean; aceite_email: boolean; origem?: Record<string, string>; site?: string }) =>
      chamar<{ ok: boolean }>('POST', '/leads', { corpo: d }),

    // Campanhas e ofertas (equipe)
    atalhosPublico: () => chamar<{ atalhos: { id: string; nome: string; descricao: string; segmento: Segmento }[] }>('GET', '/publico/atalhos', o()),
    previaPublico: (segmento: Segmento, canais: CanalCampanha[]) => chamar<PreviaPublico>('POST', '/publico/previa', o({ corpo: { segmento, canais } })),
    ofertasGestao: () => chamar<{ ofertas: OfertaGestao[] }>('GET', '/ofertas/gestao', o()),
    criarOferta: (d: NovaOferta) => chamar<OfertaGestao>('POST', '/ofertas', o({ corpo: d })),
    encerrarOferta: (id: string) => chamar<OfertaGestao>('POST', `/ofertas/${id}/encerrar`, o({ corpo: {} })),
    campanhas: () => chamar<{ campanhas: Campanha[] }>('GET', '/campanhas', o()),
    campanha: (id: string) =>
      chamar<{ campanha: Campanha; metricas: MetricasCampanha; envios: { id: string; estado: string; passo: number; canal_atual: string | null; clicou_em: string | null; comprou_em: string | null; nome: string; etapa: EtapaFunil; pedido_codigo: string | null }[] }>(
        'GET',
        `/campanhas/${id}`,
        o(),
      ),
    criarCampanha: (d: { nome: string; segmento: Segmento; mensagem: string; canais: CanalCampanha[]; espera_horas: number; oferta?: NovaOferta; oferta_id?: string; enviar?: string }) =>
      chamar<Campanha>('POST', '/campanhas', o({ corpo: d })),
    previaMensagem: (mensagem: string) => chamar<{ texto: string }>('POST', '/campanhas/previa-mensagem', o({ corpo: { mensagem } })),
    agendarCampanha: (id: string, quando: string = 'agora') => chamar<Campanha>('POST', `/campanhas/${id}/agendar`, o({ corpo: { quando } })),
    cancelarCampanha: (id: string) => chamar<Campanha>('POST', `/campanhas/${id}/cancelar`, o({ corpo: {} })),

    // ERP do Portal
    erpPainel: (periodo?: string) => chamar<PainelErp>('GET', `/erp/painel${qs({ periodo })}`, o()),
    erpEmpresa: () => chamar<{ empresa: EmpresaErp | null }>('GET', '/erp/empresa', o()),
    erpSalvarEmpresa: (d: Omit<EmpresaErp, 'dv' | 'proximo_numero' | 'proximo_numero_nc'> & { proximo_numero?: number }) => chamar<EmpresaErp>('PUT', '/erp/empresa', o({ corpo: d })),
    erpTerceiros: (f: { papel?: 'cliente' | 'fornecedor'; busca?: string } = {}) => chamar<{ terceiros: TerceiroErp[] }>('GET', `/erp/terceiros${qs(f)}`, o()),
    erpCriarTerceiro: (d: Omit<TerceiroErp, 'id' | 'dv' | 'ativo' | 'loja_nome' | 'nome_fantasia' | 'email' | 'telefone' | 'loja_id'> & { nome_fantasia?: string; email?: string; telefone?: string; loja_id?: string }) =>
      chamar<TerceiroErp>('POST', '/erp/terceiros', o({ corpo: d })),
    erpAlterarTerceiro: (id: string, d: Partial<Pick<TerceiroErp, 'ativo' | 'cliente' | 'fornecedor' | 'razao_social'>>) => chamar<TerceiroErp>('PATCH', `/erp/terceiros/${id}`, o({ corpo: d })),
    erpDepositos: () => chamar<{ depositos: DepositoErp[] }>('GET', '/erp/depositos', o()),
    erpCriarDeposito: (d: { codigo: string; nome: string }) => chamar<DepositoErp>('POST', '/erp/depositos', o({ corpo: d })),
    erpItens: (busca?: string) => chamar<{ itens: ItemErp[] }>('GET', `/erp/itens${qs({ busca })}`, o()),
    erpCriarItem: (d: { codigo: string; descricao: string; unidade: string; tipo: ItemErp['tipo']; iva: IvaErp; controla_estoque?: boolean; estoque_minimo: number; preco_venda_pyg?: number }) =>
      chamar<ItemErp>('POST', '/erp/itens', o({ corpo: d })),
    erpAlterarItem: (id: string, d: Partial<Pick<ItemErp, 'descricao' | 'iva' | 'estoque_minimo' | 'ativo'>> & { preco_venda_pyg?: number | null }) => chamar<ItemErp>('PATCH', `/erp/itens/${id}`, o({ corpo: d })),
    erpSaldos: (f: { deposito_id?: string; abaixo_minimo?: boolean } = {}) =>
      chamar<{ saldos: SaldoErp[]; abaixo_minimo: number }>('GET', `/erp/estoque/saldos${qs({ deposito_id: f.deposito_id, abaixo_minimo: f.abaixo_minimo ? 'true' : undefined })}`, o()),
    erpMovimentos: (f: { item_id?: string; deposito_id?: string } = {}) => chamar<{ movimentos: MovimentoErp[] }>('GET', `/erp/estoque/movimentos${qs(f)}`, o()),
    erpMovimentar: (d: { tipo: 'AJUSTE_ENTRADA' | 'AJUSTE_SAIDA' | 'CONSUMO_INTERNO' | 'TRANSFERENCIA'; item_id: string; deposito_id: string; destino_id?: string; quantidade: number; custo_unitario_pyg?: number; observacao: string }) =>
      chamar<unknown>('POST', '/erp/estoque/movimentos', o({ corpo: d })),
    erpInventarios: () => chamar<{ inventarios: { id: string; deposito_id: string; deposito_nome: string; estado: string; aberto_em: string; fechado_em: string | null; itens: number; contados: number }[] }>('GET', '/erp/inventarios', o()),
    erpAbrirInventario: (deposito_id: string) => chamar<{ id: string }>('POST', '/erp/inventarios', o({ corpo: { deposito_id } })),
    erpInventario: (id: string) =>
      chamar<{ inventario: { id: string; estado: string; deposito_nome: string }; itens: { item_id: string; codigo: string; descricao: string; unidade: string; quantidade_sistema: number; quantidade_contada: number | null }[] }>(
        'GET',
        `/erp/inventarios/${id}`,
        o(),
      ),
    erpContagem: (id: string, itens: { item_id: string; quantidade_contada: number | null }[]) => chamar<{ ok: boolean }>('PATCH', `/erp/inventarios/${id}/contagem`, o({ corpo: { itens } })),
    erpFecharInventario: (id: string) => chamar<{ ajustes: number; contados: number; total: number }>('POST', `/erp/inventarios/${id}/fechar`, o({ corpo: {} })),
    erpCompras: () => chamar<{ compras: CompraErp[] }>('GET', '/erp/compras', o()),
    erpCompra: (id: string) => chamar<{ compra: CompraErp; itens: LinhaDocumento[]; titulos: TituloErp[] }>('GET', `/erp/compras/${id}`, o()),
    erpRegistrarCompra: (d: LinhaPagamentoErp & { fornecedor_id: string; timbrado: string; numero: string; data: string; moeda: MoedaErp; tipo_cambio: number; deposito_id?: string; itens: { item_id: string; quantidade: number; preco_unitario: number; iva?: IvaErp }[]; observacao?: string }) =>
      chamar<CompraErp>('POST', '/erp/compras', o({ corpo: d })),
    erpAnularCompra: (id: string) => chamar<{ ok: boolean }>('POST', `/erp/compras/${id}/anular`, o({ corpo: {} })),
    erpFaturas: () => chamar<{ faturas: FaturaErp[] }>('GET', '/erp/faturas', o()),
    erpFatura: (id: string) =>
      chamar<{ fatura: FaturaErp & { tipo_documento: string; documento: string; dv: number | null }; empresa: EmpresaErp | null; itens: LinhaDocumento[]; titulos: TituloErp[]; notas: { id: string; numero_formatado: string; data: string; total: number; estado: string }[] }>(
        'GET',
        `/erp/faturas/${id}`,
        o(),
      ),
    erpEmitirFatura: (d: LinhaPagamentoErp & { terceiro_id: string; data: string; moeda: MoedaErp; tipo_cambio: number; deposito_id?: string; itens: { item_id?: string; descricao?: string; quantidade: number; preco_unitario: number; iva?: IvaErp }[]; observacao?: string }) =>
      chamar<FaturaErp>('POST', '/erp/faturas', o({ corpo: d })),
    erpAnularFatura: (id: string) => chamar<{ ok: boolean }>('POST', `/erp/faturas/${id}/anular`, o({ corpo: {} })),
    erpNotaCredito: (id: string, d: { data: string; motivo: string; itens?: { fatura_item_id: string; quantidade: number }[]; devolver_estoque: boolean }) =>
      chamar<FaturaErp>('POST', `/erp/faturas/${id}/nota-credito`, o({ corpo: d })),
    erpFaturarComissoes: (periodo: string) =>
      chamar<{ periodo: string; emitidas: { loja: string; fatura: string; total_pyg: number }[]; pendentes: { loja: string; motivo: string }[] }>('POST', '/erp/faturas/comissoes', o({ corpo: { periodo } })),
    erpTitulos: (f: { tipo?: 'PAGAR' | 'RECEBER'; situacao?: 'ABERTOS' | 'VENCIDOS' | 'QUITADOS' | 'TODOS' } = {}) => chamar<{ titulos: TituloErp[] }>('GET', `/erp/titulos${qs(f)}`, o()),
    erpTitulo: (id: string) => chamar<{ titulo: TituloErp; baixas: BaixaErp[] }>('GET', `/erp/titulos/${id}`, o()),
    erpCriarTitulo: (d: { tipo: 'PAGAR' | 'RECEBER'; terceiro_id: string; descricao: string; emissao: string; moeda: MoedaErp; valor: number; parcelas: number; primeiro_vencimento: string; intervalo_dias?: number }) =>
      chamar<{ ids: string[] }>('POST', '/erp/titulos', o({ corpo: d })),
    erpBaixar: (id: string, d: { data: string; valor: number; meio: 'TRANSFERENCIA' | 'EFECTIVO' | 'CHEQUE' | 'PIX' | 'TARJETA'; observacao?: string }) => chamar<BaixaErp>('POST', `/erp/titulos/${id}/baixas`, o({ corpo: d })),
    erpEstornarBaixa: (id: string) => chamar<{ saldo: number }>('POST', `/erp/baixas/${id}/estornar`, o({ corpo: {} })),
    erpLivro: (tipo: 'ventas' | 'compras', periodo: string) => chamar<LivroIva>('GET', `/erp/livros/${tipo}${qs({ periodo })}`, o()),
    /** CSV do livro (RG 90): baixa com o token, porque a rota exige login. */
    erpLivroCsv: async (tipo: 'ventas' | 'compras', periodo: string) => {
      const r = await fetch(`${BASE_API}/erp/livros/${tipo}?periodo=${periodo}&formato=csv`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
      if (!r.ok) throw new ErroApi(r.status, 'erro', `HTTP ${r.status}`);
      return r.text();
    },

    // Vitrine de ofertas (pública; com o token do turista inclui as exclusivas dele)
    ofertas: () => chamar<{ ofertas: OfertaVitrine[] }>('GET', '/ofertas', o()),

    // Atendimento (turista)
    meuAtendimento: () =>
      chamar<{ tickets: { id: string; numero: number; tipo: TipoTicket; estado: EstadoTicket; assunto: string; criado_em: string; atualizado_em: string; pedido_codigo: string | null }[]; mensagens: MensagemCrm[] }>(
        'GET',
        '/atendimento',
        o(),
      ),
    pedirAtendimento: (d: { pedido_id?: string; tipo: 'DUVIDA' | 'CANCELAMENTO' | 'RECLAMACAO'; texto: string }) => chamar<{ ticketId?: string }>('POST', '/atendimento', o({ corpo: d })),

    // Pedidos (cliente)
    criarPedido: (d: {
      modo: Modo;
      loja_id?: string;
      janela_chegada?: string;
      itens: { produto_id?: string; codigo_barras?: string; quantidade: number }[];
      cupom?: string;
      campanha_link?: string;
      video_link?: string;
    }) => chamar<Pedido>('POST', '/pedidos', o({ corpo: d, idempotente: true })),
    gerarPix: (id: string) => chamar<Pedido>('POST', `/pedidos/${id}/pix`, o({ idempotente: true })),
    meusPedidos: () => chamar<{ pedidos: PedidoResumo[] }>('GET', '/pedidos', o()),
    pedido: (id: string) => chamar<Pedido>('GET', `/pedidos/${id}`, o()),
    cancelar: (id: string) => chamar<Pedido>('POST', `/pedidos/${id}/cancelar`, o({ corpo: {} })),
    cheguei: (id: string) => chamar<Pedido>('POST', `/pedidos/${id}/cheguei`, o({ corpo: {} })),
    simularPagamentoPix: (txid: string) =>
      chamar<{ resultados: { txid: string; resultado: string }[] }>('POST', `/dev/pix/${encodeURIComponent(txid)}/pagar`, o({ corpo: {} })),

    // Central e loja
    filaCentral: () => chamar<FilaCentral>('GET', '/central/fila', o()),
    pedidosDaLoja: () => chamar<{ pedidos: Pedido[] }>('GET', '/loja/pedidos', o()),
    iniciarColeta: (id: string) => chamar<Pedido>('POST', `/pedidos/${id}/coleta/iniciar`, o({ corpo: {} })),
    conferirColeta: (id: string, divergencias: { item_id: string; tipo: 'ITEM_FALTANTE' | 'ITEM_A_MAIS'; descricao: string }[] = []) =>
      chamar<Pedido>('POST', `/pedidos/${id}/coleta/conferir`, o({ corpo: { divergencias } })),
    registrarTeste: (id: string, itemId: string, resultado: 'APROVADO' | 'DEFEITO', descricao?: string) =>
      chamar<Pedido>('POST', `/pedidos/${id}/itens/${itemId}/teste`, o({ corpo: { resultado, descricao } })),
    separarItem: (id: string, itemId: string) =>
      chamar<Pedido>('POST', `/pedidos/${id}/itens/${itemId}/separar`, o({ corpo: {} })),
    consultarQr: (qr: string) => chamar<Pedido>('POST', '/retirada/consultar', o({ corpo: { qr } })),
    confirmarRetirada: (id: string, qr: string, documento_conferido: boolean) =>
      chamar<Pedido>('POST', `/pedidos/${id}/retirada/confirmar`, o({ corpo: { qr, documento_conferido } })),
    liberarSaida: (id: string, qr: string, conferencia: 'AMOSTRAGEM' | 'TOTAL', divergencia?: { descricao: string }) =>
      chamar<Pedido>('POST', `/pedidos/${id}/saida/liberar`, o({ corpo: { qr, conferencia, divergencia } })),

    // Ocorrências (regra 3.3.2)
    ocorrencias: (f: { pedido_id?: string; estado?: string } = {}) =>
      chamar<{ ocorrencias: Ocorrencia[] }>('GET', `/ocorrencias${qs(f)}`, o()),
    abrirOcorrencia: (d: { pedido_id: string; item_id?: string; tipo: TipoOcorrencia; descricao: string; responsavel?: Responsavel }) =>
      chamar<Ocorrencia>('POST', '/ocorrencias', o({ corpo: d })),
    resolverOcorrencia: (id: string, d: { resolucao: Resolucao; valor_ajuste_centavos?: number; responsavel?: Responsavel }) =>
      chamar<Ocorrencia>('POST', `/ocorrencias/${id}/resolver`, o({ corpo: d, idempotente: true })),

    // Financeiro
    relatorioLoja: (lojaId: string) => chamar<RelatorioLoja>('GET', `/relatorios/lojas/${encodeURIComponent(lojaId)}`, o()),
    relatorioPlataforma: () => chamar<RelatorioPlataforma>('GET', '/relatorios/plataforma', o()),
    lancamentos: (f: { pedido_id?: string; limite?: number } = {}) =>
      chamar<{ lancamentos: Lancamento[] }>('GET', `/lancamentos${qs(f)}`, o()),
    todosPedidos: (f: { estado?: string } = {}) => chamar<{ pedidos: PedidoResumo[] }>('GET', `/pedidos${qs(f)}`, o()),
    estornar: (pagamentoId: string) =>
      chamar<{ pedido_id: string; estado: EstadoPedido; transacao_id: string }>('POST', `/pagamentos/${pagamentoId}/estorno`, o({ corpo: {}, idempotente: true })),
  };
}

export type Api = ReturnType<typeof criarApi>;
