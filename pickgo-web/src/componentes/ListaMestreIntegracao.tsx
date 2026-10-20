import { useState } from 'react';
import type { Api, ItemListaMestre, Loja, ResultadoSincronizacao } from '../api.ts';
import { fmtData, lerDinheiro } from '../formato.ts';
import { useEquipe } from '../equipe.tsx';
import { useCarga, useSessao } from '../sessao.tsx';
import { CaixaErro, Cartao, useAcao, Vazio } from './comum.tsx';

// Alimentação da lista mestre: planilha (CSV) para quem ainda não tem integração,
// e chave de API para o sistema da loja enviar o catálogo sozinho.

const COLUNAS = ['codigo_loja', 'nome', 'descricao', 'categoria', 'preco_usd', 'estoque', 'codigo_barras', 'fotos'] as const;

const MODELO = [
  COLUNAS.join(';'),
  'CS-00123;Fone Sony WH-1000XM6;Cancelamento de ruído, 30 h de bateria;Áudio;399,00;12;4548736154123;https://exemplo.com/fone-1.jpg|https://exemplo.com/fone-2.jpg',
  'CS-00124;Capacete Specialized Prevail 3;Tamanho M, cor preta;Ciclismo;320,00;4;7899001122335;',
].join('\n');

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const APELIDOS: Record<string, (typeof COLUNAS)[number]> = {
  codigo_loja: 'codigo_loja',
  codigo: 'codigo_loja',
  sku: 'codigo_loja',
  nome: 'nome',
  produto: 'nome',
  descricao: 'descricao',
  categoria: 'categoria',
  preco_usd: 'preco_usd',
  preco: 'preco_usd',
  estoque: 'estoque',
  quantidade: 'estoque',
  codigo_barras: 'codigo_barras',
  ean: 'codigo_barras',
  fotos: 'fotos',
  foto: 'fotos',
};

/** CSV com ; , ou tab, aspas e quebras de linha dentro de aspas. */
function lerCsv(texto: string): string[][] {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? '';
  const sep = [';', '\t', ','].sort((a, b) => primeira.split(b).length - primeira.split(a).length)[0]!;
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      if (linha.some((x) => x.trim())) linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha);
  return linhas;
}

interface Leitura {
  itens: ItemListaMestre[];
  erros: { linha: number; erro: string }[];
  faltando: string[];
}

function interpretar(texto: string): Leitura {
  const [cab, ...linhas] = lerCsv(texto.replace(/^﻿/, ''));
  const mapa = (cab ?? []).map((h) => APELIDOS[semAcento(h).replace(/\s+/g, '_')]);
  const faltando = (['codigo_loja', 'nome', 'categoria', 'preco_usd', 'estoque'] as const).filter((c) => !mapa.includes(c));
  const itens: ItemListaMestre[] = [];
  const erros: Leitura['erros'] = [];
  if (faltando.length) return { itens, erros, faltando };
  linhas.forEach((l, i) => {
    const v = (c: (typeof COLUNAS)[number]) => (l[mapa.indexOf(c)] ?? '').trim();
    const n = i + 2;
    const preco = lerDinheiro(v('preco_usd'));
    const estoque = Number(v('estoque').replace(/\D/g, '') || 'x');
    if (!v('codigo_loja')) return erros.push({ linha: n, erro: 'sem código da loja' });
    if (v('nome').length < 2) return erros.push({ linha: n, erro: 'nome muito curto' });
    if (v('categoria').length < 2) return erros.push({ linha: n, erro: 'sem categoria' });
    if (!preco) return erros.push({ linha: n, erro: `preço inválido: "${v('preco_usd')}"` });
    if (!Number.isInteger(estoque)) return erros.push({ linha: n, erro: `estoque inválido: "${v('estoque')}"` });
    const fotos = v('fotos')
      .split(/[|\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (fotos.some((u) => !/^https?:\/\/\S+$/.test(u))) return erros.push({ linha: n, erro: 'foto com endereço inválido (use https://…)' });
    itens.push({
      codigo_loja: v('codigo_loja'),
      nome: v('nome'),
      descricao: v('descricao') || null,
      categoria: v('categoria'),
      preco_usd_centavos: preco,
      estoque,
      codigo_barras: v('codigo_barras') || null,
      fotos: fotos.slice(0, 10),
    });
  });
  return { itens, erros, faltando };
}

function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportarPlanilha({
  api,
  lojas,
  lojaFixa,
  lojaInicial,
  aoConcluir,
}: {
  api: Api;
  lojas: Loja[];
  lojaFixa?: string;
  lojaInicial: string;
  aoConcluir: () => Promise<void>;
}) {
  const { ocupado, executar } = useAcao();
  const [lojaId, setLojaId] = useState(lojaFixa ?? lojaInicial);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [arquivo, setArquivo] = useState('');
  const [completo, setCompleto] = useState(false);
  const [resultado, setResultado] = useState<ResultadoSincronizacao | null>(null);

  return (
    <div className="importar">
      <p className="texto-apoio">
        Uma linha por produto. O <strong>código da loja</strong> identifica o produto: se já existir, ele é atualizado; se não, entra na lista mestre
        <strong> fora do Pick & Go</strong>, até ser publicado. Preço em dólar; fotos separadas por <code>|</code>.
      </p>
      <button type="button" className="btn btn-sm btn-outline" onClick={() => baixar('modelo-lista-mestre.csv', MODELO)}>
        ⬇️ Baixar modelo da planilha
      </button>

      {!lojaFixa && (
        <div className="form-group">
          <label htmlFor="imp-loja">Loja</label>
          <select id="imp-loja" className="form-control" value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="form-group">
        <label htmlFor="imp-arquivo">Arquivo CSV (exporte do Excel como “CSV UTF-8”)</label>
        <input
          id="imp-arquivo"
          type="file"
          accept=".csv,text/csv"
          className="form-control"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setResultado(null);
            if (!f) return setLeitura(null);
            setArquivo(f.name);
            setLeitura(interpretar(await f.text()));
          }}
        />
      </div>

      {leitura && leitura.faltando.length > 0 && (
        <div className="caixa-erro" role="alert">
          Faltam colunas obrigatórias: {leitura.faltando.join(', ')}. Use o modelo.
        </div>
      )}
      {leitura && !leitura.faltando.length && (
        <>
          <div className="quota-alert">
            <strong>{arquivo}:</strong> {leitura.itens.length} produto(s) prontos para enviar
            {leitura.erros.length > 0 && `, ${leitura.erros.length} linha(s) com erro serão ignoradas`}.
          </div>
          {leitura.erros.length > 0 && (
            <details className="regra" open={leitura.erros.length <= 5}>
              <summary>Linhas com erro</summary>
              <ul className="lista-erros">
                {leitura.erros.slice(0, 50).map((e) => (
                  <li key={e.linha}>
                    Linha {e.linha}: {e.erro}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <label className="marca">
            <input type="checkbox" checked={completo} onChange={(e) => setCompleto(e.target.checked)} /> É o catálogo completo da loja: zerar o estoque
            do que não estiver na planilha
          </label>
          <button
            type="button"
            className="btn btn-primary btn-block botao-pix"
            disabled={!leitura.itens.length || ocupado === 'importar' || leitura.itens.length > 5000}
            onClick={() =>
              void executar(
                'importar',
                async () => {
                  const r = await api.importarCatalogo({ loja_id: lojaFixa ? undefined : lojaId, completo, produtos: leitura.itens });
                  setResultado(r);
                  await aoConcluir();
                  return r;
                },
                (r) => `Planilha importada: ${r.criados} novo(s), ${r.atualizados} atualizado(s).`,
              )
            }
          >
            {ocupado === 'importar' ? 'Enviando…' : leitura.itens.length > 5000 ? 'Máximo de 5.000 linhas por envio' : `Enviar ${leitura.itens.length} produto(s)`}
          </button>
        </>
      )}
      {resultado && <ResumoEnvio r={resultado} />}
    </div>
  );
}

function ResumoEnvio({ r }: { r: Pick<ResultadoSincronizacao, 'recebidos' | 'criados' | 'atualizados' | 'zerados' | 'erros'> }) {
  return (
    <div className="resumo-envio">
      <span>
        <strong>{r.recebidos}</strong> recebidos
      </span>
      <span>
        <strong>{r.criados}</strong> novos (fora do Pick & Go)
      </span>
      <span>
        <strong>{r.atualizados}</strong> atualizados
      </span>
      {r.zerados > 0 && (
        <span>
          <strong>{r.zerados}</strong> zerados
        </span>
      )}
      {r.erros.length > 0 && (
        <details>
          <summary className="valor-negativo">{r.erros.length} com erro</summary>
          <ul className="lista-erros">
            {r.erros.map((e, i) => (
              <li key={i}>
                {e.codigo_loja}: {e.erro}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Situação da integração por loja e histórico de envios. */
export function PainelIntegracao({ api, lojaFixa, lojaFiltro }: { api: Api; lojaFixa?: string; lojaFiltro: string }) {
  const { avisar } = useSessao();
  const { ocupado, executar } = useAcao();
  const { pode } = useEquipe();
  const gerenciaChave = !lojaFixa && pode('integracao.gerenciar');
  const alvo = lojaFixa ?? (lojaFiltro || undefined);
  const dados = useCarga(() => api.sincronizacoes(alvo), [api, alvo], 20_000);
  const [chave, setChave] = useState<{ loja: string; chave: string } | null>(null);
  const url = `${location.origin}/v1/integracao/catalogo`;

  return (
    <Cartao tag="Integração com o sistema da loja" titulo="Como o estoque chega à lista mestre">
      {dados.erro && <CaixaErro erro={dados.erro} onTentar={dados.recarregar} />}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Loja</th>
              <th>Integração</th>
              <th>Último envio do sistema</th>
              {gerenciaChave && <th />}
            </tr>
          </thead>
          <tbody>
            {dados.dados?.lojas.map((l) => (
              <tr key={l.id}>
                <td>{l.nome}</td>
                <td>
                  {l.tem_chave ? (
                    <span className="badge badge-green">Chave ativa desde {fmtData(l.chave_integracao_criada_em)}</span>
                  ) : (
                    <span className="badge badge-gray">Sem integração</span>
                  )}
                </td>
                <td>{l.ultima_integracao ? fmtData(l.ultima_integracao) : '—'}</td>
                {gerenciaChave && (
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      disabled={!!ocupado}
                      onClick={() => {
                        if (l.tem_chave && !confirm(`Trocar a chave da ${l.nome}? O sistema da loja para de enviar até receber a nova.`)) return;
                        void executar('chave', async () => {
                          const r = await api.gerarChaveIntegracao(l.id);
                          setChave({ loja: l.nome, chave: r.chave });
                          await dados.recarregar();
                        });
                      }}
                    >
                      {l.tem_chave ? 'Trocar chave' : 'Gerar chave'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lojaFixa && <p className="nota">A chave de integração é gerada pelo Portal Paraguai. Peça ao administrador e repasse à equipe do sistema da loja.</p>}

      {chave && (
        <div className="caixa-chave">
          <strong>Chave da {chave.loja}</strong> — copie agora; ela não aparece de novo.
          <div className="busca">
            <input className="form-control copia-cola" readOnly value={chave.chave} aria-label="Chave de integração" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn-sm btn-blue" onClick={() => void navigator.clipboard?.writeText(chave.chave).then(() => avisar('Chave copiada.'))}>
              Copiar
            </button>
          </div>
        </div>
      )}

      <details className="regra">
        <summary>Instruções para a equipe do sistema da loja (API)</summary>
        <p className="nota">
          Envie o catálogo sempre que preço ou estoque mudar (ou a cada 15 minutos). Até 5.000 produtos por chamada. Com <code>"completo": true</code>,
          o que não vier fica com estoque zero. Informe o estoque físico; o Pick & Go desconta sozinho o que já está reservado. Dê baixa no seu sistema
          só quando o pedido for retirado.
        </p>
        <pre className="codigo">{`curl -X PUT ${url} \\
  -H "content-type: application/json" \\
  -H "x-chave-loja: <chave da loja>" \\
  -d '{
    "completo": false,
    "produtos": [{
      "codigo_loja": "CS-00123",
      "nome": "Fone Sony WH-1000XM6",
      "descricao": "Cancelamento de ruído, 30 h de bateria",
      "categoria": "Áudio",
      "preco_usd_centavos": 39900,
      "estoque": 12,
      "codigo_barras": "4548736154123",
      "fotos": ["https://.../fone-1.jpg"]
    }]
  }'`}</pre>
      </details>

      <h4 className="subtitulo">Histórico de envios</h4>
      {dados.dados?.sincronizacoes.length === 0 && <Vazio>Nenhum envio ainda.</Vazio>}
      {!!dados.dados?.sincronizacoes.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                {!lojaFixa && <th>Loja</th>}
                <th>Origem</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {dados.dados.sincronizacoes.map((s) => (
                <tr key={s.id}>
                  <td>
                    {fmtData(s.criado_em)}
                    <div className="nota">{s.ator}</div>
                  </td>
                  {!lojaFixa && <td>{s.loja_nome}</td>}
                  <td>
                    <span className={`badge ${s.origem === 'INTEGRACAO' ? 'badge-blue' : 'badge-gold'}`}>{s.origem === 'INTEGRACAO' ? 'Integração' : 'Planilha'}</span>
                    {s.completo && <div className="nota">catálogo completo</div>}
                  </td>
                  <td>
                    <ResumoEnvio r={s} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}
