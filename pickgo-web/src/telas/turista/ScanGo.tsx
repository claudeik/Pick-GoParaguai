import { useEffect, useState, type FormEvent } from 'react';
import { ErroApi, type ConfigPublica, type Produto } from '../../api.ts';
import { Cartao, useAcao, Vazio } from '../../componentes/comum.tsx';
import { LeitorCamera, temCamera } from '../../componentes/LeitorCamera.tsx';
import { emojiCategoria, fmtBRL, fmtUSD, usdParaBrl } from '../../formato.ts';
import { useApiCliente, useCarga, useSessao } from '../../sessao.tsx';
import { calcularPrevia, ResumoValores, type ItemSacola } from './previa.tsx';

// T5 · RF-14: dentro da loja, o cliente lê o código de barras, paga por Pix e
// recebe o QR de saída (T6), conferido pela equipe na porta.

export function ScanGo({ config, aoGerarPix }: { config: ConfigPublica | null; aoGerarPix: (pedidoId: string) => void }) {
  const api = useApiCliente();
  const { avisar, avisarErro } = useSessao();
  const { ocupado, executar } = useAcao();
  const lojas = useCarga(() => api.lojas(), [api]);
  const [lojaId, setLojaId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [itens, setItens] = useState<ItemSacola[]>([]);
  const [camera, setCamera] = useState(false);

  useEffect(() => {
    if (!lojaId && lojas.dados?.lojas[0]) setLojaId(lojas.dados.lojas[0].id);
  }, [lojas.dados, lojaId]);
  useEffect(() => setItens([]), [lojaId]);

  // Etiquetas da loja, para testar sem câmera.
  const etiquetas = useCarga(lojaId ? () => api.produtos({ loja_id: lojaId }) : null, [api, lojaId]);

  const adicionar = (p: Produto) => {
    setItens((s) => {
      const i = s.find((x) => x.produto.id === p.id);
      if (i) return s.map((x) => (x === i ? { ...x, quantidade: Math.min(x.quantidade + 1, p.estoque) } : x));
      return [...s, { produto: p, quantidade: 1 }];
    });
    avisar(`${p.nome} adicionado.`);
  };

  const lerCodigo = async (c: string) => {
    const valor = c.trim();
    if (!valor || !lojaId) return;
    try {
      adicionar(await api.produtoPorCodigo(lojaId, valor));
      setCodigo('');
    } catch (e) {
      if (e instanceof ErroApi && e.status === 404) avisar(`Código ${valor} não encontrado nesta loja.`, 'erro');
      else avisarErro(e);
    }
  };

  const pagar = () =>
    executar(
      'pagar',
      async () => {
        const p = await api.criarPedido({
          modo: 'SCAN_GO',
          loja_id: lojaId,
          itens: itens.map((i) => ({ codigo_barras: i.produto.codigo_barras ?? undefined, produto_id: i.produto.codigo_barras ? undefined : i.produto.id, quantidade: i.quantidade })),
        });
        setItens([]);
        aoGerarPix(p.id);
        return p;
      },
      (p) => `Pedido ${p.codigo} criado. Depois do Pix, mostre o QR de saída na porta.`,
    );

  const previa = config ? calcularPrevia(itens, config) : null;

  return (
    <div className="grid-2">
      <Cartao tag="T5 · RF-14" titulo="Scan & Go: leia o código do produto">
        <div className="form-group">
          <label htmlFor="loja-scan">Em qual loja você está?</label>
          <select id="loja-scan" className="form-control" value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
            {lojas.dados?.lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </div>

        {camera ? (
          <LeitorCamera aoLer={(c) => void lerCodigo(c)} aoFechar={() => setCamera(false)} />
        ) : (
          <div className="scanner">
            <div className="scanner-icone" aria-hidden="true">
              📷 ||| |||| |||
            </div>
            <form
              className="busca"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void lerCodigo(codigo);
              }}
            >
              <input
                className="form-control"
                inputMode="numeric"
                placeholder="Digite ou leia o código de barras"
                aria-label="Código de barras"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
              />
              <button type="submit" className="btn btn-sm btn-primary">
                Adicionar
              </button>
            </form>
            {temCamera() && (
              <button type="button" className="btn btn-sm btn-header-ghost" onClick={() => setCamera(true)}>
                Usar a câmera
              </button>
            )}
          </div>
        )}

        <h4 className="subtitulo">Etiquetas desta loja (toque para simular a leitura)</h4>
        {etiquetas.dados?.produtos.length === 0 && <Vazio>Esta loja ainda não tem produtos.</Vazio>}
        <ul className="lista-etiquetas">
          {etiquetas.dados?.produtos.map((p) => (
            <li key={p.id}>
              <div>
                <div className="item-nome">
                  {emojiCategoria(p.categoria)} {p.nome}
                </div>
                <div className="nota">
                  EAN {p.codigo_barras ?? '—'} · {fmtUSD(p.preco_usd_centavos)}
                </div>
              </div>
              <button type="button" className="btn btn-sm btn-primary" disabled={p.estoque === 0} onClick={() => adicionar(p)}>
                📲 {config ? fmtBRL(usdParaBrl(p.preco_usd_centavos, config.cotacao_usd_brl)) : 'Ler'}
              </button>
            </li>
          ))}
        </ul>
      </Cartao>

      <Cartao tag="T6 · RF-13 · RF-14" titulo="Sua compra nesta loja" vermelho>
        {itens.length === 0 ? (
          <Vazio>Nenhum item lido ainda.</Vazio>
        ) : (
          <ul className="itens-sacola">
            {itens.map((i) => (
              <li key={i.produto.id}>
                <div className="item-topo">
                  <div className="item-nome">
                    {i.quantidade}× {i.produto.nome}
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-red btn-mini"
                    aria-label={`Remover ${i.produto.nome}`}
                    onClick={() => setItens((s) => s.filter((x) => x !== i))}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {previa && config && itens.length > 0 && <ResumoValores p={previa} c={config} />}
        <button type="button" className="btn btn-primary btn-block botao-pix" disabled={!itens.length || ocupado === 'pagar'} onClick={() => void pagar()}>
          {ocupado === 'pagar' ? 'Gerando Pix…' : '💠 Pagar com Pix e receber o QR de saída'}
        </button>
        <p className="nota">
          Depois do pagamento, o pedido fica em <strong>Saída liberada</strong> e o QR aparece em “Meus pedidos”. Na porta, a equipe confere os
          itens (por amostragem ou total) antes de liberar.
        </p>
      </Cartao>
    </div>
  );
}
