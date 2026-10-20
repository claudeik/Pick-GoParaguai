import type { Contexto } from '../contexto.ts';
import { MODELOS, type IdModelo } from '../crm/modelos.ts';
import type { Consulta } from '../db.ts';
import type { Canal, Mensageiro } from '../integracoes/mensageria.ts';
import { enfileirarPush } from './push.ts';
import { auditar, type Ator } from './registro.ts';

// CRM e atendimento (seções 3.9 e 3.10).
// - Contato: lead ou cliente; o funil avança com cadastro, compra e retiradas.
// - Mensagem de saída nasce PENDENTE e a rotina envia (outbox): consentimento e
//   limite semanal são checados no envio, porque a pessoa pode ter pedido para parar.
// - Sem consentimento em nenhum canal, a mensagem fica só no app (caixa do cliente).

export type CanalMsg = Canal | 'APP';
export type Finalidade = 'TRANSACIONAL' | 'ATENDIMENTO' | 'MARKETING';
export type TipoTicket = 'DUVIDA' | 'CANCELAMENTO' | 'RETIRADA_ATRASADA' | 'RECLAMACAO' | 'DEFEITO' | 'OUTRO';
export type Prioridade = 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE';
export type Etapa = 'LEAD' | 'CONTATO_FEITO' | 'ONBOARDING' | 'CLIENTE_ATIVO' | 'RECORRENTE' | 'PERDIDO';

export interface ContatoLinha {
  id: string;
  cliente_id: string | null;
  nome: string;
  email: string | null;
  whatsapp: string | null;
  etapa: Etapa;
  optout_canais: string[];
  aceites_canais: string[];
}

const nomeAtor = (a: Ator) => (a === 'sistema' ? 'sistema' : `${a.perfil}:${a.email ?? a.sub}`);

/** +5511999990000: só dígitos com + na frente. */
export const normalizarTelefone = (t: string) => `+${t.replace(/\D/g, '')}`;

const FINALIDADE_CANAL: Record<string, Canal> = {
  MENSAGENS_WHATSAPP: 'WHATSAPP',
  MENSAGENS_SMS: 'SMS',
  MENSAGENS_EMAIL: 'EMAIL',
};

/** Contato do cliente do app; cria se ainda não existir. */
export async function contatoDoCliente(q: Consulta, clienteId: string): Promise<ContatoLinha> {
  const r = await q.query<ContatoLinha>('select * from contato where cliente_id = $1', [clienteId]);
  if (r.rows[0]) return r.rows[0];
  // Lead que virou cliente: mesmo WhatsApp ou e-mail.
  const c = (await q.query<{ nome: string; email: string | null; whatsapp: string }>('select nome, email, whatsapp from cliente where id = $1', [clienteId])).rows[0]!;
  const lead = await q.query<ContatoLinha>(
    `update contato set cliente_id = $1, nome = $2, email = coalesce($3, email), etapa = case when etapa in ('LEAD', 'CONTATO_FEITO') then 'ONBOARDING' else etapa end, atualizado_em = now()
     where cliente_id is null and (regexp_replace(coalesce(whatsapp, ''), '\\D', '', 'g') = regexp_replace($4, '\\D', '', 'g') or (email is not null and lower(email) = lower($3)))
     returning *`,
    [clienteId, c.nome, c.email, c.whatsapp],
  );
  if (lead.rows[0]) return lead.rows[0];
  const n = await q.query<ContatoLinha>(
    `insert into contato (cliente_id, nome, email, whatsapp, origem, etapa) values ($1, $2, $3, $4, 'CADASTRO_APP', 'ONBOARDING') returning *`,
    [clienteId, c.nome, c.email, normalizarTelefone(c.whatsapp)],
  );
  return n.rows[0]!;
}

/** Canais em que a pessoa aceitou receber mensagens e não pediu para parar. */
export async function canaisPermitidos(q: Consulta, c: ContatoLinha): Promise<Set<Canal>> {
  const aceitos = new Set<Canal>();
  if (c.cliente_id) {
    const r = await q.query<{ finalidade: string; concedido: boolean }>(
      `select distinct on (finalidade) finalidade, concedido from consentimento where cliente_id = $1 order by finalidade, criado_em desc`,
      [c.cliente_id],
    );
    for (const x of r.rows) if (x.concedido && FINALIDADE_CANAL[x.finalidade]) aceitos.add(FINALIDADE_CANAL[x.finalidade]!);
  } else for (const x of c.aceites_canais) aceitos.add(x as Canal);
  for (const x of c.optout_canais) aceitos.delete(x as Canal);
  if (!c.whatsapp) (aceitos.delete('WHATSAPP'), aceitos.delete('SMS'));
  if (!c.email) aceitos.delete('EMAIL');
  return aceitos;
}

const destinoDe = (c: ContatoLinha, canal: CanalMsg) => (canal === 'EMAIL' ? c.email : canal === 'APP' ? null : c.whatsapp);

export interface NovaMensagem {
  contatoId: string;
  /** Sem canal: o melhor canal permitido (WhatsApp, e-mail, SMS), senão só no app. */
  canal?: CanalMsg;
  finalidade: Finalidade;
  modelo?: IdModelo;
  variaveis?: Record<string, string>;
  texto?: string;
  assunto?: string;
  pedidoId?: string | null;
  ticketId?: string | null;
  autor: Ator;
}

export async function enfileirarMensagem(q: Consulta, d: NovaMensagem) {
  const c = (await q.query<ContatoLinha>('select * from contato where id = $1', [d.contatoId])).rows[0];
  if (!c) throw new Error('contato inexistente');
  let canal = d.canal;
  if (!canal) {
    const ok = await canaisPermitidos(q, c);
    canal = (['WHATSAPP', 'EMAIL', 'SMS'] as Canal[]).find((x) => ok.has(x)) ?? 'APP';
  }
  const m = d.modelo ? MODELOS[d.modelo] : undefined;
  const texto = m ? m.texto(d.variaveis ?? {}) : (d.texto ?? '');
  const app = canal === 'APP';
  const r = await q.query<{ id: string; estado: string; canal: string }>(
    `insert into mensagem (contato_id, ticket_id, pedido_id, direcao, canal, finalidade, destino, assunto, conteudo, modelo, estado, autor, proxima_tentativa_em, provedor)
     values ($1, $2, $3, 'SAIDA', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id, estado, canal`,
    [
      c.id,
      d.ticketId ?? null,
      d.pedidoId ?? null,
      canal,
      d.finalidade,
      destinoDe(c, canal),
      d.assunto ?? m?.assunto ?? null,
      texto,
      d.modelo ?? null,
      // No app a mensagem já está na caixa do cliente.
      app ? 'ENTREGUE' : 'PENDENTE',
      nomeAtor(d.autor),
      // Pronta para envio já; só ganha horário de nova tentativa depois de uma falha.
      null,
      app ? 'app' : null,
    ],
  );
  await q.query('update contato set ultimo_contato_em = now(), atualizado_em = now() where id = $1', [c.id]);
  // Aviso do pedido também vai por push para os aparelhos com o app (o código de login não).
  if (c.cliente_id && d.finalidade === 'TRANSACIONAL' && d.modelo !== 'codigo_acesso') {
    await enfileirarPush(q, { clienteId: c.cliente_id, titulo: d.assunto ?? m?.assunto ?? 'Pick & Go', corpo: texto, pedidoId: d.pedidoId ?? null });
  }
  return r.rows[0]!;
}

const PRAZO_HORAS: Record<Prioridade, number> = { URGENTE: 1, ALTA: 4, NORMAL: 24, BAIXA: 72 };

export async function abrirTicket(
  q: Consulta,
  d: { contatoId: string; pedidoId?: string | null; tipo: TipoTicket; prioridade?: Prioridade; canal: string; assunto: string; automatico?: boolean; autor: Ator },
) {
  const prioridade = d.prioridade ?? 'NORMAL';
  const valores = [d.contatoId, d.pedidoId ?? null, d.tipo, prioridade, d.canal, d.assunto.slice(0, 200), !!d.automatico, PRAZO_HORAS[prioridade]];
  const sql = `insert into ticket (contato_id, pedido_id, tipo, prioridade, canal, assunto, automatico, responder_ate)
     values ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(hours => $8::int))`;
  // Chamado automático: um por pedido e tipo; se já existe, só sobe a prioridade.
  const r = d.automatico
    ? await q.query<{ id: string; numero: number }>(
        `${sql} on conflict (pedido_id, tipo) where automatico and estado <> 'RESOLVIDO'
         do update set prioridade = case when excluded.prioridade in ('ALTA', 'URGENTE') then excluded.prioridade else ticket.prioridade end,
           responder_ate = least(ticket.responder_ate, excluded.responder_ate), atualizado_em = now()
         returning id, numero`,
        valores,
      )
    : await q.query<{ id: string; numero: number }>(`${sql} returning id, numero`, valores);
  const t = r.rows[0]!;
  await auditar(q, d.autor, 'ticket.abrir', 'ticket', t.id, { tipo: d.tipo, prioridade, pedido_id: d.pedidoId ?? null });
  return t;
}

interface DadosPedido {
  id: string;
  codigo: string;
  cliente_id: string;
  modo: string;
  total_brl_centavos: number;
  pronto_em: Date | null;
  local: string;
  horario: string;
}

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Asuncion', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

async function dadosPedido(q: Consulta, id: string): Promise<DadosPedido | null> {
  const p = (
    await q.query<Omit<DadosPedido, 'local' | 'horario'>>('select id, codigo, cliente_id, modo, total_brl_centavos, pronto_em from pedido where id = $1', [id])
  ).rows[0];
  if (!p) return null;
  const l = (
    await q.query<{ nome: string; ponto_retirada_descricao: string | null; abre: string; fecha: string }>(
      `select l.nome, l.ponto_retirada_descricao, to_char(l.horario_abertura, 'HH24:MI') as abre, to_char(l.horario_fechamento, 'HH24:MI') as fecha
       from pedido_item i join loja l on l.id = i.loja_id where i.pedido_id = $1 order by l.nome limit 1`,
      [id],
    )
  ).rows[0];
  const local = p.modo === 'RETIRADA_LOJA' && l ? `${l.nome} (${l.ponto_retirada_descricao ?? 'balcão da loja'})` : 'Central do Portal Paraguai';
  return { ...p, local, horario: l ? `${l.abre} às ${l.fecha}` : '08:00 às 18:00' };
}

/** Jornadas automáticas por evento do pedido (RF-34). Roda na transação que publica o evento. */
export async function processarEventoCrm(q: Consulta, ctx: Pick<Contexto, 'config' | 'agora'>, e: { tipo: string; payload: Record<string, unknown> }) {
  // Conta excluída: nada de contato nem mensagem (o contato seria recriado com os dados anônimos).
  const excluido = async (clienteId: string) =>
    !!(await q.query('select 1 from cliente where id = $1 and excluido_em is not null', [clienteId])).rows[0];
  if (e.tipo === 'ClienteCadastrado') {
    if (await excluido(String(e.payload.cliente_id))) return;
    const c = await contatoDoCliente(q, String(e.payload.cliente_id));
    await enfileirarMensagem(q, { contatoId: c.id, finalidade: 'TRANSACIONAL', modelo: 'boas_vindas', variaveis: { nome: c.nome.split(' ')[0]! }, autor: 'sistema' });
    return;
  }
  const pedidoId = e.payload.pedido_id as string | undefined;
  if (!pedidoId) return;
  const p = await dadosPedido(q, pedidoId);
  if (!p || (await excluido(p.cliente_id))) return;
  const c = await contatoDoCliente(q, p.cliente_id);
  const msg = (modelo: IdModelo, variaveis: Record<string, string> = {}) =>
    enfileirarMensagem(q, { contatoId: c.id, finalidade: 'TRANSACIONAL', modelo, variaveis: { codigo: p.codigo, ...variaveis }, pedidoId, autor: 'sistema' });

  switch (e.tipo) {
    case 'PagamentoConfirmado':
      await msg('pagamento_confirmado', { total: brl(p.total_brl_centavos) });
      await q.query(`update contato set etapa = 'ONBOARDING', atualizado_em = now() where id = $1 and etapa in ('LEAD', 'CONTATO_FEITO')`, [c.id]);
      break;
    case 'PedidoPronto':
      await msg('pedido_pronto', { local: p.local, horario: p.horario });
      break;
    case 'RetiradaConfirmada': {
      const n = await q.query<{ n: number }>(`select count(*)::int as n from pedido where cliente_id = $1 and estado in ('RETIRADO', 'ENTREGUE')`, [p.cliente_id]);
      await q.query(`update contato set etapa = $2, atualizado_em = now() where id = $1`, [c.id, n.rows[0]!.n >= 2 ? 'RECORRENTE' : 'CLIENTE_ATIVO']);
      await q.query(
        `update ticket set estado = 'RESOLVIDO', resolvido_em = now(), atualizado_em = now()
         where pedido_id = $1 and tipo = 'RETIRADA_ATRASADA' and automatico and estado <> 'RESOLVIDO'`,
        [pedidoId],
      );
      break;
    }
    case 'PedidoNaoRetirado': {
      await abrirTicket(q, { contatoId: c.id, pedidoId, tipo: 'RETIRADA_ATRASADA', prioridade: 'ALTA', canal: 'INTERNO', assunto: `Pedido ${p.codigo} não retirado no prazo`, automatico: true, autor: 'sistema' });
      await msg('nao_retirado');
      break;
    }
    case 'PedidoExpirado':
      await msg('pix_expirado');
      break;
    case 'PedidoCancelado':
      await msg('pedido_cancelado');
      break;
    case 'PedidoReembolsado':
      await msg('pedido_reembolsado');
      break;
    case 'TicketEncaminhadoLoja':
      await abrirTicket(q, { contatoId: c.id, pedidoId, tipo: 'DEFEITO', canal: 'APP', assunto: `Defeito depois da retirada · ${p.codigo} (encaminhado à loja)`, automatico: true, autor: 'sistema' });
      break;
  }
}

/** Pronto há mais de N horas e não retirado: lembra o cliente e abre chamado para o atendimento acompanhar. */
export async function lembrarRetiradas(ctx: Contexto): Promise<number> {
  const limite = new Date(ctx.agora().getTime() - ctx.config.lembreteRetiradaHoras * 3_600_000);
  const r = await ctx.db.query<{ id: string }>(
    `select id from pedido where estado = 'PRONTO_RETIRADA' and pronto_em < $1 and lembrete_retirada_em is null limit 100`,
    [limite],
  );
  for (const { id } of r.rows) {
    await ctx.db.tx(async (q) => {
      const marcado = await q.query(`update pedido set lembrete_retirada_em = now() where id = $1 and lembrete_retirada_em is null returning id`, [id]);
      if (!marcado.rows[0]) return;
      const p = (await dadosPedido(q, id))!;
      const c = await contatoDoCliente(q, p.cliente_id);
      const prazo = new Date((p.pronto_em ?? ctx.agora()).getTime() + ctx.config.prazoRetiradaHoras * 3_600_000);
      await enfileirarMensagem(q, {
        contatoId: c.id,
        finalidade: 'TRANSACIONAL',
        modelo: 'lembrete_retirada',
        variaveis: { codigo: p.codigo, local: p.local, desde: dataHora(p.pronto_em ?? ctx.agora()), prazo: dataHora(prazo) },
        pedidoId: id,
        autor: 'sistema',
      });
      await abrirTicket(q, { contatoId: c.id, pedidoId: id, tipo: 'RETIRADA_ATRASADA', canal: 'INTERNO', assunto: `Retirada atrasada · ${p.codigo}`, automatico: true, autor: 'sistema' });
    });
  }
  return r.rows.length;
}

interface PendenteLinha {
  id: string;
  contato_id: string;
  canal: Canal;
  finalidade: Finalidade;
  destino: string | null;
  assunto: string | null;
  conteudo: string;
  modelo: string | null;
  tentativas: number;
  campanha_id: string | null;
}

const MAX_TENTATIVAS = 5;

/**
 * Envia as mensagens pendentes. Reserva cada mensagem numa transação curta e
 * envia fora dela (a rede não segura o banco). Entrega pelo menos uma vez:
 * uma queda entre o envio e a gravação pode repetir a mensagem.
 */
export async function despacharMensagens(ctx: Contexto, mensageiro: Mensageiro): Promise<{ enviadas: number; bloqueadas: number; falhas: number }> {
  const pend = await ctx.db.query<PendenteLinha>(
    `select id, contato_id, canal, finalidade, destino, assunto, conteudo, modelo, tentativas, campanha_id from mensagem
     where estado = 'PENDENTE' and (proxima_tentativa_em is null or proxima_tentativa_em <= $1) order by criado_em limit 50`,
    [ctx.agora()],
  );
  const total = { enviadas: 0, bloqueadas: 0, falhas: 0 };
  for (const m of pend.rows) {
    const decisao = await ctx.db.tx(async (q) => {
      const ainda = await q.query<{ estado: string }>('select estado from mensagem where id = $1 for update', [m.id]);
      if (ainda.rows[0]?.estado !== 'PENDENTE') return 'pular' as const;
      const c = (await q.query<ContatoLinha>('select * from contato where id = $1', [m.contato_id])).rows[0]!;
      const permitidos = await canaisPermitidos(q, c);
      // Resposta de atendimento vale dentro da conversa que o cliente abriu no canal (24 h).
      const conversa =
        m.finalidade === 'ATENDIMENTO' &&
        !!(
          await q.query(`select 1 from mensagem where contato_id = $1 and canal = $2 and direcao = 'ENTRADA' and criado_em > $3 limit 1`, [
            c.id,
            m.canal,
            new Date(ctx.agora().getTime() - 24 * 3_600_000),
          ])
        ).rows[0];
      // Confirmação do PARAR e código de login: a própria pessoa pediu, valem sem aceite de mensagens.
      const pedidoPelaPessoa = m.modelo === 'optout' || m.modelo === 'codigo_acesso';
      let motivo: string | null = null;
      if (!m.destino) motivo = 'contato sem endereço para este canal';
      else if (!permitidos.has(m.canal) && !conversa && !pedidoPelaPessoa) {
        motivo = c.optout_canais.includes(m.canal) ? 'pessoa pediu para parar neste canal' : 'sem consentimento para este canal';
      } else if (m.finalidade === 'MARKETING') {
        // Cada campanha conta uma vez, mesmo passando por vários canais da cascata.
        const n = await q.query<{ n: number }>(
          `select count(distinct coalesce(campanha_id::text, id::text))::int as n from mensagem
           where contato_id = $1 and finalidade = 'MARKETING' and direcao = 'SAIDA' and estado in ('ENVIADA', 'ENTREGUE', 'LIDA')
             and criado_em > $2 and ($3::uuid is null or campanha_id is distinct from $3::uuid)`,
          [c.id, new Date(ctx.agora().getTime() - 7 * 24 * 3_600_000), m.campanha_id],
        );
        if (n.rows[0]!.n >= ctx.config.limiteMarketingSemana) motivo = `limite de ${ctx.config.limiteMarketingSemana} mensagens de oferta por semana`;
      }
      if (motivo) {
        await q.query(`update mensagem set estado = 'BLOQUEADA', motivo = $2, atualizado_em = now() where id = $1`, [m.id, motivo]);
        return 'bloqueada' as const;
      }
      const espera = 2 ** m.tentativas * 60_000;
      await q.query(`update mensagem set tentativas = tentativas + 1, proxima_tentativa_em = $2, atualizado_em = now() where id = $1`, [
        m.id,
        new Date(ctx.agora().getTime() + espera),
      ]);
      return 'enviar' as const;
    });
    if (decisao === 'bloqueada') total.bloqueadas++;
    if (decisao !== 'enviar') continue;

    const r = await mensageiro.enviar({
      canal: m.canal,
      destino: m.destino!,
      assunto: m.assunto ?? undefined,
      texto: m.conteudo,
      modelo: m.modelo ?? undefined,
    });
    if (r.ok) {
      await ctx.db.query(`update mensagem set estado = $2, provedor = $3, provedor_id = $4, motivo = null, atualizado_em = now() where id = $1`, [
        m.id,
        r.estado,
        mensageiro.tipo,
        r.provedorId,
      ]);
      total.enviadas++;
    } else {
      const fim = r.definitivo || m.tentativas + 1 >= MAX_TENTATIVAS;
      await ctx.db.query(`update mensagem set estado = $2, motivo = $3, atualizado_em = now() where id = $1`, [m.id, fim ? 'FALHOU' : 'PENDENTE', r.erro]);
      total.falhas++;
    }
  }
  return total;
}

const PALAVRAS_PARAR = new Set(['PARAR', 'PARE', 'STOP', 'SAIR', 'CANCELAR', 'DESCADASTRAR', 'UNSUBSCRIBE']);

/** Mensagem recebida (WhatsApp, SMS ou app): resposta PARAR desliga o canal; o resto vira conversa num chamado. */
export async function receberMensagem(
  q: Consulta,
  d: { canal: CanalMsg; de: string; texto: string; provedorId?: string; nome?: string; contatoId?: string; pedidoId?: string | null; tipo?: TipoTicket },
) {
  let c: ContatoLinha | undefined;
  if (d.contatoId) c = (await q.query<ContatoLinha>('select * from contato where id = $1', [d.contatoId])).rows[0];
  else if (d.canal === 'EMAIL') c = (await q.query<ContatoLinha>('select * from contato where lower(email) = lower($1) order by criado_em limit 1', [d.de])).rows[0];
  else {
    c = (
      await q.query<ContatoLinha>(`select * from contato where regexp_replace(coalesce(whatsapp, ''), '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g') order by cliente_id nulls last, criado_em limit 1`, [
        d.de,
      ])
    ).rows[0];
  }
  if (!c) {
    c = (
      await q.query<ContatoLinha>(`insert into contato (nome, whatsapp, email, origem, etapa) values ($1, $2, $3, 'MENSAGEM_RECEBIDA', 'LEAD') returning *`, [
        d.nome ?? d.de,
        d.canal === 'EMAIL' ? null : normalizarTelefone(d.de),
        d.canal === 'EMAIL' ? d.de : null,
      ])
    ).rows[0]!;
  }

  const entrada = await q.query<{ id: string }>(
    `insert into mensagem (contato_id, pedido_id, direcao, canal, finalidade, destino, conteudo, estado, provedor_id, autor)
     values ($1, $2, 'ENTRADA', $3, 'ATENDIMENTO', $4, $5, 'RECEBIDA', $6, $7) on conflict (provedor_id) do nothing returning id`,
    [c.id, d.pedidoId ?? null, d.canal, d.de, d.texto, d.provedorId ?? null, `contato:${c.id}`],
  );
  if (!entrada.rows[0]) return { contatoId: c.id, duplicada: true as const };
  await q.query('update contato set ultimo_contato_em = now(), atualizado_em = now() where id = $1', [c.id]);

  if (d.canal !== 'APP' && PALAVRAS_PARAR.has(d.texto.trim().toUpperCase())) {
    await q.query(`update contato set optout_canais = array(select distinct unnest(optout_canais || $2::text[])) where id = $1`, [c.id, [d.canal]]);
    const finalidade = Object.entries(FINALIDADE_CANAL).find(([, v]) => v === d.canal)?.[0];
    if (c.cliente_id && finalidade) {
      await q.query(`insert into consentimento (cliente_id, finalidade, concedido, versao_texto) values ($1, $2, false, 'resposta-parar')`, [c.cliente_id, finalidade]);
    }
    await enfileirarMensagem(q, { contatoId: c.id, canal: d.canal, finalidade: 'TRANSACIONAL', modelo: 'optout', autor: 'sistema' });
    return { contatoId: c.id, optout: true as const };
  }

  let ticket = (
    await q.query<{ id: string; numero: number; estado: string }>(
      `select id, numero, estado from ticket where contato_id = $1 and estado <> 'RESOLVIDO' and ($2::uuid is null or pedido_id is null or pedido_id = $2) order by atualizado_em desc limit 1`,
      [c.id, d.pedidoId ?? null],
    )
  ).rows[0];
  let novo = false;
  if (ticket) {
    await q.query(`update ticket set estado = case when estado = 'AGUARDANDO_CLIENTE' then 'EM_ATENDIMENTO' else estado end, atualizado_em = now() where id = $1`, [ticket.id]);
  } else {
    const t = await abrirTicket(q, {
      contatoId: c.id,
      pedidoId: d.pedidoId,
      tipo: d.tipo ?? 'DUVIDA',
      prioridade: d.tipo === 'CANCELAMENTO' ? 'ALTA' : 'NORMAL',
      canal: d.canal,
      assunto: d.texto.replace(/\s+/g, ' ').slice(0, 120),
      autor: 'sistema',
    });
    ticket = { ...t, estado: 'ABERTO' };
    novo = true;
  }
  await q.query('update mensagem set ticket_id = $2 where id = $1', [entrada.rows[0].id, ticket.id]);
  if (novo) {
    await enfileirarMensagem(q, { contatoId: c.id, canal: d.canal, finalidade: 'ATENDIMENTO', modelo: 'chamado_aberto', variaveis: { numero: String(ticket.numero) }, ticketId: ticket.id, autor: 'sistema' });
  }
  return { contatoId: c.id, ticketId: ticket.id, novo };
}
