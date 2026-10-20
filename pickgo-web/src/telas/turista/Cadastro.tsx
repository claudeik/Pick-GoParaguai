import { useState, type FormEvent } from 'react';
import { criarApi, ErroApi } from '../../api.ts';
import { Cartao } from '../../componentes/comum.tsx';
import { useSessao } from '../../sessao.tsx';

// T12 · RF-18 e RF-41: cadastro mínimo com aceite explícito dos termos e das mensagens.
const VERSAO_TERMOS = 'v1-2026-10';

export function Cadastro() {
  const { entrarCliente, avisar } = useSessao();
  const [f, setF] = useState({ cpf: '', nome: '', whatsapp: '', email: '', termos: false, whats: false, mail: false, sms: false });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!f.termos) {
      setErro('Para comprar é preciso aceitar os termos de uso e a política de privacidade.');
      return;
    }
    setEnviando(true);
    try {
      const r = await criarApi(null).cadastrar({
        cpf: f.cpf,
        nome: f.nome.trim(),
        whatsapp: f.whatsapp.replace(/[^\d+]/g, ''),
        email: f.email.trim() || undefined,
        aceite_termos: true,
        aceite_mensagens_whatsapp: f.whats,
        aceite_mensagens_email: f.mail,
        aceite_mensagens_sms: f.sms,
        versao_termos: VERSAO_TERMOS,
      });
      entrarCliente(r.token);
      avisar(`Bem-vindo, ${f.nome.split(' ')[0]}! Cadastro concluído.`);
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'cliente-ja-cadastrado') {
        setErro('Este CPF já tem cadastro. O login por código no WhatsApp entra na Fase 2; por enquanto, use outro CPF de teste.');
      } else {
        setErro(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setEnviando(false);
    }
  };

  const campo = (k: keyof typeof f) => ({
    value: f[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }),
  });
  const marca = (k: keyof typeof f) => ({
    checked: f[k] as boolean,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.checked }),
  });

  return (
    <div className="cadastro">
      <Cartao tag="T12 · RF-18 · RF-41" titulo="Crie sua conta para comprar com Pix">
        <p className="texto-apoio">
          Compre nas lojas do Portal Paraguai antes de chegar ou dentro da loja, pague por Pix e retire sem fila.
        </p>
        <form onSubmit={enviar} noValidate>
          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="cpf">CPF</label>
              <input id="cpf" className="form-control" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" required {...campo('cpf')} />
            </div>
            <div className="form-group">
              <label htmlFor="nome">Nome completo</label>
              <input id="nome" className="form-control" autoComplete="name" required {...campo('nome')} />
            </div>
            <div className="form-group">
              <label htmlFor="whatsapp">WhatsApp com DDD</label>
              <input id="whatsapp" className="form-control" inputMode="tel" autoComplete="tel" placeholder="+55 11 99999-0000" required {...campo('whatsapp')} />
            </div>
            <div className="form-group">
              <label htmlFor="email">E-mail (opcional)</label>
              <input id="email" type="email" className="form-control" autoComplete="email" {...campo('email')} />
            </div>
          </div>

          <fieldset className="aceites">
            <legend>Aceites (LGPD · versão {VERSAO_TERMOS})</legend>
            <label>
              <input type="checkbox" {...marca('termos')} /> Li e aceito os termos de uso e a política de privacidade <em>(obrigatório)</em>
            </label>
            <label>
              <input type="checkbox" {...marca('whats')} /> Quero receber avisos do pedido e ofertas por WhatsApp
            </label>
            <label>
              <input type="checkbox" {...marca('sms')} /> Quero receber avisos do pedido por SMS
            </label>
            <label>
              <input type="checkbox" {...marca('mail')} /> Quero receber recibos e ofertas por e-mail
            </label>
            <span className="nota">Você pode parar a qualquer momento respondendo PARAR.</span>
          </fieldset>

          {erro && (
            <div className="caixa-erro" role="alert">
              {erro}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={enviando}>
            {enviando ? 'Criando conta…' : 'Criar conta e ver o catálogo'}
          </button>
          <p className="nota">
            Ambiente de teste: use um CPF válido gerado para testes (ex.: 529.982.247-25). O CPF é guardado só como hash.
          </p>
        </form>
      </Cartao>
    </div>
  );
}
