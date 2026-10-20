import type { ConfigPublica, Produto } from '../../api.ts';
import { aplicarBps, fmtBRL, fmtPct, fmtUSD, usdParaBrl } from '../../formato.ts';

export interface ItemSacola {
  produto: Produto;
  quantidade: number;
}

export interface Previa {
  totalUsd: number;
  subtotalBrl: number;
  taxaPix: number;
  taxaCambio: number;
  total: number;
  loja: number;
  portal: number;
  epyx: number;
  excedenteUsd: number;
}

/**
 * Prévia dos valores na sacola, com as mesmas regras do backend.
 * O valor que vale é o do pedido criado pelo servidor.
 */
export function calcularPrevia(itens: ItemSacola[], c: ConfigPublica): Previa {
  let totalUsd = 0;
  let subtotalBrl = 0;
  const porLoja = new Map<string, number>();
  for (const i of itens) {
    const usd = i.produto.preco_usd_centavos * i.quantidade;
    const brl = usdParaBrl(usd, c.cotacao_usd_brl);
    totalUsd += usd;
    subtotalBrl += brl;
    porLoja.set(i.produto.loja_id, (porLoja.get(i.produto.loja_id) ?? 0) + brl);
  }
  let portal = 0;
  let epyx = 0;
  for (const v of porLoja.values()) {
    portal += aplicarBps(v, c.comissao_portal_bps);
    epyx += aplicarBps(v, c.comissao_epyx_bps);
  }
  const taxaPix = aplicarBps(subtotalBrl, c.taxa_pix_bps);
  const taxaCambio = aplicarBps(subtotalBrl, c.taxa_cambio_bps);
  return {
    totalUsd,
    subtotalBrl,
    taxaPix,
    taxaCambio,
    total: subtotalBrl + taxaPix + taxaCambio,
    loja: subtotalBrl - portal - epyx,
    portal,
    epyx,
    excedenteUsd: Math.max(0, totalUsd - c.cota_usd_centavos),
  };
}

export function ResumoValores({ p, c }: { p: Previa; c: ConfigPublica }) {
  const pctLoja = 10_000 - c.comissao_portal_bps - c.comissao_epyx_bps;
  return (
    <>
      {p.excedenteUsd > 0 ? (
        <div className="quota-alert warning">
          <strong>⚠️ Acima da cota de US$ {(c.cota_usd_centavos / 100).toFixed(0)} por pessoa (via terrestre).</strong>
          <br />
          Sua compra soma {fmtUSD(p.totalUsd)}, {fmtUSD(p.excedenteUsd)} acima da cota. O excedente pode ser tributado pela
          Receita Federal na volta ao Brasil.
        </div>
      ) : (
        p.totalUsd > 0 && (
          <div className="quota-alert">
            <strong>✅ Dentro da cota de US$ {(c.cota_usd_centavos / 100).toFixed(0)}.</strong> Restam{' '}
            {fmtUSD(c.cota_usd_centavos - p.totalUsd)} da sua cota.
          </div>
        )
      )}

      <dl className="resumo">
        <div>
          <dt>Produtos (US$)</dt>
          <dd>{fmtUSD(p.totalUsd)}</dd>
        </div>
        <div>
          <dt>Produtos em reais (US$ 1 = R$ {c.cotacao_usd_brl.toFixed(4).replace('.', ',')})</dt>
          <dd>{fmtBRL(p.subtotalBrl)}</dd>
        </div>
        <div>
          <dt>Taxa Pix ({fmtPct(c.taxa_pix_bps)})</dt>
          <dd>+ {fmtBRL(p.taxaPix)}</dd>
        </div>
        <div>
          <dt>Taxa de câmbio ({fmtPct(c.taxa_cambio_bps)})</dt>
          <dd>+ {fmtBRL(p.taxaCambio)}</dd>
        </div>
        <div className="resumo-total">
          <dt>Total no Pix</dt>
          <dd>{fmtBRL(p.total)}</dd>
        </div>
      </dl>

      <div className="split-previa">
        <div className="split-titulo">🔒 Divisão automática do valor dos produtos</div>
        <div className="split-bar">
          <div className="split-seg-store" style={{ width: `${pctLoja / 100}%` }}>
            {fmtPct(pctLoja)} loja
          </div>
          <div className="split-seg-portal" style={{ width: `${c.comissao_portal_bps / 100}%` }}>
            {fmtPct(c.comissao_portal_bps)}
          </div>
          <div className="split-seg-epyx" style={{ width: `${c.comissao_epyx_bps / 100}%` }}>
            {fmtPct(c.comissao_epyx_bps)}
          </div>
        </div>
        <div className="split-valores">
          <span>
            🏬 Loja(s): <strong>{fmtBRL(p.loja)}</strong>
          </span>
          <span>
            🇵🇾 Portal: <strong>{fmtBRL(p.portal)}</strong>
          </span>
          <span>
            ⚡ EPYX: <strong>{fmtBRL(p.epyx + p.taxaPix + p.taxaCambio)}</strong> <small>(com taxas)</small>
          </span>
        </div>
      </div>
    </>
  );
}
