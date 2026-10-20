import { useState } from 'react';
import { ErroApi } from '../../api.ts';
import { Cartao } from '../../componentes/comum.tsx';
import { useApiCliente, useSessao } from '../../sessao.tsx';

// Dados da conta e exclusão pelo próprio cliente (App Store 5.1.1(v) e LGPD, art. 18).

interface Eu {
  nome: string;
  cpf_mascarado: string;
  whatsapp: string;
  email: string | null;
}

export function MinhaConta({ eu, aoExcluir }: { eu: Eu | null | undefined; aoExcluir: () => void }) {
  const api = useApiCliente();
  const { avisar } = useSessao();
  const [confirmando, setConfirmando] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const excluir = async () => {
    setErro(null);
    setExcluindo(true);
    try {
      await api.excluirConta();
      avisar('Sua conta foi excluída.');
      aoExcluir();
    } catch (e) {
      const pedidos = e instanceof ErroApi && Array.isArray(e.dados.pedidos) ? ` (${(e.dados.pedidos as string[]).join(', ')})` : '';
      setErro(`${e instanceof Error ? e.message : String(e)}${pedidos}`);
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="cadastro">
      <Cartao titulo="Minha conta">
        {eu && (
          <dl className="dados-conta">
            <dt>Nome</dt>
            <dd>{eu.nome}</dd>
            <dt>CPF</dt>
            <dd>{eu.cpf_mascarado}</dd>
            <dt>WhatsApp</dt>
            <dd>{eu.whatsapp}</dd>
            <dt>E-mail</dt>
            <dd>{eu.email ?? '—'}</dd>
          </dl>
        )}
      </Cartao>

      <Cartao titulo="Excluir conta" vermelho>
        <p className="texto-apoio">
          Apagamos seu nome, CPF, WhatsApp e e-mail, e você para de receber mensagens. Os pedidos já feitos ficam guardados sem os seus dados, porque a
          contabilidade e a parte fiscal exigem. Pix ainda não pago é cancelado. Pedido pago e não retirado precisa ser retirado ou reembolsado antes.
        </p>
        {!confirmando ? (
          <button type="button" className="btn btn-outline-red" onClick={() => setConfirmando(true)}>
            Excluir minha conta
          </button>
        ) : (
          <>
            <div className="form-group">
              <label htmlFor="confirmar-exclusao">
                Para confirmar, digite <strong>EXCLUIR</strong>
              </label>
              <input id="confirmar-exclusao" className="form-control" autoComplete="off" value={texto} onChange={(e) => setTexto(e.target.value)} />
            </div>
            {erro && (
              <div className="caixa-erro" role="alert">
                {erro}
              </div>
            )}
            <div className="alternar">
              <button type="button" className="btn btn-outline-red" disabled={texto.trim().toUpperCase() !== 'EXCLUIR' || excluindo} onClick={() => void excluir()}>
                {excluindo ? 'Excluindo…' : 'Excluir definitivamente'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setConfirmando(false);
                  setTexto('');
                  setErro(null);
                }}
              >
                Voltar
              </button>
            </div>
          </>
        )}
      </Cartao>
    </div>
  );
}
