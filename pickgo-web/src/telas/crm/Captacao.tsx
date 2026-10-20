import { useState, type FormEvent } from 'react';
import type { Api } from '../../api.ts';
import { Cartao } from '../../componentes/comum.tsx';
import { useSessao } from '../../sessao.tsx';

// Captação de leads (RF-41): formulário para a página do vídeo ou da campanha.
// O lead entra no funil com o aceite de cada canal e a origem (UTM, vídeo, cupom).

export function Captacao({ api, aoCriar }: { api: Api; aoCriar: () => void }) {
  const { avisar, avisarErro } = useSessao();
  const [f, setF] = useState({ nome: '', whatsapp: '', email: '', interesse: '', whats: true, sms: false, mail: false, utm_source: 'youtube', utm_campaign: 'outubro-fronteira', video: '' });
  const [enviando, setEnviando] = useState(false);
  const url = `${location.origin}/v1/leads`;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await api.enviarLead({
        nome: f.nome.trim(),
        whatsapp: f.whatsapp.trim() || undefined,
        email: f.email.trim() || undefined,
        interesse: f.interesse.trim() || undefined,
        aceite_whatsapp: f.whats,
        aceite_sms: f.sms,
        aceite_email: f.mail,
        origem: Object.fromEntries(Object.entries({ utm_source: f.utm_source, utm_campaign: f.utm_campaign, video: f.video }).filter(([, v]) => v)),
      });
      avisar(`Lead ${f.nome} no funil.`);
      setF({ ...f, nome: '', whatsapp: '', email: '', interesse: '' });
      aoCriar();
    } catch (err) {
      avisarErro(err);
    } finally {
      setEnviando(false);
    }
  };
  const campo = (k: keyof typeof f) => ({ value: f[k] as string, onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });

  return (
    <div className="grid-2">
      <Cartao tag="RF-41" titulo="Formulário de captação (prévia)">
        <form onSubmit={(e) => void enviar(e)} className="form-lead">
          <p className="texto-apoio">É o que o turista vê na página do vídeo ou da campanha. O envio cai direto no funil como lead.</p>
          <div className="form-group">
            <label htmlFor="ld-nome">Seu nome</label>
            <input id="ld-nome" className="form-control" required minLength={2} {...campo('nome')} />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="ld-whats">WhatsApp</label>
              <input id="ld-whats" className="form-control" inputMode="tel" placeholder="+55 11 99999-0000" {...campo('whatsapp')} />
            </div>
            <div className="form-group">
              <label htmlFor="ld-email">E-mail</label>
              <input id="ld-email" type="email" className="form-control" {...campo('email')} />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="ld-int">O que você procura?</label>
            <input id="ld-int" className="form-control" placeholder="Ex.: iPhone, bicicleta, perfume" {...campo('interesse')} />
          </div>
          <fieldset className="aceites">
            <legend>Quero receber ofertas por</legend>
            <label>
              <input type="checkbox" checked={f.whats} onChange={(e) => setF({ ...f, whats: e.target.checked })} /> WhatsApp
            </label>
            <label>
              <input type="checkbox" checked={f.sms} onChange={(e) => setF({ ...f, sms: e.target.checked })} /> SMS
            </label>
            <label>
              <input type="checkbox" checked={f.mail} onChange={(e) => setF({ ...f, mail: e.target.checked })} /> E-mail
            </label>
          </fieldset>
          {/* Armadilha para robôs, invisível para pessoas. */}
          <input type="text" name="site" tabIndex={-1} autoComplete="off" className="sr-only" aria-hidden="true" />
          <button type="submit" className="btn btn-primary btn-block" disabled={enviando || !f.nome.trim() || (!f.whatsapp.trim() && !f.email.trim())}>
            {enviando ? 'Enviando…' : 'Quero receber as ofertas'}
          </button>
        </form>
      </Cartao>
      <Cartao tag="Integração" titulo="Origem da campanha e uso na página">
        <div className="grid-2">
          <div className="form-group">
            <label htmlFor="ld-src">utm_source</label>
            <input id="ld-src" className="form-control" {...campo('utm_source')} />
          </div>
          <div className="form-group">
            <label htmlFor="ld-camp">utm_campaign</label>
            <input id="ld-camp" className="form-control" {...campo('utm_campaign')} />
          </div>
          <div className="form-group">
            <label htmlFor="ld-vid">Vídeo</label>
            <input id="ld-vid" className="form-control" placeholder="VID-BIKE-CDE" {...campo('video')} />
          </div>
        </div>
        <p className="nota">A página da campanha envia o mesmo formulário para a API; não precisa de login. Há limite de envios por IP e um campo armadilha contra robôs.</p>
        <pre className="codigo">{`POST ${url}
{
  "nome": "Ana", "whatsapp": "+5511988887777",
  "interesse": "iPhone",
  "aceite_whatsapp": true, "aceite_sms": false, "aceite_email": false,
  "origem": { "utm_source": "youtube", "utm_campaign": "outubro-fronteira", "video": "VID-BIKE-CDE" }
}`}</pre>
      </Cartao>
    </div>
  );
}
