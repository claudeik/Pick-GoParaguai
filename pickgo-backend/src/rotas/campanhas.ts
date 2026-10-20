import { z } from 'zod';
import { exigirPermissao, lerToken } from '../auth.ts';
import { validar, type Modulo } from '../contexto.ts';
import { conflito, invalido, naoEncontrado } from '../erros.ts';
import {
  CANAIS_CAMPANHA,
  criarOferta,
  metricasCampanha,
  montarMensagem,
  novaOferta,
  previaPublico,
  segmento,
  SEGMENTO_PREFERENCIAIS,
} from '../servicos/campanhas.ts';
import { auditar } from '../servicos/registro.ts';

// Campanhas e ofertas (T14, T15, T29 · RF-28 a RF-31, RF-36 a RF-38).

const canais = z
  .array(z.enum(CANAIS_CAMPANHA))
  .min(1)
  .max(3)
  .refine((c) => new Set(c).size === c.length, 'canal repetido na cascata');

const novaCampanha = z.object({
  nome: z.string().trim().min(3).max(120),
  segmento,
  mensagem: z.string().trim().min(10).max(1000),
  canais,
  espera_horas: z.number().int().min(1).max(168).default(4),
  /** Oferta criada junto, exclusiva para o público da campanha. */
  oferta: novaOferta.optional(),
  /** Ou uma oferta pública que já existe. */
  oferta_id: z.uuid().optional(),
  /** 'agora', uma data ISO, ou nada (fica em rascunho). */
  enviar: z.union([z.literal('agora'), z.iso.datetime({ offset: true })]).optional(),
});

export const rotasCampanhas: Modulo = (app, { db, config, agora }) => {
  // Prévia do público: quantos atendem aos filtros e quantos cada canal alcança.
  app.post('/v1/publico/previa', async (req) => {
    exigirPermissao(req, 'campanhas.ver');
    const d = validar(z.object({ segmento, canais: canais.default(['WHATSAPP', 'SMS', 'EMAIL']) }), req.body);
    return previaPublico(db, d.segmento, d.canais);
  });

  app.get('/v1/publico/atalhos', async (req) => {
    exigirPermissao(req, 'campanhas.ver');
    return {
      atalhos: [
        { id: 'preferenciais', nome: 'Clientes preferenciais', descricao: 'Ativos ou recorrentes que já gastaram R$ 3.000', segmento: SEGMENTO_PREFERENCIAIS },
        { id: 'reativar', nome: 'Reativar quem sumiu', descricao: 'Clientes sem compra há 60 dias', segmento: { somente_clientes: true, sem_compra_ha_dias: 60, pedidos_minimo: 1 } },
        { id: 'onboarding', nome: 'Primeira compra', descricao: 'Cadastrados que ainda não retiraram nada', segmento: { etapas: ['ONBOARDING'] } },
        { id: 'leads', nome: 'Leads', descricao: 'Ainda sem cadastro no app', segmento: { etapas: ['LEAD', 'CONTATO_FEITO'] } },
      ],
    };
  });

  // --- Ofertas ---

  // Vitrine (pública): ofertas valendo agora. Com o token do turista, inclui as exclusivas para ele.
  app.get('/v1/ofertas', async (req) => {
    const h = req.headers.authorization;
    const u = h?.startsWith('Bearer ') ? lerToken(h.slice(7), config.segredoToken) : null;
    const clienteId = u?.perfil === 'cliente' ? u.sub : null;
    const r = await db.query(
      `select o.id, o.codigo, o.titulo, o.preco_promocional_usd_centavos, o.quantidade_total, o.quantidade_restante, o.limite_por_cliente,
         o.inicio, o.fim, o.exclusiva, p.id as produto_id, p.nome as produto_nome, p.categoria, p.preco_usd_centavos, p.foto_url, p.loja_id, l.nome as loja_nome
       from oferta o join produto p on p.id = o.produto_id join loja l on l.id = p.loja_id
       where o.estado = 'ATIVA' and o.inicio <= $1 and o.fim > $1 and o.quantidade_restante > 0 and p.ativo
         and (not o.exclusiva or (o.campanha_id is not null and $2::uuid is not null and exists (
           select 1 from campanha_envio e join contato c on c.id = e.contato_id where e.campanha_id = o.campanha_id and c.cliente_id = $2)))
       order by o.fim`,
      [agora(), clienteId],
    );
    return { ofertas: r.rows };
  });

  app.get('/v1/ofertas/gestao', async (req) => {
    exigirPermissao(req, 'campanhas.ver');
    const r = await db.query(
      `select o.*, p.nome as produto_nome, p.preco_usd_centavos, l.nome as loja_nome, c.nome as campanha_nome,
         (o.quantidade_total - o.quantidade_restante) as vendidas,
         (select count(distinct pedido_id)::int from oferta_uso u where u.oferta_id = o.id and not u.devolvido) as pedidos,
         (o.estado = 'ATIVA' and o.fim > $1 and o.inicio <= $1 and o.quantidade_restante > 0) as valendo
       from oferta o join produto p on p.id = o.produto_id join loja l on l.id = p.loja_id left join campanha c on c.id = o.campanha_id
       order by o.criado_em desc limit 200`,
      [agora()],
    );
    return { ofertas: r.rows };
  });

  // Oferta pública (aparece no catálogo para todos).
  app.post('/v1/ofertas', async (req, rep) => {
    const u = exigirPermissao(req, 'campanhas.gerenciar');
    const d = validar(novaOferta, req.body);
    const o = await db.tx(async (q) => {
      const o = await criarOferta(q, d, u, agora());
      await auditar(q, u, 'oferta.criar', 'oferta', o.id, d);
      return o;
    });
    return rep.code(201).send(o);
  });

  app.post<{ Params: { id: string } }>('/v1/ofertas/:id/encerrar', async (req) => {
    const u = exigirPermissao(req, 'campanhas.gerenciar');
    return db.tx(async (q) => {
      const r = await q.query(`update oferta set estado = 'ENCERRADA' where id = $1 returning *`, [z.uuid().parse(req.params.id)]);
      if (!r.rows[0]) throw naoEncontrado('oferta');
      await auditar(q, u, 'oferta.encerrar', 'oferta', req.params.id);
      return r.rows[0];
    });
  });

  // --- Campanhas ---

  app.get('/v1/campanhas', async (req) => {
    exigirPermissao(req, 'campanhas.ver');
    const r = await db.query<{ id: string }>(
      `select c.*, o.codigo as oferta_codigo, o.titulo as oferta_titulo, o.quantidade_restante, o.quantidade_total
       from campanha c left join oferta o on o.id = c.oferta_id order by c.criado_em desc limit 100`,
    );
    const campanhas = [];
    for (const c of r.rows) campanhas.push({ ...c, metricas: await metricasCampanha(db, c.id) });
    return { campanhas };
  });

  app.get<{ Params: { id: string } }>('/v1/campanhas/:id', async (req) => {
    exigirPermissao(req, 'campanhas.ver');
    const id = z.uuid().parse(req.params.id);
    const c = (await db.query('select * from campanha where id = $1', [id])).rows[0];
    if (!c) throw naoEncontrado('campanha');
    const envios = (
      await db.query(
        `select e.id, e.estado, e.passo, e.canal_atual, e.clicou_em, e.comprou_em, e.proximo_passo_em, ct.nome, ct.etapa, p.codigo as pedido_codigo
         from campanha_envio e join contato ct on ct.id = e.contato_id left join pedido p on p.id = e.pedido_id
         where e.campanha_id = $1 order by e.comprou_em desc nulls last, e.clicou_em desc nulls last, ct.nome limit 300`,
        [id],
      )
    ).rows;
    return { campanha: c, metricas: await metricasCampanha(db, id), envios };
  });

  app.post('/v1/campanhas', async (req, rep) => {
    const u = exigirPermissao(req, 'campanhas.gerenciar');
    const d = validar(novaCampanha, req.body);
    if (d.oferta && d.oferta_id) throw invalido('use uma oferta nova ou uma existente, não as duas');
    const c = await db.tx(async (q) => {
      const c = (
        await q.query<{ id: string }>(
          `insert into campanha (nome, segmento, mensagem, canais, espera_horas, oferta_id, estado, agendada_para, criado_por)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
          [
            d.nome,
            JSON.stringify(d.segmento),
            d.mensagem,
            d.canais,
            d.espera_horas,
            d.oferta_id ?? null,
            d.enviar ? 'AGENDADA' : 'RASCUNHO',
            d.enviar === 'agora' ? agora() : (d.enviar ?? null),
            `${u.perfil}:${u.email ?? u.sub}`,
          ],
        )
      ).rows[0]!;
      if (d.oferta_id) {
        const o = await q.query(`select 1 from oferta where id = $1 and estado = 'ATIVA'`, [d.oferta_id]);
        if (!o.rows[0]) throw invalido('oferta inexistente ou encerrada');
      }
      if (d.oferta) {
        const o = await criarOferta(q, { ...d.oferta, exclusiva: d.oferta.exclusiva ?? true }, u, agora(), c.id);
        await q.query('update campanha set oferta_id = $2 where id = $1', [c.id, (o as { id: string }).id]);
      }
      await auditar(q, u, 'campanha.criar', 'campanha', c.id, { nome: d.nome, canais: d.canais, enviar: d.enviar ?? null });
      return (await q.query('select * from campanha where id = $1', [c.id])).rows[0];
    });
    return rep.code(201).send(c);
  });

  // Prévia do texto como a pessoa vai receber.
  app.post('/v1/campanhas/previa-mensagem', async (req) => {
    exigirPermissao(req, 'campanhas.ver');
    const d = validar(z.object({ mensagem: z.string().max(1000) }), req.body);
    return {
      texto: montarMensagem(d.mensagem, {
        nome: 'Rafael',
        link: `${config.urlPublica}/l/EXEMPLO123`,
        cupom: 'PICKGO-AB12',
        produto: 'iPhone 16 Pro Max 256GB',
        oferta: 'iPhone com preço de fronteira',
        preco: 'US$ 999.00 (R$ 5.494,50)',
        preco_normal: 'US$ 1,120.00',
        restantes: '12',
        fim: '25/10 18:00',
      }),
    };
  });

  app.post<{ Params: { id: string } }>('/v1/campanhas/:id/agendar', async (req) => {
    const u = exigirPermissao(req, 'campanhas.gerenciar');
    const d = validar(z.object({ quando: z.union([z.literal('agora'), z.iso.datetime({ offset: true })]).default('agora') }), req.body ?? {});
    return db.tx(async (q) => {
      const r = await q.query(
        `update campanha set estado = 'AGENDADA', agendada_para = $2 where id = $1 and estado in ('RASCUNHO', 'AGENDADA') returning *`,
        [z.uuid().parse(req.params.id), d.quando === 'agora' ? agora() : d.quando],
      );
      if (!r.rows[0]) throw conflito('estado-invalido', 'só campanha em rascunho ou agendada pode ser (re)agendada');
      await auditar(q, u, 'campanha.agendar', 'campanha', req.params.id, d);
      return r.rows[0];
    });
  });

  app.post<{ Params: { id: string } }>('/v1/campanhas/:id/cancelar', async (req) => {
    const u = exigirPermissao(req, 'campanhas.gerenciar');
    const id = z.uuid().parse(req.params.id);
    return db.tx(async (q) => {
      const r = await q.query(`update campanha set estado = 'CANCELADA', concluida_em = now() where id = $1 and estado <> 'CONCLUIDA' returning *`, [id]);
      if (!r.rows[0]) throw conflito('estado-invalido', 'campanha já concluída');
      await q.query('update campanha_envio set proximo_passo_em = null where campanha_id = $1', [id]);
      await q.query(`update mensagem set estado = 'BLOQUEADA', motivo = 'campanha cancelada', atualizado_em = now() where campanha_id = $1 and estado = 'PENDENTE'`, [id]);
      await auditar(q, u, 'campanha.cancelar', 'campanha', id);
      return r.rows[0];
    });
  });

  // Link curto da campanha (seção 9.1: GET /l/{codigo}): registra o clique e leva ao app com o cupom.
  app.get<{ Params: { codigo: string } }>('/l/:codigo', async (req, rep) => {
    const r = await db.query<{ codigo: string | null; video: string | null }>(
      `update campanha_envio e set clicou_em = coalesce(e.clicou_em, now()),
         estado = case when e.estado = 'COMPROU' then e.estado else 'CLICOU' end, proximo_passo_em = null
       from campanha c left join oferta o on o.id = c.oferta_id
       where c.id = e.campanha_id and e.codigo_link = $1
       returning o.codigo, (select vp.codigo from video_produto vp where vp.video_id = c.video_id order by vp.momento_s, vp.ordem limit 1) as video`,
      [req.params.codigo.slice(0, 40)],
    );
    if (!r.rows[0]) return rep.redirect(`${config.urlApp}/`, 302);
    // Campanha de vídeo: o app abre o vídeo (pelo primeiro produto dele).
    const q = new URLSearchParams({ c: req.params.codigo, ...(r.rows[0].codigo ? { oferta: r.rows[0].codigo } : {}), ...(r.rows[0].video ? { v: r.rows[0].video } : {}) });
    return rep.redirect(`${config.urlApp}/#turista?${q}`, 302);
  });
};
