import { Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Api, NovaOferta, OfertaGestao, PagadorDesconto, Produto } from '../../api.ts';
import { CaixaErro, Cartao, Dialogo, useAcao, Vazio } from '../../componentes/comum.tsx';
import { useEquipe } from '../../equipe.tsx';
import { fmtData, fmtUSD, lerDinheiro } from '../../formato.ts';
import { useCarga } from '../../sessao.tsx';

// Ofertas por quantidade e por tempo limitado (RF-28, RF-29).

export const NOME_PAGADOR: Record<PagadorDesconto, string> = { LOJA: 'Loja', PORTAL: 'Portal', DIVIDIDO: 'Loja e Portal (metade cada)' };

/** Tempo até `fim`, em "2 d 03 h", "03:12:09" ou "encerrada". */
export function useContagem(fim: string) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((new Date(fim).getTime() - agora) / 1000));
  if (!s) return 'encerrada';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return d ? `${d} d ${pad(h)} h` : `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

export function Ofertas({ api }: { api: Api }) {
  const { pode } = useEquipe();
  const lista = useCarga(() => api.ofertasGestao(), [api], 15_000);
  const [criando, setCriando] = useState(false);
  return (
    <Cartao
      tag="RF-28 · RF-29"
      titulo="Ofertas por quantidade e por tempo limitado"
      extra={
        pode('campanhas.gerenciar') ? (
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setCriando(true)}>
            <Zap size={15} /> Oferta pública
          </button>
        ) : undefined
      }
    >
      <p className="texto-apoio">Pública aparece no catálogo para todos, com contagem regressiva. Exclusiva vale só para o público da campanha, pelo cupom.</p>
      {lista.erro && <CaixaErro erro={lista.erro} onTentar={lista.recarregar} />}
      {lista.dados?.ofertas.length === 0 && <Vazio>Nenhuma oferta.</Vazio>}
      {!!lista.dados?.ofertas.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Oferta</th>
                <th>Preço</th>
                <th>Unidades</th>
                <th>Prazo</th>
                <th>Desconto pago por</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.dados.ofertas.map((o) => (
                <LinhaOferta key={o.id} o={o} api={api} aoMudar={lista.recarregar} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialogo aberto={criando} aoFechar={() => setCriando(false)} titulo="⚡ Nova oferta pública">
        {criando && (
          <FormOfertaAvulsa
            api={api}
            aoCriar={async () => {
              setCriando(false);
              await lista.recarregar();
            }}
          />
        )}
      </Dialogo>
    </Cartao>
  );
}

function LinhaOferta({ o, api, aoMudar }: { o: OfertaGestao; api: Api; aoMudar: () => Promise<void> }) {
  const { pode } = useEquipe();
  const { ocupado, executar } = useAcao();
  const falta = useContagem(o.fim);
  const pct = Math.round((o.vendidas / o.quantidade_total) * 100);
  return (
    <tr className={o.valendo ? '' : 'linha-inativa'}>
      <td>
        <strong>{o.titulo}</strong>
        <div className="nota">
          <code>{o.codigo}</code> · {o.produto_nome} · {o.loja_nome} · {o.exclusiva ? `exclusiva${o.campanha_nome ? ` de “${o.campanha_nome}”` : ''}` : 'pública'}
        </div>
      </td>
      <td>
        <strong>{fmtUSD(o.preco_promocional_usd_centavos)}</strong>
        <div className="nota riscado">{fmtUSD(o.preco_usd_centavos)}</div>
      </td>
      <td>
        <div className="barra-trilho estreita" aria-label={`${o.vendidas} de ${o.quantidade_total} vendidas`}>
          <span className="barra-valor" style={{ width: `${pct}%` }} />
        </div>
        <div className="nota">
          {o.vendidas}/{o.quantidade_total} vendidas · até {o.limite_por_cliente} por cliente
        </div>
      </td>
      <td>
        {o.valendo ? <span className="badge badge-gold">termina em {falta}</span> : <span className="badge badge-gray">{o.estado === 'ENCERRADA' ? 'encerrada' : o.quantidade_restante === 0 ? 'esgotada' : new Date(o.inicio) > new Date() ? 'ainda não começou' : 'prazo vencido'}</span>}
        <div className="nota">{fmtData(o.fim)}</div>
      </td>
      <td>{NOME_PAGADOR[o.pagador]}</td>
      <td>
        {pode('campanhas.gerenciar') && o.estado === 'ATIVA' && (
          <button type="button" className="btn btn-sm btn-outline-red" disabled={!!ocupado} onClick={() => void executar('encerrar', async () => (await api.encerrarOferta(o.id), await aoMudar()), 'Oferta encerrada.')}>
            Encerrar
          </button>
        )}
      </td>
    </tr>
  );
}

function FormOfertaAvulsa({ api, aoCriar }: { api: Api; aoCriar: () => Promise<void> }) {
  const [oferta, setOferta] = useState<NovaOferta | null>(null);
  const { ocupado, executar } = useAcao();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (oferta) void executar('criar', async () => (await api.criarOferta({ ...oferta, exclusiva: false }), await aoCriar()), 'Oferta publicada no catálogo.');
      }}
    >
      <CamposOferta api={api} aoMudar={setOferta} />
      <button type="submit" className="btn btn-primary btn-block botao-pix" disabled={!oferta || !!ocupado}>
        Publicar oferta
      </button>
    </form>
  );
}

const paraLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** Campos da oferta; devolve null enquanto estiver incompleta. */
export function CamposOferta({ api, aoMudar }: { api: Api; aoMudar: (o: NovaOferta | null) => void }) {
  const produtos = useCarga(() => api.produtos({ limite: 100 }), [api]);
  const [f, setF] = useState({
    produto_id: '',
    titulo: '',
    preco: '',
    quantidade: '10',
    limite: '1',
    inicio: paraLocal(new Date()),
    fim: paraLocal(new Date(Date.now() + 2 * 86_400_000)),
    pagador: 'LOJA' as PagadorDesconto,
    codigo: '',
  });
  const p: Produto | undefined = produtos.dados?.produtos.find((x) => x.id === f.produto_id);
  const preco = lerDinheiro(f.preco);
  const qtd = Number(f.quantidade);
  const limite = Number(f.limite);
  const erro =
    !p ? null : preco && preco >= p.preco_usd_centavos ? 'O preço da oferta precisa ser menor que o normal.' : qtd > p.estoque ? `A loja tem ${p.estoque} unidade(s) no app.` : new Date(f.fim) <= new Date(f.inicio) ? 'O fim precisa ser depois do início.' : null;

  useEffect(() => {
    const ok = p && preco && !erro && qtd > 0 && limite > 0 && f.titulo.trim().length >= 3;
    aoMudar(
      ok
        ? {
            produto_id: p!.id,
            titulo: f.titulo.trim(),
            preco_promocional_usd_centavos: preco!,
            quantidade_total: qtd,
            limite_por_cliente: limite,
            inicio: new Date(f.inicio).toISOString(),
            fim: new Date(f.fim).toISOString(),
            pagador: f.pagador,
            codigo: f.codigo.trim() ? `PICKGO-${f.codigo.trim().toUpperCase().replace(/^PICKGO-/, '')}` : undefined,
          }
        : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, p?.id, preco, erro]);

  const muda = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="campos-oferta">
      <div className="form-group">
        <label htmlFor="of-prod">Produto</label>
        <select id="of-prod" className="form-control" value={f.produto_id} onChange={(e) => {
          const x = produtos.dados?.produtos.find((y) => y.id === e.target.value);
          setF({ ...f, produto_id: e.target.value, titulo: f.titulo || (x ? `${x.nome} com preço de fronteira` : '') });
        }}>
          <option value="">Escolha um produto publicado</option>
          {produtos.dados?.produtos.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome} · {x.loja_nome} · {fmtUSD(x.preco_usd_centavos)} · {x.estoque} em estoque
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="of-tit">Título da oferta</label>
        <input id="of-tit" className="form-control" maxLength={120} value={f.titulo} onChange={muda('titulo')} />
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="of-preco">Preço da oferta (US$)</label>
          <input id="of-preco" className="form-control" inputMode="decimal" placeholder={p ? (p.preco_usd_centavos / 100).toFixed(2).replace('.', ',') : ''} value={f.preco} onChange={muda('preco')} />
          {p && preco && preco < p.preco_usd_centavos && <p className="nota">{Math.round((1 - preco / p.preco_usd_centavos) * 100)}% de desconto sobre {fmtUSD(p.preco_usd_centavos)}</p>}
        </div>
        <div className="form-group">
          <label htmlFor="of-pag">Quem paga o desconto</label>
          <select id="of-pag" className="form-control" value={f.pagador} onChange={(e) => setF({ ...f, pagador: e.target.value as PagadorDesconto })}>
            {Object.entries(NOME_PAGADOR).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="of-qtd">Unidades na oferta</label>
          <input id="of-qtd" className="form-control" inputMode="numeric" value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value.replace(/\D/g, '') })} />
        </div>
        <div className="form-group">
          <label htmlFor="of-lim">Limite por cliente</label>
          <input id="of-lim" className="form-control" inputMode="numeric" value={f.limite} onChange={(e) => setF({ ...f, limite: e.target.value.replace(/\D/g, '') })} />
        </div>
        <div className="form-group">
          <label htmlFor="of-ini">Começa</label>
          <input id="of-ini" type="datetime-local" className="form-control" value={f.inicio} onChange={muda('inicio')} />
        </div>
        <div className="form-group">
          <label htmlFor="of-fim">Termina</label>
          <input id="of-fim" type="datetime-local" className="form-control" value={f.fim} onChange={muda('fim')} />
        </div>
        <div className="form-group">
          <label htmlFor="of-cod">Cupom (opcional)</label>
          <input id="of-cod" className="form-control" placeholder="PICKGO-XXXX (gerado se vazio)" maxLength={19} value={f.codigo} onChange={muda('codigo')} />
        </div>
      </div>
      {erro && (
        <div className="caixa-erro" role="alert">
          {erro}
        </div>
      )}
      {f.pagador !== 'LOJA' && <p className="nota">O Portal completa o repasse da loja com a parte dele do desconto, lançada no ledger como despesa de campanha.</p>}
    </div>
  );
}
