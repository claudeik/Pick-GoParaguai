import { z } from 'zod';
import { ator, exigir, exigirPermissao } from '../auth.ts';
import { validar, type Modulo } from '../contexto.ts';
import { ErroHttp, invalido, naoEncontrado } from '../erros.ts';
import {
  abrirTicket,
  canaisPermitidos,
  contatoDoCliente,
  enfileirarMensagem,
  normalizarTelefone,
  receberMensagem,
  type ContatoLinha,
} from '../servicos/crm.ts';
import { auditar } from '../servicos/registro.ts';

// CRM e atendimento (T17, T18 · RF-32 a RF-35): funil de leads e clientes,
// onboarding, ficha do cliente, chamados e mensagens; webhooks da Twilio.

const ETAPAS = ['LEAD', 'CONTATO_FEITO', 'ONBOARDING', 'CLIENTE_ATIVO', 'RECORRENTE', 'PERDIDO'] as const;
const TIPOS_TICKET = ['DUVIDA', 'CANCELAMENTO', 'RETIRADA_ATRASADA', 'RECLAMACAO', 'DEFEITO', 'OUTRO'] as const;
const ESTADOS_TICKET = ['ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO_CLIENTE', 'RESOLVIDO'] as const;
const PRIORIDADES = ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] as const;
const CANAIS = ['WHATSAPP', 'SMS', 'EMAIL', 'APP'] as const;

const telefone = z.string().trim().regex(/^\+?[\d\s()-]{10,20}$/, 'telefone com DDI e DDD');

const novoContato = z
  .object({
    nome: z.string().trim().min(2).max(120),
    email: z.email().max(200).optional(),
    whatsapp: telefone.optional(),
    etapa: z.enum(ETAPAS).default('LEAD'),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    notas: z.string().max(4000).optional(),
  })
  .refine((c) => c.email || c.whatsapp, 'informe e-mail ou WhatsApp');

const alteracaoContato = z.object({
  etapa: z.enum(ETAPAS).optional(),
  responsavel: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  notas: z.string().max(4000).nullable().optional(),
});

/** Formulário público de captação (RF-41): aceite explícito por canal, com a origem da campanha. */
const lead = z.object({
  nome: z.string().trim().min(2).max(120),
  whatsapp: telefone.optional(),
  email: z.email().max(200).optional(),
  interesse: z.string().max(200).optional(),
  aceite_whatsapp: z.boolean().default(false),
  aceite_sms: z.boolean().default(false),
  aceite_email: z.boolean().default(false),
  origem: z
    .object({ utm_source: z.string().max(80).optional(), utm_campaign: z.string().max(80).optional(), video: z.string().max(80).optional(), cupom: z.string().max(40).optional() })
    .optional(),
  // Armadilha para robôs: campo escondido que pessoa não preenche.
  site: z.string().max(0).optional(),
});

const novoTicket = z.object({
  contato_id: z.uuid(),
  pedido_id: z.uuid().optional(),
  tipo: z.enum(TIPOS_TICKET),
  prioridade: z.enum(PRIORIDADES).default('NORMAL'),
  assunto: z.string().trim().min(3).max(200),
});

const alteracaoTicket = z.object({
  estado: z.enum(ESTADOS_TICKET).optional(),
  prioridade: z.enum(PRIORIDADES).optional(),
  responsavel: z.string().max(200).nullable().optional(),
  tipo: z.enum(TIPOS_TICKET).optional(),
});

const resposta = z.object({
  canal: z.enum(CANAIS),
  texto: z.string().trim().min(1).max(1600),
  /** Depois de responder, o chamado espera o cliente. */
  aguardar_cliente: z.boolean().default(true),
});

const pedidoAtendimento = z.object({
  pedido_id: z.uuid().optional(),
  tipo: z.enum(['DUVIDA', 'CANCELAMENTO', 'RECLAMACAO']),
  texto: z.string().trim().min(3).max(1600),
});

// Limite simples do formulário público: 20 envios por IP a cada 10 minutos.
const envios = new Map<string, number[]>();
function limitar(ip: string) {
  const agora = Date.now();
  const lista = (envios.get(ip) ?? []).filter((t) => agora - t < 600_000);
  if (lista.length >= 20) throw new ErroHttp(429, 'muitas-tentativas', 'muitos envios; tente de novo em alguns minutos');
  lista.push(agora);
  envios.set(ip, lista);
}

export const rotasCrm: Modulo = (app, ctx) => {
  const { db, config, mensageiro } = ctx;

  // --- Funil e contatos ---

  app.get('/v1/crm/funil', async (req) => {
    exigirPermissao(req, 'crm.ver');
    const r = await db.query<{ etapa: string; n: number }>('select etapa, count(*)::int as n from contato group by etapa');
    const t = await db.query<{ abertos: number; atrasados: number }>(
      `select count(*) filter (where estado <> 'RESOLVIDO')::int as abertos,
              count(*) filter (where estado <> 'RESOLVIDO' and responder_ate < now())::int as atrasados from ticket`,
    );
    return { por_etapa: Object.fromEntries(r.rows.map((x) => [x.etapa, x.n])), tickets: t.rows[0] };
  });

  app.get('/v1/crm/contatos', async (req) => {
    exigirPermissao(req, 'crm.ver');
    const f = validar(z.object({ etapa: z.enum(ETAPAS).optional(), busca: z.string().max(80).optional(), limite: z.coerce.number().int().min(1).max(1000).default(500) }), req.query);
    const cond: string[] = [];
    const params: unknown[] = [];
    if (f.etapa) (params.push(f.etapa), cond.push(`c.etapa = $${params.length}`));
    if (f.busca) (params.push(`%${f.busca}%`), cond.push(`(c.nome ilike $${params.length} or c.email ilike $${params.length} or c.whatsapp ilike $${params.length})`));
    params.push(f.limite);
    const r = await db.query(
      `select c.id, c.cliente_id, c.nome, c.email, c.whatsapp, c.origem, c.etapa, c.responsavel, c.tags, c.optout_canais,
         c.ultimo_contato_em, c.criado_em,
         coalesce(p.pedidos, 0)::int as pedidos, coalesce(p.gasto, 0)::bigint as gasto_brl_centavos, p.ultima_compra,
         coalesce(t.abertos, 0)::int as tickets_abertos
       from contato c
       left join (select cliente_id, count(*) as pedidos, sum(total_brl_centavos) as gasto, max(criado_em) as ultima_compra
                  from pedido where estado not in ('CRIADO', 'AGUARDANDO_PIX', 'EXPIRADO', 'CANCELADO', 'REEMBOLSADO') group by cliente_id) p on p.cliente_id = c.cliente_id
       left join (select contato_id, count(*) as abertos from ticket where estado <> 'RESOLVIDO' group by contato_id) t on t.contato_id = c.id
       ${cond.length ? 'where ' + cond.join(' and ') : ''}
       order by c.atualizado_em desc limit $${params.length}`,
      params,
    );
    return { contatos: r.rows };
  });

  app.get<{ Params: { id: string } }>('/v1/crm/contatos/:id', async (req) => {
    exigirPermissao(req, 'crm.ver');
    const id = z.uuid().parse(req.params.id);
    const c = (await db.query<ContatoLinha & Record<string, unknown>>('select * from contato where id = $1', [id])).rows[0];
    if (!c) throw naoEncontrado('contato');
    const pedidos = c.cliente_id
      ? (
          await db.query<{ id: string; codigo: string; estado: string; modo: string; total_brl_centavos: number; criado_em: string }>(
            'select id, codigo, estado, modo, total_brl_centavos, criado_em from pedido where cliente_id = $1 order by criado_em desc limit 50',
            [c.cliente_id],
          )
        ).rows
      : [];
    const mensagens = (await db.query('select * from mensagem where contato_id = $1 order by criado_em desc limit 100', [id])).rows;
    const tickets = (await db.query('select * from ticket where contato_id = $1 order by atualizado_em desc limit 50', [id])).rows;
    const canais = [...(await canaisPermitidos(db, c))];
    const pagos = pedidos.filter((p) => !['CRIADO', 'AGUARDANDO_PIX', 'EXPIRADO', 'CANCELADO'].includes(p.estado));
    const retirados = pedidos.filter((p) => p.estado === 'RETIRADO' || p.estado === 'ENTREGUE');
    // Onboarding calculado dos dados reais, não marcado à mão.
    const onboarding = [
      { passo: 'Cadastro no app', feito: !!c.cliente_id },
      { passo: 'Aceite de mensagens em algum canal', feito: canais.length > 0 },
      { passo: 'Primeiro pedido pago', feito: pagos.length > 0 },
      { passo: 'Primeira retirada', feito: retirados.length > 0 },
      { passo: 'Segunda compra', feito: retirados.length > 1 },
    ];
    return { contato: c, canais_permitidos: canais, onboarding, pedidos, mensagens, tickets };
  });

  app.post('/v1/crm/contatos', async (req, rep) => {
    const u = exigirPermissao(req, 'crm.editar');
    const d = validar(novoContato, req.body);
    const r = await db.tx(async (q) => {
      const c = await q.query<{ id: string }>(
        `insert into contato (nome, email, whatsapp, origem, etapa, tags, notas, responsavel) values ($1, $2, $3, 'MANUAL', $4, $5, $6, $7) returning *`,
        [d.nome, d.email ?? null, d.whatsapp ? normalizarTelefone(d.whatsapp) : null, d.etapa, d.tags, d.notas ?? null, ator(u)],
      );
      await auditar(q, u, 'contato.criar', 'contato', c.rows[0]!.id, { etapa: d.etapa });
      return c.rows[0];
    });
    return rep.code(201).send(r);
  });

  app.patch<{ Params: { id: string } }>('/v1/crm/contatos/:id', async (req) => {
    const u = exigirPermissao(req, 'crm.editar');
    const d = validar(alteracaoContato, req.body);
    const id = z.uuid().parse(req.params.id);
    const campos = Object.entries(d).filter(([, v]) => v !== undefined);
    if (!campos.length) throw invalido('nada para alterar');
    return db.tx(async (q) => {
      const r = await q.query(
        `update contato set ${campos.map(([k], i) => `${k} = $${i + 2}`).join(', ')}, atualizado_em = now() where id = $1 returning *`,
        [id, ...campos.map(([, v]) => v)],
      );
      if (!r.rows[0]) throw naoEncontrado('contato');
      await auditar(q, u, 'contato.alterar', 'contato', id, d);
      return r.rows[0];
    });
  });

  // Captação de leads (RF-41): página pública do vídeo ou da campanha.
  app.post('/v1/leads', async (req, rep) => {
    limitar(req.ip);
    const d = validar(lead, req.body);
    if (d.site) return rep.code(202).send({ ok: true }); // robô: finge sucesso
    if (!d.whatsapp && !d.email) throw invalido('informe WhatsApp ou e-mail');
    const aceites = [d.aceite_whatsapp && 'WHATSAPP', d.aceite_sms && 'SMS', d.aceite_email && 'EMAIL'].filter(Boolean) as string[];
    await db.tx(async (q) => {
      const existente = (
        await q.query<{ id: string }>(
          `select id from contato where ($1::text is not null and regexp_replace(coalesce(whatsapp, ''), '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g'))
             or ($2::text is not null and lower(email) = lower($2)) limit 1`,
          [d.whatsapp ?? null, d.email ?? null],
        )
      ).rows[0];
      if (existente) {
        await q.query(
          `update contato set aceites_canais = array(select distinct unnest(aceites_canais || $2::text[])),
             optout_canais = array(select unnest(optout_canais) except select unnest($2::text[])),
             tags = array(select distinct unnest(tags || $3::text[])), ultimo_contato_em = now(), atualizado_em = now() where id = $1`,
          [existente.id, aceites, d.interesse ? [`interesse:${d.interesse}`] : []],
        );
        return;
      }
      await q.query(
        `insert into contato (nome, email, whatsapp, origem, etapa, aceites_canais, tags, origem_detalhe) values ($1, $2, $3, 'FORMULARIO', 'LEAD', $4, $5, $6)`,
        [d.nome, d.email ?? null, d.whatsapp ? normalizarTelefone(d.whatsapp) : null, aceites, d.interesse ? [`interesse:${d.interesse}`] : [], d.origem ? JSON.stringify(d.origem) : null],
      );
    });
    return rep.code(201).send({ ok: true });
  });

  // --- Chamados ---

  app.get('/v1/crm/tickets', async (req) => {
    exigirPermissao(req, 'crm.ver');
    const f = validar(z.object({ estado: z.enum([...ESTADOS_TICKET, 'ABERTOS']).default('ABERTOS'), tipo: z.enum(TIPOS_TICKET).optional() }), req.query);
    const cond = [f.estado === 'ABERTOS' ? `t.estado <> 'RESOLVIDO'` : `t.estado = $1`];
    const params: unknown[] = f.estado === 'ABERTOS' ? [] : [f.estado];
    if (f.tipo) (params.push(f.tipo), cond.push(`t.tipo = $${params.length}`));
    const r = await db.query(
      `select t.*, c.nome as contato_nome, c.whatsapp as contato_whatsapp, c.email as contato_email, p.codigo as pedido_codigo, p.estado as pedido_estado,
         (select conteudo from mensagem m where m.ticket_id = t.id order by criado_em desc limit 1) as ultima_mensagem,
         (t.responder_ate < now() and t.estado <> 'RESOLVIDO') as atrasado
       from ticket t join contato c on c.id = t.contato_id left join pedido p on p.id = t.pedido_id
       where ${cond.join(' and ')}
       order by case t.prioridade when 'URGENTE' then 0 when 'ALTA' then 1 when 'NORMAL' then 2 else 3 end, t.responder_ate nulls last limit 300`,
      params,
    );
    return { tickets: r.rows };
  });

  app.get<{ Params: { id: string } }>('/v1/crm/tickets/:id', async (req) => {
    exigirPermissao(req, 'crm.ver');
    const id = z.uuid().parse(req.params.id);
    const t = (
      await db.query(
        `select t.*, c.nome as contato_nome, c.whatsapp as contato_whatsapp, c.email as contato_email, c.cliente_id, p.codigo as pedido_codigo, p.estado as pedido_estado
         from ticket t join contato c on c.id = t.contato_id left join pedido p on p.id = t.pedido_id where t.id = $1`,
        [id],
      )
    ).rows[0] as (Record<string, unknown> & { contato_id: string }) | undefined;
    if (!t) throw naoEncontrado('chamado');
    const mensagens = (await db.query('select * from mensagem where ticket_id = $1 or (contato_id = $2 and ticket_id is null and criado_em > now() - interval \'7 days\') order by criado_em', [id, t.contato_id])).rows;
    const contato = (await db.query<ContatoLinha>('select * from contato where id = $1', [t.contato_id])).rows[0]!;
    return { ticket: t, mensagens, canais_permitidos: [...(await canaisPermitidos(db, contato))] };
  });

  app.post('/v1/crm/tickets', async (req, rep) => {
    const u = exigirPermissao(req, 'crm.editar');
    const d = validar(novoTicket, req.body);
    const t = await db.tx((q) => abrirTicket(q, { contatoId: d.contato_id, pedidoId: d.pedido_id, tipo: d.tipo, prioridade: d.prioridade, canal: 'INTERNO', assunto: d.assunto, autor: u }));
    return rep.code(201).send(t);
  });

  app.patch<{ Params: { id: string } }>('/v1/crm/tickets/:id', async (req) => {
    const u = exigirPermissao(req, 'crm.editar', 'atendimento.responder');
    const d = validar(alteracaoTicket, req.body);
    const id = z.uuid().parse(req.params.id);
    return db.tx(async (q) => {
      const r = await q.query(
        `update ticket set estado = coalesce($2, estado), prioridade = coalesce($3, prioridade), tipo = coalesce($5, tipo),
           responsavel = case when $4::boolean then $6 else responsavel end,
           resolvido_em = case when $2 = 'RESOLVIDO' then now() when $2 is not null then null else resolvido_em end, atualizado_em = now()
         where id = $1 returning *`,
        [id, d.estado ?? null, d.prioridade ?? null, d.responsavel !== undefined, d.tipo ?? null, d.responsavel ?? null],
      );
      if (!r.rows[0]) throw naoEncontrado('chamado');
      await auditar(q, u, 'ticket.alterar', 'ticket', id, d);
      return r.rows[0];
    });
  });

  // RF-33: o atendente responde pelo canal escolhido; a mensagem sai pela fila com as regras de consentimento.
  app.post<{ Params: { id: string } }>('/v1/crm/tickets/:id/mensagens', async (req, rep) => {
    const u = exigirPermissao(req, 'atendimento.responder');
    const d = validar(resposta, req.body);
    const id = z.uuid().parse(req.params.id);
    const m = await db.tx(async (q) => {
      const t = (await q.query<{ contato_id: string; pedido_id: string | null; estado: string }>('select contato_id, pedido_id, estado from ticket where id = $1 for update', [id])).rows[0];
      if (!t) throw naoEncontrado('chamado');
      const m = await enfileirarMensagem(q, { contatoId: t.contato_id, canal: d.canal, finalidade: 'ATENDIMENTO', texto: d.texto, ticketId: id, pedidoId: t.pedido_id, autor: u });
      await q.query(
        `update ticket set estado = $2, responsavel = coalesce(responsavel, $3), atualizado_em = now() where id = $1`,
        [id, d.aguardar_cliente ? 'AGUARDANDO_CLIENTE' : 'EM_ATENDIMENTO', ator(u)],
      );
      await auditar(q, u, 'ticket.responder', 'ticket', id, { canal: d.canal });
      return m;
    });
    return rep.code(201).send(m);
  });

  // Mensagem avulsa para um contato (ex.: avisar sobre o pedido); respeita consentimento.
  app.post<{ Params: { id: string } }>('/v1/crm/contatos/:id/mensagens', async (req, rep) => {
    const u = exigirPermissao(req, 'mensagens.enviar');
    const d = validar(resposta.omit({ aguardar_cliente: true }), req.body);
    const id = z.uuid().parse(req.params.id);
    const m = await db.tx(async (q) => {
      const c = await q.query('select 1 from contato where id = $1', [id]);
      if (!c.rows[0]) throw naoEncontrado('contato');
      const m = await enfileirarMensagem(q, { contatoId: id, canal: d.canal, finalidade: 'ATENDIMENTO', texto: d.texto, autor: u });
      await auditar(q, u, 'mensagem.enviar', 'contato', id, { canal: d.canal });
      return m;
    });
    return rep.code(201).send(m);
  });

  // --- Atendimento pelo app do turista ---

  app.post('/v1/atendimento', async (req, rep) => {
    const u = exigir(req, 'cliente');
    const d = validar(pedidoAtendimento, req.body);
    const r = await db.tx(async (q) => {
      if (d.pedido_id) {
        const p = await q.query('select 1 from pedido where id = $1 and cliente_id = $2', [d.pedido_id, u.sub]);
        if (!p.rows[0]) throw naoEncontrado('pedido');
      }
      const c = await contatoDoCliente(q, u.sub);
      return receberMensagem(q, { canal: 'APP', de: `app:${u.sub}`, texto: d.texto, contatoId: c.id, pedidoId: d.pedido_id ?? null, tipo: d.tipo });
    });
    return rep.code(201).send(r);
  });

  app.get('/v1/atendimento', async (req) => {
    const u = exigir(req, 'cliente');
    const c = (await db.query<{ id: string }>('select id from contato where cliente_id = $1', [u.sub])).rows[0];
    if (!c) return { tickets: [], mensagens: [] };
    const tickets = (
      await db.query(
        `select t.id, t.numero, t.tipo, t.estado, t.assunto, t.criado_em, t.atualizado_em, p.codigo as pedido_codigo
         from ticket t left join pedido p on p.id = t.pedido_id where t.contato_id = $1 and t.canal <> 'INTERNO' order by t.atualizado_em desc limit 50`,
        [c.id],
      )
    ).rows;
    // Caixa do cliente: o que chegou pelo app e as respostas; nada de anotação interna.
    const mensagens = (
      await db.query(
        `select id, ticket_id, direcao, canal, assunto, conteudo, estado, criado_em from mensagem
         where contato_id = $1 and estado not in ('BLOQUEADA', 'FALHOU') order by criado_em desc limit 100`,
        [c.id],
      )
    ).rows;
    return { tickets, mensagens };
  });

  // --- Webhooks da Twilio (formulário x-www-form-urlencoded, assinado) ---

  const conferirTwilio = (url: string, corpo: unknown, assinatura: string | undefined) => {
    const params = Object.fromEntries(Object.entries((corpo ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
    if (!mensageiro.assinaturaValida(`${config.urlPublica}${url}`, params, assinatura)) {
      throw new ErroHttp(401, 'assinatura-invalida', 'assinatura da Twilio inválida');
    }
    return params;
  };

  // Status da entrega: queued/sent → ENVIADA, delivered → ENTREGUE, read → LIDA, failed/undelivered → FALHOU.
  app.post('/v1/webhooks/twilio/status', async (req, rep) => {
    const p = conferirTwilio('/v1/webhooks/twilio/status', req.body, req.headers['x-twilio-signature'] as string | undefined);
    const mapa: Record<string, string> = { queued: 'ENVIADA', sent: 'ENVIADA', delivered: 'ENTREGUE', read: 'LIDA', failed: 'FALHOU', undelivered: 'FALHOU' };
    const estado = mapa[p.MessageStatus ?? ''];
    if (estado && p.MessageSid) {
      // Não volta estado (um "sent" atrasado não desfaz o "read").
      await db.query(
        `update mensagem set estado = $2, motivo = coalesce($3, motivo), atualizado_em = now()
         where provedor_id = $1 and not (estado = 'LIDA' or (estado = 'ENTREGUE' and $2 = 'ENVIADA'))`,
        [p.MessageSid, estado, p.ErrorCode ? `Twilio ${p.ErrorCode}` : null],
      );
    }
    return rep.code(204).send();
  });

  // Mensagem recebida no WhatsApp ou SMS: vira conversa num chamado; PARAR desliga o canal.
  app.post('/v1/webhooks/twilio/entrada', async (req, rep) => {
    const p = conferirTwilio('/v1/webhooks/twilio/entrada', req.body, req.headers['x-twilio-signature'] as string | undefined);
    const whatsapp = (p.From ?? '').startsWith('whatsapp:');
    const de = (p.From ?? '').replace(/^whatsapp:/, '');
    if (!de || !p.Body) return rep.code(204).send();
    await db.tx((q) => receberMensagem(q, { canal: whatsapp ? 'WHATSAPP' : 'SMS', de, texto: p.Body!, provedorId: p.MessageSid, nome: p.ProfileName }));
    // Resposta vazia em TwiML: a confirmação sai pela fila de mensagens.
    return rep.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });
};
