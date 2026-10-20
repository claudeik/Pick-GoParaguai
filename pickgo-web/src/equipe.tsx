import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { criarApi, type Permissao, type QuemSou } from './api.ts';

// Login da equipe (Portal, EPYX e lojas) pelo Keycloak, com código de autorização + PKCE.
// Sem VITE_KEYCLOAK_URL o app fica no modo demonstração: cada aba entra com o login de
// desenvolvimento do backend e todas as ações aparecem (o backend continua checando).

const URL_KEYCLOAK = import.meta.env.VITE_KEYCLOAK_URL as string | undefined;
export const modoKeycloak = !!URL_KEYCLOAK;

const gerenciador = URL_KEYCLOAK
  ? new UserManager({
      authority: `${URL_KEYCLOAK}/realms/${import.meta.env.VITE_KEYCLOAK_REALM ?? 'pickgo'}`,
      client_id: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'pickgo-web',
      redirect_uri: `${location.origin}/`,
      post_logout_redirect_uri: `${location.origin}/`,
      response_type: 'code',
      scope: 'openid profile email',
      automaticSilentRenew: true,
      userStore: new WebStorageStateStore({ store: sessionStorage }),
    })
  : null;

interface Equipe {
  modo: 'keycloak' | 'demonstracao';
  token: string | null;
  eu: QuemSou | null;
  carregando: boolean;
  erro: string | null;
  entrar: () => void;
  sair: () => void;
  /** No modo demonstração tudo aparece; com Keycloak, só o que o perfil permite. */
  pode: (p: Permissao) => boolean;
}

const EquipeCtx = createContext<Equipe | null>(null);

export function ProvedorEquipe({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [eu, setEu] = useState<QuemSou | null>(null);
  const [carregando, setCarregando] = useState(modoKeycloak);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!gerenciador) return;
    let vivo = true;
    (async () => {
      try {
        const q = new URLSearchParams(location.search);
        if (q.has('code') && q.has('state')) {
          // Volta do Keycloak: troca o código pelo token e restaura a aba de onde saiu.
          const u = await gerenciador.signinRedirectCallback();
          const destino = (u.state as { hash?: string } | undefined)?.hash ?? '';
          history.replaceState(null, '', `${location.pathname}${destino}`);
          dispatchEvent(new HashChangeEvent('hashchange'));
          if (vivo) setUsuario(u);
        } else if (q.has('error')) {
          setErro(q.get('error_description') ?? q.get('error'));
          history.replaceState(null, '', `${location.pathname}${location.hash}`);
        } else {
          let u = await gerenciador.getUser();
          if (u?.expired) u = await gerenciador.signinSilent().catch(() => null);
          if (vivo) setUsuario(u && !u.expired ? u : null);
        }
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : String(e));
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    const carregou = (u: User) => setUsuario(u);
    const saiu = () => setUsuario(null);
    gerenciador.events.addUserLoaded(carregou);
    gerenciador.events.addUserUnloaded(saiu);
    gerenciador.events.addAccessTokenExpired(saiu);
    gerenciador.events.addSilentRenewError(saiu);
    return () => {
      vivo = false;
      gerenciador.events.removeUserLoaded(carregou);
      gerenciador.events.removeUserUnloaded(saiu);
      gerenciador.events.removeAccessTokenExpired(saiu);
      gerenciador.events.removeSilentRenewError(saiu);
    };
  }, []);

  const token = usuario?.access_token ?? null;

  // Quem sou e o que posso: vem da API, que é quem decide.
  useEffect(() => {
    if (!token) return setEu(null);
    let vivo = true;
    criarApi(token)
      .quemSou()
      .then((r) => vivo && (setEu(r), setErro(null)))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
    // O token é renovado a cada poucos minutos; o perfil só muda num novo login.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.profile.sub]);

  const entrar = useCallback(() => {
    void gerenciador?.signinRedirect({ state: { hash: location.hash } });
  }, []);
  const sair = useCallback(() => {
    void gerenciador?.signoutRedirect({ id_token_hint: usuario?.id_token });
  }, [usuario]);
  const pode = useCallback((p: Permissao) => !modoKeycloak || !!eu?.permissoes.includes(p), [eu]);

  const valor = useMemo<Equipe>(
    () => ({ modo: modoKeycloak ? 'keycloak' : 'demonstracao', token, eu, carregando, erro, entrar, sair, pode }),
    [token, eu, carregando, erro, entrar, sair, pode],
  );
  return <EquipeCtx.Provider value={valor}>{children}</EquipeCtx.Provider>;
}

export function useEquipe(): Equipe {
  const e = useContext(EquipeCtx);
  if (!e) throw new Error('useEquipe fora do ProvedorEquipe');
  return e;
}
