import { useEffect, useState } from 'react';
import type { Api, ItemErp, TerceiroErp } from '../../api.ts';
import { CaixaErro, Cartao, Dialogo, useAcao, Vazio } from '../../componentes/comum.tsx';
import { useEquipe } from '../../equipe.tsx';
import { useCarga } from '../../sessao.tsx';
import { dataCurta, fmtGs, fmtQtd, NOME_IVA } from './comum.tsx';

// Cadastros do ERP: empresa e timbrado, clientes e fornecedores, itens e depósitos.

/** DV do RUC na tela, para avisar antes de enviar (o backend confere de novo). */
function dvRuc(numero: string) {
  let total = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    if (peso > 11) peso = 2;
    total += Number(numero[i]) * peso;
    peso++;
  }
  const r = total % 11;
  return r > 1 ? 11 - r : 0;
}
function avisoRuc(ruc: string) {
  const m = /^(\d{3,9})-(\d)$/.exec(ruc.replace(/[.\s]/g, ''));
  if (!m) return 'Formato 80012345-6';
  return dvRuc(m[1]!) === Number(m[2]) ? null : `Dígito verificador não confere (seria ${dvRuc(m[1]!)})`;
}

export function Cadastros({ api }: { api: Api }) {
  return (
    <>
      <Empresa api={api} />
      <Terceiros api={api} />
      <Itens api={api} />
      <Depositos api={api} />
    </>
  );
}

function Empresa({ api }: { api: Api }) {
  const { pode } = useEquipe();
  const e = useCarga(() => api.erpEmpresa(), [api]);
  const { ocupado, executar } = useAcao();
  const [f, setF] = useState({ ruc: '', razao_social: '', nome_fantasia: '', endereco: '', atividade: '', timbrado: '', timbrado_inicio: '', timbrado_fim: '', estabelecimento: '001', ponto_expedicao: '001' });
  useEffect(() => {
    const x = e.dados?.empresa;
    if (x) setF({ ruc: `${x.ruc}-${x.dv}`, razao_social: x.razao_social, nome_fantasia: x.nome_fantasia ?? '', endereco: x.endereco ?? '', atividade: x.atividade ?? '', timbrado: x.timbrado, timbrado_inicio: String(x.timbrado_inicio).slice(0, 10), timbrado_fim: String(x.timbrado_fim).slice(0, 10), estabelecimento: x.estabelecimento, ponto_expedicao: x.ponto_expedicao });
  }, [e.dados]);
  const aviso = f.ruc ? avisoRuc(f.ruc) : null;
  const edita = pode('erp.fiscal');
  const campo = (k: keyof typeof f, rotulo: string, extra: Record<string, unknown> = {}) => (
    <div className="form-group">
      <label htmlFor={`em-${k}`}>{rotulo}</label>
      <input id={`em-${k}`} className="form-control" readOnly={!edita} value={f[k]} onChange={(ev) => setF({ ...f, [k]: ev.target.value })} {...extra} />
    </div>
  );
  return (
    <Cartao tag="Empresa" titulo="Dados do Portal Paraguai e timbrado">
      {e.erro && <CaixaErro erro={e.erro} />}
      {!e.dados?.empresa && <p className="quota-alert warning">Cadastre o RUC e o timbrado antes de emitir faturas.</p>}
      {e.dados?.empresa && (
        <p className="nota">
          Próxima fatura {e.dados.empresa.estabelecimento}-{e.dados.empresa.ponto_expedicao}-{String(e.dados.empresa.proximo_numero).padStart(7, '0')} · próxima nota de crédito nº {e.dados.empresa.proximo_numero_nc} · timbrado vale até {dataCurta(e.dados.empresa.timbrado_fim)}
        </p>
      )}
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          if (aviso) return;
          void executar('empresa', async () => {
            await api.erpSalvarEmpresa({ ...f, nome_fantasia: f.nome_fantasia || null, endereco: f.endereco || null, atividade: f.atividade || null });
            await e.recarregar();
          }, 'Dados da empresa salvos.');
        }}
      >
        <div className="grid-2">
          {campo('ruc', 'RUC (com dígito)', { placeholder: '80012345-6' })}
          {campo('razao_social', 'Razão social')}
          {campo('nome_fantasia', 'Nome fantasia')}
          {campo('endereco', 'Endereço')}
          {campo('atividade', 'Atividade econômica')}
          {campo('timbrado', 'Timbrado (8 dígitos)', { inputMode: 'numeric', maxLength: 8 })}
          {campo('timbrado_inicio', 'Vigência: início', { type: 'date' })}
          {campo('timbrado_fim', 'Vigência: fim', { type: 'date' })}
          {campo('estabelecimento', 'Estabelecimento', { maxLength: 3 })}
          {campo('ponto_expedicao', 'Ponto de expedição', { maxLength: 3 })}
        </div>
        {aviso && <p className="nota destaque">{aviso}</p>}
        {edita && (
          <button type="submit" className="btn btn-primary" disabled={!!ocupado || !!aviso}>
            Salvar
          </button>
        )}
      </form>
    </Cartao>
  );
}

function Terceiros({ api }: { api: Api }) {
  const { pode } = useEquipe();
  const lista = useCarga(() => api.erpTerceiros(), [api]);
  const [novo, setNovo] = useState(false);
  return (
    <Cartao
      tag="Cadastros"
      titulo="Clientes e fornecedores"
      extra={
        pode('erp.fiscal') ? (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setNovo(true)}>
            + Cadastrar
          </button>
        ) : undefined
      }
    >
      <p className="texto-apoio">Cada loja do Pick & Go entra aqui como cliente do Portal, com o RUC dela, para receber as faturas de comissão.</p>
      {lista.dados?.terceiros.length === 0 && <Vazio>Nenhum cadastro.</Vazio>}
      {!!lista.dados?.terceiros.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Razão social</th>
                <th>Documento</th>
                <th>Papel</th>
                <th>Loja do Pick & Go</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.dados.terceiros.map((t) => (
                <LinhaTerceiro key={t.id} t={t} api={api} aoMudar={lista.recarregar} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialogo aberto={novo} aoFechar={() => setNovo(false)} titulo="Novo cliente ou fornecedor">
        {novo && (
          <FormTerceiro
            api={api}
            aoSalvar={async () => {
              setNovo(false);
              await lista.recarregar();
            }}
          />
        )}
      </Dialogo>
    </Cartao>
  );
}

function LinhaTerceiro({ t, api, aoMudar }: { t: TerceiroErp; api: Api; aoMudar: () => Promise<void> }) {
  const { pode } = useEquipe();
  const { ocupado, executar } = useAcao();
  return (
    <tr className={t.ativo ? '' : 'linha-inativa'}>
      <td>
        <strong>{t.razao_social}</strong>
        {t.email && <div className="nota">{t.email}</div>}
      </td>
      <td>
        {t.tipo_documento} {t.documento}
        {t.dv !== null ? `-${t.dv}` : ''}
      </td>
      <td>{[t.cliente && 'cliente', t.fornecedor && 'fornecedor'].filter(Boolean).join(' e ')}</td>
      <td>{t.loja_nome ?? '—'}</td>
      <td>
        {pode('erp.fiscal') && (
          <button type="button" className="btn btn-sm btn-outline" disabled={!!ocupado} onClick={() => void executar('ativo', async () => (await api.erpAlterarTerceiro(t.id, { ativo: !t.ativo }), await aoMudar()))}>
            {t.ativo ? 'Inativar' : 'Reativar'}
          </button>
        )}
      </td>
    </tr>
  );
}

function FormTerceiro({ api, aoSalvar }: { api: Api; aoSalvar: () => Promise<void> }) {
  const { ocupado, executar } = useAcao();
  const lojas = useCarga(() => api.lojas(), [api]);
  const [f, setF] = useState({ tipo_documento: 'RUC' as TerceiroErp['tipo_documento'], documento: '', razao_social: '', email: '', telefone: '', cliente: true, fornecedor: false, loja_id: '' });
  const aviso = f.tipo_documento === 'RUC' && f.documento ? avisoRuc(f.documento) : null;
  const ok = f.documento.trim().length >= 3 && f.razao_social.trim().length >= 2 && (f.cliente || f.fornecedor) && !aviso;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        void executar('terceiro', async () => {
          await api.erpCriarTerceiro({ ...f, razao_social: f.razao_social.trim(), email: f.email || undefined, telefone: f.telefone || undefined, loja_id: f.loja_id || undefined });
          await aoSalvar();
        }, 'Cadastro salvo.');
      }}
    >
      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="tc-tipo">Documento</label>
          <div className="busca">
            <select className="form-control" aria-label="Tipo de documento" value={f.tipo_documento} onChange={(e) => setF({ ...f, tipo_documento: e.target.value as TerceiroErp['tipo_documento'] })}>
              {['RUC', 'CI', 'CPF', 'CNPJ', 'PASSAPORTE', 'EXTERIOR'].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <input id="tc-tipo" className="form-control" placeholder={f.tipo_documento === 'RUC' ? '80012345-6' : ''} value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} />
          </div>
          {aviso && <p className="nota destaque">{aviso}</p>}
        </div>
        <div className="form-group">
          <label htmlFor="tc-razao">Razão social</label>
          <input id="tc-razao" className="form-control" value={f.razao_social} onChange={(e) => setF({ ...f, razao_social: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="tc-email">E-mail</label>
          <input id="tc-email" type="email" className="form-control" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="tc-tel">Telefone</label>
          <input id="tc-tel" className="form-control" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} />
        </div>
      </div>
      <div className="opcoes">
        <label>
          <input type="checkbox" checked={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.checked })} /> Cliente
        </label>
        <label>
          <input type="checkbox" checked={f.fornecedor} onChange={(e) => setF({ ...f, fornecedor: e.target.checked })} /> Fornecedor
        </label>
      </div>
      {f.cliente && (
        <div className="form-group">
          <label htmlFor="tc-loja">É uma loja do Pick & Go?</label>
          <select id="tc-loja" className="form-control" value={f.loja_id} onChange={(e) => setF({ ...f, loja_id: e.target.value })}>
            <option value="">Não</option>
            {lojas.dados?.lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </div>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={!ok || !!ocupado}>
        Salvar
      </button>
    </form>
  );
}

function Itens({ api }: { api: Api }) {
  const { pode } = useEquipe();
  const lista = useCarga(() => api.erpItens(), [api]);
  const [novo, setNovo] = useState(false);
  const podeCriar = pode('erp.estoque') || pode('erp.fiscal');
  return (
    <Cartao
      tag="Cadastros"
      titulo="Itens do Portal"
      extra={
        podeCriar ? (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setNovo(true)}>
            + Item
          </button>
        ) : undefined
      }
    >
      <p className="texto-apoio">Mercadorias, insumos e serviços do próprio Portal (sacolas, etiquetas, material da central, serviços faturados). Os produtos das lojas ficam na lista mestre.</p>
      {lista.erro && <CaixaErro erro={lista.erro} />}
      {lista.dados?.itens.length === 0 && <Vazio>Nenhum item.</Vazio>}
      {!!lista.dados?.itens.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                <th>Tipo</th>
                <th>IVA</th>
                <th className="numero">Saldo</th>
                <th className="numero">Mínimo</th>
                <th className="numero">Custo médio</th>
                <th className="numero">Preço de venda</th>
              </tr>
            </thead>
            <tbody>
              {lista.dados.itens.map((i: ItemErp) => (
                <tr key={i.id} className={i.ativo ? '' : 'linha-inativa'}>
                  <td>
                    <code>{i.codigo}</code>
                  </td>
                  <td>{i.descricao}</td>
                  <td>{i.tipo.toLowerCase()}</td>
                  <td>{NOME_IVA[i.iva]}</td>
                  <td className={`numero ${i.controla_estoque && Number(i.estoque_minimo) > 0 && Number(i.saldo_total) < Number(i.estoque_minimo) ? 'valor-negativo' : ''}`}>
                    {i.controla_estoque ? `${fmtQtd(i.saldo_total ?? 0)} ${i.unidade}` : '—'}
                  </td>
                  <td className="numero">{i.controla_estoque ? fmtQtd(i.estoque_minimo) : '—'}</td>
                  <td className="numero">{i.controla_estoque ? fmtGs(Number(i.custo_medio_pyg)) : '—'}</td>
                  <td className="numero">{i.preco_venda_pyg ? fmtGs(i.preco_venda_pyg) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialogo aberto={novo} aoFechar={() => setNovo(false)} titulo="Novo item">
        {novo && (
          <FormItem
            api={api}
            aoSalvar={async () => {
              setNovo(false);
              await lista.recarregar();
            }}
          />
        )}
      </Dialogo>
    </Cartao>
  );
}

function FormItem({ api, aoSalvar }: { api: Api; aoSalvar: () => Promise<void> }) {
  const { ocupado, executar } = useAcao();
  const [f, setF] = useState({ codigo: '', descricao: '', unidade: 'UN', tipo: 'MERCADORIA' as ItemErp['tipo'], iva: '10' as ItemErp['iva'], estoque_minimo: '0', preco: '' });
  const ok = f.codigo.trim() && f.descricao.trim().length >= 2;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        void executar('item', async () => {
          await api.erpCriarItem({
            codigo: f.codigo.trim(),
            descricao: f.descricao.trim(),
            unidade: f.tipo === 'SERVICO' ? 'SRV' : f.unidade,
            tipo: f.tipo,
            iva: f.iva,
            estoque_minimo: Number(f.estoque_minimo.replace(',', '.')) || 0,
            preco_venda_pyg: f.preco ? Number(f.preco.replace(/\D/g, '')) : undefined,
          });
          await aoSalvar();
        }, 'Item cadastrado.');
      }}
    >
      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="it-cod">Código</label>
          <input id="it-cod" className="form-control" maxLength={40} value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="it-desc">Descrição</label>
          <input id="it-desc" className="form-control" maxLength={200} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="it-tipo">Tipo</label>
          <select id="it-tipo" className="form-control" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as ItemErp['tipo'] })}>
            <option value="MERCADORIA">Mercadoria (controla estoque)</option>
            <option value="INSUMO">Insumo (controla estoque)</option>
            <option value="SERVICO">Serviço (sem estoque)</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="it-iva">IVA</label>
          <select id="it-iva" className="form-control" value={f.iva} onChange={(e) => setF({ ...f, iva: e.target.value as ItemErp['iva'] })}>
            {Object.entries(NOME_IVA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {f.tipo !== 'SERVICO' && (
          <>
            <div className="form-group">
              <label htmlFor="it-un">Unidade</label>
              <select id="it-un" className="form-control" value={f.unidade} onChange={(e) => setF({ ...f, unidade: e.target.value })}>
                {['UN', 'CX', 'KG', 'L', 'M', 'PCT'].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="it-min">Estoque mínimo</label>
              <input id="it-min" className="form-control" inputMode="decimal" value={f.estoque_minimo} onChange={(e) => setF({ ...f, estoque_minimo: e.target.value })} />
            </div>
          </>
        )}
        <div className="form-group">
          <label htmlFor="it-preco">Preço de venda (Gs., com IVA, opcional)</label>
          <input id="it-preco" className="form-control" inputMode="numeric" value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} />
        </div>
      </div>
      <button type="submit" className="btn btn-primary btn-block" disabled={!ok || !!ocupado}>
        Cadastrar
      </button>
    </form>
  );
}

function Depositos({ api }: { api: Api }) {
  const { pode } = useEquipe();
  const lista = useCarga(() => api.erpDepositos(), [api]);
  const { ocupado, executar } = useAcao();
  const [f, setF] = useState({ codigo: '', nome: '' });
  return (
    <Cartao tag="Cadastros" titulo="Depósitos">
      <ul className="lista-compacta">
        {lista.dados?.depositos.map((d) => (
          <li key={d.id}>
            <code>{d.codigo}</code> · {d.nome}
          </li>
        ))}
      </ul>
      {lista.dados?.depositos.length === 0 && <Vazio>Nenhum depósito.</Vazio>}
      {pode('erp.estoque') && (
        <form
          className="busca"
          onSubmit={(e) => {
            e.preventDefault();
            if (f.codigo.trim() && f.nome.trim().length >= 2) void executar('dep', async () => (await api.erpCriarDeposito({ codigo: f.codigo.trim(), nome: f.nome.trim() }), setF({ codigo: '', nome: '' }), await lista.recarregar()), 'Depósito criado.');
          }}
        >
          <input className="form-control estreito" placeholder="Código" aria-label="Código do depósito" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} />
          <input className="form-control" placeholder="Nome (ex.: Central do Portal)" aria-label="Nome do depósito" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          <button type="submit" className="btn btn-sm btn-outline" disabled={!!ocupado}>
            Criar
          </button>
        </form>
      )}
    </Cartao>
  );
}
