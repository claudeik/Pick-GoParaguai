import { z } from 'zod';
import { exigirPermissao } from '../auth.ts';
import { validar, type Modulo } from '../contexto.ts';
import type { Consulta } from '../db.ts';
import { conflito, invalido, naoEncontrado } from '../erros.ts';
import { extrairIdYoutube, lerMomento } from '../integracoes/youtube.ts';
import { CANAIS_CAMPANHA, segmento } from '../servicos/campanhas.ts';
import { auditar } from '../servicos/registro.ts';
import { linkVideo, metricasVideos, novoCodigoVideo, produtosDoVideo, somar, textoParaYoutube } from '../servicos/videos.ts';

// Vídeos do YouTube com produtos (T20 a T22 · RF-31, RF-39 a RF-41). O marketing cola o
// link do vídeo, marca os produtos e o momento em que aparecem, e recebe o texto pronto
// para a descrição e o comentário fixado. O link curto /v/{codigo} abre o produto no app.

const momento = z.union([z.number().int().min(0).max(86_400), z.string().trim().regex(/^\d{1,2}(:\d{1,2}){0,2}$/, 'momento como 1:23')]);

const produtoNoVideo = z.object({
  produto_id: z.uuid(),
  momento: momento.optional(),
  /** Oferta pública do produto: o link do vídeo já aplica o cupom. */
  oferta_id: z.uuid().nullable().optional(),
});

const novoVideo = z.object({
  /** Link do YouTube (watch, youtu.be, shorts, live) ou o ID do vídeo. */
  url: z.string().trim().min(11).max(300),
  /** Sem título, vale o do YouTube (oEmbed). */
  titulo: z.string().trim().min(3).max(200).optional(),
  descricao: z.string().trim().max(2000).optional(),
  loja_id: z.string().max(60).optional(),
  produtos: z.array(produtoNoVideo).max(30).default([]),
  publicar: z.boolean().default(false),
});

const alteracao = z.object({
  titulo: z.string().trim().min(3).max(200).optional(),
  descricao: z.string().trim().max(2000).nullable().optional(),
  estado: z.enum(['RASCUNHO', 'PUBLICADO', 'ARQUIVADO']).optional(),
});

const campanhaDoVideo = z.object({
  nome: z.string().trim().min(3).max(120).optional(),
  segmento: segmento.default({}),
  mensagem: z.string().trim().min(10).max(1000).optional(),
  canais: z.array(z.enum(CANAIS_CAMPANHA)).min(1).max(3).default(['WHATSAPP', 'EMAIL', 'SMS']),
  espera_horas: z.number().int().min(1).max(168).default(4),
  enviar: z.union([z.literal('agora'), z.iso.datetime({ offset: true })]).optional(),
});

export const rotasVideos: Modulo = (app, { db, config, agora, infoVideo }) => {
  /** Grava os produtos do vídeo; quem já estava mantém o código do link (links já publicados seguem valendo). */
  async function gravarProdutos(q: Consulta, videoId: string, lista: z.infer<typeof produtoNoVideo>[]) {
    const ids = lista.map((p) => p.produto_id);
    if (new Set(ids).size !== ids.length) throw invalido('produto repetido no vídeo');
    for (const p of lista) {
      const prod = await q.query('select 1 from produto where id = $1 and ativo', [p.produto_id]);
      if (!prod.rows[0]) throw invalido(`produto ${p.produto_id} inexistente ou inativo`);
      if (p.oferta_id) {
        const o = await q.query<{ produto_id: string; exclusiva: boolean }>('select produto_id, exclusiva from oferta where id = $1', [p.oferta_id]);
        if (!o.rows[0] || o.rows[0].produto_id !== p.produto_id) throw invalido('a oferta precisa ser do mesmo produto');
        // O vídeo é público: oferta exclusiva de campanha não valeria para quem assiste.
        if (o.rows[0].exclusiva) throw invalido('use uma oferta pública no vídeo; a exclusiva só vale para o público da campanha');
      }
    }
    await q.query('delete from video_produto where video_id = $1 and not (produto_id = any($2::uuid[]))', [videoId, ids]);
    for (const [i, p] of lista.entries()) {
      let s: number;
      try {
        s = lerMomento(p.momento);
      } catch (e) {
        throw invalido((e as Error).message);
      }
      await q.query(
        `insert into video_produto (video_id, produto_id, oferta_id, momento_s, ordem, codigo) values ($1, $2, $3, $4, $5, $6)
         on conflict (video_id, produto_id) do update set oferta_id = excluded.oferta_id, momento_s = excluded.momento_s, ordem = excluded.ordem`,
        [videoId, p.produto_id, p.oferta_id ?? null, s, i, await novoCodigoVideo(q)],
      );
    }
  }

  async function detalhe(q: Consulta, id: string) {
    const v = (await q.query<{ id: string; titulo: string; descricao: string | null; youtube_id: string }>('select * from video where id = $1', [id])).rows[0];
    if (!v) throw naoEncontrado('vídeo');
    const produtos = await produtosDoVideo(q, id, agora());
    const m = await metricasVideos(q, [id]);
    const zero = { cliques: 0, interessados: 0, pedidos: 0, receita_brl_centavos: 0 };
    const comMetricas = produtos.map((p) => ({ ...p, link: linkVideo(config.urlPublica, p.codigo), metricas: m.get(p.id) ?? zero }));
    return {
      ...v,
      url_youtube: `https://www.youtube.com/watch?v=${v.youtube_id}`,
      produtos: comMetricas,
      metricas: somar(comMetricas.map((p) => p.metricas)),
      texto_youtube: textoParaYoutube(config.urlPublica, v, produtos),
    };
  }

  // --- Equipe (marketing) ---

  app.get('/v1/videos', async (req) => {
    exigirPermissao(req, 'campanhas.ver');
    const r = await db.query<{ id: string }>(
      `select v.*, (select count(*)::int from video_produto vp where vp.video_id = v.id) as produtos from video v order by v.criado_em desc limit 200`,
    );
    const m = await metricasVideos(db, r.rows.map((v) => v.id));
    const porVideo = new Map<string, ReturnType<typeof somar>[]>();
    for (const x of m.values()) porVideo.set(x.video_id, [...(porVideo.get(x.video_id) ?? []), x]);
    return { videos: r.rows.map((v) => ({ ...v, metricas: somar(porVideo.get(v.id) ?? []) })) };
  });

  app.post('/v1/videos', async (req, rep) => {
    const u = exigirPermissao(req, 'campanhas.gerenciar');
    const d = validar(novoVideo, req.body);
    const youtubeId = extrairIdYoutube(d.url);
    if (!youtubeId) throw invalido('link do YouTube não reconhecido; cole o link do vídeo (youtube.com/watch?v=… ou youtu.be/…)');
    const info = d.titulo ? null : ((await infoVideo?.(youtubeId)) ?? null);
    const titulo = d.titulo ?? info?.titulo;
    if (!titulo) throw invalido('não foi possível ler o título no YouTube; informe o título');
    const id = await db.tx(async (q) => {
      const existe = await q.query<{ id: string }>('select id from video where youtube_id = $1', [youtubeId]);
      if (existe.rows[0]) throw conflito('video-ja-cadastrado', 'este vídeo já está cadastrado', { video_id: existe.rows[0].id });
      if (d.loja_id && !(await q.query('select 1 from loja where id = $1', [d.loja_id])).rows[0]) throw naoEncontrado('loja');
      const v = (
        await q.query<{ id: string }>(
          `insert into video (youtube_id, titulo, canal, descricao, loja_id, estado, publicado_em, criado_por) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
          [youtubeId, titulo, info?.canal ?? null, d.descricao ?? null, d.loja_id ?? null, d.publicar ? 'PUBLICADO' : 'RASCUNHO', d.publicar ? agora() : null, `${u.perfil}:${u.email ?? u.sub}`],
        )
      ).rows[0]!.id;
      await gravarProdutos(q, v, d.produtos);
      await auditar(q, u, 'video.criar', 'video', v, { youtube_id: youtubeId, produtos: d.produtos.length });
      return v;
    });
    return rep.code(201).send(await detalhe(db, id));
  });

  app.get<{ Params: { id: string } }>('/v1/videos/:id', async (req) => {
    exigirPermissao(req, 'campanhas.ver');
    return detalhe(db, z.uuid().parse(req.params.id));
  });

  app.patch<{ Params: { id: string } }>('/v1/videos/:id', async (req) => {
    const u = exigirPermissao(req, 'campanhas.gerenciar');
    const id = z.uuid().parse(req.params.id);
    const d = validar(alteracao, req.body);
    await db.tx(async (q) => {
      const r = await q.query(
        `update video set titulo = coalesce($2, titulo), descricao = case when $3::boolean then $4 else descricao end,
           estado = coalesce($5, estado), publicado_em = case when $5 = 'PUBLICADO' then coalesce(publicado_em, $6) else publicado_em end, atualizado_em = now()
         where id = $1 returning id`,
        [id, d.titulo ?? null, d.descricao !== undefined, d.descricao ?? null, d.estado ?? null, agora()],
      );
      if (!r.rows[0]) throw naoEncontrado('vídeo');
      if (d.estado === 'PUBLICADO' && !(await q.query('select 1 from video_produto where video_id = $1', [id])).rows[0]) {
        throw invalido('marque ao menos um produto antes de publicar');
      }
      await auditar(q, u, 'video.alterar', 'video', id, d);
    });
    return detalhe(db, id);
  });

  app.put<{ Params: { id: string } }>('/v1/videos/:id/produtos', async (req) => {
    const u = exigirPermissao(req, 'campanhas.gerenciar');
    const id = z.uuid().parse(req.params.id);
    const d = validar(z.object({ produtos: z.array(produtoNoVideo).max(30) }), req.body);
    await db.tx(async (q) => {
      if (!(await q.query('select 1 from video where id = $1 for update', [id])).rows[0]) throw naoEncontrado('vídeo');
      await gravarProdutos(q, id, d.produtos);
      await auditar(q, u, 'video.produtos', 'video', id, { produtos: d.produtos.length });
    });
    return detalhe(db, id);
  });

  // Automação: campanha que avisa os clientes do vídeo novo. O link de cada pessoa abre o vídeo no app.
  app.post<{ Params: { id: string } }>('/v1/videos/:id/campanha', async (req, rep) => {
    const u = exigirPermissao(req, 'campanhas.gerenciar');
    const id = z.uuid().parse(req.params.id);
    const d = validar(campanhaDoVideo, req.body ?? {});
    const c = await db.tx(async (q) => {
      const v = (await q.query<{ titulo: string; estado: string }>('select titulo, estado from video where id = $1', [id])).rows[0];
      if (!v) throw naoEncontrado('vídeo');
      if (v.estado !== 'PUBLICADO') throw conflito('video-nao-publicado', 'publique o vídeo antes de divulgá-lo');
      const ofertas = (await produtosDoVideo(q, id, agora())).filter((p) => p.oferta_valendo);
      const mensagem =
        d.mensagem ??
        `Oi, {nome}! Vídeo novo no Pick & Go: "${v.titulo}".${ofertas.length ? ` ${ofertas.length === 1 ? 'Tem oferta' : `São ${ofertas.length} ofertas`} por tempo limitado.` : ''} Assista e compre com Pix: {link}`;
      const r = (
        await q.query<{ id: string }>(
          `insert into campanha (nome, segmento, mensagem, canais, espera_horas, oferta_id, video_id, estado, agendada_para, criado_por)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
          [
            d.nome ?? `Vídeo: ${v.titulo}`.slice(0, 120),
            JSON.stringify(d.segmento),
            mensagem,
            d.canais,
            d.espera_horas,
            ofertas[0]?.oferta_id ?? null,
            id,
            d.enviar ? 'AGENDADA' : 'RASCUNHO',
            d.enviar === 'agora' ? agora() : (d.enviar ?? null),
            `${u.perfil}:${u.email ?? u.sub}`,
          ],
        )
      ).rows[0]!;
      await auditar(q, u, 'campanha.criar', 'campanha', r.id, { video_id: id, enviar: d.enviar ?? null });
      return r;
    });
    return rep.code(201).send(c);
  });

  // --- Público (app do turista e quem chega pelo YouTube) ---

  // Vitrine de vídeos publicados, com os produtos e a oferta de cada um.
  app.get('/v1/videos/publicados', async () => {
    const r = await db.query<{ id: string }>(
      `select id, youtube_id, titulo, canal, descricao, loja_id, publicado_em from video where estado = 'PUBLICADO' order by publicado_em desc limit 50`,
    );
    const videos = [];
    for (const v of r.rows) {
      const produtos = (await produtosDoVideo(db, v.id, agora())).map(({ oferta_id: _o, ...p }) => ({ ...p, oferta_codigo: p.oferta_valendo ? p.oferta_codigo : null }));
      if (produtos.length) videos.push({ ...v, produtos });
    }
    return { videos };
  });

  // O app abriu um produto do vídeo: conta o clique (de dentro do app) e, com o turista
  // identificado, guarda o interesse para o lembrete de quem não comprou.
  app.post('/v1/videos/abrir', async (req) => {
    const d = validar(z.object({ codigo: z.string().trim().min(4).max(12), clique: z.boolean().default(true) }), req.body);
    const vp = (
      await db.query<{ id: string; video_id: string; produto_id: string; oferta_codigo: string | null }>(
        `select vp.id, vp.video_id, vp.produto_id, case when o.estado = 'ATIVA' and o.inicio <= $2 and o.fim > $2 and o.quantidade_restante > 0 then o.codigo end as oferta_codigo
         from video_produto vp join video v on v.id = vp.video_id left join oferta o on o.id = vp.oferta_id
         where vp.codigo = $1 and v.estado = 'PUBLICADO'`,
        [d.codigo.toUpperCase(), agora()],
      )
    ).rows[0];
    if (!vp) throw naoEncontrado('link do vídeo');
    if (d.clique) await db.query(`insert into video_clique (video_produto_id, origem) values ($1, 'app')`, [vp.id]);
    if (req.usuario?.perfil === 'cliente') {
      await db.query('insert into video_interesse (video_produto_id, cliente_id) values ($1, $2) on conflict do nothing', [vp.id, req.usuario.sub]);
    }
    return { video_id: vp.video_id, produto_id: vp.produto_id, cupom: vp.oferta_codigo };
  });

  // Link curto do vídeo (RF-39, RF-40): registra o clique e a origem, e abre o produto
  // no app com o cupom. Com o app instalado e o domínio verificado (App Links e
  // Universal Links), o sistema abre o app direto; sem o app, abre a página web.
  app.get<{ Params: { codigo: string }; Querystring: { o?: string } }>('/v/:codigo', async (req, rep) => {
    const codigo = req.params.codigo.slice(0, 12).toUpperCase();
    const vp = (
      await db.query<{ id: string; oferta_codigo: string | null }>(
        `select vp.id, case when o.estado = 'ATIVA' and o.inicio <= $2 and o.fim > $2 and o.quantidade_restante > 0 then o.codigo end as oferta_codigo
         from video_produto vp join video v on v.id = vp.video_id left join oferta o on o.id = vp.oferta_id
         where vp.codigo = $1 and v.estado = 'PUBLICADO'`,
        [codigo, agora()],
      )
    ).rows[0];
    if (!vp) return rep.redirect(`${config.urlApp}/#turista`, 302);
    const ref = req.headers.referer ?? '';
    const origem = (req.query.o?.slice(0, 30) || (/youtu\.?be/i.test(ref) ? 'youtube' : ref ? new URL(ref, 'http://x').hostname.slice(0, 60) : 'direto')).toLowerCase();
    await db.query('insert into video_clique (video_produto_id, origem) values ($1, $2)', [vp.id, origem]);
    const q = new URLSearchParams({ v: codigo, ...(vp.oferta_codigo ? { oferta: vp.oferta_codigo } : {}) });
    return rep.redirect(`${config.urlApp}/#turista?${q}`, 302);
  });
};
