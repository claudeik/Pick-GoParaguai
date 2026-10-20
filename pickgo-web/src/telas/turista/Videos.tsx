import { Play, ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ProdutoDoVideo, VideoPublicado } from '../../api.ts';
import { CaixaErro, Cartao, useAcao, Vazio } from '../../componentes/comum.tsx';
import { fmtUSD } from '../../formato.ts';
import { useApiCliente, useCarga } from '../../sessao.tsx';
import { momento } from '../crm/Videos.tsx';
import { CHAVE_CUPOM, CHAVE_VIDEO, colocarNaSacola, gravarLocal } from './CatalogoESacola.tsx';

// T20 · RF-39 a RF-41: vídeos do Portal no YouTube com os produtos que aparecem neles.
// "Comprar" leva o produto para a sacola com o cupom da oferta e a origem no vídeo.

export function VideosTurista({ abrirCodigo, aoComprar }: { abrirCodigo: string | null; aoComprar: () => void }) {
  const api = useApiCliente();
  const lista = useCarga(() => api.videosPublicados(), [api], 60_000);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [inicio, setInicio] = useState(0);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [tocar, setTocar] = useState(0);
  const { ocupado, executar } = useAcao();

  const videos = lista.dados?.videos ?? [];
  const v: VideoPublicado | undefined = videos.find((x) => x.id === videoId) ?? videos[0];

  // Chegou pelo link do vídeo (/v/{codigo}): abre esse vídeo no momento do produto.
  useEffect(() => {
    if (!abrirCodigo || !lista.dados) return;
    const alvo = lista.dados.videos.flatMap((x) => x.produtos.map((p) => ({ x, p }))).find(({ p }) => p.codigo === abrirCodigo);
    if (!alvo) return;
    setVideoId(alvo.x.id);
    setInicio(alvo.p.momento_s);
    setDestaque(alvo.p.codigo);
    // O clique já foi contado no link; aqui só fica o interesse para o lembrete.
    void api.abrirVideo(abrirCodigo, false).catch(() => undefined);
  }, [abrirCodigo, lista.dados, api]);

  const irPara = (p: ProdutoDoVideo) => {
    setInicio(p.momento_s);
    setDestaque(p.codigo);
    setTocar((n) => n + 1);
  };

  const comprar = (p: ProdutoDoVideo) =>
    executar(
      p.codigo,
      async () => {
        const r = await api.abrirVideo(p.codigo);
        colocarNaSacola(await api.produto(r.produto_id));
        if (r.cupom) gravarLocal(CHAVE_CUPOM, r.cupom);
        gravarLocal(CHAVE_VIDEO, p.codigo);
        aoComprar();
      },
      `${p.produto_nome} na sacola.`,
    );

  if (lista.erro) return <CaixaErro erro={lista.erro} onTentar={lista.recarregar} />;
  if (lista.dados && !videos.length) return <Vazio>Nenhum vídeo publicado ainda. Os vídeos do canal do Portal aparecem aqui com os produtos para comprar.</Vazio>;
  if (!v) return <p className="carregando">Carregando os vídeos…</p>;

  return (
    <>
      <Cartao tag="T20" titulo={v.titulo}>
        <div className="video-player">
          <iframe
            key={`${v.id}-${inicio}-${tocar}`}
            src={`https://www.youtube-nocookie.com/embed/${v.youtube_id}?rel=0&playsinline=1&start=${inicio}${tocar ? '&autoplay=1' : ''}`}
            title={`Vídeo: ${v.titulo}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        {v.descricao && <p className="texto-apoio">{v.descricao}</p>}
        <h4 className="subtitulo">Produtos deste vídeo</h4>
        <ul className="produtos-video">
          {v.produtos.map((p) => (
            <li key={p.codigo} className={destaque === p.codigo ? 'destaque' : undefined}>
              <button type="button" className="btn btn-sm btn-outline momento" aria-label={`Ver o momento ${momento(p.momento_s)} do vídeo`} onClick={() => irPara(p)}>
                <Play size={13} aria-hidden="true" /> {momento(p.momento_s)}
              </button>
              <span className="produto-video-nome">
                <strong>{p.produto_nome}</strong>
                <span className="nota">{p.loja_nome}</span>
              </span>
              <span className="produto-video-preco">
                {p.oferta_codigo && p.oferta_preco_usd_centavos ? (
                  <>
                    <s>{fmtUSD(p.preco_usd_centavos)}</s> <strong>{fmtUSD(p.oferta_preco_usd_centavos)}</strong>
                    <span className="nota">{p.oferta_titulo}</span>
                  </>
                ) : (
                  <strong>{fmtUSD(p.preco_usd_centavos)}</strong>
                )}
              </span>
              <button type="button" className="btn btn-sm btn-primary" disabled={ocupado === p.codigo} onClick={() => void comprar(p)}>
                <ShoppingBag size={15} aria-hidden="true" /> {ocupado === p.codigo ? 'Levando…' : 'Comprar'}
              </button>
            </li>
          ))}
        </ul>
      </Cartao>

      {videos.length > 1 && (
        <Cartao titulo="Mais vídeos">
          <ul className="lista-videos">
            {videos.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  className={`cartao-video ${x.id === v.id ? 'ativo' : ''}`}
                  aria-current={x.id === v.id ? 'true' : undefined}
                  onClick={() => {
                    setVideoId(x.id);
                    setInicio(0);
                    setDestaque(null);
                    setTocar(0);
                  }}
                >
                  <img src={`https://i.ytimg.com/vi/${x.youtube_id}/mqdefault.jpg`} alt="" loading="lazy" />
                  <span>{x.titulo}</span>
                  <span className="nota">{x.produtos.length} produtos</span>
                </button>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </>
  );
}
