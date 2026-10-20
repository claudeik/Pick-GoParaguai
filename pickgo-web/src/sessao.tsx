import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { criarApi, ErroApi, type Api, type Perfil } from './api.ts';
import { modoKeycloak, useEquipe } from './equipe.tsx';

// Guarda o token do turista (cadastro) e obtém tokens da equipe pelo login de
// desenvolvimento do backend, até a integração com o provedor OIDC.

const CHAVE_CLIENTE = 'pickgo.token.cliente';

function lerArmazenado(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarArmazenado(chave: string, valor: string | null) {
  try {
    if (valor) localStorage.setItem(chave, valor);
    else localStorage.removeItem(chave);
  } catch {
    // Armazenamento indisponível (aba anônima): a sessão vale só nesta aba.
  }
}

interface Aviso {
  id: number;
  texto: string;
  tipo: 'ok' | 'erro';
}

interface Sessao {
  tokenCliente: string | null;
  entrarCliente: (token: string | null) => void;
  avisar: (texto: string, tipo?: 'ok' | 'erro') => void;
  avisarErro: (e: unknown) => void;
}

const SessaoCtx = createContext<Sessao | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [tokenCliente, setTokenCliente] = useState(() => lerArmazenado(CHAVE_CLIENTE));
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const seq = useRef(0);

  const entrarCliente = useCallback((t: string | null) => {
    gravarArmazenado(CHAVE_CLIENTE, t);
    setTokenCliente(t);
  }, []);

  const avisar = useCallback((texto: string, tipo: 'ok' | 'erro' = 'ok') => {
    const id = ++seq.current;
    setAvisos((a) => [...a.slice(-3), { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'erro' ? 8000 : 5000);
  }, []);

  const avisarErro = useCallback(
    (e: unknown) => {
      if (e instanceof ErroApi && e.status === 401 && tokenCliente) entrarCliente(null);
      avisar(e instanceof Error ? e.message : String(e), 'erro');
    },
    [avisar, entrarCliente, tokenCliente],
  );

  const valor = useMemo(
    () => ({ tokenCliente, entrarCliente, avisar, avisarErro }),
    [tokenCliente, entrarCliente, avisar, avisarErro],
  );

  return (
    <SessaoCtx.Provider value={valor}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`toast ${a.tipo === 'erro' ? 'toast-erro' : ''}`} role={a.tipo === 'erro' ? 'alert' : 'status'}>
            <span>{a.texto}</span>
            <button type="button" className="toast-fechar" aria-label="Fechar aviso" onClick={() => setAvisos((x) => x.filter((y) => y.id !== a.id))}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </SessaoCtx.Provider>
  );
}

export function useSessao(): Sessao {
  const s = useContext(SessaoCtx);
  if (!s) throw new Error('useSessao fora do ProvedorSessao');
  return s;
}

/** API autenticada como o turista. */
export function useApiCliente(): Api {
  const { tokenCliente } = useSessao();
  return useMemo(() => criarApi(tokenCliente), [tokenCliente]);
}

/**
 * API autenticada como alguém da equipe (central, lojista, admin).
 * Com Keycloak, usa o token de quem entrou (os parâmetros são ignorados).
 * No modo demonstração, pede um token ao /v1/dev/login com o perfil da aba.
 */
export function useApiEquipe(perfil: Perfil, sub: string, lojaId?: string): { api: Api | null; erro: string | null; precisaLogin: boolean } {
  const equipe = useEquipe();
  const [token, setToken] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (modoKeycloak) return;
    let vivo = true;
    setToken(null);
    setErro(null);
    criarApi(null)
      .devLogin({ perfil, sub, loja_id: lojaId })
      .then((r) => vivo && setToken(r.token))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [perfil, sub, lojaId]);

  const efetivo = modoKeycloak ? equipe.token : token;
  const api = useMemo(() => (efetivo ? criarApi(efetivo) : null), [efetivo]);
  if (modoKeycloak) return { api, erro: equipe.erro, precisaLogin: !equipe.carregando && !equipe.token };
  return { api, erro, precisaLogin: false };
}

/**
 * Carrega dados e recarrega a cada `intervaloMs` (painéis da operação).
 * `recarregar` força uma nova leitura depois de uma ação.
 */
export function useCarga<T>(carregar: (() => Promise<T>) | null, deps: unknown[], intervaloMs = 0) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const ref = useRef(carregar);
  ref.current = carregar;

  const recarregar = useCallback(async () => {
    const fn = ref.current;
    if (!fn) return;
    setCarregando(true);
    try {
      setDados(await fn());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!carregar) return;
    void recarregar();
    if (!intervaloMs) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void recarregar();
    }, intervaloMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, !!carregar, intervaloMs]);

  return { dados, erro, carregando, recarregar, setDados };
}
