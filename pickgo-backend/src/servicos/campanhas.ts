import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Contexto } from '../contexto.ts';
import type { Consulta } from '../db.ts';
import { conflito, invalido, naoEncontrado } from '../erros.ts';
import type { Canal } from '../integracoes/mensageria.ts';
import { canaisPermitidos, enfileirarMensagem, type ContatoLinha } from './crm.ts';
import type { Ator } from './registro.ts';

// Campanhas e ofertas (RF-28 a RF-31, RF-36 a RF-38).
// - Público: filtros sobre os contatos do CRM, guardados na campanha.
// - Oferta: preço promocional num produto, com unidades e prazo limitados.
// - Cascata: tenta o primeiro canal aceito; se a pessoa não ler nem clicar em
//   `espera_horas`, tenta o próximo. Compra ou clique encerram a cascata.

const ETAPAS = ['LEAD', 'CONTATO_FEITO', 'ONBOARDING', 'CLIENTE_ATIVO', 'RECORRENTE', 'PERDIDO'] as const;
export const CANAIS_CAMPANHA = ['WHATSAPP', 'SMS', 'EMAIL'] as const;
const ESTADOS_PAGOS = `('PAGO', 'EM_SEPARACAO', 'EM_COLETA', 'EM_TESTE_LOJA', 'PRONTO_RETIRADA', 'LIBERADO_SAIDA', 'RETIRADO', 'NAO_RETIRADO', 'ENTREGUE')`;

export const segmento = z.object({
  etapas: z.array(z.enum(ETAPAS)).max(6).optional(),
  gasto_minimo_brl_centavos: z.number().int().min(0).optional(),
  pedidos_minimo: z.number().int().min(0).optional(),
  /** Reativação: sem compra há pelo menos N dias (ou nunca comprou). */
  sem_compra_ha_dias: z.number().int().min(1).max(3650).optional(),
  comprou_categoria: z.string().trim().min(2).max(60).optional(),
  comprou_loja: z.string().max(60).optional(),
  interesse: z.string().trim().min(2).max(60).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  somente_clientes: z.boolean().optional(),
});
export type Segmento = z.infer<typeof segmento>;

/** Atalho de "clientes alvo preferenciais": ativos ou recorrentes que já gastaram R$ 3.000. */
export const SEGMENTO_PREFERENCIAIS: Segmento = { etapas: ['CLIENTE_ATIVO', 'RECORRENTE'], gasto_minimo_brl_centavos: 300_000 };

interface LinhaPublico extends ContatoLinha {
  pedidos: number;
  gasto: number;
  ultima_compra: string | null;
}

/** Contatos que atendem ao segmento, com pedidos e gasto. */
export async function consultarPublico(q: Consulta, s: Segmento, limite = 20_000): Promise<LinhaPublico[]> {
  const cond: string[] = [];
  const p: unknown[] = [];
  const v = (x: unknown) => (p.push(x), `$${p.length}`);
  if (s.etapas?.length) cond.push(`c.etapa = any(${v(s.etapas)}::text[])`);
  if (s.gasto_minimo_brl_centavos) cond.push(`coalesce(e.gasto, 0) >= ${v(s.gasto_minimo_brl_centavos)}`);
  if (s.pedidos_minimo) cond.push(`coalesce(e.pedidos, 0) >= ${v(s.pedidos_minimo)}`);
  if (s.sem_compra_ha_dias) cond.push(`(e.ultima is null or e.ultima < now() - make_interval(days => ${v(s.sem_compra_ha_dias)}::int))`);
  if (s.somente_clientes) cond.push('c.cliente_id is not null');
  if (s.tags?.length) cond.push(`c.tags && ${v(s.tags)}::text[]`);
  if (s.interesse) cond.push(`exists (select 1 from unnest(c.tags) t where t ilike 'interesse:%' || ${v(s.interesse)} || '%')`);
  if (s.comprou_categoria || s.comprou_loja) {
    const f = [s.comprou_categoria && `pr.categoria ilike ${v(s.comprou_categoria)}`, s.comprou_loja && `i.loja_id = ${v(s.comprou_loja)}`].filter(Boolean).join(' and ');
    cond.push(`exists (select 1 from pedido pd join pedido_item i on i.pedido_id = pd.id join produto pr on pr.id = i.produto_id
                       where pd.cliente_id = c.cliente_id and pd.estado in ${ESTADOS_PAGOS} and ${f})`);
  }
  const r = await q.query<LinhaPublico>(
    `with e as (select cliente_id, count(*)::int as pedidos, sum(total_brl_centavos)::bigint as gasto, max(criado_em) as ultima
                from pedido where estado in ${ESTADOS_PAGOS} group by cliente_id)
     select c.*, coalesce(e.pedidos, 0)::int as pedidos, coalesce(e.gasto, 0)::bigint as gasto, e.ultima as ultima_compra
     from contato c left join e on e.cliente_id = c.cliente_id
     ${cond.length ? 'where ' + cond.join(' and ') : ''}
     order by coalesce(e.gasto, 0) desc, c.criado_em limit ${v(limite)}`,
    p,
  );
  return r.rows;
}

/** Prévia: quantos atendem ao segmento e quantos podem ser alcançados por cada canal. */
export async function previaPublico(q: Consulta, s: Segmento, canais: readonly Canal[]) {
  const publico = await consultarPublico(q, s);
  const porCanal: Record<string, number> = { WHATSAPP: 0, SMS: 0, EMAIL: 0 };
  let alcancaveis = 0;
  for (const c of publico) {
    const ok = await canaisPermitidos(q, c);
    for (const k of ok) porCanal[k] = (porCanal[k] ?? 0) + 1;
    if (canais.some((k) => ok.has(k))) alcancaveis++;
  }
  return {
    total: publico.length,
    alcancaveis,
    por_canal: porCanal,
    amostra: publico.slice(0, 15).map((c) => ({ id: c.id, nome: c.nome, etapa: c.etapa, pedidos: c.pedidos, gasto_brl_centavos: c.gasto })),
  };
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codigoAleatorio = (n: number) =>
  [...randomBytes(n)].map((b) => ALFABETO[b % ALFABETO.length]).join('');

export const novaOferta = z
  .object({
    produto_id: z.uuid(),
    titulo: z.string().trim().min(3).max(120),
    preco_promocional_usd_centavos: z.number().int().positive(),
    quantidade_total: z.number().int().min(1).max(100_000),
    limite_por_cliente: z.number().int().min(1).max(100).default(1),
    inicio: z.iso.datetime({ offset: true }).optional(),
    fim: z.iso.datetime({ offset: true }),
    /** Padrão: pública quando avulsa; exclusiva quando criada junto com a campanha. */
    exclusiva: z.boolean().optional(),
    pagador: z.enum(['LOJA', 'PORTAL', 'DIVIDIDO']),
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^PICKGO-[A-Z0-9]{4,12}$/, 'cupom no formato PICKGO-XXXX')
      .optional(),
  })
  .refine((o) => new Date(o.fim) > new Date(o.inicio ?? Date.now()), 'o fim precisa ser depois do início');

export async function criarOferta(q: Consulta, d: z.infer<typeof novaOferta>, a: Ator, agora: Date, campanhaId: string | null = null) {
  const p = (await q.query<{ preco_usd_centavos: number; estoque: number; ativo: boolean }>('select preco_usd_centavos, estoque, ativo from produto where id = $1', [d.produto_id])).rows[0];
  if (!p) throw naoEncontrado('produto');
  if (!p.ativo) throw invalido('o produto não está publicado no Pick & Go');
  if (d.preco_promocional_usd_centavos >= p.preco_usd_centavos) throw invalido('o preço da oferta precisa ser menor que o preço normal');
  if (d.quantidade_total > p.estoque) throw invalido(`a loja tem ${p.estoque} unidade(s) disponíveis no app`);
  const codigo = d.codigo ?? `PICKGO-${codigoAleatorio(4)}`;
  const existe = await q.query('select 1 from oferta where codigo = $1', [codigo]);
  if (existe.rows[0]) throw conflito('cupom-em-uso', `o cupom ${codigo} já existe`);
  const r = await q.query<{ id: string }>(
    `insert into oferta (codigo, produto_id, titulo, preco_promocional_usd_centavos, quantidade_total, quantidade_restante, limite_por_cliente,
       inicio, fim, exclusiva, pagador, campanha_id, criado_por)
     values ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12) returning *`,
    [codigo, d.produto_id, d.titulo, d.preco_promocional_usd_centavos, d.quantidade_total, d.limite_por_cliente, d.inicio ?? agora.toISOString(), d.fim, d.exclusiva ?? false, d.pagador, campanhaId, nomeAtor(a)],
  );
  return r.rows[0]!;
}

const nomeAtor = (a: Ator) => (a === 'sistema' ? 'sistema' : `${a.perfil}:${a.email ?? a.sub}`);

export interface OfertaLinha {
  id: string;
  codigo: string;
  produto_id: string;
  titulo: string;
  preco_promocional_usd_centavos: number;
  quantidade_restante: number;
  limite_por_cliente: number;
  inicio: Date;
  fim: Date;
  exclusiva: boolean;
  pagador: 'LOJA' | 'PORTAL' | 'DIVIDIDO';
  campanha_id: string | null;
  estado: string;
}

/**
 * Reserva unidades da oferta para o pedido (na transação do pedido).
 * Exclusiva de campanha só vale para quem está no público dela.
 */
export async function reservarOferta(q: Consulta, codigo: string, clienteId: string, produtoId: string, quantidade: number, agora: Date) {
  const o = (await q.query<OfertaLinha>('select * from oferta where codigo = $1 for update', [codigo.trim().toUpperCase()])).rows[0];
  if (!o) throw invalido('cupom inválido');
  if (o.estado !== 'ATIVA' || agora < new Date(o.inicio) || agora > new Date(o.fim)) throw conflito('oferta-encerrada', 'esta oferta não está valendo agora');
  if (o.produto_id !== produtoId) throw invalido('o cupom não vale para este produto');
  if (o.exclusiva && o.campanha_id) {
    const noPublico = await q.query(
      `select 1 from campanha_envio e join contato c on c.id = e.contato_id where e.campanha_id = $1 and c.cliente_id = $2`,
      [o.campanha_id, clienteId],
    );
    if (!noPublico.rows[0]) throw conflito('oferta-exclusiva', 'esta oferta é exclusiva para os clientes convidados');
  }
  const usado = await q.query<{ n: number }>(
    'select coalesce(sum(quantidade), 0)::int as n from oferta_uso where oferta_id = $1 and cliente_id = $2 and not devolvido',
    [o.id, clienteId],
  );
  if (usado.rows[0]!.n + quantidade > o.limite_por_cliente) {
    throw conflito('limite-da-oferta', `limite de ${o.limite_por_cliente} unidade(s) por cliente nesta oferta`);
  }
  if (o.quantidade_restante < quantidade) {
    throw conflito('oferta-esgotada', o.quantidade_restante ? `restam só ${o.quantidade_restante} unidade(s) na oferta` : 'a oferta esgotou');
  }
  await q.query('update oferta set quantidade_restante = quantidade_restante - $2 where id = $1', [o.id, quantidade]);
  return o;
}

/** Venda pela campanha (RF-31): marca a conversão e para a cascata da pessoa. */
export async function registrarConversao(q: Consulta, campanhaId: string, clienteId: string, pedidoId: string) {
  const r = await q.query<{ id: string }>(
    `update campanha_envio e set estado = 'COMPROU', comprou_em = now(), pedido_id = $3, proximo_passo_em = null
     from contato c where c.id = e.contato_id and e.campanha_id = $1 and c.cliente_id = $2 and e.estado <> 'COMPROU' returning e.id`,
    [campanhaId, clienteId, pedidoId],
  );
  return !!r.rows[0];
}

// --- Cascata de envio ---

interface CampanhaLinha {
  id: string;
  nome: string;
  segmento: Segmento;
  oferta_id: string | null;
  mensagem: string;
  canais: Canal[];
  espera_horas: number;
}

interface EnvioLinha {
  id: string;
  campanha_id: string;
  contato_id: string;
  passo: number;
  codigo_link: string;
  mensagem_id: string | null;
}

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** Troca {variáveis} da mensagem; sempre termina com o jeito de parar de receber. */
export function montarMensagem(modelo: string, v: Record<string, string>) {
  const t = modelo.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
  return /PARAR/i.test(t) ? t : `${t}\n\nResponda PARAR para não receber mais ofertas.`;
}

async function variaveis(q: Consulta, ctx: Pick<Contexto, 'config'>, c: CampanhaLinha, contato: ContatoLinha, envio: EnvioLinha) {
  const v: Record<string, string> = { nome: contato.nome.split(' ')[0]!, link: `${ctx.config.urlPublica}/l/${envio.codigo_link}` };
  if (c.oferta_id) {
    const o = (
      await q.query<{ codigo: string; titulo: string; preco_promocional_usd_centavos: number; quantidade_restante: number; fim: Date; produto: string; preco_usd_centavos: number }>(
        `select o.codigo, o.titulo, o.preco_promocional_usd_centavos, o.quantidade_restante, o.fim, p.nome as produto, p.preco_usd_centavos
         from oferta o join produto p on p.id = o.produto_id where o.id = $1`,
        [c.oferta_id],
      )
    ).rows[0];
    if (o) {
      Object.assign(v, {
        cupom: o.codigo,
        produto: o.produto,
        oferta: o.titulo,
        preco: `${usd(o.preco_promocional_usd_centavos)} (${brl(Math.round(o.preco_promocional_usd_centavos * (ctx.config.cotacaoUsdBrlE4 / 10_000)))})`,
        preco_normal: usd(o.preco_usd_centavos),
        restantes: String(o.quantidade_restante),
        fim: new Date(o.fim).toLocaleString('pt-BR', { timeZone: 'America/Asuncion', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      });
    }
  }
  return v;
}

/** Envia o passo `desde` da cascata pelo primeiro canal aceito a partir dele. */
async function enviarPasso(q: Consulta, ctx: Pick<Contexto, 'config' | 'agora'>, c: CampanhaLinha, envio: EnvioLinha, desde: number) {
  const contato = (await q.query<ContatoLinha>('select * from contato where id = $1', [envio.contato_id])).rows[0]!;
  const ok = await canaisPermitidos(q, contato);
  const i = c.canais.findIndex((k, idx) => idx >= desde && ok.has(k));
  if (i < 0) {
    // Sem canal: no primeiro passo ninguém foi contatado; depois, a cascata acabou.
    await q.query(`update campanha_envio set estado = case when $2 = 0 then 'SEM_CANAL' else estado end, proximo_passo_em = null where id = $1`, [envio.id, desde]);
    return;
  }
  const texto = montarMensagem(c.mensagem, await variaveis(q, ctx, c, contato, envio));
  const m = await enfileirarMensagem(q, { contatoId: contato.id, canal: c.canais[i]!, finalidade: 'MARKETING', texto, assunto: c.nome, autor: 'sistema' });
  await q.query('update mensagem set campanha_id = $2 where id = $1', [m.id, c.id]);
  const temProximo = c.canais.some((k, idx) => idx > i && ok.has(k));
  await q.query(
    `update campanha_envio set passo = $2, canal_atual = $3, mensagem_id = $4, estado = 'NA_FILA', proximo_passo_em = $5 where id = $1`,
    [envio.id, i, c.canais[i], m.id, temProximo ? new Date(ctx.agora().getTime() + c.espera_horas * 3_600_000) : null],
  );
}

/** Rotina: dispara as campanhas agendadas, avança a cascata e encerra as concluídas. */
export async function processarCampanhas(ctx: Contexto): Promise<{ disparadas: number; passos: number }> {
  const agora = ctx.agora();
  let disparadas = 0;
  let passos = 0;

  const prontas = await ctx.db.query<{ id: string }>(`select id from campanha where estado = 'AGENDADA' and agendada_para <= $1`, [agora]);
  for (const { id } of prontas.rows) {
    await ctx.db.tx(async (q) => {
      const c = (await q.query<CampanhaLinha & { estado: string }>('select * from campanha where id = $1 for update', [id])).rows[0]!;
      if (c.estado !== 'AGENDADA') return;
      await q.query(`update campanha set estado = 'ENVIANDO', disparada_em = now() where id = $1`, [id]);
      for (const p of await consultarPublico(q, c.segmento)) {
        const e = (
          await q.query<EnvioLinha>(
            `insert into campanha_envio (campanha_id, contato_id, codigo_link) values ($1, $2, $3) on conflict do nothing returning *`,
            [id, p.id, codigoAleatorio(10)],
          )
        ).rows[0];
        if (e) await enviarPasso(q, ctx, c, e, 0);
      }
      disparadas++;
    });
  }

  // Situação de cada envio acompanha a entrega da mensagem (entregue, lida).
  await ctx.db.query(
    `update campanha_envio e set estado = case m.estado when 'LIDA' then 'LIDA' when 'ENTREGUE' then 'ENTREGUE' when 'ENVIADA' then 'ENVIADA' else e.estado end,
       proximo_passo_em = case when m.estado = 'LIDA' then null else e.proximo_passo_em end
     from mensagem m where m.id = e.mensagem_id and e.estado in ('NA_FILA', 'ENVIADA', 'ENTREGUE') and m.estado in ('ENVIADA', 'ENTREGUE', 'LIDA')`,
  );

  // Oferta esgotada ou encerrada: para de oferecer.
  await ctx.db.query(
    `update campanha_envio e set estado = 'ESGOTADO', proximo_passo_em = null
     from campanha c join oferta o on o.id = c.oferta_id
     where c.id = e.campanha_id and c.estado = 'ENVIANDO' and e.proximo_passo_em is not null
       and (o.quantidade_restante = 0 or o.estado <> 'ATIVA' or o.fim < $1)`,
    [agora],
  );

  const vencidos = await ctx.db.query<EnvioLinha>(
    `select e.* from campanha_envio e join campanha c on c.id = e.campanha_id
     where c.estado = 'ENVIANDO' and e.proximo_passo_em <= $1 and e.estado in ('NA_FILA', 'ENVIADA', 'ENTREGUE') limit 500`,
    [agora],
  );
  for (const e of vencidos.rows) {
    await ctx.db.tx(async (q) => {
      const c = (await q.query<CampanhaLinha>('select * from campanha where id = $1', [e.campanha_id])).rows[0]!;
      await enviarPasso(q, ctx, c, e, e.passo + 1);
      passos++;
    });
  }

  await ctx.db.query(
    `update campanha c set estado = 'CONCLUIDA', concluida_em = now()
     where c.estado = 'ENVIANDO' and not exists (select 1 from campanha_envio e where e.campanha_id = c.id and e.proximo_passo_em is not null)
       and not exists (select 1 from mensagem m where m.campanha_id = c.id and m.estado = 'PENDENTE')`,
  );
  return { disparadas, passos };
}

/** Métricas da campanha (RF-38): público, entrega, leitura, cliques, compras e receita. */
export async function metricasCampanha(q: Consulta, id: string) {
  const envios = await q.query<{ estado: string; n: number }>('select estado, count(*)::int as n from campanha_envio where campanha_id = $1 group by estado', [id]);
  const msgs = await q.query<{ canal: string; estado: string; n: number }>(
    'select canal, estado, count(*)::int as n from mensagem where campanha_id = $1 group by canal, estado',
    [id],
  );
  const vendas = await q.query<{ pedidos: number; receita: number }>(
    `select count(*)::int as pedidos, coalesce(sum(total_brl_centavos), 0)::bigint as receita from pedido where campanha_id = $1 and estado in ${ESTADOS_PAGOS}`,
    [id],
  );
  const cliques = await q.query<{ n: number }>('select count(*)::int as n from campanha_envio where campanha_id = $1 and clicou_em is not null', [id]);
  const porEstado = Object.fromEntries(envios.rows.map((r) => [r.estado, r.n]));
  const soma = (f: (m: { estado: string }) => boolean) => msgs.rows.filter(f).reduce((s, m) => s + m.n, 0);
  return {
    publico: envios.rows.reduce((s, r) => s + r.n, 0),
    sem_canal: porEstado.SEM_CANAL ?? 0,
    envios_por_estado: porEstado,
    mensagens: {
      enviadas: soma((m) => ['ENVIADA', 'ENTREGUE', 'LIDA'].includes(m.estado)),
      entregues: soma((m) => ['ENTREGUE', 'LIDA'].includes(m.estado)),
      lidas: soma((m) => m.estado === 'LIDA'),
      bloqueadas: soma((m) => m.estado === 'BLOQUEADA'),
      falhas: soma((m) => m.estado === 'FALHOU'),
      na_fila: soma((m) => m.estado === 'PENDENTE'),
      por_canal: msgs.rows,
    },
    cliques: cliques.rows[0]!.n,
    compras: vendas.rows[0]!.pedidos,
    receita_brl_centavos: vendas.rows[0]!.receita,
  };
}
