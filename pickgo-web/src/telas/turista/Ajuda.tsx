import { useState, type FormEvent } from 'react';
import { CaixaErro, Cartao, useAcao, Vazio } from '../../componentes/comum.tsx';
import { fmtData } from '../../formato.ts';
import { useApiCliente, useCarga } from '../../sessao.tsx';
import { Conversa } from '../crm/Ficha.tsx';

// Ajuda do turista: dúvidas, pedido de cancelamento e reclamações, com as
// respostas do atendimento do Portal e os avisos dos pedidos.

const ESTADO: Record<string, string> = { ABERTO: 'Recebido', EM_ATENDIMENTO: 'Em atendimento', AGUARDANDO_CLIENTE: 'Respondido', RESOLVIDO: 'Resolvido' };

export function Ajuda() {
  const api = useApiCliente();
  const dados = useCarga(() => api.meuAtendimento(), [api], 8000);
  const pedidos = useCarga(() => api.meusPedidos(), [api]);
  const { ocupado, executar } = useAcao();
  const [f, setF] = useState<{ tipo: 'DUVIDA' | 'CANCELAMENTO' | 'RECLAMACAO'; pedido_id: string; texto: string }>({ tipo: 'DUVIDA', pedido_id: '', texto: '' });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    void executar(
      'enviar',
      async () => {
        await api.pedirAtendimento({ tipo: f.tipo, pedido_id: f.pedido_id || undefined, texto: f.texto.trim() });
        setF({ ...f, texto: '' });
        await dados.recarregar();
      },
      'Mensagem enviada ao atendimento.',
    );
  };

  return (
    <div className="grid-2">
      <Cartao tag="RF-32 · RF-33" titulo="Fale com o Portal Paraguai">
        <form onSubmit={enviar}>
          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="aj-tipo">Assunto</label>
              <select id="aj-tipo" className="form-control" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as typeof f.tipo })}>
                <option value="DUVIDA">Tenho uma dúvida</option>
                <option value="CANCELAMENTO">Quero cancelar um pedido</option>
                <option value="RECLAMACAO">Reclamação</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="aj-pedido">Pedido (opcional)</label>
              <select id="aj-pedido" className="form-control" value={f.pedido_id} onChange={(e) => setF({ ...f, pedido_id: e.target.value })}>
                <option value="">Nenhum</option>
                {pedidos.dados?.pedidos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} · {p.estado.replaceAll('_', ' ').toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="aj-texto">Mensagem</label>
            <textarea id="aj-texto" className="form-control" rows={4} required minLength={3} maxLength={1600} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} />
          </div>
          {f.tipo === 'CANCELAMENTO' && <p className="nota">Pedido já pago é estornado pelo Pix depois que a equipe confirmar o cancelamento.</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={ocupado === 'enviar' || f.texto.trim().length < 3}>
            Enviar
          </button>
        </form>
        <h4 className="subtitulo">Seus atendimentos</h4>
        {dados.erro && <CaixaErro erro={dados.erro} onTentar={dados.recarregar} />}
        {dados.dados?.tickets.length === 0 && <Vazio>Nenhum atendimento.</Vazio>}
        <ul className="lista-compacta">
          {dados.dados?.tickets.map((t) => (
            <li key={t.id}>
              <strong>#{t.numero}</strong> {t.assunto} {t.pedido_codigo && <span className="nota">· {t.pedido_codigo}</span>}{' '}
              <span className={`badge ${t.estado === 'RESOLVIDO' ? 'badge-green' : t.estado === 'AGUARDANDO_CLIENTE' ? 'badge-blue' : 'badge-gold'}`}>{ESTADO[t.estado]}</span>
              <div className="nota">{fmtData(t.atualizado_em)}</div>
            </li>
          ))}
        </ul>
      </Cartao>
      <Cartao tag="Mensagens" titulo="Avisos e respostas" vermelho>
        <Conversa mensagens={[...(dados.dados?.mensagens ?? [])].reverse()} />
      </Cartao>
    </div>
  );
}
