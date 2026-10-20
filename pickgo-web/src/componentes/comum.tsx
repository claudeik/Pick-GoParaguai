import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { EstadoPedido } from '../api.ts';
import { classeEstado, NOME_ESTADO } from '../formato.ts';
import { useEquipe } from '../equipe.tsx';
import { useSessao } from '../sessao.tsx';

/** QR de verdade (legível por câmera), gerado no navegador. */
export function Qr({ valor, tamanho = 168, rotulo }: { valor: string; tamanho?: number; rotulo: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    QRCode.toDataURL(valor, { width: tamanho * 2, margin: 1, color: { dark: '#0B1E3B', light: '#FFFFFF' } })
      .then((u) => vivo && setUrl(u))
      .catch(() => vivo && setUrl(null));
    return () => {
      vivo = false;
    };
  }, [valor, tamanho]);
  return url ? (
    <img src={url} width={tamanho} height={tamanho} alt={rotulo} className="qr-img" />
  ) : (
    <div style={{ width: tamanho, height: tamanho }} className="qr-img qr-carregando" aria-label="Gerando QR" />
  );
}

export function Estado({ estado }: { estado: EstadoPedido }) {
  return <span className={`badge ${classeEstado(estado)}`}>{NOME_ESTADO[estado] ?? estado}</span>;
}

export function Kpi({ rotulo, valor, sub, destaque }: { rotulo: string; valor: ReactNode; sub?: ReactNode; destaque?: 'red' | 'green' }) {
  return (
    <div className={`kpi-card ${destaque === 'green' ? 'kpi-verde' : ''}`}>
      <span className="kpi-label">{rotulo}</span>
      <span className={`kpi-value ${destaque === 'red' ? 'red' : ''}`}>{valor}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

export function Cartao({
  tag,
  titulo,
  extra,
  vermelho,
  children,
}: {
  tag?: string;
  titulo: string;
  extra?: ReactNode;
  vermelho?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`card ${vermelho ? 'card-flag-red' : 'card-flag-top'}`}>
      <div className="card-header">
        <div>
          {tag && <span className={`screen-tag ${vermelho ? 'red' : ''}`}>{tag}</span>}
          <h3 className="card-title">{titulo}</h3>
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="vazio">{children}</p>;
}

export function CaixaErro({ erro, onTentar }: { erro: string; onTentar?: () => void }) {
  return (
    <div className="caixa-erro" role="alert">
      <strong>Não foi possível carregar.</strong> {erro}
      {onTentar && (
        <button type="button" className="btn btn-sm btn-outline" onClick={onTentar}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

/**
 * Executa uma ação assíncrona com um botão ocupado enquanto roda.
 * Erros viram aviso; `ok` vira aviso de sucesso.
 */
export function useAcao() {
  const { avisar, avisarErro } = useSessao();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const executar = useCallback(
    async <T,>(chave: string, fn: () => Promise<T>, ok?: string | ((r: T) => string)): Promise<T | undefined> => {
      setOcupado(chave);
      try {
        const r = await fn();
        if (ok) avisar(typeof ok === 'function' ? ok(r) : ok);
        return r;
      } catch (e) {
        avisarErro(e);
        return undefined;
      } finally {
        setOcupado(null);
      }
    },
    [avisar, avisarErro],
  );
  return { ocupado, executar };
}

/** <dialog> nativo controlado por `aberto`. */
export function Dialogo({
  aberto,
  aoFechar,
  titulo,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);
  return (
    <dialog
      ref={ref}
      className="modern-dialog"
      onClose={aoFechar}
      onClick={(e) => e.target === ref.current && aoFechar()}
      aria-label={titulo}
    >
      <div className="dialog-header">
        <h3>{titulo}</h3>
        <button type="button" className="btn btn-sm btn-header-ghost" onClick={aoFechar}>
          Fechar ✕
        </button>
      </div>
      <div className="dialog-body">{aberto && children}</div>
    </dialog>
  );
}

/** Tela da equipe sem login (modo Keycloak). */
export function PedirLogin({ motivo }: { motivo?: string }) {
  const { entrar, erro, carregando } = useEquipe();
  if (carregando) return <p className="carregando">Verificando a sessão…</p>;
  return (
    <div className="pedir-login card card-flag-top">
      <h3 className="card-title">Área da equipe</h3>
      <p className="texto-apoio">{motivo ?? 'Entre com a sua conta do Portal Paraguai, da EPYX ou da sua loja para continuar.'}</p>
      {erro && (
        <div className="caixa-erro" role="alert">
          {erro}
        </div>
      )}
      <button type="button" className="btn btn-primary" onClick={entrar}>
        Entrar com a conta da equipe
      </button>
    </div>
  );
}

/** Aviso quando o perfil de quem entrou não dá acesso à tela. */
export function SemPermissao({ oQue }: { oQue: string }) {
  const { eu } = useEquipe();
  return (
    <div className="pedir-login card card-flag-red">
      <h3 className="card-title">Sem acesso a {oQue}</h3>
      <p className="texto-apoio">
        Seu perfil ({eu?.perfis.map((p) => p.nome).join(', ') || 'sem perfil'}) não inclui esta área. Peça acesso ao administrador da sua organização.
      </p>
    </div>
  );
}
