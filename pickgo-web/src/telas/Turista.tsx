import { useEffect, useState } from 'react';
import type { ConfigPublica } from '../api.ts';
import { useCarga, useApiCliente, useSessao } from '../sessao.tsx';
import { Ajuda } from './turista/Ajuda.tsx';
import { Cadastro } from './turista/Cadastro.tsx';
import { CatalogoESacola, CHAVE_CUPOM, CHAVE_LINK, gravarLocal } from './turista/CatalogoESacola.tsx';
import { Entrar } from './turista/Entrar.tsx';
import { MeusPedidos } from './turista/MeusPedidos.tsx';
import { PixDialogo } from './turista/PixDialogo.tsx';
import { ScanGo } from './turista/ScanGo.tsx';
import { MinhaConta } from './turista/MinhaConta.tsx';
import { cancelarPush, EVENTO_ABRIR_PEDIDOS, registrarPush } from '../nativo.ts';

type Aba = 'catalogo' | 'scango' | 'pedidos' | 'ajuda' | 'conta';

/**
 * App do turista. `irPara` só existe no sistema completo (atalho de teste para a central);
 * `loja` é o app publicado nas lojas: rótulos sem os códigos das telas da especificação.
 */
export function Turista({ config, irPara, loja = false }: { config: ConfigPublica | null; irPara?: (v: 'central') => void; loja?: boolean }) {
  const { tokenCliente, entrarCliente } = useSessao();
  const api = useApiCliente();
  const [aba, setAba] = useState<Aba>('catalogo');
  const [pixPedidoId, setPixPedidoId] = useState<string | null>(null);
  // Sem sessão: cadastro (padrão) ou login de quem já tem conta.
  const [entrar, setEntrar] = useState<{ cpf: string } | null>(null);
  const eu = useCarga(tokenCliente ? () => api.eu() : null, [api]);

  // Link da campanha (#turista?c=…&oferta=…): guarda o cupom e a origem, mesmo antes do cadastro.
  useEffect(() => {
    const [, qs] = location.hash.split('?');
    if (!qs) return;
    const p = new URLSearchParams(qs);
    if (p.get('oferta')) gravarLocal(CHAVE_CUPOM, p.get('oferta')!.toUpperCase());
    if (p.get('c')) gravarLocal(CHAVE_LINK, p.get('c')!);
    history.replaceState(null, '', `${location.pathname}#turista`);
    setAba('catalogo');
  }, []);

  // App instalado: registra o aparelho para o push dos avisos do pedido.
  useEffect(() => {
    if (tokenCliente) void registrarPush((d) => api.registrarDispositivo(d));
  }, [tokenCliente, api]);

  useEffect(() => {
    const abrir = () => setAba('pedidos');
    addEventListener(EVENTO_ABRIR_PEDIDOS, abrir);
    return () => removeEventListener(EVENTO_ABRIR_PEDIDOS, abrir);
  }, []);

  const sair = async () => {
    await cancelarPush((t) => api.removerDispositivo(t));
    entrarCliente(null);
    setAba('catalogo');
  };

  if (!tokenCliente) {
    return entrar ? (
      <Entrar cpfInicial={entrar.cpf} aoCriarConta={() => setEntrar(null)} />
    ) : (
      <Cadastro aoEntrar={(cpf = '') => setEntrar({ cpf })} />
    );
  }

  const abas: { id: Aba; rotulo: string }[] = loja
    ? [
        { id: 'catalogo', rotulo: '🛒 Catálogo' },
        { id: 'scango', rotulo: '📷 Scan & Go' },
        { id: 'pedidos', rotulo: '📦 Pedidos' },
        { id: 'ajuda', rotulo: '💬 Ajuda' },
        { id: 'conta', rotulo: '👤 Conta' },
      ]
    : [
        { id: 'catalogo', rotulo: '🛒 T1 · T2 Catálogo e sacola' },
        { id: 'scango', rotulo: '📷 T5 · T6 Scan & Go na loja' },
        { id: 'pedidos', rotulo: '📦 T4 · T19 Meus pedidos e QR' },
        { id: 'ajuda', rotulo: '💬 Ajuda e mensagens' },
        { id: 'conta', rotulo: '👤 Minha conta' },
      ];

  return (
    <>
      <div className="barra-cliente">
        <span>
          👤 <strong>{eu.dados?.nome ?? '…'}</strong> {eu.dados && <>· CPF {eu.dados.cpf_mascarado}</>}
        </span>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => void sair()}>
          Sair
        </button>
      </div>
      <div className="sub-nav" role="tablist" aria-label="App do turista">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            className={`sub-tab ${aba === a.id ? 'active' : ''}`}
            onClick={() => setAba(a.id)}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === 'catalogo' && <CatalogoESacola config={config} aoGerarPix={setPixPedidoId} />}
      {aba === 'scango' && <ScanGo config={config} aoGerarPix={setPixPedidoId} />}
      {aba === 'ajuda' && <Ajuda />}
      {aba === 'pedidos' && <MeusPedidos aoPagar={setPixPedidoId} irParaCentral={irPara && (() => irPara('central'))} />}
      {aba === 'conta' && <MinhaConta eu={eu.dados} aoExcluir={() => void sair()} />}

      <PixDialogo
        pedidoId={pixPedidoId}
        aoFechar={() => setPixPedidoId(null)}
        aoVerPedidos={() => {
          setPixPedidoId(null);
          setAba('pedidos');
        }}
      />
    </>
  );
}
