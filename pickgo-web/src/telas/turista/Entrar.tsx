import { useEffect, useState, type FormEvent } from 'react';
import { criarApi, ErroApi } from '../../api.ts';
import { Cartao } from '../../componentes/comum.tsx';
import { useSessao } from '../../sessao.tsx';

// Login de quem já tem cadastro: CPF, depois o código de 6 dígitos enviado ao WhatsApp do cadastro.

export function Entrar({ cpfInicial = '', aoCriarConta }: { cpfInicial?: string; aoCriarConta: () => void }) {
  const { entrarCliente, avisar } = useSessao();
  const [cpf, setCpf] = useState(cpfInicial);
  const [codigo, setCodigo] = useState('');
  const [envio, setEnvio] = useState<{ enviado_para: string; validade_min: number; codigo_dev?: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aguardar, setAguardar] = useState(0);

  useEffect(() => {
    if (aguardar <= 0) return;
    const t = setTimeout(() => setAguardar((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [aguardar]);

  const pedir = async (e?: FormEvent) => {
    e?.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await criarApi(null).pedirCodigo(cpf);
      setEnvio(r);
      setCodigo('');
      setAguardar(60);
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'aguarde-novo-codigo') setAguardar(Number(e.dados.aguardar_s) || 60);
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  };

  const confirmar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await criarApi(null).entrar(cpf, codigo);
      entrarCliente(r.token);
      avisar('Bem-vindo de volta!');
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="cadastro">
      <Cartao tag="T12 · RF-18" titulo="Entrar na sua conta">
        {!envio ? (
          <form onSubmit={pedir} noValidate>
            <p className="texto-apoio">Informe o CPF do cadastro. Enviamos um código de acesso para o seu WhatsApp.</p>
            <div className="form-group">
              <label htmlFor="cpf-entrar">CPF</label>
              <input
                id="cpf-entrar"
                className="form-control"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00"
                required
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
              />
            </div>
            {erro && (
              <div className="caixa-erro" role="alert">
                {erro}
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-block" disabled={enviando || aguardar > 0}>
              {enviando ? 'Enviando…' : aguardar > 0 ? `Aguarde ${aguardar} s` : 'Receber código no WhatsApp'}
            </button>
          </form>
        ) : (
          <form onSubmit={confirmar} noValidate>
            <p className="texto-apoio">
              Enviamos um código de 6 dígitos para o WhatsApp <strong>{envio.enviado_para}</strong>. Ele vale por {envio.validade_min} minutos.
            </p>
            <div className="form-group">
              <label htmlFor="codigo">Código de acesso</label>
              <input
                id="codigo"
                className="form-control"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                required
                autoFocus
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            {envio.codigo_dev && (
              <div className="caixa-teste">
                Ambiente de teste: o WhatsApp é simulado. Seu código é <strong>{envio.codigo_dev}</strong>.
              </div>
            )}
            {erro && (
              <div className="caixa-erro" role="alert">
                {erro}
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-block" disabled={enviando || codigo.length !== 6}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
            <p className="nota">
              Não chegou?{' '}
              <button type="button" className="link" disabled={aguardar > 0 || enviando} onClick={() => pedir()}>
                {aguardar > 0 ? `Reenviar em ${aguardar} s` : 'Reenviar código'}
              </button>{' '}
              ·{' '}
              <button
                type="button"
                className="link"
                onClick={() => {
                  setEnvio(null);
                  setErro(null);
                }}
              >
                Trocar CPF
              </button>
            </p>
          </form>
        )}
        <p className="nota">
          Ainda não tem conta?{' '}
          <button type="button" className="link" onClick={aoCriarConta}>
            Criar conta
          </button>
        </p>
      </Cartao>
    </div>
  );
}
