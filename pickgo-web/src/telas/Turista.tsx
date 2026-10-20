import { useEffect, useState } from 'react';
import type { ConfigPublica } from '../api.ts';
import { useCarga, useApiCliente, useSessao } from '../sessao.tsx';
import { Ajuda } from './turista/Ajuda.tsx';
import { Cadastro } from './turista/Cadastro.tsx';
import { CatalogoESacola, CHAVE_CUPOM, CHAVE_LINK, gravarLocal, lerLocal } from './turista/CatalogoESacola.tsx';
import { Entrar } from './turista/Entrar.tsx';
import { VideosTurista } from './turista/Videos.tsx';
import { MeusPedidos } from './turista/MeusPedidos.tsx';
import { PixDialogo } from './turista/PixDialogo.tsx';
import { ScanGo } from './turista/ScanGo.tsx';
import { MinhaConta } from './turista/MinhaConta.tsx';
import { cancelarPush, EVENTO_ABRIR_PEDIDOS, registrarPush } from '../nativo.ts';

type Aba = 'catalogo' | 'videos' | 'scango' | 'pedidos' | 'ajuda' | 'conta';

/** Link do vídeo que chegou antes do login: abre o vídeo depois de entrar. */
const CHAVE_ABRIR_VIDEO = 'pickgo.abrir_video';

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
  const [abrirVideo, setAbrirVideo] = useState<string | null>(null);
  const eu = useCarga(tokenCliente ? () => api.eu() : null, [api]);

  // Link da campanha (#turista?c=…&oferta=…): guarda o cupom e a origem, mesmo antes do cadastro.
  useEffect(() => {
    const [, qs] = location.hash.split('?');
    if (!qs) return;
    const p = new URLSearchParams(qs);
    if (p.get('oferta')) gravarLocal(CHAVE_CUPOM, p.get('oferta')!.toUpperCase());
    if (p.get('c')) gravarLocal(CHAVE_LINK, p.get('c')!);
    if (p.get('v')) gravarLocal(CHAVE_ABRIR_VIDEO, p.get('v')!.toUpperCase());
    history.replaceState(null, '', `${location.pathname}#turista`);
    setAba('catalogo');
  }, []);

  // Link do vídeo (#turista?v=…): com a sessão aberta, abre a aba Vídeos naquele produto.
  useEffect(() => {
    const v = lerLocal(CHAVE_ABRIR_VIDEO);
    if (!tokenCliente || !v) return;
    gravarLocal(CHAVE_ABRIR_VIDEO, '');
    setAbrirVideo(v);
    setAba('videos');
  }, [tokenCliente]);

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
        { id: 'videos', rotulo: '🎬 Vídeos' },
        { id: 'scango', rotulo: '📷 Scan & Go' },
        { id: 'pedidos', rotulo: '📦 Pedidos' },
        { id: 'ajuda', rotulo: '💬 Ajuda' },
        { id: 'conta', rotulo: '👤 Conta' },
      ]
    : [
        { id: 'catalogo', rotulo: '🛒 T1 · T2 Catálogo e sacola' },
        { id: 'videos', rotulo: '🎬 T20 Vídeos com produtos' },
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
      {aba === 'videos' && <VideosTurista abrirCodigo={abrirVideo} aoComprar={() => setAba('catalogo')} />}
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
