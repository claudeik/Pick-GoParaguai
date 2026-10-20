import { useState } from 'react';
import type { Api, Ocorrencia, Pedido, Resolucao, Responsavel, TipoOcorrencia } from '../api.ts';
import { fmtBRL, fmtData, NOME_OCORRENCIA, NOME_RESOLUCAO, NOME_RESPONSAVEL, RESOLUCOES_POR_TIPO } from '../formato.ts';
import { useCarga } from '../sessao.tsx';
import { CaixaErro, Cartao, useAcao, Vazio } from './comum.tsx';

// Seção 3.3.2 · RF-15, RF-45, RF-48: quem, quando, tipo, responsável e resolução.
// Acerto na fatura vira lançamento no ledger; nunca altera lançamento antigo.

/** Tipos que a equipe abre à mão. DEFEITO_TESTE nasce do teste da loja. */
const TIPOS_MANUAIS: TipoOcorrencia[] = ['ITEM_FALTANTE', 'ITEM_A_MAIS', 'DIVERGENCIA_SAIDA', 'DEFEITO_POS_SAIDA'];

export function PainelOcorrencias({
  api,
  pedidos,
  podeAbrir,
  podeResolver,
  tag = 'Seção 3.3.2 · RF-15 · RF-48',
}: {
  api: Api;
  pedidos: Pedido[];
  podeAbrir: boolean;
  podeResolver: boolean;
  tag?: string;
}) {
  const lista = useCarga(() => api.ocorrencias(), [api], 8000);
  const [filtro, setFiltro] = useState<'ABERTA' | 'TODAS'>('ABERTA');
  const ocorrencias = (lista.dados?.ocorrencias ?? []).filter((o) => filtro === 'TODAS' || o.estado === 'ABERTA');
  const codigoDe = (id: string) => pedidos.find((p) => p.id === id)?.codigo;

  return (
    <Cartao
      tag={tag}
      titulo="Ocorrências do pedido"
      vermelho
      extra={
        <div className="botoes-linha">
          <button type="button" className={`btn btn-sm ${filtro === 'ABERTA' ? 'btn-blue' : 'btn-outline'}`} onClick={() => setFiltro('ABERTA')}>
            Abertas
          </button>
          <button type="button" className={`btn btn-sm ${filtro === 'TODAS' ? 'btn-blue' : 'btn-outline'}`} onClick={() => setFiltro('TODAS')}>
            Todas
          </button>
        </div>
      }
    >
      <details className="regra">
        <summary>Regra de responsabilidade (3.3.2)</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Situação</th>
                <th>Responsável</th>
                <th>Resolução</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Defeito no teste da loja, antes da saída</td>
                <td>Loja</td>
                <td>Troca do item; o pedido segue ao ponto de retirada</td>
              </tr>
              <tr>
                <td>Defeito depois que o cliente sai</td>
                <td>Loja</td>
                <td>Ticket encaminhado à loja, sem ônus ao Portal</td>
              </tr>
              <tr>
                <td>Item faltante</td>
                <td>Loja e Portal</td>
                <td>Acerto na fatura de repasse ou reposição na loja</td>
              </tr>
              <tr>
                <td>Item a mais</td>
                <td>Loja e Portal</td>
                <td>Acerto na fatura ou devolução e reposição</td>
              </tr>
              <tr>
                <td>Divergência na conferência de saída</td>
                <td>Conforme o caso</td>
                <td>Responsável registrado e ajuste na fatura</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="nota">O marco da mudança de responsabilidade é a conferência do QR na saída do cliente.</p>
      </details>

      <div className={podeAbrir ? 'grid-2' : ''}>
        {podeAbrir && <FormNovaOcorrencia api={api} pedidos={pedidos} aoCriar={lista.recarregar} />}
        <div>
          {lista.erro && <CaixaErro erro={lista.erro} onTentar={lista.recarregar} />}
          {lista.dados && ocorrencias.length === 0 && <Vazio>{filtro === 'ABERTA' ? 'Nenhuma ocorrência aberta.' : 'Nenhuma ocorrência registrada.'}</Vazio>}
          <ul className="lista-ocorrencias">
            {ocorrencias.map((o) => (
              <ItemOcorrencia key={o.id} o={o} codigo={o.pedido_codigo ?? codigoDe(o.pedido_id)} api={api} podeResolver={podeResolver} aoMudar={lista.recarregar} />
            ))}
          </ul>
        </div>
      </div>
    </Cartao>
  );
}

function FormNovaOcorrencia({ api, pedidos, aoCriar }: { api: Api; pedidos: Pedido[]; aoCriar: () => Promise<void> }) {
  const { ocupado, executar } = useAcao();
  const [pedidoId, setPedidoId] = useState('');
  const [tipo, setTipo] = useState<TipoOcorrencia>('ITEM_FALTANTE');
  const [itemId, setItemId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [responsavel, setResponsavel] = useState<Responsavel>('A_DEFINIR');
  const pedido = pedidos.find((p) => p.id === pedidoId);

  return (
    <form
      className="painel-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pedidoId) return;
        void executar(
          'abrir',
          async () => {
            await api.abrirOcorrencia({
              pedido_id: pedidoId,
              item_id: itemId || undefined,
              tipo,
              descricao: descricao.trim(),
              responsavel: tipo === 'DIVERGENCIA_SAIDA' ? responsavel : undefined,
            });
            setDescricao('');
            setItemId('');
            await aoCriar();
          },
          'Ocorrência registrada.',
        );
      }}
    >
      <h4 className="subtitulo">Registrar ocorrência</h4>
      <div className="form-group">
        <label htmlFor="oc-pedido">Pedido</label>
        <select id="oc-pedido" className="form-control" required value={pedidoId} onChange={(e) => setPedidoId(e.target.value)}>
          <option value="">Escolha o pedido</option>
          {pedidos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.codigo} · {p.cliente_nome ?? ''} · {p.estado}
            </option>
          ))}
        </select>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="oc-tipo">Situação</label>
          <select id="oc-tipo" className="form-control" value={tipo} onChange={(e) => setTipo(e.target.value as TipoOcorrencia)}>
            {TIPOS_MANUAIS.map((t) => (
              <option key={t} value={t}>
                {NOME_OCORRENCIA[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="oc-item">Item (opcional)</label>
          <select id="oc-item" className="form-control" value={itemId} onChange={(e) => setItemId(e.target.value)} disabled={!pedido}>
            <option value="">Pedido inteiro</option>
            {pedido?.itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.quantidade}× {i.nome_produto} ({i.loja_nome})
              </option>
            ))}
          </select>
        </div>
      </div>
      {tipo === 'DIVERGENCIA_SAIDA' && (
        <div className="form-group">
          <label htmlFor="oc-resp">Responsável</label>
          <select id="oc-resp" className="form-control" value={responsavel} onChange={(e) => setResponsavel(e.target.value as Responsavel)}>
            {(['A_DEFINIR', 'LOJA', 'PORTAL', 'LOJA_E_PORTAL'] as Responsavel[]).map((r) => (
              <option key={r} value={r}>
                {NOME_RESPONSAVEL[r]}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="form-group">
        <label htmlFor="oc-desc">Descrição</label>
        <textarea id="oc-desc" className="form-control" rows={2} required minLength={3} maxLength={1000} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary btn-block" disabled={!pedidoId || ocupado === 'abrir'}>
        ⚠️ Registrar ocorrência
      </button>
    </form>
  );
}

function ItemOcorrencia({ o, codigo, api, podeResolver, aoMudar }: { o: Ocorrencia; codigo?: string; api: Api; podeResolver: boolean; aoMudar: () => Promise<void> }) {
  const { ocupado, executar } = useAcao();
  const opcoes = RESOLUCOES_POR_TIPO[o.tipo];
  const [resolucao, setResolucao] = useState<Resolucao>(opcoes[0]!);
  const [valor, setValor] = useState('');
  const [responsavel, setResponsavel] = useState<Responsavel>(o.responsavel === 'A_DEFINIR' ? 'LOJA' : o.responsavel);
  const centavos = Math.round(Number(valor.replace(',', '.')) * 100);
  const valido = resolucao !== 'ACERTO_FATURA' || centavos > 0;

  return (
    <li className={`ocorrencia ${o.responsavel === 'LOJA' ? 'resp-loja' : 'resp-portal'}`}>
      <div className="ocorrencia-topo">
        <strong>
          {NOME_OCORRENCIA[o.tipo]} {codigo && <>· {codigo}</>}
        </strong>
        <span className={`badge ${o.estado === 'ABERTA' ? 'badge-gold' : 'badge-green'}`}>{o.estado === 'ABERTA' ? 'Aberta' : 'Resolvida'}</span>
      </div>
      {o.descricao && <div>{o.descricao}</div>}
      <div className="nota">
        Responsável: <strong>{NOME_RESPONSAVEL[o.responsavel]}</strong> · aberta por {o.aberta_por} em {fmtData(o.aberta_em)}
        {o.resolucao && (
          <>
            {' '}
            · {NOME_RESOLUCAO[o.resolucao]}
            {o.valor_ajuste_centavos ? ` de ${fmtBRL(o.valor_ajuste_centavos)}` : ''} por {o.resolvida_por} em {fmtData(o.resolvida_em)}
          </>
        )}
      </div>

      {podeResolver && o.estado === 'ABERTA' && o.tipo !== 'DEFEITO_TESTE' && (
        <form
          className="resolver"
          onSubmit={(e) => {
            e.preventDefault();
            void executar(
              'resolver',
              async () => {
                await api.resolverOcorrencia(o.id, {
                  resolucao,
                  valor_ajuste_centavos: resolucao === 'ACERTO_FATURA' ? centavos : undefined,
                  responsavel: o.responsavel === 'A_DEFINIR' ? responsavel : undefined,
                });
                await aoMudar();
              },
              resolucao === 'ACERTO_FATURA' ? 'Ajuste lançado na fatura de repasse.' : 'Ocorrência resolvida.',
            );
          }}
        >
          <select className="form-control" aria-label="Resolução" value={resolucao} onChange={(e) => setResolucao(e.target.value as Resolucao)}>
            {opcoes.map((r) => (
              <option key={r} value={r}>
                {NOME_RESOLUCAO[r]}
              </option>
            ))}
          </select>
          {o.responsavel === 'A_DEFINIR' && (
            <select className="form-control" aria-label="Responsável" value={responsavel} onChange={(e) => setResponsavel(e.target.value as Responsavel)}>
              {(['LOJA', 'PORTAL', 'LOJA_E_PORTAL'] as Responsavel[]).map((r) => (
                <option key={r} value={r}>
                  {NOME_RESPONSAVEL[r]}
                </option>
              ))}
            </select>
          )}
          {resolucao === 'ACERTO_FATURA' && (
            <input className="form-control" inputMode="decimal" placeholder="Valor R$" aria-label="Valor do ajuste em reais" value={valor} onChange={(e) => setValor(e.target.value)} />
          )}
          <button type="submit" className="btn btn-sm btn-blue" disabled={!valido || ocupado === 'resolver'}>
            Resolver
          </button>
        </form>
      )}
      {o.tipo === 'DEFEITO_TESTE' && o.estado === 'ABERTA' && <p className="nota">Fecha quando a loja trocar o item e o novo teste for aprovado.</p>}
    </li>
  );
}
