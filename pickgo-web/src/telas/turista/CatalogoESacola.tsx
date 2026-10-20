import { useEffect, useMemo, useState } from 'react';
import type { ConfigPublica, Modo, OfertaVitrine, Produto } from '../../api.ts';
import { VitrineOfertas } from './Ofertas.tsx';
import { CaixaErro, Cartao, useAcao, Vazio } from '../../componentes/comum.tsx';
import { emojiCategoria, fmtBRL, fmtUSD, usdParaBrl } from '../../formato.ts';
import { useApiCliente, useCarga } from '../../sessao.tsx';
import { calcularPrevia, ResumoValores, type ItemSacola } from './previa.tsx';

const CHAVE_SACOLA = 'pickgo.sacola';
export const CHAVE_CUPOM = 'pickgo.cupom';
export const CHAVE_LINK = 'pickgo.campanha_link';
/** Código do link do vídeo que levou o produto à sacola (origem do pedido, RF-31). */
export const CHAVE_VIDEO = 'pickgo.video_link';

export function lerLocal(chave: string): string {
  try {
    return localStorage.getItem(chave) ?? '';
  } catch {
    return '';
  }
}
export function gravarLocal(chave: string, valor: string) {
  try {
    if (valor) localStorage.setItem(chave, valor);
    else localStorage.removeItem(chave);
  } catch {
    // sem armazenamento: vale só nesta aba
  }
}

/** Põe um produto na sacola guardada (a aba Vídeos usa antes de abrir o catálogo). */
export function colocarNaSacola(p: Produto) {
  const s = lerSacola();
  const i = s.find((x) => x.produto.id === p.id);
  const nova = i ? s : [...s, { produto: p, quantidade: 1 }];
  try {
    localStorage.setItem(CHAVE_SACOLA, JSON.stringify(nova));
  } catch {
    // sem armazenamento: a sacola vale só nesta aba
  }
}

function lerSacola(): ItemSacola[] {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE_SACOLA) ?? '[]') as ItemSacola[];
    return Array.isArray(s) ? s : [];
  } catch {
    return [];
  }
}

export function CatalogoESacola({ config, aoGerarPix }: { config: ConfigPublica | null; aoGerarPix: (pedidoId: string) => void }) {
  const api = useApiCliente();
  const [lojaFiltro, setLojaFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [sacola, setSacola] = useState<ItemSacola[]>(lerSacola);
  const [cupom, setCupom] = useState(() => lerLocal(CHAVE_CUPOM));
  const [cupomDigitado, setCupomDigitado] = useState('');
  const ofertas = useCarga(() => api.ofertas(), [api], 30_000);
  const oferta: OfertaVitrine | undefined = ofertas.dados?.ofertas.find((o) => o.codigo === cupom.toUpperCase());
  useEffect(() => gravarLocal(CHAVE_CUPOM, cupom), [cupom]);
  const [modo, setModo] = useState<Modo>('RETIRADA_PORTAL');
  const [janela, setJanela] = useState('');
  const { ocupado, executar } = useAcao();

  const lojas = useCarga(() => api.lojas(), [api]);
  const produtos = useCarga(
    () => api.produtos({ loja_id: lojaFiltro || undefined, busca: buscaAplicada || undefined }),
    [api, lojaFiltro, buscaAplicada],
  );

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_SACOLA, JSON.stringify(sacola));
    } catch {
      // sem armazenamento: a sacola vale só nesta aba
    }
  }, [sacola]);

  const lojasNaSacola = useMemo(() => new Set(sacola.map((i) => i.produto.loja_id)), [sacola]);
  useEffect(() => {
    if (modo === 'RETIRADA_LOJA' && lojasNaSacola.size > 1) setModo('RETIRADA_PORTAL');
  }, [modo, lojasNaSacola]);

  const adicionar = (p: Produto) =>
    setSacola((s) => {
      const i = s.find((x) => x.produto.id === p.id);
      if (i) return s.map((x) => (x === i ? { ...x, quantidade: Math.min(x.quantidade + 1, p.estoque, 20) } : x));
      return [...s, { produto: p, quantidade: 1 }];
    });
  const mudarQtd = (id: string, delta: number) =>
    setSacola((s) =>
      s
        .map((x) => (x.produto.id === id ? { ...x, quantidade: Math.min(x.quantidade + delta, x.produto.estoque, 20) } : x))
        .filter((x) => x.quantidade > 0),
    );

  const comprarNaOferta = (o: OfertaVitrine) => {
    setCupom(o.codigo);
    const p: Produto = {
      id: o.produto_id,
      loja_id: o.loja_id,
      loja_nome: o.loja_nome,
      nome: o.produto_nome,
      categoria: o.categoria,
      preco_usd_centavos: o.preco_usd_centavos,
      estoque: o.quantidade_restante,
      foto_url: o.foto_url,
      codigo_barras: null,
    };
    setSacola((s) => (s.some((x) => x.produto.id === p.id) ? s.map((x) => (x.produto.id === p.id ? { ...x, quantidade: Math.min(x.quantidade, o.limite_por_cliente) } : x)) : [...s, { produto: p, quantidade: 1 }]));
  };

  const fecharCompra = () =>
    executar(
      'pix',
      async () => {
        const p = await api.criarPedido({
          modo,
          janela_chegada: janela.trim() || undefined,
          itens: sacola.map((i) => ({ produto_id: i.produto.id, quantidade: i.quantidade })),
          cupom: cupom || undefined,
          campanha_link: lerLocal(CHAVE_LINK) || undefined,
          video_link: lerLocal(CHAVE_VIDEO) || undefined,
        });
        // O pedido já reservou o estoque: esvazia a sacola antes do Pix, para um
        // erro na cobrança não levar a um segundo pedido. O diálogo gera o Pix.
        setSacola([]);
        setCupom('');
        gravarLocal(CHAVE_LINK, '');
        gravarLocal(CHAVE_VIDEO, '');
        void produtos.recarregar();
        aoGerarPix(p.id);
        return p;
      },
      (p) => `Pedido ${p.codigo} criado. Pague o Pix para confirmar.`,
    );

  // Prévia com o preço da oferta no produto do cupom (o servidor confirma).
  const comOferta = sacola.map((i) => (oferta && i.produto.id === oferta.produto_id ? { ...i, produto: { ...i.produto, preco_usd_centavos: oferta.preco_promocional_usd_centavos } } : i));
  const previa = config ? calcularPrevia(comOferta, config) : null;
  const passouLimite = !!oferta && sacola.some((i) => i.produto.id === oferta.produto_id && i.quantidade > oferta.limite_por_cliente);
  const lojaUnica = lojasNaSacola.size === 1 ? lojas.dados?.lojas.find((l) => lojasNaSacola.has(l.id)) : undefined;

  return (
    <div className="layout-sidebar">
      <div className="coluna-catalogo">
      {!!ofertas.dados?.ofertas.length && <VitrineOfertas ofertas={ofertas.dados.ofertas} config={config} cupomAtivo={cupom} aoComprar={comprarNaOferta} />}
      <Cartao tag="T1 · RF-01" titulo="Catálogo das lojas do Portal Paraguai">
        <div className="filtros">
          <div className="store-pills">
            <button type="button" className={`store-pill ${lojaFiltro === '' ? 'active' : ''}`} onClick={() => setLojaFiltro('')}>
              🇵🇾 Todas as lojas
            </button>
            {lojas.dados?.lojas.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`store-pill ${lojaFiltro === l.id ? 'active' : ''}`}
                onClick={() => setLojaFiltro(l.id)}
              >
                🏬 {l.nome}
              </button>
            ))}
          </div>
          <form
            className="busca"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              setBuscaAplicada(busca.trim());
            }}
          >
            <input
              type="search"
              className="form-control"
              placeholder="Buscar produto ou loja"
              aria-label="Buscar produto ou loja"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-outline">
              Buscar
            </button>
          </form>
        </div>

        {produtos.erro && <CaixaErro erro={produtos.erro} onTentar={produtos.recarregar} />}
        {produtos.dados && produtos.dados.produtos.length === 0 && <Vazio>Nenhum produto encontrado.</Vazio>}
        <div className="grid-2">
          {produtos.dados?.produtos.map((p) => {
            const naSacola = sacola.find((i) => i.produto.id === p.id)?.quantidade ?? 0;
            const esgotado = p.estoque - naSacola <= 0;
            return (
              <article key={p.id} className="product-card">
                <div className="product-visual">
                  <span className="product-store-tag">{p.loja_nome}</span>
                  <span className="product-stock-tag">{p.estoque > 0 ? `Estoque: ${p.estoque}` : 'Esgotado'}</span>
                  {p.foto_url ? <img src={p.foto_url} alt="" className="product-foto" /> : <span aria-hidden="true">{emojiCategoria(p.categoria)}</span>}
                </div>
                <div className="product-body">
                  <span className="product-sku">
                    {p.categoria}
                    {p.codigo_barras && <> · EAN {p.codigo_barras}</>}
                  </span>
                  <h4 className="product-title">{p.nome}</h4>
                  {p.descricao && <p className="product-descricao">{p.descricao}</p>}
                  <div className="price-box">
                    <span className="price-usd">Preço na loja: {fmtUSD(p.preco_usd_centavos)}</span>
                    {config && (
                      <span className="price-brl">
                        {fmtBRL(usdParaBrl(p.preco_usd_centavos, config.cotacao_usd_brl))} <small>+ taxas no Pix</small>
                      </span>
                    )}
                  </div>
                  <button type="button" className="btn btn-sm btn-blue btn-block" disabled={esgotado} onClick={() => adicionar(p)}>
                    {esgotado ? 'Sem estoque' : naSacola ? `+ Sacola (${naSacola})` : '+ Sacola Pick & Go'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </Cartao>
      </div>

      <aside className="card card-flag-red sacola">
        <div className="card-header">
          <div>
            <span className="screen-tag red">T2 · T3 · RF-02 · RF-03 · RF-05</span>
            <h3 className="card-title">Sacola e pagamento</h3>
          </div>
          <span className="badge badge-blue">{lojasNaSacola.size} loja(s)</span>
        </div>

        {sacola.length === 0 ? (
          <Vazio>
            <span className="vazio-icone">🛍️</span>
            Sua sacola está vazia. Adicione produtos das lojas de Ciudad del Este.
          </Vazio>
        ) : (
          <ul className="itens-sacola">
            {sacola.map((i) => (
              <li key={i.produto.id}>
                <div className="item-topo">
                  <div>
                    <span className="badge badge-blue">{i.produto.loja_nome}</span>
                    <div className="item-nome">
                      {emojiCategoria(i.produto.categoria)} {i.produto.nome}
                    </div>
                  </div>
                  <button type="button" className="btn btn-sm btn-outline-red btn-mini" aria-label={`Remover ${i.produto.nome}`} onClick={() => mudarQtd(i.produto.id, -i.quantidade)}>
                    ✕
                  </button>
                </div>
                <div className="item-base">
                  <div className="qtd">
                    <button type="button" className="btn btn-sm btn-outline btn-mini" aria-label="Diminuir" onClick={() => mudarQtd(i.produto.id, -1)}>
                      −
                    </button>
                    <strong aria-live="polite">{i.quantidade}</strong>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline btn-mini"
                      aria-label="Aumentar"
                      disabled={i.quantidade >= i.produto.estoque}
                      onClick={() => mudarQtd(i.produto.id, 1)}
                    >
                      +
                    </button>
                  </div>
                  <div className="item-preco">
                    <span>{fmtUSD(i.produto.preco_usd_centavos * i.quantidade)}</span>
                    {config && <strong>{fmtBRL(usdParaBrl(i.produto.preco_usd_centavos * i.quantidade, config.cotacao_usd_brl))}</strong>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="form-group">
          <label htmlFor="modo">📍 Como você quer receber (RF-03)</label>
          <select id="modo" className="form-control" value={modo} onChange={(e) => setModo(e.target.value as Modo)}>
            <option value="RETIRADA_PORTAL">🏢 Retirar na central do Portal (junta todas as lojas)</option>
            <option value="RETIRADA_LOJA" disabled={lojasNaSacola.size > 1}>
              🏪 Retirar no balcão da loja{lojasNaSacola.size > 1 ? ' (só com 1 loja na sacola)' : ''}
            </option>
            <option value="ENVIO_BRASIL" disabled>
              🚚 Envio ao Brasil (em breve)
            </option>
          </select>
          {modo === 'RETIRADA_LOJA' && lojaUnica && (
            <p className="nota">
              Retirada: {lojaUnica.ponto_retirada_descricao ?? (lojaUnica.ponto_retirada_tipo === 'ANEXO' ? 'anexo da loja' : 'dentro da loja')} ·{' '}
              {lojaUnica.horario_abertura} às {lojaUnica.horario_fechamento}
            </p>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="janela">🕒 Quando você chega? (opcional)</label>
          <input id="janela" className="form-control" placeholder="Ex.: sábado de manhã" maxLength={60} value={janela} onChange={(e) => setJanela(e.target.value)} />
        </div>

        <div className="form-group">
          <label htmlFor="cupom">🎟️ Cupom</label>
          {cupom ? (
            <div className="cupom-ativo">
              <span>
                <code>{cupom}</code> {oferta ? `· ${oferta.titulo}` : '· confirmado ao gerar o Pix'}
              </span>
              <button type="button" className="btn btn-sm btn-outline btn-mini" onClick={() => setCupom('')} aria-label="Tirar cupom">
                ✕
              </button>
            </div>
          ) : (
            <form
              className="busca"
              onSubmit={(e) => {
                e.preventDefault();
                if (cupomDigitado.trim()) setCupom(cupomDigitado.trim().toUpperCase());
                setCupomDigitado('');
              }}
            >
              <input id="cupom" className="form-control" placeholder="PICKGO-XXXX" value={cupomDigitado} onChange={(e) => setCupomDigitado(e.target.value)} />
              <button type="submit" className="btn btn-sm btn-outline">
                Aplicar
              </button>
            </form>
          )}
          {oferta && !sacola.some((i) => i.produto.id === oferta.produto_id) && <p className="nota">Adicione {oferta.produto_nome} para usar o cupom.</p>}
          {passouLimite && <p className="nota destaque">A oferta vale para até {oferta!.limite_por_cliente} unidade(s) por cliente; diminua a quantidade.</p>}
        </div>

        {previa && config && sacola.length > 0 && <ResumoValores p={previa} c={config} />}

        <button
          type="button"
          className="btn btn-primary btn-block botao-pix"
          disabled={sacola.length === 0 || ocupado === 'pix' || passouLimite}
          onClick={() => void fecharCompra()}
        >
          {ocupado === 'pix' ? 'Gerando Pix…' : '💠 Gerar QR Code Pix'}
        </button>
      </aside>
    </div>
  );
}
