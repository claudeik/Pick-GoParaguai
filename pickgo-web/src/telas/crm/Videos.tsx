import { Copy, Megaphone, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { Api, EstadoVideo, MetricasVideo, ProdutoNoVideo, VideoDetalhe } from '../../api.ts';
import { CaixaErro, Cartao, Kpi, useAcao, Vazio } from '../../componentes/comum.tsx';
import { useEquipe } from '../../equipe.tsx';
import { fmtBRL, fmtData, fmtUSD } from '../../formato.ts';
import { useCarga, useSessao } from '../../sessao.tsx';

// Vídeos do YouTube como vitrine (T20 a T22 · RF-31, RF-39 a RF-41): o marketing cola o
// link, marca os produtos e o momento em que aparecem, e copia o texto pronto para o YouTube.

const NOME_ESTADO: Record<EstadoVideo, string> = { RASCUNHO: 'Rascunho', PUBLICADO: 'Publicado', ARQUIVADO: 'Arquivado' };
const COR_ESTADO: Record<EstadoVideo, string> = { RASCUNHO: 'badge-gray', PUBLICADO: 'badge-green', ARQUIVADO: 'badge-gold' };

/** 83 → "1:23" */
export const momento = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${seg}` : `${m}:${seg}`;
};

const conversao = (m: MetricasVideo) => (m.cliques ? `${Math.round((m.pedidos / m.cliques) * 100)}%` : '—');

function useCopiar() {
  const { avisar } = useSessao();
  return async (texto: string, oQue: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      avisar(`${oQue} copiado.`);
    } catch {
      avisar('Não deu para copiar aqui: selecione o texto e copie.', 'erro');
    }
  };
}

export function Videos({ api }: { api: Api }) {
  const { pode } = useEquipe();
  const lista = useCarga(() => api.videos(), [api], 30_000);
  const [aberto, setAberto] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [titulo, setTitulo] = useState('');
  const { ocupado, executar } = useAcao();

  const cadastrar = async (e: FormEvent) => {
    e.preventDefault();
    const v = await executar('novo', () => api.criarVideo({ url: url.trim(), titulo: titulo.trim() || undefined }), 'Vídeo cadastrado. Agora marque os produtos.');
    if (v) {
      setUrl('');
      setTitulo('');
      void lista.recarregar();
      setAberto(v.id);
    }
  };

  if (aberto) return <DetalheVideo api={api} id={aberto} aoVoltar={() => (setAberto(null), void lista.recarregar())} />;

  const todos = lista.dados?.videos ?? [];
  const total = todos.reduce(
    (t, v) => ({ cliques: t.cliques + v.metricas.cliques, pedidos: t.pedidos + v.metricas.pedidos, receita: t.receita + v.metricas.receita_brl_centavos }),
    { cliques: 0, pedidos: 0, receita: 0 },
  );

  return (
    <>
      <div className="grid-4">
        <Kpi rotulo="Vídeos publicados" valor={todos.filter((v) => v.estado === 'PUBLICADO').length} sub={`${todos.length} cadastrados`} />
        <Kpi rotulo="Cliques nos links" valor={total.cliques} sub="YouTube, app e mensagens" />
        <Kpi rotulo="Pedidos pelo vídeo" valor={total.pedidos} sub="Pagos, origem no link do vídeo" destaque="green" />
        <Kpi rotulo="Receita pelo vídeo" valor={fmtBRL(total.receita)} sub="Itens do produto do link" />
      </div>

      {pode('campanhas.gerenciar') && (
        <Cartao tag="T20 · RF-39" titulo="Novo vídeo do YouTube">
          <form className="form-linha" onSubmit={cadastrar}>
            <div className="form-group">
              <label htmlFor="video-url">Link do vídeo</label>
              <input id="video-url" className="form-control" placeholder="https://youtu.be/… ou youtube.com/watch?v=…" value={url} onChange={(e) => setUrl(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="video-titulo">Título (opcional)</label>
              <input id="video-titulo" className="form-control" placeholder="Vem do YouTube se ficar em branco" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={!url.trim() || ocupado === 'novo'}>
              <Plus size={15} /> {ocupado === 'novo' ? 'Lendo o YouTube…' : 'Cadastrar'}
            </button>
          </form>
          <p className="nota">O vídeo continua no YouTube. O Pick &amp; Go mostra o player no app e cria um link curto para cada produto marcado.</p>
        </Cartao>
      )}

      <Cartao titulo="Vídeos">
        {lista.erro && <CaixaErro erro={lista.erro} onTentar={lista.recarregar} />}
        {lista.dados && !todos.length && <Vazio>Nenhum vídeo ainda. Cole o link de um vídeo do canal do Portal para começar.</Vazio>}
        {!!todos.length && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vídeo</th>
                  <th>Situação</th>
                  <th>Produtos</th>
                  <th>Cliques</th>
                  <th>Pedidos</th>
                  <th>Conversão</th>
                  <th>Receita</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {todos.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <div className="video-linha">
                        <img src={`https://i.ytimg.com/vi/${v.youtube_id}/mqdefault.jpg`} alt="" width={96} height={54} loading="lazy" />
                        <span>
                          <strong>{v.titulo}</strong>
                          <span className="nota">{v.canal ?? 'YouTube'} · {fmtData(v.criado_em)}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${COR_ESTADO[v.estado]}`}>{NOME_ESTADO[v.estado]}</span>
                    </td>
                    <td>{v.produtos}</td>
                    <td>{v.metricas.cliques}</td>
                    <td>{v.metricas.pedidos}</td>
                    <td>{conversao(v.metricas)}</td>
                    <td>{fmtBRL(v.metricas.receita_brl_centavos)}</td>
                    <td>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => setAberto(v.id)}>
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </>
  );
}

interface Linha {
  produto_id: string;
  momento: string;
  oferta_id: string;
}

function DetalheVideo({ api, id, aoVoltar }: { api: Api; id: string; aoVoltar: () => void }) {
  const { pode } = useEquipe();
  const podeEditar = pode('campanhas.gerenciar');
  const copiar = useCopiar();
  const { ocupado, executar } = useAcao();
  const [v, setV] = useState<VideoDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [mudou, setMudou] = useState(false);
  const produtos = useCarga(() => api.produtos({ limite: 100 }), [api]);
  const ofertas = useCarga(() => api.ofertasGestao(), [api]);

  const carregar = (d?: VideoDetalhe) => {
    const aplicar = (x: VideoDetalhe) => {
      setV(x);
      setLinhas(x.produtos.map((p) => ({ produto_id: p.produto_id, momento: momento(p.momento_s), oferta_id: p.oferta_id ?? '' })));
      setMudou(false);
    };
    if (d) return aplicar(d);
    api
      .video(id)
      .then(aplicar)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  };
  useEffect(() => carregar(), [api, id]);

  if (erro) return <CaixaErro erro={erro} onTentar={() => carregar()} />;
  if (!v) return <p className="carregando">Carregando o vídeo…</p>;

  const mudar = (i: number, campo: keyof Linha, valor: string) => {
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor, ...(campo === 'produto_id' ? { oferta_id: '' } : {}) } : l)));
    setMudou(true);
  };
  const usados = new Set(linhas.map((l) => l.produto_id));
  // Só oferta pública e valendo: o vídeo é aberto por qualquer pessoa.
  const ofertasDo = (produtoId: string) => (ofertas.dados?.ofertas ?? []).filter((o) => o.produto_id === produtoId && !o.exclusiva && o.estado === 'ATIVA');

  const salvarProdutos = () =>
    executar(
      'produtos',
      async () => {
        const lista: ProdutoNoVideo[] = linhas.filter((l) => l.produto_id).map((l) => ({ produto_id: l.produto_id, momento: l.momento.trim() || 0, oferta_id: l.oferta_id || null }));
        carregar(await api.produtosDoVideo(v.id, lista));
      },
      'Produtos do vídeo salvos.',
    );
  const mudarEstado = (estado: EstadoVideo) =>
    executar('estado', async () => carregar(await api.alterarVideo(v.id, { estado })), estado === 'PUBLICADO' ? 'Vídeo publicado no app.' : `Vídeo em ${NOME_ESTADO[estado].toLowerCase()}.`);
  const divulgar = (enviar: boolean) =>
    executar(
      'campanha',
      () => api.campanhaDoVideo(v.id, { segmento: { somente_clientes: true }, ...(enviar ? { enviar: 'agora' as const } : {}) }),
      (c) => (enviar ? `Campanha "${c.nome}" disparada para os clientes.` : `Campanha "${c.nome}" criada em rascunho na aba Campanhas.`),
    );

  return (
    <>
      <button type="button" className="btn btn-sm btn-outline" onClick={aoVoltar}>
        ← Todos os vídeos
      </button>

      <Cartao
        tag="T20 · RF-39 · RF-40"
        titulo={v.titulo}
        extra={<span className={`badge ${COR_ESTADO[v.estado]}`}>{NOME_ESTADO[v.estado]}</span>}
      >
        <div className="video-detalhe">
          <div className="video-player">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${v.youtube_id}?rel=0`}
              title={`Vídeo: ${v.titulo}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <div>
            <p className="nota">
              {v.canal ?? 'YouTube'} ·{' '}
              <a href={v.url_youtube} target="_blank" rel="noreferrer">
                abrir no YouTube
              </a>
            </p>
            <div className="grid-2">
              <Kpi rotulo="Cliques" valor={v.metricas.cliques} sub={`${v.metricas.interessados} abriram no app`} />
              <Kpi rotulo="Pedidos" valor={v.metricas.pedidos} sub={`Conversão ${conversao(v.metricas)}`} destaque="green" />
            </div>
            <Kpi rotulo="Receita pelo vídeo" valor={fmtBRL(v.metricas.receita_brl_centavos)} sub="Pedidos pagos com origem neste vídeo" />
            {podeEditar && (
              <div className="alternar acoes-video">
                {v.estado !== 'PUBLICADO' && (
                  <button type="button" className="btn btn-primary" disabled={!v.produtos.length || ocupado === 'estado'} onClick={() => void mudarEstado('PUBLICADO')}>
                    Publicar no app
                  </button>
                )}
                {v.estado === 'PUBLICADO' && (
                  <>
                    <button type="button" className="btn btn-blue" disabled={ocupado === 'campanha'} onClick={() => void divulgar(true)}>
                      <Megaphone size={15} /> Avisar clientes agora
                    </button>
                    <button type="button" className="btn btn-outline" disabled={ocupado === 'campanha'} onClick={() => void divulgar(false)}>
                      Criar campanha em rascunho
                    </button>
                    <button type="button" className="btn btn-outline" disabled={ocupado === 'estado'} onClick={() => void mudarEstado('ARQUIVADO')}>
                      Arquivar
                    </button>
                  </>
                )}
              </div>
            )}
            {!v.produtos.length && <p className="nota">Marque ao menos um produto para publicar.</p>}
          </div>
        </div>
      </Cartao>

      <Cartao tag="RF-39" titulo="Produtos do vídeo">
        <p className="texto-apoio">Informe o momento em que cada produto aparece (como 1:23). A oferta pública escolhida já vem aplicada para quem abrir pelo link.</p>
        {podeEditar ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Momento</th>
                    <th>Oferta</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={i}>
                      <td>
                        <select className="form-control" aria-label="Produto" value={l.produto_id} onChange={(e) => mudar(i, 'produto_id', e.target.value)}>
                          <option value="">Escolha o produto</option>
                          {(produtos.dados?.produtos ?? [])
                            .filter((p) => p.id === l.produto_id || !usados.has(p.id))
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nome} · {p.loja_nome} · {fmtUSD(p.preco_usd_centavos)}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td>
                        <input className="form-control input-momento" aria-label="Momento no vídeo" placeholder="0:42" value={l.momento} onChange={(e) => mudar(i, 'momento', e.target.value)} />
                      </td>
                      <td>
                        <select className="form-control" aria-label="Oferta" value={l.oferta_id} disabled={!l.produto_id} onChange={(e) => mudar(i, 'oferta_id', e.target.value)}>
                          <option value="">Sem oferta</option>
                          {ofertasDo(l.produto_id).map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.titulo} · {fmtUSD(o.preco_promocional_usd_centavos)} · até {fmtData(o.fim)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-red"
                          aria-label="Tirar o produto do vídeo"
                          onClick={() => {
                            setLinhas((ls) => ls.filter((_, j) => j !== i));
                            setMudou(true);
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="alternar">
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => {
                  setLinhas((ls) => [...ls, { produto_id: '', momento: '', oferta_id: '' }]);
                  setMudou(true);
                }}
              >
                <Plus size={15} /> Produto
              </button>
              <button type="button" className="btn btn-sm btn-primary" disabled={!mudou || ocupado === 'produtos'} onClick={() => void salvarProdutos()}>
                {ocupado === 'produtos' ? 'Salvando…' : 'Salvar produtos'}
              </button>
            </div>
          </>
        ) : null}

        {!!v.produtos.length && (
          <>
            <h4 className="subtitulo">Links e resultados por produto</h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Momento</th>
                    <th>Produto</th>
                    <th>Link curto</th>
                    <th>Cliques</th>
                    <th>Pedidos</th>
                    <th>Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {v.produtos.map((p) => (
                    <tr key={p.id}>
                      <td className="mono">{momento(p.momento_s)}</td>
                      <td>
                        {p.produto_nome}
                        {p.oferta_titulo && (
                          <span className="nota">
                            {' '}
                            · {p.oferta_titulo} {p.oferta_valendo ? `(${fmtUSD(p.oferta_preco_usd_centavos ?? 0)})` : '(encerrada)'}
                          </span>
                        )}
                      </td>
                      <td>
                        <button type="button" className="link mono" onClick={() => void copiar(p.link, 'Link')}>
                          {p.link.replace(/^https?:\/\//, '')} <Copy size={13} aria-hidden="true" />
                        </button>
                      </td>
                      <td>{p.metricas.cliques}</td>
                      <td>{p.metricas.pedidos}</td>
                      <td>{fmtBRL(p.metricas.receita_brl_centavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Cartao>

      {!!v.produtos.length && (
        <Cartao tag="Automação" titulo="Texto pronto para o YouTube">
          <p className="texto-apoio">
            Cole na descrição do vídeo: com três produtos ou mais, o YouTube transforma os momentos em capítulos. Fixe o comentário para os links ficarem no topo.
          </p>
          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="texto-descricao">Descrição</label>
              <textarea id="texto-descricao" className="form-control texto-youtube" readOnly rows={10} value={v.texto_youtube.descricao} />
              <button type="button" className="btn btn-sm btn-outline" onClick={() => void copiar(v.texto_youtube.descricao, 'Descrição')}>
                <Copy size={15} /> Copiar descrição
              </button>
            </div>
            <div className="form-group">
              <label htmlFor="texto-comentario">Comentário fixado</label>
              <textarea id="texto-comentario" className="form-control texto-youtube" readOnly rows={10} value={v.texto_youtube.comentario_fixado} />
              <button type="button" className="btn btn-sm btn-outline" onClick={() => void copiar(v.texto_youtube.comentario_fixado, 'Comentário')}>
                <Copy size={15} /> Copiar comentário
              </button>
            </div>
          </div>
          <p className="nota">
            Automações ligadas: o link abre o produto no app com o cupom da oferta; quem abre pelo vídeo e não compra recebe um lembrete depois de 6 horas, uma vez, se aceitou
            mensagens (dentro do limite semanal de ofertas); e "Avisar clientes" cria uma campanha cujo link abre este vídeo no app.
          </p>
        </Cartao>
      )}
    </>
  );
}
