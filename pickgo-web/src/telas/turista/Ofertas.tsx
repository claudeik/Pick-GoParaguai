import { Zap } from 'lucide-react';
import type { ConfigPublica, OfertaVitrine } from '../../api.ts';
import { emojiCategoria, fmtBRL, fmtUSD, usdParaBrl } from '../../formato.ts';
import { useContagem } from '../crm/Ofertas.tsx';

// Vitrine de ofertas por quantidade e tempo limitado (RF-28): contagem regressiva e unidades restantes.

export function VitrineOfertas({ ofertas, config, cupomAtivo, aoComprar }: { ofertas: OfertaVitrine[]; config: ConfigPublica | null; cupomAtivo: string; aoComprar: (o: OfertaVitrine) => void }) {
  return (
    <section className="vitrine-ofertas" aria-label="Ofertas por tempo limitado">
      <h3 className="card-title">
        <Zap size={18} /> Ofertas por tempo limitado
      </h3>
      <div className="ofertas-linha">
        {ofertas.map((o) => (
          <CartaoOferta key={o.id} o={o} config={config} ativa={cupomAtivo === o.codigo} aoComprar={() => aoComprar(o)} />
        ))}
      </div>
    </section>
  );
}

function CartaoOferta({ o, config, ativa, aoComprar }: { o: OfertaVitrine; config: ConfigPublica | null; ativa: boolean; aoComprar: () => void }) {
  const falta = useContagem(o.fim);
  const pct = Math.round((1 - o.preco_promocional_usd_centavos / o.preco_usd_centavos) * 100);
  return (
    <article className={`cartao-oferta ${ativa ? 'ativa' : ''}`}>
      <div className="oferta-topo">
        <span className="badge badge-red">−{pct}%</span>
        {o.exclusiva && <span className="badge badge-gold">Exclusiva para você</span>}
        <span className="oferta-tempo" aria-label={`termina em ${falta}`}>
          ⏱ {falta}
        </span>
      </div>
      <div className="oferta-produto">
        <span aria-hidden="true">{emojiCategoria(o.categoria)}</span>
        <div>
          <strong>{o.produto_nome}</strong>
          <div className="nota">{o.loja_nome}</div>
        </div>
      </div>
      <div className="oferta-preco">
        <span className="riscado">{fmtUSD(o.preco_usd_centavos)}</span> <strong>{fmtUSD(o.preco_promocional_usd_centavos)}</strong>
        {config && <span className="nota"> · {fmtBRL(usdParaBrl(o.preco_promocional_usd_centavos, config.cotacao_usd_brl))} + taxas</span>}
      </div>
      <div className="nota">
        Restam <strong>{o.quantidade_restante}</strong> de {o.quantidade_total} · até {o.limite_por_cliente} por cliente · cupom <code>{o.codigo}</code>
      </div>
      <button type="button" className="btn btn-sm btn-primary btn-block" onClick={aoComprar} disabled={ativa}>
        {ativa ? 'Cupom aplicado na sacola' : 'Comprar na oferta'}
      </button>
    </article>
  );
}
