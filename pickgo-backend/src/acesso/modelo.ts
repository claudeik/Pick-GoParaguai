// Modelo de acesso da equipe (seção 11): cada usuário pertence a uma organização
// (Portal Paraguai, EPYX ou uma loja) e tem um perfil de acesso. O perfil dá
// permissões de ver e de editar; quem é de loja só enxerga a própria loja.
//
// Os perfis são papéis (realm roles) no Keycloak; organização e loja são
// atributos do usuário que chegam no token. Este arquivo é a fonte da verdade:
// o realm do Keycloak (pickgo-keycloak/realm-pickgo.json) só declara os papéis.

export const PERMISSOES = {
  'catalogo.ver': 'Ver a lista mestre e o catálogo',
  'catalogo.editar': 'Cadastrar e editar produtos, preço e estoque',
  'catalogo.publicar': 'Publicar ou tirar produtos do Pick & Go',
  'catalogo.importar': 'Importar planilha da lista mestre',
  'integracao.gerenciar': 'Gerar e trocar a chave de integração da loja',
  'pedidos.ver': 'Ver pedidos',
  'operacao.central': 'Operar a central: coleta e conferência',
  'operacao.loja': 'Teste de defeitos e separação na loja',
  'retirada.entregar': 'Conferir QR e entregar ao cliente',
  'ocorrencias.ver': 'Ver ocorrências',
  'ocorrencias.abrir': 'Registrar ocorrências',
  'ocorrencias.resolver': 'Resolver ocorrências e lançar acerto na fatura',
  'financeiro.loja': 'Ver vendas, comissões e repasse da loja',
  'financeiro.plataforma': 'Ver o painel da plataforma, o ledger e a conciliação',
  'estorno.executar': 'Estornar pagamentos',
  'lojas.editar': 'Editar ponto de retirada e horário da loja',
  'crm.ver': 'Ver contatos, funil, chamados e mensagens dos clientes',
  'crm.editar': 'Cadastrar leads, mover no funil e abrir ou encaminhar chamados',
  'atendimento.responder': 'Responder chamados pelo WhatsApp, SMS, e-mail ou app',
  'mensagens.enviar': 'Enviar mensagem avulsa a um cliente',
  'campanhas.ver': 'Ver campanhas, ofertas e resultados',
  'campanhas.gerenciar': 'Criar público, ofertas e campanhas e disparar envios',
  'erp.ver': 'Ver o ERP do Portal: cadastros, estoque, faturas, contas e livros',
  'erp.fiscal': 'Cadastros, compras, faturas, notas de crédito e dados da empresa',
  'erp.financeiro': 'Contas a pagar e a receber: lançar, baixar e estornar baixas',
  'erp.estoque': 'Itens, depósitos, movimentações e inventário',
  'usuarios.ver': 'Ver usuários',
  'usuarios.gerenciar': 'Criar usuários, mudar perfil e bloquear acesso',
} as const;

export type Permissao = keyof typeof PERMISSOES;
export type Organizacao = 'PORTAL' | 'EPYX' | 'LOJA';

export interface PerfilAcesso {
  id: string;
  nome: string;
  organizacao: Organizacao;
  descricao: string;
  permissoes: Permissao[];
  /** Perfis que este perfil pode atribuir a outros usuários. */
  concede: string[];
}

const TODAS = Object.keys(PERMISSOES) as Permissao[];

export const PERFIS_ACESSO: PerfilAcesso[] = [
  {
    id: 'portal-admin',
    nome: 'Administrador do Portal',
    organizacao: 'PORTAL',
    descricao: 'Acesso total: lojas, catálogo, operação, financeiro e usuários de todas as organizações.',
    permissoes: TODAS,
    concede: ['*'],
  },
  {
    id: 'portal-central',
    nome: 'Operador da central',
    organizacao: 'PORTAL',
    descricao: 'Fila de picking, coleta nas lojas, conferência, entrega por QR e ocorrências.',
    permissoes: ['pedidos.ver', 'operacao.central', 'retirada.entregar', 'ocorrencias.ver', 'ocorrencias.abrir', 'ocorrencias.resolver', 'catalogo.ver', 'crm.ver', 'atendimento.responder'],
    concede: [],
  },
  {
    id: 'portal-atendimento',
    nome: 'Atendimento do Portal',
    organizacao: 'PORTAL',
    descricao: 'CRM e atendimento: funil, onboarding, chamados e mensagens; consulta pedidos e catálogo; não mexe em dinheiro.',
    permissoes: ['pedidos.ver', 'ocorrencias.ver', 'ocorrencias.abrir', 'catalogo.ver', 'crm.ver', 'crm.editar', 'atendimento.responder', 'mensagens.enviar', 'campanhas.ver'],
    concede: [],
  },
  {
    id: 'portal-marketing',
    nome: 'Marketing do Portal',
    organizacao: 'PORTAL',
    descricao: 'Público, ofertas por quantidade e tempo limitado, campanhas em cascata e captação de leads.',
    permissoes: ['catalogo.ver', 'pedidos.ver', 'crm.ver', 'crm.editar', 'mensagens.enviar', 'campanhas.ver', 'campanhas.gerenciar'],
    concede: [],
  },
  {
    id: 'portal-financeiro',
    nome: 'Financeiro do Portal',
    organizacao: 'PORTAL',
    descricao: 'Painel da plataforma, ledger, conciliação, estornos e o ERP do Portal (faturas, compras, contas e livros do IVA).',
    permissoes: ['pedidos.ver', 'financeiro.plataforma', 'financeiro.loja', 'estorno.executar', 'ocorrencias.ver', 'erp.ver', 'erp.fiscal', 'erp.financeiro'],
    concede: [],
  },
  {
    id: 'portal-almoxarifado',
    nome: 'Almoxarifado do Portal',
    organizacao: 'PORTAL',
    descricao: 'Estoque do Portal: itens, depósitos, entradas, saídas, transferências e inventário.',
    permissoes: ['erp.ver', 'erp.estoque'],
    concede: [],
  },
  {
    id: 'epyx-admin',
    nome: 'Administrador EPYX',
    organizacao: 'EPYX',
    descricao: 'Suporte técnico da plataforma, integrações das lojas, financeiro e usuários da EPYX.',
    permissoes: ['catalogo.ver', 'integracao.gerenciar', 'pedidos.ver', 'ocorrencias.ver', 'financeiro.plataforma', 'financeiro.loja', 'usuarios.ver', 'usuarios.gerenciar'],
    concede: ['epyx-admin', 'epyx-suporte', 'epyx-financeiro'],
  },
  {
    id: 'epyx-suporte',
    nome: 'Suporte EPYX',
    organizacao: 'EPYX',
    descricao: 'Acompanha pedidos, catálogo e integrações para dar suporte; não edita dados de negócio.',
    permissoes: ['catalogo.ver', 'integracao.gerenciar', 'pedidos.ver', 'ocorrencias.ver'],
    concede: [],
  },
  {
    id: 'epyx-financeiro',
    nome: 'Financeiro EPYX',
    organizacao: 'EPYX',
    descricao: 'Split, ledger e conciliação do Pix e do câmbio.',
    permissoes: ['financeiro.plataforma', 'financeiro.loja', 'pedidos.ver'],
    concede: [],
  },
  {
    id: 'loja-gerente',
    nome: 'Gerente da loja',
    organizacao: 'LOJA',
    descricao: 'Tudo da própria loja: catálogo, operação, vendas e a equipe da loja.',
    permissoes: [
      'catalogo.ver',
      'catalogo.editar',
      'catalogo.publicar',
      'catalogo.importar',
      'pedidos.ver',
      'operacao.loja',
      'retirada.entregar',
      'ocorrencias.ver',
      'financeiro.loja',
      'lojas.editar',
      'usuarios.ver',
      'usuarios.gerenciar',
    ],
    concede: ['loja-gerente', 'loja-estoque', 'loja-operador', 'loja-financeiro'],
  },
  {
    id: 'loja-estoque',
    nome: 'Estoque da loja',
    organizacao: 'LOJA',
    descricao: 'Mantém a lista mestre da loja: produtos, preço, estoque e planilha. Não publica no Pick & Go.',
    permissoes: ['catalogo.ver', 'catalogo.editar', 'catalogo.importar'],
    concede: [],
  },
  {
    id: 'loja-operador',
    nome: 'Operador da loja',
    organizacao: 'LOJA',
    descricao: 'Bancada de teste, separação no balcão e entrega por QR.',
    permissoes: ['pedidos.ver', 'operacao.loja', 'retirada.entregar', 'catalogo.ver', 'ocorrencias.ver'],
    concede: [],
  },
  {
    id: 'loja-financeiro',
    nome: 'Financeiro da loja',
    organizacao: 'LOJA',
    descricao: 'Vendas, comissões e repasse da loja.',
    permissoes: ['pedidos.ver', 'financeiro.loja'],
    concede: [],
  },
];

export const perfilPorId = new Map(PERFIS_ACESSO.map((p) => [p.id, p]));

/** Une as permissões dos perfis que o usuário tem (ignora papéis que não são do Pick & Go). */
export function permissoesDe(perfis: string[]): Set<Permissao> {
  const s = new Set<Permissao>();
  for (const id of perfis) for (const p of perfilPorId.get(id)?.permissoes ?? []) s.add(p);
  return s;
}

/** Pode `quem` (com estes perfis) atribuir `perfil` a alguém? */
export function podeConceder(perfisDeQuem: string[], perfil: string): boolean {
  return perfisDeQuem.some((id) => {
    const c = perfilPorId.get(id)?.concede ?? [];
    return c.includes('*') || c.includes(perfil);
  });
}

/**
 * Perfil antigo (token de desenvolvimento) → perfil de acesso equivalente.
 * Mantém os testes e o modo demonstração funcionando sem o Keycloak.
 */
export const PERFIL_LEGADO: Record<string, string> = {
  admin: 'portal-admin',
  central: 'portal-central',
  lojista: 'loja-gerente',
  operador: 'loja-operador',
};
