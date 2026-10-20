import { useEffect, useState, type FormEvent } from 'react';
import type { Api, ConfigPublica, DadosProduto, Loja, ProdutoGestao, SituacaoProduto } from '../api.ts';
import { emojiCategoria, fmtBRL, fmtData, fmtUSD, lerDinheiro, usdParaBrl } from '../formato.ts';
import { useEquipe } from '../equipe.tsx';
import { useCarga } from '../sessao.tsx';
import { CaixaErro, Cartao, Dialogo, Kpi, useAcao, Vazio } from './comum.tsx';
import { ImportarPlanilha, PainelIntegracao } from './ListaMestreIntegracao.tsx';

// Lista mestre: o catálogo de cada loja, vindo do sistema dela (integração ou
// planilha) ou cadastrado à mão. O Pick & Go vende o subconjunto publicado.
// O admin do Portal vê todas as lojas; o lojista só a própria.
// Produto não é apagado (pedidos antigos apontam para ele): despublicar tira do app.

const paraTexto = (centavos: number) => (centavos / 100).toFixed(2).replace('.', ',');

const SITUACOES: { id: SituacaoProduto; rotulo: string }[] = [
  { id: 'TODOS', rotulo: 'Todos' },
  { id: 'ATIVOS', rotulo: 'No Pick & Go' },
  { id: 'INATIVOS', rotulo: 'Fora do Pick & Go' },
  { id: 'SEM_ESTOQUE', rotulo: 'Publicados sem estoque' },
];

const NOME_ORIGEM: Record<ProdutoGestao['origem'], string> = {
  INTEGRACAO: 'Integração',
  IMPORTACAO: 'Planilha',
  MANUAL: 'Manual',
};

export function GestaoCatalogo({
  api,
  config,
  lojas,
  lojaFixa,
}: {
  api: Api;
  config: ConfigPublica | null;
  lojas: Loja[];
  /** Painel do lojista: a loja dele, sem seletor. */
  lojaFixa?: string;
}) {
  const [lojaId, setLojaId] = useState(lojaFixa ?? '');
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [situacao, setSituacao] = useState<SituacaoProduto>('TODOS');
  const [editando, setEditando] = useState<ProdutoGestao | 'novo' | null>(null);
  const [importando, setImportando] = useState(false);
  const { pode } = useEquipe();
  const lista = useCarga(
    () => api.catalogoGestao({ loja_id: lojaFixa ? undefined : lojaId || undefined, busca: buscaAplicada || undefined, situacao }),
    [api, lojaId, buscaAplicada, situacao, lojaFixa],
  );
  const categorias = useCarga(() => api.categorias(), [api]);
  const r = lista.dados?.resumo;
  const nomeLoja = (id: string) => lojas.find((l) => l.id === id)?.nome ?? id;
  const lojaDoFiltro = lojaFixa ?? lojaId;

  return (
    <>
      <Cartao
        tag="Lista mestre · RF-01"
        titulo={lojaFixa ? `Lista mestre da ${nomeLoja(lojaFixa)}` : 'Lista mestre das lojas'}
        extra={
          <div className="botoes-linha sem-margem">
            {pode('catalogo.importar') && (
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setImportando(true)} disabled={!lojas.length}>
                📄 Importar planilha
              </button>
            )}
            {pode('catalogo.editar') && (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditando('novo')} disabled={!lojaFixa && !lojas.length}>
                + Novo produto
              </button>
            )}
          </div>
        }
      >
        <p className="texto-apoio">
          Catálogo de cada loja, com preço, estoque, código de barras, código da loja, descrição e fotos, vindo do sistema da loja. Só os
          produtos publicados aparecem no app do Pick & Go.
        </p>
        <div className="grid-4 resumo-catalogo">
          <Kpi rotulo="Na lista mestre" valor={r?.total ?? '—'} />
          <Kpi rotulo="Publicados no Pick & Go" valor={r?.ativos ?? '—'} destaque="green" />
          <Kpi rotulo="Publicados sem estoque" valor={r?.sem_estoque ?? '—'} destaque={r?.sem_estoque ? 'red' : undefined} sub="Aparecem como esgotados" />
          <Kpi rotulo="Fora do Pick & Go" valor={r ? r.total - r.ativos : '—'} sub="Na lista, mas não à venda no app" />
        </div>

        <div className="filtros-gestao">
          {!lojaFixa && (
            <select className="form-control" aria-label="Loja" value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
              <option value="">Todas as lojas</option>
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          )}
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
              placeholder="Nome, categoria, código da loja ou de barras"
              aria-label="Buscar produto"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-outline">
              Buscar
            </button>
          </form>
          <div className="store-pills" role="group" aria-label="Situação">
            {SITUACOES.map((s) => (
              <button key={s.id} type="button" className={`store-pill ${situacao === s.id ? 'active' : ''}`} aria-pressed={situacao === s.id} onClick={() => setSituacao(s.id)}>
                {s.rotulo}
              </button>
            ))}
          </div>
        </div>

        {lista.erro && <CaixaErro erro={lista.erro} onTentar={lista.recarregar} />}
        {lista.dados && lista.dados.produtos.length === 0 && <Vazio>Nenhum produto com esses filtros.</Vazio>}
        {!!lista.dados?.produtos.length && (
          <div className="table-wrap">
            <table className="tabela-catalogo">
              <thead>
                <tr>
                  <th>Produto</th>
                  {!lojaFixa && <th>Loja</th>}
                  <th>Preço</th>
                  <th>Estoque</th>
                  <th>Origem</th>
                  <th>Pick & Go</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.dados.produtos.map((p) => (
                  <LinhaProduto key={p.id} p={p} api={api} config={config} mostrarLoja={!lojaFixa} aoEditar={() => setEditando(p)} aoMudar={lista.recarregar} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="nota">
          Disponível no app = estoque informado pela loja − unidades reservadas em pedidos do Pick & Go ainda não retirados. Mudar o preço vale para
          pedidos novos.
        </p>

        <Dialogo aberto={!!editando} aoFechar={() => setEditando(null)} titulo={editando === 'novo' ? 'Novo produto na lista mestre' : 'Editar produto'}>
          {editando && (
            <FormProduto
              api={api}
              config={config}
              lojas={lojas}
              lojaInicial={lojaFixa ?? (lojaId || lojas[0]?.id || '')}
              lojaFixa={!!lojaFixa}
              produto={editando === 'novo' ? null : editando}
              categorias={categorias.dados?.categorias ?? []}
              aoSalvar={async () => {
                setEditando(null);
                await Promise.all([lista.recarregar(), categorias.recarregar()]);
              }}
            />
          )}
        </Dialogo>
        <Dialogo aberto={importando} aoFechar={() => setImportando(false)} titulo="📄 Importar planilha para a lista mestre">
          {importando && (
            <ImportarPlanilha
              api={api}
              lojas={lojas}
              lojaFixa={lojaFixa}
              lojaInicial={lojaDoFiltro || lojas[0]?.id || ''}
              aoConcluir={async () => {
                await lista.recarregar();
              }}
            />
          )}
        </Dialogo>
      </Cartao>

      <PainelIntegracao api={api} lojaFixa={lojaFixa} lojaFiltro={lojaId} />
    </>
  );
}

function LinhaProduto({
  p,
  api,
  config,
  mostrarLoja,
  aoEditar,
  aoMudar,
}: {
  p: ProdutoGestao;
  api: Api;
  config: ConfigPublica | null;
  mostrarLoja: boolean;
  aoEditar: () => void;
  aoMudar: () => Promise<void>;
}) {
  const { ocupado, executar } = useAcao();
  const { pode } = useEquipe();
  const edita = pode('catalogo.editar');
  const [estoque, setEstoque] = useState(String(p.estoque));
  useEffect(() => setEstoque(String(p.estoque)), [p.estoque]);
  const novoEstoque = Number(estoque);
  const estoqueMudou = estoque !== String(p.estoque) && Number.isInteger(novoEstoque) && novoEstoque >= 0;
  const capa = p.fotos?.[0] ?? p.foto_url;

  const salvar = (d: Partial<DadosProduto>, ok: string) =>
    executar('salvar', async () => {
      await api.alterarProduto(p.id, d);
      await aoMudar();
    }, ok);

  return (
    <tr className={p.ativo ? '' : 'linha-inativa'}>
      <td>
        <div className="produto-celula">
          {capa ? <img src={capa} alt="" className="miniatura" loading="lazy" /> : <span aria-hidden="true">{emojiCategoria(p.categoria)}</span>}
          <div>
            <strong>{p.nome}</strong>
            <div className="nota">
              {p.categoria}
              {p.codigo_loja && <> · cód. loja {p.codigo_loja}</>}
              {p.codigo_barras && <> · EAN {p.codigo_barras}</>}
              {p.fotos?.length > 1 && <> · {p.fotos.length} fotos</>}
            </div>
            {p.descricao && <div className="descricao-curta">{p.descricao}</div>}
          </div>
        </div>
      </td>
      {mostrarLoja && <td>{p.loja_nome}</td>}
      <td>
        <strong>{fmtUSD(p.preco_usd_centavos)}</strong>
        {config && <div className="nota">{fmtBRL(usdParaBrl(p.preco_usd_centavos, config.cotacao_usd_brl))}</div>}
      </td>
      <td>
        <form
          className="estoque-rapido"
          onSubmit={(e) => {
            e.preventDefault();
            if (estoqueMudou) void salvar({ estoque: novoEstoque }, `Disponível de ${p.nome}: ${novoEstoque}.`);
          }}
        >
          <input
            className={`form-control ${p.estoque === 0 ? 'estoque-zero' : ''}`}
            inputMode="numeric"
            aria-label={`Disponível no app de ${p.nome}`}
            value={estoque}
            readOnly={!edita}
            onChange={(e) => setEstoque(e.target.value.replace(/\D/g, ''))}
          />
          {estoqueMudou && (
            <button type="submit" className="btn btn-sm btn-blue" disabled={!!ocupado}>
              Salvar
            </button>
          )}
        </form>
        <div className="nota">
          {p.estoque_loja != null ? `loja: ${p.estoque_loja}` : 'sem sistema'}
          {!!p.reservado && ` · reservado: ${p.reservado}`}
        </div>
      </td>
      <td>
        <span className={`badge ${p.origem === 'INTEGRACAO' ? 'badge-blue' : p.origem === 'IMPORTACAO' ? 'badge-gold' : 'badge-gray'}`}>{NOME_ORIGEM[p.origem]}</span>
        {p.sincronizado_em && <div className="nota">{fmtData(p.sincronizado_em)}</div>}
      </td>
      <td>
        <label className="chave">
          <input
            type="checkbox"
            checked={p.ativo}
            disabled={!!ocupado || !pode('catalogo.publicar')}
            onChange={(e) => void salvar({ ativo: e.target.checked }, e.target.checked ? `${p.nome} publicado no Pick & Go.` : `${p.nome} saiu do Pick & Go.`)}
          />
          <span>{p.ativo ? 'Publicado' : 'Fora'}</span>
        </label>
      </td>
      <td>
        {edita && (
          <button type="button" className="btn btn-sm btn-outline" onClick={aoEditar}>
            Editar
          </button>
        )}
      </td>
    </tr>
  );
}

function FormProduto({
  api,
  config,
  lojas,
  lojaInicial,
  lojaFixa,
  produto,
  categorias,
  aoSalvar,
}: {
  api: Api;
  config: ConfigPublica | null;
  lojas: Loja[];
  lojaInicial: string;
  lojaFixa: boolean;
  produto: ProdutoGestao | null;
  categorias: string[];
  aoSalvar: () => Promise<void>;
}) {
  const { ocupado, executar } = useAcao();
  const { pode } = useEquipe();
  const [f, setF] = useState({
    loja_id: produto?.loja_id ?? lojaInicial,
    nome: produto?.nome ?? '',
    categoria: produto?.categoria ?? '',
    preco: produto ? paraTexto(produto.preco_usd_centavos) : '',
    estoque: produto ? String(produto.estoque) : '0',
    codigo_barras: produto?.codigo_barras ?? '',
    codigo_loja: produto?.codigo_loja ?? '',
    descricao: produto?.descricao ?? '',
    fotos: (produto?.fotos ?? []).join('\n'),
    ativo: produto?.ativo ?? pode('catalogo.publicar'),
  });
  const [erro, setErro] = useState<string | null>(null);
  const preco = lerDinheiro(f.preco);
  const fotos = f.fotos
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const integrado = produto?.origem === 'INTEGRACAO';
  const muda = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!preco) return setErro('Informe o preço em dólar, por exemplo 199,90.');
    const estoque = Number(f.estoque);
    if (!Number.isInteger(estoque) || estoque < 0) return setErro('Estoque precisa ser um número inteiro, zero ou mais.');
    if (fotos.length > 10) return setErro('No máximo 10 fotos por produto.');
    if (fotos.some((u) => !/^https?:\/\/\S+$/.test(u))) return setErro('Cada foto precisa ser um endereço que comece com https://');
    const dados: DadosProduto = {
      nome: f.nome.trim(),
      categoria: f.categoria.trim(),
      preco_usd_centavos: preco,
      estoque,
      codigo_barras: f.codigo_barras.trim() || null,
      codigo_loja: f.codigo_loja.trim() || null,
      descricao: f.descricao.trim() || null,
      fotos,
      ativo: f.ativo,
    };
    void executar(
      'salvar',
      async () => {
        const { ativo, ...semAtivo } = dados;
        const corpo = pode('catalogo.publicar') ? dados : semAtivo;
        if (produto) await api.alterarProduto(produto.id, corpo);
        else await api.criarProduto({ ...semAtivo, ...(pode('catalogo.publicar') ? { ativo } : {}), loja_id: lojaFixa ? undefined : f.loja_id } as DadosProduto);
        await aoSalvar();
      },
      produto ? `${dados.nome} atualizado.` : `${dados.nome} cadastrado.`,
    );
  };

  return (
    <form onSubmit={enviar} noValidate>
      {integrado && (
        <div className="quota-alert warning">
          Este produto vem da integração com o sistema da loja. Preço, descrição, fotos e estoque serão sobrescritos no próximo envio; o ideal é corrigir
          no sistema da loja. Publicar ou despublicar no Pick & Go é decisão daqui e não muda com a integração.
        </div>
      )}
      {!lojaFixa && (
        <div className="form-group">
          <label htmlFor="pr-loja">Loja</label>
          <select id="pr-loja" className="form-control" value={f.loja_id} onChange={muda('loja_id')} disabled={!!produto}>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
          {produto && <p className="nota">A loja de um produto não muda; cadastre um novo na outra loja.</p>}
        </div>
      )}
      <div className="form-group">
        <label htmlFor="pr-nome">Nome do produto</label>
        <input id="pr-nome" className="form-control" required minLength={2} maxLength={200} value={f.nome} onChange={muda('nome')} />
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="pr-codloja">Código da loja (SKU no sistema dela)</label>
          <input id="pr-codloja" className="form-control" maxLength={60} value={f.codigo_loja} onChange={muda('codigo_loja')} disabled={integrado} />
          <p className="nota">É a chave que a integração usa para atualizar o produto.</p>
        </div>
        <div className="form-group">
          <label htmlFor="pr-ean">Código de barras (EAN)</label>
          <input id="pr-ean" className="form-control" inputMode="numeric" maxLength={40} value={f.codigo_barras} onChange={muda('codigo_barras')} />
          <p className="nota">Necessário para o Scan & Go.</p>
        </div>
        <div className="form-group">
          <label htmlFor="pr-cat">Categoria</label>
          <input id="pr-cat" className="form-control" list="pr-categorias" required minLength={2} maxLength={60} value={f.categoria} onChange={muda('categoria')} />
          <datalist id="pr-categorias">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="form-group">
          <label htmlFor="pr-preco">Preço na loja (US$)</label>
          <input id="pr-preco" className="form-control" inputMode="decimal" placeholder="199,90" required value={f.preco} onChange={muda('preco')} />
          {preco && config && <p className="nota">No app: {fmtBRL(usdParaBrl(preco, config.cotacao_usd_brl))} + taxas do Pix</p>}
        </div>
        <div className="form-group">
          <label htmlFor="pr-estoque">Disponível no Pick & Go</label>
          <input id="pr-estoque" className="form-control" inputMode="numeric" required value={f.estoque} onChange={(e) => setF({ ...f, estoque: e.target.value.replace(/\D/g, '') })} />
          {produto?.estoque_loja != null && (
            <p className="nota">
              A loja informou {produto.estoque_loja}
              {produto.reservado ? `, com ${produto.reservado} reservado(s)` : ''}.
            </p>
          )}
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="pr-desc">Descrição</label>
        <textarea id="pr-desc" className="form-control" rows={3} maxLength={4000} value={f.descricao} onChange={muda('descricao')} />
      </div>
      <div className="form-group">
        <label htmlFor="pr-fotos">Fotos (um endereço por linha, a primeira é a capa)</label>
        <textarea id="pr-fotos" className="form-control" rows={3} placeholder="https://…" value={f.fotos} onChange={muda('fotos')} />
        {fotos.length > 0 && (
          <div className="galeria">
            {fotos.slice(0, 10).map((u, i) => (
              <img key={u + i} src={u} alt={`Foto ${i + 1}`} className="miniatura" loading="lazy" />
            ))}
          </div>
        )}
      </div>
      <label className="marca">
        <input type="checkbox" checked={f.ativo} disabled={!pode('catalogo.publicar')} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Publicado no Pick & Go (aparece no app do turista)
        {!pode('catalogo.publicar') && <span className="nota"> · quem publica é o gerente da loja ou o Portal</span>}
      </label>
      {erro && (
        <div className="caixa-erro" role="alert">
          {erro}
        </div>
      )}
      <button type="submit" className="btn btn-primary btn-block botao-pix" disabled={ocupado === 'salvar'}>
        {ocupado === 'salvar' ? 'Salvando…' : produto ? 'Salvar alterações' : 'Cadastrar produto'}
      </button>
    </form>
  );
}
