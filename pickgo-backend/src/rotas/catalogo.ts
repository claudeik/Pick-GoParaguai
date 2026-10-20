import { z } from 'zod';
import { ehDaLoja, exigirPermissao, tem, type Usuario } from '../auth.ts';
import { validar, type Modulo } from '../contexto.ts';
import { conflito, ErroHttp, invalido, naoEncontrado, proibido } from '../erros.ts';
import { ESTADOS_RESERVA, gerarChaveIntegracao, hashChave, itemCatalogo, sincronizarCatalogo } from '../servicos/catalogo.ts';
import { auditar } from '../servicos/registro.ts';

// T1 Catálogo (RF-01), catálogo do lojista e ponto de retirada por loja (RF-49).

const filtroProdutos = z.object({
  loja_id: z.string().optional(),
  categoria: z.string().optional(),
  busca: z.string().max(80).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const novoProduto = z.object({
  nome: z.string().trim().min(2).max(200),
  categoria: z.string().trim().min(2).max(60),
  preco_usd_centavos: z.number().int().positive().max(100_000_000),
  estoque: z.number().int().min(0).max(1_000_000),
  codigo_loja: z.string().trim().min(1).max(60).nullable().optional(),
  descricao: z.string().trim().max(4000).nullable().optional(),
  fotos: z.array(z.url().max(500)).max(10).optional(),
  codigo_barras: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z-]{4,40}$/, 'código de barras com 4 a 40 letras ou números')
    .nullable()
    .optional(),
  ativo: z.boolean().optional(),
});

const filtroGestao = z.object({
  loja_id: z.string().optional(),
  busca: z.string().max(80).optional(),
  situacao: z.enum(['TODOS', 'ATIVOS', 'INATIVOS', 'SEM_ESTOQUE']).default('TODOS'),
});

const pontoRetirada = z.object({
  tipo: z.enum(['DENTRO', 'ANEXO']),
  descricao: z.string().max(200).optional(),
  horario_abertura: z.string().regex(/^\d{2}:\d{2}$/),
  horario_fechamento: z.string().regex(/^\d{2}:\d{2}$/),
});

const COLUNAS_PRODUTO = `p.id, p.loja_id, l.nome as loja_nome, p.nome, p.categoria, p.preco_usd_centavos,
  p.estoque, p.foto_url, p.fotos, p.descricao, p.codigo_barras, p.codigo_loja`;

const COLUNAS_GESTAO = `${COLUNAS_PRODUTO}, p.ativo, p.estoque_loja, p.origem, p.sincronizado_em, p.criado_em, p.atualizado_em`;

const envioCatalogo = z.object({
  /** true: o que não veio fica com estoque zero (envio do catálogo inteiro). */
  completo: z.boolean().default(false),
  produtos: z.array(itemCatalogo).min(1).max(5000),
});

/** Envios de catálogo podem ser grandes (até 5.000 itens). */
const LIMITE_ENVIO = { bodyLimit: 8 * 1024 * 1024 };

export const rotasCatalogo: Modulo = (app, { db }) => {
  app.get('/v1/lojas', async () => {
    const r = await db.query(
      `select id, nome, ponto_retirada_tipo, ponto_retirada_descricao,
              to_char(horario_abertura, 'HH24:MI') as horario_abertura,
              to_char(horario_fechamento, 'HH24:MI') as horario_fechamento
       from loja where ativa order by nome`,
    );
    return { lojas: r.rows };
  });

  app.get('/v1/categorias', async () => {
    const r = await db.query<{ categoria: string }>(
      'select distinct categoria from produto where ativo order by categoria',
    );
    return { categorias: r.rows.map((c) => c.categoria) };
  });

  // Paginação por cursor (id do último produto devolvido), ordenada por nome e id.
  app.get('/v1/produtos', async (req) => {
    const f = validar(filtroProdutos, req.query);
    const cond = ['p.ativo', 'l.ativa'];
    const params: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      cond.push(sql.replace('?', `$${params.length}`));
    };
    if (f.loja_id) add('p.loja_id = ?', f.loja_id);
    if (f.categoria) add('p.categoria = ?', f.categoria);
    if (f.busca) {
      params.push(`%${f.busca}%`);
      cond.push(`(p.nome ilike $${params.length} or l.nome ilike $${params.length})`);
    }
    if (f.cursor) {
      const c = await db.query<{ nome: string; id: string }>('select nome, id from produto where id = $1', [f.cursor]);
      if (c.rows[0]) {
        params.push(c.rows[0].nome, c.rows[0].id);
        cond.push(`(p.nome, p.id) > ($${params.length - 1}, $${params.length})`);
      }
    }
    params.push(f.limite + 1);
    const r = await db.query<{ id: string }>(
      `select ${COLUNAS_PRODUTO} from produto p join loja l on l.id = p.loja_id
       where ${cond.join(' and ')} order by p.nome, p.id limit $${params.length}`,
      params,
    );
    const produtos = r.rows.slice(0, f.limite);
    return { produtos, proximo_cursor: r.rows.length > f.limite ? produtos.at(-1)!.id : null };
  });

  app.get<{ Params: { id: string } }>('/v1/produtos/:id', async (req) => {
    const r = await db.query(
      `select ${COLUNAS_PRODUTO} from produto p join loja l on l.id = p.loja_id where p.id = $1 and p.ativo`,
      [z.uuid().parse(req.params.id)],
    );
    if (!r.rows[0]) throw naoEncontrado('produto');
    return r.rows[0];
  });

  // Scan & Go (T5): o app lê o código de barras dentro da loja.
  app.get<{ Params: { lojaId: string; codigo: string } }>('/v1/lojas/:lojaId/produtos/codigo/:codigo', async (req) => {
    const r = await db.query(
      `select ${COLUNAS_PRODUTO} from produto p join loja l on l.id = p.loja_id
       where p.loja_id = $1 and p.codigo_barras = $2 and p.ativo`,
      [req.params.lojaId, req.params.codigo],
    );
    if (!r.rows[0]) throw naoEncontrado('produto');
    return r.rows[0];
  });

  // --- Lista mestre (equipe da loja na própria loja; Portal e EPYX em qualquer loja) ---
  // Produto nunca é apagado: pedidos antigos apontam para ele. Despublicar tira do app.
  // Editar dados (catalogo.editar) e publicar no Pick & Go (catalogo.publicar) são permissões separadas.

  /** Loja sobre a qual a ação vale: a do usuário de loja, ou a escolhida por Portal/EPYX. */
  const lojaAlvo = (u: Usuario, lojaId: string | undefined) => {
    if (!ehDaLoja(u)) {
      if (!lojaId) throw invalido('informe loja_id');
      return lojaId;
    }
    if (lojaId && lojaId !== u.loja_id) throw proibido('produto de outra loja');
    return u.loja_id!;
  };

  /** O banco recusa EAN repetido na mesma loja; vira um erro legível. */
  const comEanUnico = async <T,>(fn: () => Promise<T>, ean: string | null | undefined): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      const pg = e as { code?: string; constraint?: string };
      if (pg.code === '23505' && pg.constraint === 'produto_codigo_loja_unico') {
        throw conflito('codigo-loja-duplicado', 'já existe produto com este código da loja');
      }
      if (pg.code === '23505') {
        throw conflito('codigo-barras-duplicado', `já existe produto com o código de barras ${ean} nesta loja`);
      }
      throw e;
    }
  };

  app.get('/v1/loja/produtos', async (req) => {
    const u = exigirPermissao(req, 'catalogo.ver');
    const f = validar(filtroGestao, req.query);
    const cond: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      cond.push(sql.replaceAll('?', `$${params.length}`));
    };
    if (!ehDaLoja(u)) {
      if (f.loja_id) add('p.loja_id = ?', f.loja_id);
    } else add('p.loja_id = ?', u.loja_id);
    if (f.busca) add('(p.nome ilike ? or p.codigo_barras ilike ? or p.codigo_loja ilike ? or p.categoria ilike ?)', `%${f.busca}%`);
    if (f.situacao === 'ATIVOS') cond.push('p.ativo');
    if (f.situacao === 'INATIVOS') cond.push('not p.ativo');
    if (f.situacao === 'SEM_ESTOQUE') cond.push('p.ativo and p.estoque = 0');
    const r = await db.query(
      `select ${COLUNAS_GESTAO},
         (select count(*)::int from pedido_item i join pedido pd on pd.id = i.pedido_id
           where i.produto_id = p.id and pd.estado not in ('CRIADO', 'AGUARDANDO_PIX', 'EXPIRADO', 'CANCELADO', 'REEMBOLSADO')) as vendidos,
         (select coalesce(sum(i.quantidade), 0)::int from pedido_item i join pedido pd on pd.id = i.pedido_id
           where i.produto_id = p.id and pd.estado = any('{${ESTADOS_RESERVA.join(',')}}'::text[])) as reservado
       from produto p join loja l on l.id = p.loja_id
       ${cond.length ? 'where ' + cond.join(' and ') : ''}
       order by l.nome, p.ativo desc, p.nome limit 1000`,
      params,
    );
    const resumo = await db.query<{ total: number; ativos: number; sem_estoque: number }>(
      `select count(*)::int as total, count(*) filter (where ativo)::int as ativos,
         count(*) filter (where ativo and estoque = 0)::int as sem_estoque
       from produto ${!ehDaLoja(u) ? (f.loja_id ? 'where loja_id = $1' : '') : 'where loja_id = $1'}`,
      !ehDaLoja(u) ? (f.loja_id ? [f.loja_id] : []) : [u.loja_id],
    );
    return { produtos: r.rows, resumo: resumo.rows[0] };
  });

  app.post('/v1/loja/produtos', async (req, rep) => {
    const u = exigirPermissao(req, 'catalogo.editar');
    const d = validar(novoProduto.extend({ loja_id: z.string().optional() }), req.body);
    const lojaId = lojaAlvo(u, d.loja_id);
    // Sem permissão de publicar, o produto entra fora do Pick & Go.
    const podePublicar = tem(u, 'catalogo.publicar');
    if (d.ativo && !podePublicar) throw proibido('seu perfil não publica produtos no Pick & Go');
    const ativo = podePublicar ? (d.ativo ?? true) : false;
    const loja = await db.query('select 1 from loja where id = $1', [lojaId]);
    if (!loja.rows[0]) throw naoEncontrado('loja');
    const r = await comEanUnico(
      () =>
        db.tx(async (q) => {
          const p = await q.query<{ id: string }>(
            `insert into produto (loja_id, nome, categoria, preco_usd_centavos, estoque, fotos, foto_url, codigo_barras, ativo, codigo_loja, descricao)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
            [
              lojaId,
              d.nome,
              d.categoria,
              d.preco_usd_centavos,
              d.estoque,
              JSON.stringify(d.fotos ?? []),
              d.fotos?.[0] ?? null,
              d.codigo_barras || null,
              ativo,
              d.codigo_loja || null,
              d.descricao || null,
            ],
          );
          const id = p.rows[0]!.id;
          await auditar(q, u, 'produto.criar', 'produto', id, { ...d, loja_id: lojaId });
          return (await q.query(`select ${COLUNAS_GESTAO} from produto p join loja l on l.id = p.loja_id where p.id = $1`, [id])).rows[0];
        }),
      d.codigo_barras,
    );
    return rep.code(201).send(r);
  });

  // Preço novo vale para pedidos novos; o pedido guarda o preço do momento da compra.
  app.patch<{ Params: { id: string } }>('/v1/loja/produtos/:id', async (req) => {
    const u = exigirPermissao(req, 'catalogo.editar', 'catalogo.publicar');
    const d = validar(novoProduto.partial(), req.body);
    const id = z.uuid().parse(req.params.id);
    const mudaDados = Object.entries(d).some(([k, v]) => k !== 'ativo' && v !== undefined);
    if (mudaDados && !tem(u, 'catalogo.editar')) throw proibido('seu perfil só publica ou despublica produtos');
    if (d.ativo !== undefined && !tem(u, 'catalogo.publicar')) throw proibido('seu perfil não publica produtos no Pick & Go');
    return comEanUnico(
      () =>
        db.tx(async (q) => {
          const atual = await q.query<Record<string, unknown>>('select * from produto where id = $1 for update', [id]);
          if (!atual.rows[0]) throw naoEncontrado('produto');
          lojaAlvo(u, atual.rows[0].loja_id as string);
          const campos: (readonly [string, unknown])[] = Object.entries(d)
            .filter(([, v]) => v !== undefined)
            .flatMap(([k, v]) =>
              k === 'fotos'
                ? [['fotos', JSON.stringify(v)], ['foto_url', (v as string[])[0] ?? null]] as const
                : [[k, (k === 'codigo_barras' || k === 'codigo_loja' || k === 'descricao') && v === '' ? null : v] as const],
            );
          if (campos.length) {
            await q.query(
              `update produto set ${campos.map(([k], i) => `${k} = $${i + 2}`).join(', ')}, atualizado_em = now() where id = $1`,
              [id, ...campos.map(([, v]) => v)],
            );
            const antes = Object.fromEntries(campos.map(([k]) => [k, atual.rows[0]![k]]));
            await auditar(q, u, 'produto.alterar', 'produto', id, { antes, depois: Object.fromEntries(campos) });
          }
          return (await q.query(`select ${COLUNAS_GESTAO} from produto p join loja l on l.id = p.loja_id where p.id = $1`, [id])).rows[0];
        }),
      d.codigo_barras,
    );
  });

  // --- Lista mestre: integração com o sistema da loja e importação de planilha ---

  // O sistema da loja envia o catálogo com a chave de API dela (cabeçalho x-chave-loja).
  app.put('/v1/integracao/catalogo', LIMITE_ENVIO, async (req) => {
    const chave = req.headers['x-chave-loja'];
    if (typeof chave !== 'string' || chave.length < 20) throw new ErroHttp(401, 'chave-ausente', 'envie a chave da loja no cabeçalho x-chave-loja');
    const loja = await db.query<{ id: string }>('select id from loja where chave_integracao_hash = $1 and ativa', [hashChave(chave)]);
    if (!loja.rows[0]) throw new ErroHttp(401, 'chave-invalida', 'chave da loja inválida ou revogada');
    const lojaId = loja.rows[0].id;
    const d = validar(envioCatalogo, req.body);
    return db.tx((q) =>
      sincronizarCatalogo(q, lojaId, d.produtos, {
        origem: 'INTEGRACAO',
        completo: d.completo,
        ator: { sub: `sistema-${lojaId}`, perfil: 'integracao', loja_id: lojaId, exp: 0 },
      }),
    );
  });

  // Planilha (CSV lido no navegador) para loja ainda sem integração.
  app.post('/v1/loja/catalogo/importar', LIMITE_ENVIO, async (req) => {
    const u = exigirPermissao(req, 'catalogo.importar');
    const d = validar(envioCatalogo.extend({ loja_id: z.string().optional() }), req.body);
    const lojaId = lojaAlvo(u, d.loja_id);
    const loja = await db.query('select 1 from loja where id = $1', [lojaId]);
    if (!loja.rows[0]) throw naoEncontrado('loja');
    return db.tx((q) => sincronizarCatalogo(q, lojaId, d.produtos, { origem: 'IMPORTACAO', completo: d.completo, ator: u }));
  });

  app.get('/v1/loja/sincronizacoes', async (req) => {
    const u = exigirPermissao(req, 'catalogo.ver', 'integracao.gerenciar');
    const f = validar(z.object({ loja_id: z.string().optional() }), req.query);
    const lojaId = ehDaLoja(u) ? u.loja_id : f.loja_id;
    const r = await db.query(
      `select s.*, l.nome as loja_nome from sincronizacao s join loja l on l.id = s.loja_id
       ${lojaId ? 'where s.loja_id = $1' : ''} order by s.criado_em desc limit 50`,
      lojaId ? [lojaId] : [],
    );
    const lojas = await db.query(
      `select id, nome, chave_integracao_hash is not null as tem_chave, chave_integracao_criada_em,
         (select max(criado_em) from sincronizacao s where s.loja_id = l.id and s.origem = 'INTEGRACAO') as ultima_integracao
       from loja l ${lojaId ? 'where id = $1' : ''} order by nome`,
      lojaId ? [lojaId] : [],
    );
    return { sincronizacoes: r.rows, lojas: lojas.rows };
  });

  // Gera (ou troca) a chave de API do sistema da loja. A chave aparece só nesta resposta.
  app.post<{ Params: { id: string } }>('/v1/lojas/:id/chave-integracao', async (req) => {
    const u = exigirPermissao(req, 'integracao.gerenciar');
    if (ehDaLoja(u)) throw proibido('a chave da loja é gerada pelo Portal ou pela EPYX');
    const chave = await db.tx((q) => gerarChaveIntegracao(q, req.params.id, u));
    if (!chave) throw naoEncontrado('loja');
    return { loja_id: req.params.id, chave };
  });

  app.put('/v1/loja/ponto-retirada', async (req) => {
    const u = exigirPermissao(req, 'lojas.editar');
    const d = validar(pontoRetirada.extend({ loja_id: z.string().optional() }), req.body);
    const lojaId = lojaAlvo(u, d.loja_id);
    return db.tx(async (q) => {
      const r = await q.query(
        `update loja set ponto_retirada_tipo = $2, ponto_retirada_descricao = $3,
                horario_abertura = $4, horario_fechamento = $5
         where id = $1 returning id, ponto_retirada_tipo, ponto_retirada_descricao,
           to_char(horario_abertura, 'HH24:MI') as horario_abertura,
           to_char(horario_fechamento, 'HH24:MI') as horario_fechamento`,
        [lojaId, d.tipo, d.descricao ?? null, d.horario_abertura, d.horario_fechamento],
      );
      if (!r.rows[0]) throw naoEncontrado('loja');
      await auditar(q, u, 'loja.ponto_retirada', 'loja', lojaId!, d);
      return r.rows[0];
    });
  });
};
