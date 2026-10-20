import { ArrowDown, ArrowUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Api, CanalCampanha, EtapaFunil, NovaOferta, Segmento } from '../../api.ts';
import { CaixaErro, useAcao } from '../../componentes/comum.tsx';
import { fmtBRL, lerDinheiro } from '../../formato.ts';
import { useCarga } from '../../sessao.tsx';
import { NOME_CANAL } from './Ficha.tsx';
import { ETAPAS } from './Funil.tsx';
import { CamposOferta } from './Ofertas.tsx';

// Nova campanha: público (com prévia), oferta, mensagem, cascata de canais e envio.

const VARIAVEIS = ['{nome}', '{produto}', '{preco}', '{preco_normal}', '{cupom}', '{restantes}', '{fim}', '{link}'];

export function NovaCampanha({ api, aoCriar }: { api: Api; aoCriar: () => Promise<void> }) {
  const { ocupado, executar } = useAcao();
  const atalhos = useCarga(() => api.atalhosPublico(), [api]);
  const lojas = useCarga(() => api.lojas(), [api]);
  const [nome, setNome] = useState('');
  const [seg, setSeg] = useState<Segmento>({ etapas: ['CLIENTE_ATIVO', 'RECORRENTE'] });
  const [gasto, setGasto] = useState('');
  const [comOferta, setComOferta] = useState(true);
  const [oferta, setOferta] = useState<NovaOferta | null>(null);
  const [mensagem, setMensagem] = useState('Oi {nome}! {produto} por {preco} só até {fim}. Restam {restantes} unidades. Use o cupom {cupom}: {link}');
  const [canais, setCanais] = useState<CanalCampanha[]>(['WHATSAPP', 'SMS', 'EMAIL']);
  const [espera, setEspera] = useState(4);
  const [quando, setQuando] = useState<'agora' | 'agendar' | 'rascunho'>('agora');
  const [data, setData] = useState('');

  const segmento: Segmento = { ...seg, gasto_minimo_brl_centavos: lerDinheiro(gasto) ?? undefined };
  const chave = JSON.stringify([segmento, canais]);
  const previa = useCarga(() => api.previaPublico(segmento, canais), [api, chave]);
  const [texto, setTexto] = useState('');
  useEffect(() => {
    const t = setTimeout(() => void api.previaMensagem(mensagem).then((r) => setTexto(r.texto)).catch(() => undefined), 300);
    return () => clearTimeout(t);
  }, [api, mensagem]);

  const alternarEtapa = (e: EtapaFunil) => {
    const atual = new Set(seg.etapas ?? []);
    if (atual.has(e)) atual.delete(e);
    else atual.add(e);
    setSeg({ ...seg, etapas: [...atual] });
  };
  const mover = (i: number, d: -1 | 1) => {
    const c = [...canais];
    [c[i], c[i + d]] = [c[i + d]!, c[i]!];
    setCanais(c);
  };
  const pronto = nome.trim().length >= 3 && canais.length > 0 && mensagem.trim().length >= 10 && (!comOferta || oferta) && (quando !== 'agendar' || data);

  return (
    <form
      className="nova-campanha"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pronto) return;
        void executar(
          'criar',
          async () => {
            await api.criarCampanha({
              nome: nome.trim(),
              segmento,
              mensagem: mensagem.trim(),
              canais,
              espera_horas: espera,
              oferta: comOferta ? { ...oferta!, exclusiva: true } : undefined,
              enviar: quando === 'agora' ? 'agora' : quando === 'agendar' ? new Date(data).toISOString() : undefined,
            });
            await aoCriar();
          },
          quando === 'agora' ? 'Campanha criada; o envio começa em instantes.' : quando === 'agendar' ? 'Campanha agendada.' : 'Rascunho salvo.',
        );
      }}
    >
      <div className="form-group">
        <label htmlFor="cp-nome">Nome da campanha</label>
        <input id="cp-nome" className="form-control" required minLength={3} maxLength={120} placeholder="Ex.: iPhone para clientes preferenciais" value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>

      <fieldset className="passo-campanha">
        <legend>1. Público</legend>
        <div className="store-pills">
          {atalhos.dados?.atalhos.map((a) => (
            <button
              key={a.id}
              type="button"
              className="store-pill"
              title={a.descricao}
              onClick={() => {
                setSeg(a.segmento);
                setGasto(a.segmento.gasto_minimo_brl_centavos ? String(a.segmento.gasto_minimo_brl_centavos / 100) : '');
              }}
            >
              {a.nome}
            </button>
          ))}
        </div>
        <div className="etapas-segmento" role="group" aria-label="Etapas do funil">
          {ETAPAS.map((e) => (
            <label key={e.id} className="marca">
              <input type="checkbox" checked={seg.etapas?.includes(e.id) ?? false} onChange={() => alternarEtapa(e.id)} /> {e.titulo}
            </label>
          ))}
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label htmlFor="sg-gasto">Gasto mínimo (R$)</label>
            <input id="sg-gasto" className="form-control" inputMode="decimal" value={gasto} onChange={(e) => setGasto(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="sg-ped">Mínimo de compras</label>
            <input id="sg-ped" className="form-control" inputMode="numeric" value={seg.pedidos_minimo ?? ''} onChange={(e) => setSeg({ ...seg, pedidos_minimo: Number(e.target.value.replace(/\D/g, '')) || undefined })} />
          </div>
          <div className="form-group">
            <label htmlFor="sg-dias">Sem comprar há (dias)</label>
            <input id="sg-dias" className="form-control" inputMode="numeric" value={seg.sem_compra_ha_dias ?? ''} onChange={(e) => setSeg({ ...seg, sem_compra_ha_dias: Number(e.target.value.replace(/\D/g, '')) || undefined })} />
          </div>
          <div className="form-group">
            <label htmlFor="sg-cat">Já comprou na categoria</label>
            <input id="sg-cat" className="form-control" placeholder="Ex.: Smartphones" value={seg.comprou_categoria ?? ''} onChange={(e) => setSeg({ ...seg, comprou_categoria: e.target.value || undefined })} />
          </div>
          <div className="form-group">
            <label htmlFor="sg-loja">Já comprou na loja</label>
            <select id="sg-loja" className="form-control" value={seg.comprou_loja ?? ''} onChange={(e) => setSeg({ ...seg, comprou_loja: e.target.value || undefined })}>
              <option value="">Qualquer</option>
              {lojas.dados?.lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="sg-int">Interesse (leads)</label>
            <input id="sg-int" className="form-control" placeholder="Ex.: bicicleta" value={seg.interesse ?? ''} onChange={(e) => setSeg({ ...seg, interesse: e.target.value || undefined })} />
          </div>
        </div>
        {previa.erro && <CaixaErro erro={previa.erro} />}
        {previa.dados && (
          <div className="previa-publico" aria-live="polite">
            <strong>{previa.dados.total}</strong> pessoa(s) no público · <strong>{previa.dados.alcancaveis}</strong> alcançáveis pelos canais escolhidos
            <span className="nota">
              {' '}
              (WhatsApp {previa.dados.por_canal.WHATSAPP}, SMS {previa.dados.por_canal.SMS}, e-mail {previa.dados.por_canal.EMAIL})
            </span>
            {previa.dados.amostra.length > 0 && (
              <div className="nota">
                Ex.: {previa.dados.amostra.slice(0, 6).map((p) => `${p.nome} (${fmtBRL(p.gasto_brl_centavos)})`).join(', ')}
              </div>
            )}
          </div>
        )}
      </fieldset>

      <fieldset className="passo-campanha">
        <legend>2. Oferta</legend>
        <label className="marca">
          <input type="checkbox" checked={comOferta} onChange={(e) => setComOferta(e.target.checked)} /> Criar uma oferta exclusiva para este público (quantidade e prazo limitados)
        </label>
        {comOferta && <CamposOferta api={api} aoMudar={setOferta} />}
      </fieldset>

      <fieldset className="passo-campanha">
        <legend>3. Mensagem</legend>
        <textarea className="form-control" rows={4} maxLength={1000} aria-label="Mensagem" value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
        <div className="botoes-linha sem-margem">
          {VARIAVEIS.map((v) => (
            <button key={v} type="button" className="btn btn-sm btn-outline variavel" onClick={() => setMensagem((m) => `${m} ${v}`)}>
              {v}
            </button>
          ))}
        </div>
        {texto && (
          <div className="balao saida previa-mensagem">
            <div className="balao-texto">{texto}</div>
            <div className="balao-meta">Prévia com dados de exemplo · “Responda PARAR” é acrescentado se faltar</div>
          </div>
        )}
      </fieldset>

      <fieldset className="passo-campanha">
        <legend>4. Cascata de canais</legend>
        <ol className="cascata">
          {canais.map((k, i) => (
            <li key={k}>
              <strong>
                {i + 1}. {NOME_CANAL[k]}
              </strong>
              <span className="botoes-linha sem-margem">
                <button type="button" className="icone" aria-label={`Subir ${NOME_CANAL[k]}`} disabled={i === 0} onClick={() => mover(i, -1)}>
                  <ArrowUp size={15} />
                </button>
                <button type="button" className="icone" aria-label={`Descer ${NOME_CANAL[k]}`} disabled={i === canais.length - 1} onClick={() => mover(i, 1)}>
                  <ArrowDown size={15} />
                </button>
                <button type="button" className="btn btn-sm btn-outline" disabled={canais.length === 1} onClick={() => setCanais(canais.filter((x) => x !== k))}>
                  Tirar
                </button>
              </span>
            </li>
          ))}
        </ol>
        {(['WHATSAPP', 'SMS', 'EMAIL'] as CanalCampanha[])
          .filter((k) => !canais.includes(k))
          .map((k) => (
            <button key={k} type="button" className="btn btn-sm btn-outline" onClick={() => setCanais([...canais, k])}>
              + {NOME_CANAL[k]}
            </button>
          ))}
        <div className="form-group">
          <label htmlFor="cp-espera">Esperar antes do próximo canal (horas)</label>
          <input id="cp-espera" type="number" min={1} max={168} className="form-control" value={espera} onChange={(e) => setEspera(Math.min(168, Math.max(1, Number(e.target.value) || 1)))} />
        </div>
      </fieldset>

      <fieldset className="passo-campanha">
        <legend>5. Envio</legend>
        <div className="opcoes">
          <label>
            <input type="radio" name="quando" checked={quando === 'agora'} onChange={() => setQuando('agora')} /> Enviar agora
          </label>
          <label>
            <input type="radio" name="quando" checked={quando === 'agendar'} onChange={() => setQuando('agendar')} /> Agendar
          </label>
          <label>
            <input type="radio" name="quando" checked={quando === 'rascunho'} onChange={() => setQuando('rascunho')} /> Salvar rascunho
          </label>
        </div>
        {quando === 'agendar' && <input type="datetime-local" className="form-control" aria-label="Data do envio" value={data} onChange={(e) => setData(e.target.value)} />}
        <p className="nota">Só recebe quem aceitou o canal e não pediu para parar; cada pessoa recebe no máximo 3 campanhas por semana.</p>
      </fieldset>

      <button type="submit" className="btn btn-primary btn-block botao-pix" disabled={!pronto || !!ocupado}>
        {quando === 'agora' ? `Enviar para ${previa.dados?.alcancaveis ?? '…'} pessoa(s)` : quando === 'agendar' ? 'Agendar campanha' : 'Salvar rascunho'}
      </button>
    </form>
  );
}
