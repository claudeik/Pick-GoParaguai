import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ator } from '../auth.ts';
import type { Consulta } from '../db.ts';
import { auditar, type Ator } from './registro.ts';

// Lista mestre: o sistema de cada loja envia o catálogo (preço, estoque, código de
// barras, código da loja, descrição e fotos). O Pick & Go vende só o que está
// publicado (produto.ativo).
//
// Estoque: a loja informa o físico dela; o disponível no app é esse número menos
// o que já está reservado em pedidos do Pick & Go ainda não retirados. Premissa
// [DECISÃO]: a loja só baixa a venda no sistema dela quando o pedido é retirado
// (evento RetiradaConfirmada); se baixar antes, a reserva conta duas vezes.

export const itemCatalogo = z.object({
  codigo_loja: z.string().trim().min(1).max(60),
  nome: z.string().trim().min(2).max(200),
  descricao: z.string().trim().max(4000).nullable().optional(),
  categoria: z.string().trim().min(2).max(60),
  preco_usd_centavos: z.number().int().positive().max(100_000_000),
  estoque: z.number().int().min(0).max(1_000_000),
  codigo_barras: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z-]{4,40}$/, 'código de barras com 4 a 40 letras ou números')
    .nullable()
    .optional(),
  fotos: z.array(z.url().max(500)).max(10).optional(),
});
export type ItemCatalogo = z.infer<typeof itemCatalogo>;

/** Estados em que o item ainda está reservado para o cliente do Pick & Go. */
export const ESTADOS_RESERVA = [
  'CRIADO',
  'AGUARDANDO_PIX',
  'PAGO',
  'EM_SEPARACAO',
  'EM_COLETA',
  'EM_TESTE_LOJA',
  'PRONTO_RETIRADA',
  'LIBERADO_SAIDA',
  'NAO_RETIRADO',
];

export const hashChave = (chave: string) => createHash('sha256').update(chave).digest('hex');

/** Nova chave de API para o sistema da loja; a antiga deixa de valer. */
export async function gerarChaveIntegracao(q: Consulta, lojaId: string, a: Ator): Promise<string | null> {
  const chave = `pgk_${lojaId}_${randomBytes(24).toString('base64url')}`;
  const r = await q.query('update loja set chave_integracao_hash = $2, chave_integracao_criada_em = now() where id = $1 returning id', [
    lojaId,
    hashChave(chave),
  ]);
  if (!r.rows[0]) return null;
  await auditar(q, a, 'loja.chave_integracao', 'loja', lojaId);
  return chave;
}

export async function reservadosDaLoja(q: Consulta, lojaId: string): Promise<Map<string, number>> {
  const r = await q.query<{ produto_id: string; qtd: number }>(
    `select i.produto_id, sum(i.quantidade)::int as qtd from pedido_item i join pedido p on p.id = i.pedido_id
     where i.loja_id = $1 and p.estado = any($2::text[]) group by i.produto_id`,
    [lojaId, ESTADOS_RESERVA],
  );
  return new Map(r.rows.map((x) => [x.produto_id, x.qtd]));
}

export interface ResultadoSincronizacao {
  id: string;
  recebidos: number;
  criados: number;
  atualizados: number;
  zerados: number;
  erros: { codigo_loja: string; erro: string }[];
}

/**
 * Grava ou atualiza os produtos pelo código da loja. Item novo entra fora do
 * Pick & Go, até a loja ou o Portal publicar. Com `completo`, o que a loja não
 * mandou fica com estoque zero (nunca é apagado: pedidos antigos apontam para ele).
 */
export async function sincronizarCatalogo(
  q: Consulta,
  lojaId: string,
  itens: ItemCatalogo[],
  o: { origem: 'INTEGRACAO' | 'IMPORTACAO'; completo: boolean; ator: Ator },
): Promise<ResultadoSincronizacao> {
  const reservados = await reservadosDaLoja(q, lojaId);
  const erros: ResultadoSincronizacao['erros'] = [];
  const vistos = new Set<string>();
  let criados = 0;
  let atualizados = 0;

  for (const it of itens) {
    if (vistos.has(it.codigo_loja)) {
      erros.push({ codigo_loja: it.codigo_loja, erro: 'código da loja repetido no envio' });
      continue;
    }
    vistos.add(it.codigo_loja);
    const ean = it.codigo_barras || null;
    if (ean) {
      const outro = await q.query(
        'select 1 from produto where loja_id = $1 and codigo_barras = $2 and codigo_loja is distinct from $3',
        [lojaId, ean, it.codigo_loja],
      );
      if (outro.rows[0]) {
        erros.push({ codigo_loja: it.codigo_loja, erro: `código de barras ${ean} já usado por outro produto da loja` });
        continue;
      }
    }
    const fotos = it.fotos ?? [];
    const atual = await q.query<{ id: string }>('select id from produto where loja_id = $1 and codigo_loja = $2 for update', [
      lojaId,
      it.codigo_loja,
    ]);
    if (atual.rows[0]) {
      const id = atual.rows[0].id;
      const disponivel = Math.max(0, it.estoque - (reservados.get(id) ?? 0));
      await q.query(
        `update produto set nome = $2, descricao = $3, categoria = $4, preco_usd_centavos = $5, codigo_barras = $6,
           fotos = $7, foto_url = $8, estoque_loja = $9, estoque = $10, origem = $11, sincronizado_em = now(), atualizado_em = now()
         where id = $1`,
        [id, it.nome, it.descricao ?? null, it.categoria, it.preco_usd_centavos, ean, JSON.stringify(fotos), fotos[0] ?? null, it.estoque, disponivel, o.origem],
      );
      atualizados++;
    } else {
      await q.query(
        `insert into produto (loja_id, codigo_loja, nome, descricao, categoria, preco_usd_centavos, codigo_barras,
           fotos, foto_url, estoque_loja, estoque, origem, sincronizado_em, ativo)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, now(), false)`,
        [lojaId, it.codigo_loja, it.nome, it.descricao ?? null, it.categoria, it.preco_usd_centavos, ean, JSON.stringify(fotos), fotos[0] ?? null, it.estoque, o.origem],
      );
      criados++;
    }
  }

  let zerados = 0;
  if (o.completo) {
    const r = await q.query<{ id: string }>(
      `update produto set estoque_loja = 0, estoque = 0, sincronizado_em = now(), atualizado_em = now()
       where loja_id = $1 and codigo_loja is not null and not (codigo_loja = any($2::text[])) and (estoque_loja is distinct from 0 or estoque <> 0)
       returning id`,
      [lojaId, [...vistos]],
    );
    zerados = r.rows.length;
  }

  const nomeAtor = o.ator === 'sistema' ? 'sistema' : ator(o.ator);
  const s = await q.query<{ id: string }>(
    `insert into sincronizacao (loja_id, origem, ator, completo, recebidos, criados, atualizados, zerados, erros)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [lojaId, o.origem, nomeAtor, o.completo, itens.length, criados, atualizados, zerados, JSON.stringify(erros)],
  );
  await auditar(q, o.ator, 'catalogo.sincronizar', 'loja', lojaId, { origem: o.origem, recebidos: itens.length, criados, atualizados, zerados, erros: erros.length });
  return { id: s.rows[0]!.id, recebidos: itens.length, criados, atualizados, zerados, erros };
}
