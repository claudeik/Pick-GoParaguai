import { criarApi, type ConfigPublica } from '../api.ts';
import { CaixaErro, PedirLogin, SemPermissao } from '../componentes/comum.tsx';
import { useEquipe } from '../equipe.tsx';
import { GestaoCatalogo } from '../componentes/GestaoCatalogo.tsx';
import { useApiEquipe, useCarga } from '../sessao.tsx';

// Administração do catálogo de todas as lojas do Pick & Go, pelo admin do Portal.

export function Catalogo({ config }: { config: ConfigPublica | null }) {
  const { api, erro, precisaLogin } = useApiEquipe('admin', 'admin-portal');
  const { pode, eu } = useEquipe();
  const lojas = useCarga(() => criarApi(null).lojas(), []);
  if (precisaLogin) return <PedirLogin />;
  if (erro) return <CaixaErro erro={erro} />;
  if (!pode('catalogo.ver')) return <SemPermissao oQue="lista mestre" />;
  if (lojas.erro) return <CaixaErro erro={lojas.erro} onTentar={lojas.recarregar} />;
  if (!api || !lojas.dados) return <p className="carregando">Entrando como administrador…</p>;
  return <GestaoCatalogo api={api} config={config} lojas={lojas.dados.lojas} lojaFixa={eu?.organizacao === 'LOJA' ? (eu.loja_id ?? undefined) : undefined} />;
}
