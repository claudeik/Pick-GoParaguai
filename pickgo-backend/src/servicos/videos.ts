import { randomInt } from 'node:crypto';
import type { Contexto } from '../contexto.ts';
import type { Consulta } from '../db.ts';
import { formatarMomento } from '../integracoes/youtube.ts';
import { contatoDoCliente, enfileirarMensagem } from './crm.ts';

// Vídeos do YouTube como vitrine (seção 3.11). Cada produto do vídeo tem um link curto
// /v/{codigo} (RF-39) que registra o clique e abre o produto no app, com o cupom da oferta.
// O pedido guarda o vídeo e o produto de origem (RF-31).

/** Estados de pedido que contam como venda: pago em diante, sem os cancelados e reembolsados. */
export const ESTADOS_VENDA = ['PAGO', 'EM_SEPARACAO', 'EM_COLETA', 'EM_TESTE_LOJA', 'PRONTO_RETIRADA', 'RETIRADO', 'LIBERADO_SAIDA', 'POSTADO', 'EM_TRANSITO', 'NA_ALFANDEGA', 'ENTREGUE', 'NAO_RETIRADO'];

// Sem 0/O, 1/I/L: o código pode ser digitado de uma tela ou lido em voz alta numa live.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export async function novoCodigoVideo(q: Consulta): Promise<string> {
  for (;;) {
    const c = Array.from({ length: 6 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
    if (!(await q.query('select 1 from video_produto where codigo = $1', [c])).rows[0]) return c;
  }
}

export const linkVideo = (urlPublica: string, codigo: string) => `${urlPublica}/v/${codigo}`;

export interface ProdutoDoVideo {
  id: string;
  produto_id: string;
  produto_nome: string;
  preco_usd_centavos: number;
  foto_url: string | null;
  loja_id: string;
  loja_nome: string;
  momento_s: number;
  ordem: number;
  codigo: string;
  oferta_id: string | null;
  oferta_codigo: string | null;
  oferta_titulo: string | null;
  oferta_preco_usd_centavos: number | null;
  oferta_valendo: boolean;
}

/** Produtos do vídeo na ordem em que aparecem, com a oferta e se ela vale agora. */
export async function produtosDoVideo(q: Consulta, videoId: string, agora: Date): Promise<ProdutoDoVideo[]> {
  const r = await q.query<ProdutoDoVideo>(
    `select vp.id, vp.produto_id, p.nome as produto_nome, p.preco_usd_centavos, p.foto_url, p.loja_id, l.nome as loja_nome,
       vp.momento_s, vp.ordem, vp.codigo, vp.oferta_id, o.codigo as oferta_codigo, o.titulo as oferta_titulo,
       o.preco_promocional_usd_centavos as oferta_preco_usd_centavos,
       coalesce(o.estado = 'ATIVA' and o.inicio <= $2 and o.fim > $2 and o.quantidade_restante > 0, false) as oferta_valendo
     from video_produto vp join produto p on p.id = vp.produto_id join loja l on l.id = p.loja_id
     left join oferta o on o.id = vp.oferta_id
     where vp.video_id = $1 order by vp.momento_s, vp.ordem`,
    [videoId, agora],
  );
  return r.rows;
}

export interface Metricas {
  cliques: number;
  interessados: number;
  pedidos: number;
  receita_brl_centavos: number;
}

/** Cliques, interessados, pedidos pagos e receita dos produtos do vídeo, por produto do vídeo. */
export async function metricasVideos(q: Consulta, videoIds: string[]): Promise<Map<string, Metricas & { video_id: string }>> {
  const r = await q.query<Metricas & { id: string; video_id: string }>(
    `select vp.id, vp.video_id,
       (select count(*)::int from video_clique c where c.video_produto_id = vp.id) as cliques,
       (select count(*)::int from video_interesse i where i.video_produto_id = vp.id) as interessados,
       (select count(*)::int from pedido pe where pe.video_produto_id = vp.id and pe.estado = any($2)) as pedidos,
       (select coalesce(sum(it.subtotal_brl_centavos), 0)::bigint from pedido pe join pedido_item it on it.pedido_id = pe.id
          where pe.video_produto_id = vp.id and pe.estado = any($2) and it.produto_id = vp.produto_id) as receita_brl_centavos
     from video_produto vp where vp.video_id = any($1::uuid[])`,
    [videoIds, ESTADOS_VENDA],
  );
  return new Map(r.rows.map((x) => [x.id, x]));
}

export function somar(ms: Metricas[]): Metricas {
  return ms.reduce((t, m) => ({ cliques: t.cliques + m.cliques, interessados: t.interessados + m.interessados, pedidos: t.pedidos + m.pedidos, receita_brl_centavos: t.receita_brl_centavos + m.receita_brl_centavos }), {
    cliques: 0,
    interessados: 0,
    pedidos: 0,
    receita_brl_centavos: 0,
  });
}

const usd = (c: number) => `US$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Texto pronto para colar no YouTube: a descrição com os capítulos (o YouTube cria os
 * capítulos a partir de "0:00" e de pelo menos três momentos) e o comentário fixado.
 */
export function textoParaYoutube(urlPublica: string, v: { titulo: string; descricao: string | null }, produtos: ProdutoDoVideo[]) {
  const linha = (p: ProdutoDoVideo) => {
    const preco = p.oferta_id && p.oferta_preco_usd_centavos ? `${usd(p.oferta_preco_usd_centavos)} (de ${usd(p.preco_usd_centavos)})` : usd(p.preco_usd_centavos);
    return `${formatarMomento(p.momento_s)} ${p.produto_nome} · ${preco} → ${linkVideo(urlPublica, p.codigo)}`;
  };
  const capitulos = produtos.length >= 3 && !produtos.some((p) => p.momento_s === 0) ? ['0:00 Abertura'] : [];
  const descricao = [
    v.descricao?.trim() || `${v.titulo}. Compre pelo Pick & Go do Portal Paraguai: pague por Pix e retire sem fila em Ciudad del Este.`,
    '',
    '🛒 Produtos do vídeo:',
    ...capitulos,
    ...produtos.map(linha),
    '',
    'Preços em dólar, pagos em reais pelo Pix com a cotação do dia. Ofertas por tempo e quantidade limitados.',
  ].join('\n');
  const comentario = [`🛒 Compre os produtos deste vídeo com Pix e retire sem fila:`, ...produtos.map((p) => `• ${p.produto_nome}: ${linkVideo(urlPublica, p.codigo)}`)].join('\n');
  return { descricao, comentario_fixado: comentario };
}

/**
 * Lembrete de quem abriu o produto pelo vídeo e não comprou (automação de venda).
 * Uma vez por pessoa e produto do vídeo, como mensagem de oferta: vale o aceite do canal,
 * o pedido de parar e o limite semanal de ofertas, conferidos no envio.
 */
export async function lembrarVideos(ctx: Contexto): Promise<number> {
  if (ctx.config.lembreteVideoHoras <= 0) return 0;
  const limite = new Date(ctx.agora().getTime() - ctx.config.lembreteVideoHoras * 3_600_000);
  const r = await ctx.db.query<{ id: string }>(
    `select i.id from video_interesse i join video_produto vp on vp.id = i.video_produto_id join video v on v.id = vp.video_id
     join cliente c on c.id = i.cliente_id
     where i.lembrado_em is null and i.comprou_em is null and i.criado_em < $1 and v.estado = 'PUBLICADO' and c.excluido_em is null
     limit 100`,
    [limite],
  );
  let n = 0;
  for (const { id } of r.rows) {
    await ctx.db.tx(async (q) => {
      const i = (
        await q.query<{ cliente_id: string; codigo: string; produto: string; video: string; oferta_titulo: string | null; oferta_valendo: boolean }>(
          `update video_interesse i set lembrado_em = $2 from video_produto vp join video v on v.id = vp.video_id join produto p on p.id = vp.produto_id
             left join oferta o on o.id = vp.oferta_id
           where i.id = $1 and vp.id = i.video_produto_id and i.lembrado_em is null and i.comprou_em is null
           returning i.cliente_id, vp.codigo, p.nome as produto, v.titulo as video, o.titulo as oferta_titulo,
             coalesce(o.estado = 'ATIVA' and o.fim > $2 and o.quantidade_restante > 0, false) as oferta_valendo`,
          [id, ctx.agora()],
        )
      ).rows[0];
      if (!i) return;
      const c = await contatoDoCliente(q, i.cliente_id);
      await enfileirarMensagem(q, {
        contatoId: c.id,
        finalidade: 'MARKETING',
        modelo: 'lembrete_video',
        variaveis: {
          nome: c.nome.split(' ')[0]!,
          produto: i.produto,
          video: i.video,
          oferta: i.oferta_valendo && i.oferta_titulo ? `A oferta "${i.oferta_titulo}" ainda está valendo.` : '',
          link: linkVideo(ctx.config.urlPublica, i.codigo),
        },
        autor: 'sistema',
      });
      n++;
    });
  }
  return n;
}
