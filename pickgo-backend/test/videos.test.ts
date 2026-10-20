import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { extrairIdYoutube, formatarMomento, lerMomento } from '../src/integracoes/youtube.ts';
import { lembrarVideos } from '../src/servicos/videos.ts';
import { criarAmbiente, type Ambiente } from './ambiente.ts';

// Vídeos do YouTube com produtos e link inteligente (T20 a T22 · RF-31, RF-39 a RF-41).

describe('YouTube: links e momentos', () => {
  it('reconhece o ID em todos os formatos de link', () => {
    for (const url of [
      'dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
      'youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    ]) {
      assert.equal(extrairIdYoutube(url), 'dQw4w9WgXcQ', url);
    }
    assert.equal(extrairIdYoutube('https://vimeo.com/123456789'), null);
    assert.equal(extrairIdYoutube('https://www.youtube.com/channel/UC123'), null);
  });

  it('converte momentos de ida e volta', () => {
    assert.equal(lerMomento('1:23'), 83);
    assert.equal(lerMomento('1:02:03'), 3723);
    assert.equal(lerMomento(90), 90);
    assert.equal(formatarMomento(83), '1:23');
    assert.equal(formatarMomento(3723), '1:02:03');
  });
});

describe('vídeos com produtos', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente({ infoVideo: async () => ({ titulo: 'Achados de Ciudad del Este', canal: 'Portal Paraguai' }) })));
  after(() => a.fechar());

  const daqui = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  let videoId = '';
  let codigoJbl = '';
  let jblId = '';

  it('marketing cadastra o vídeo pelo link, com título do YouTube, produtos, oferta e texto pronto', async () => {
    const mkt = a.acesso('portal-marketing');
    const jbl = await a.produto('JBL Charge');
    const ps5 = await a.produto('PlayStation 5');
    const quest = await a.produto('Meta Quest');
    jblId = jbl.id;
    const oferta = (
      await a.req('POST', '/v1/ofertas', {
        token: mkt,
        corpo: { produto_id: jbl.id, titulo: 'JBL do vídeo', fim: daqui(48), pagador: 'LOJA', preco_promocional_usd_centavos: jbl.preco_usd_centavos - 1000, quantidade_total: 5, codigo: 'PICKGO-JBLVID' },
      })
    ).corpo;

    assert.equal((await a.req('POST', '/v1/videos', { token: a.acesso('portal-atendimento'), corpo: { url: 'dQw4w9WgXcQ' } })).status, 403);
    assert.equal((await a.req('POST', '/v1/videos', { token: mkt, corpo: { url: 'https://vimeo.com/1' } })).status, 422);

    const r = await a.req('POST', '/v1/videos', {
      token: mkt,
      corpo: {
        url: 'https://youtu.be/dQw4w9WgXcQ',
        publicar: true,
        produtos: [
          { produto_id: ps5.id, momento: '3:10' },
          { produto_id: jbl.id, momento: '0:42', oferta_id: oferta.id },
          { produto_id: quest.id, momento: 300 },
        ],
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    videoId = r.corpo.id;
    assert.equal(r.corpo.titulo, 'Achados de Ciudad del Este');
    assert.equal(r.corpo.canal, 'Portal Paraguai');
    assert.deepEqual(r.corpo.produtos.map((p: { momento_s: number }) => p.momento_s), [42, 190, 300]);
    const pj = r.corpo.produtos[0];
    codigoJbl = pj.codigo;
    assert.match(pj.codigo, /^[A-Z2-9]{6}$/);
    assert.equal(pj.link, `${a.config.urlPublica}/v/${pj.codigo}`);
    assert.equal(pj.oferta_valendo, true);
    // Descrição com capítulos (0:00 + três momentos) e os links.
    assert.match(r.corpo.texto_youtube.descricao, /^0:00 Abertura$/m);
    assert.match(r.corpo.texto_youtube.descricao, new RegExp(`^0:42 .*JBL.*→ .*/v/${pj.codigo}$`, 'm'));
    assert.match(r.corpo.texto_youtube.comentario_fixado, new RegExp(`/v/${pj.codigo}`));

    // Mesmo vídeo de novo: conflito.
    assert.equal((await a.req('POST', '/v1/videos', { token: mkt, corpo: { url: 'dQw4w9WgXcQ' } })).status, 409);
  });

  it('oferta exclusiva de campanha não entra no vídeo público', async () => {
    const mkt = a.acesso('portal-marketing');
    const ps5 = await a.produto('PlayStation 5');
    const exc = (
      await a.req('POST', '/v1/ofertas', {
        token: mkt,
        corpo: { produto_id: ps5.id, titulo: 'Só para a campanha', fim: daqui(48), pagador: 'LOJA', preco_promocional_usd_centavos: ps5.preco_usd_centavos - 1000, quantidade_total: 2, exclusiva: true },
      })
    ).corpo;
    const r = await a.req('POST', '/v1/videos', { token: mkt, corpo: { url: 'aaaaaaaaaaa', titulo: 'Outro vídeo', produtos: [{ produto_id: ps5.id, oferta_id: exc.id }] } });
    assert.equal(r.status, 422);
  });

  it('o link curto conta o clique com a origem e abre o produto no app com o cupom', async () => {
    const r = await a.app.inject({ method: 'GET', url: `/v/${codigoJbl.toLowerCase()}`, headers: { referer: 'https://www.youtube.com/' } });
    assert.equal(r.statusCode, 302);
    assert.equal(r.headers.location, `${a.config.urlApp}/#turista?v=${codigoJbl}&oferta=PICKGO-JBLVID`);
    const c = await a.db.query<{ origem: string }>('select origem from video_clique order by id desc limit 1');
    assert.equal(c.rows[0]!.origem, 'youtube');
    // Código que não existe leva à vitrine.
    assert.equal((await a.app.inject({ method: 'GET', url: '/v/ZZZZZZ' })).headers.location, `${a.config.urlApp}/#turista`);
  });

  it('a vitrine pública mostra o vídeo com os produtos e não expõe a oferta pelo id', async () => {
    const r = await a.req('GET', '/v1/videos/publicados');
    const v = r.corpo.videos.find((x: { id: string }) => x.id === videoId);
    assert.equal(v.youtube_id, 'dQw4w9WgXcQ');
    assert.equal(v.produtos.length, 3);
    assert.equal(v.produtos[0].oferta_codigo, 'PICKGO-JBLVID');
    assert.equal(v.produtos[0].oferta_id, undefined);
  });

  it('quem compra pelo vídeo fica com a origem no pedido e entra nos resultados', async () => {
    const t = await a.novoCliente('Comprou no Vídeo', { aceite_mensagens_whatsapp: true });
    const abriu = await a.req('POST', '/v1/videos/abrir', { token: t, corpo: { codigo: codigoJbl, clique: false } });
    assert.equal(abriu.corpo.produto_id, jblId);
    assert.equal(abriu.corpo.cupom, 'PICKGO-JBLVID');
    const p = await a.pedidoComPix(t, { modo: 'RETIRADA_PORTAL', cupom: 'PICKGO-JBLVID', video_link: codigoJbl, itens: [{ produto_id: jblId, quantidade: 1 }] });
    await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos);
    const d = (await a.req('GET', `/v1/videos/${videoId}`, { token: a.acesso('portal-marketing') })).corpo;
    const m = d.produtos[0].metricas;
    assert.equal(m.cliques, 1);
    assert.equal(m.interessados, 1);
    assert.equal(m.pedidos, 1);
    assert.ok(m.receita_brl_centavos > 0);
    const lista = (await a.req('GET', '/v1/videos', { token: a.acesso('portal-marketing') })).corpo.videos;
    assert.equal(lista.find((x: { id: string }) => x.id === videoId).metricas.pedidos, 1);
  });

  it('quem abriu pelo vídeo e não comprou recebe um lembrete, uma vez; quem comprou não', async () => {
    const t = await a.novoCliente('Só Olhou', { aceite_mensagens_whatsapp: true });
    await a.req('POST', '/v1/videos/abrir', { token: t, corpo: { codigo: codigoJbl } });
    await a.rodarRotinas();
    const antes = a.mensageiro.enviados.filter((m) => m.modelo === 'lembrete_video').length;
    assert.equal(await lembrarVideos(a.ctx), 0, 'antes de 6 h, nada');
    a.avancar(7 * 3_600_000);
    assert.equal(await lembrarVideos(a.ctx), 1, 'só quem não comprou');
    await a.rodarRotinas();
    const lembretes = a.mensageiro.enviados.filter((m) => m.modelo === 'lembrete_video');
    assert.equal(lembretes.length, antes + 1, 'só quem não comprou');
    assert.match(lembretes.at(-1)!.texto, /Oi, Só! .*JBL.*Achados de Ciudad del Este.*\/v\//s);
    assert.equal(await lembrarVideos(a.ctx), 0, 'uma vez só');
  });

  it('campanha do vídeo: o link de cada pessoa abre o vídeo no app', async () => {
    const mkt = a.acesso('portal-marketing');
    const r = await a.req('POST', `/v1/videos/${videoId}/campanha`, { token: mkt, corpo: { segmento: { somente_clientes: true }, enviar: 'agora' } });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.video_id, videoId);
    assert.match(r.corpo.mensagem, /Achados de Ciudad del Este.*\{link\}/s);
    await a.rodarRotinas();
    const envio = (await a.db.query<{ codigo_link: string }>('select codigo_link from campanha_envio where campanha_id = $1 limit 1', [r.corpo.id])).rows[0]!;
    const l = await a.app.inject({ method: 'GET', url: `/l/${envio.codigo_link}` });
    assert.match(String(l.headers.location), new RegExp(`v=${codigoJbl}`));
  });

  it('não publica vídeo sem produto e arquiva o vídeo, que sai da vitrine e do link', async () => {
    const mkt = a.acesso('portal-marketing');
    const vazio = (await a.req('POST', '/v1/videos', { token: mkt, corpo: { url: 'bbbbbbbbbbb', titulo: 'Sem produtos' } })).corpo;
    assert.equal((await a.req('PATCH', `/v1/videos/${vazio.id}`, { token: mkt, corpo: { estado: 'PUBLICADO' } })).status, 422);
    assert.equal((await a.req('PATCH', `/v1/videos/${videoId}`, { token: mkt, corpo: { estado: 'ARQUIVADO' } })).status, 200);
    assert.equal((await a.req('GET', '/v1/videos/publicados')).corpo.videos.some((x: { id: string }) => x.id === videoId), false);
    assert.equal((await a.req('POST', '/v1/videos/abrir', { corpo: { codigo: codigoJbl } })).status, 404);
  });
});
