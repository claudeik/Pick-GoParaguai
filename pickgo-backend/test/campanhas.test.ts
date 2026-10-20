import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { expirarCobrancas } from '../src/servicos/rotinas.ts';
import { criarAmbiente, type Ambiente } from './ambiente.ts';

// Campanhas e ofertas: público, ofertas por quantidade e tempo, quem paga o
// desconto, cascata de canais, link rastreado e conversão.

const amanha = () => new Date(Date.now() + 86_400_000).toISOString();

async function comprarERetirar(a: Ambiente, token: string, produto: string, quantidade = 1) {
  const p0 = await a.produto(produto);
  const loja = p0.loja_id;
  const p = await a.pedidoComPix(token, { modo: 'RETIRADA_LOJA', itens: [{ produto_id: p0.id, quantidade }] });
  await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos);
  const ped = (await a.req('GET', `/v1/pedidos/${p.id}`, { token })).corpo;
  for (const i of ped.itens) await a.req('POST', `/v1/pedidos/${p.id}/itens/${i.id}/separar`, { token: a.equipe('lojista', loja), corpo: {} });
  const qr = (await a.req('GET', `/v1/pedidos/${p.id}`, { token })).corpo.qr;
  await a.req('POST', `/v1/pedidos/${p.id}/retirada/confirmar`, { token: a.equipe('lojista', loja), corpo: { qr, documento_conferido: true } });
}

const contatoDe = async (a: Ambiente, token: string) => {
  const eu = (await a.req('GET', '/v1/clientes/eu', { token })).corpo;
  return (await a.db.query<{ id: string; whatsapp: string }>('select id, whatsapp from contato where cliente_id = $1', [eu.id])).rows[0]!;
};

describe('ofertas por quantidade e por tempo', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  it('valida a oferta, aplica o preço, respeita limite por cliente, esgota e devolve unidade de Pix expirado', async () => {
    const mkt = a.acesso('portal-marketing');
    const ps5 = await a.produto('PlayStation 5');
    const base = { produto_id: ps5.id, titulo: 'PS5 Pro relâmpago', fim: amanha(), pagador: 'LOJA' };
    assert.equal((await a.req('POST', '/v1/ofertas', { token: mkt, corpo: { ...base, preco_promocional_usd_centavos: ps5.preco_usd_centavos, quantidade_total: 2 } })).status, 422);
    assert.equal((await a.req('POST', '/v1/ofertas', { token: mkt, corpo: { ...base, preco_promocional_usd_centavos: 59_900, quantidade_total: 999 } })).status, 422);
    assert.equal((await a.req('POST', '/v1/ofertas', { token: a.acesso('portal-atendimento'), corpo: { ...base, preco_promocional_usd_centavos: 59_900, quantidade_total: 2 } })).status, 403);
    const o = (await a.req('POST', '/v1/ofertas', { token: mkt, corpo: { ...base, preco_promocional_usd_centavos: 59_900, quantidade_total: 2, codigo: 'PICKGO-PS5PRO' } })).corpo;
    assert.equal(o.exclusiva, false);
    assert.equal((await a.req('GET', '/v1/ofertas')).corpo.ofertas[0].codigo, 'PICKGO-PS5PRO', 'oferta pública na vitrine');

    const c1 = await a.novoCliente('Comprador Um');
    const p1 = await a.pedidoComPix(c1, { modo: 'RETIRADA_PORTAL', cupom: 'pickgo-ps5pro', itens: [{ produto_id: ps5.id, quantidade: 1 }] });
    assert.equal(p1.itens[0].preco_usd_centavos, 59_900);
    assert.equal(p1.valores.subtotal_brl_centavos, 329_450);
    let r = await a.req('POST', '/v1/pedidos', { token: c1, idem: true, corpo: { modo: 'RETIRADA_PORTAL', cupom: 'PICKGO-PS5PRO', itens: [{ produto_id: ps5.id, quantidade: 1 }] } });
    assert.equal(r.corpo.codigo, 'limite-da-oferta');

    const c2 = await a.novoCliente('Comprador Dois');
    const p2 = await a.pedidoComPix(c2, { modo: 'RETIRADA_PORTAL', cupom: 'PICKGO-PS5PRO', itens: [{ produto_id: ps5.id, quantidade: 1 }] });
    await a.webhook(p2.pagamento.txid, p2.valores.total_brl_centavos);
    const c3 = await a.novoCliente('Comprador Três');
    r = await a.req('POST', '/v1/pedidos', { token: c3, idem: true, corpo: { modo: 'RETIRADA_PORTAL', cupom: 'PICKGO-PS5PRO', itens: [{ produto_id: ps5.id, quantidade: 1 }] } });
    assert.equal(r.corpo.codigo, 'oferta-esgotada');
    assert.equal((await a.produto('PlayStation 5')).estoque, ps5.estoque - 2, 'estoque do produto não foi tocado pelo pedido recusado');

    // Pix do primeiro expira: a unidade volta para a oferta e o terceiro consegue.
    a.avancar((a.config.validadePixMinutos + 1) * 60_000);
    await expirarCobrancas(a.ctx);
    r = await a.req('POST', '/v1/pedidos', { token: c3, idem: true, corpo: { modo: 'RETIRADA_PORTAL', cupom: 'PICKGO-PS5PRO', itens: [{ produto_id: ps5.id, quantidade: 1 }] } });
    assert.equal(r.status, 201);
    assert.equal((await a.req('GET', '/v1/ofertas/gestao', { token: mkt })).corpo.ofertas[0].vendidas, 2);
    r = await a.req('POST', '/v1/pedidos', { token: c3, idem: true, corpo: { modo: 'RETIRADA_PORTAL', cupom: 'PICKGO-NAOEXISTE', itens: [{ produto_id: ps5.id, quantidade: 1 }] } });
    assert.equal(r.status, 422);
  });

  it('desconto pago pelo Portal entra no repasse da loja e volta no estorno; dividido paga a metade', async () => {
    const mkt = a.acesso('portal-marketing');
    const quest = await a.produto('Meta Quest');
    await a.req('POST', '/v1/ofertas', {
      token: mkt,
      corpo: { produto_id: quest.id, titulo: 'Quest pago pelo Portal', fim: amanha(), pagador: 'PORTAL', preco_promocional_usd_centavos: 44_900, quantidade_total: 3, codigo: 'PICKGO-QPORTAL' },
    });
    const t = await a.novoCliente('Ganha Subsídio');
    const p = await a.pedidoComPix(t, { modo: 'RETIRADA_PORTAL', cupom: 'PICKGO-QPORTAL', itens: [{ produto_id: quest.id, quantidade: 1 }] });
    await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos);
    const desconto = Math.round((quest.preco_usd_centavos - 44_900) * 5.5);
    let lanc = await a.lancamentos(p.id);
    const sub = lanc.filter((l) => l.tipo === 'SUBSIDIO_CAMPANHA');
    assert.deepEqual(sub.map((l) => [l.conta_debito, l.conta_credito, l.valor_centavos]), [['portal:campanhas', 'loja:atacado-games:repasse', desconto]]);
    let rel = (await a.req('GET', '/v1/relatorios/lojas/atacado-games', { token: a.equipe('admin') })).corpo;
    assert.equal(rel.subsidios_brl_centavos, desconto);

    await a.req('POST', `/v1/pagamentos/${p.pagamento.id}/estorno`, { token: a.equipe('admin'), corpo: {}, idem: true });
    lanc = await a.lancamentos(p.id);
    assert.equal(lanc.filter((l) => l.tipo === 'ESTORNO_SUBSIDIO_CAMPANHA').length, 1);
    rel = (await a.req('GET', '/v1/relatorios/lojas/atacado-games', { token: a.equipe('admin') })).corpo;
    assert.equal(rel.subsidios_brl_centavos, 0);
    const saldos = (await a.req('GET', '/v1/relatorios/plataforma', { token: a.equipe('admin') })).corpo.saldos_por_conta;
    assert.equal(Object.values(saldos as Record<string, number>).reduce((x, y) => x + y, 0), 0, 'dupla entrada fecha em zero');
    assert.equal(saldos['portal:campanhas'] ?? 0, 0);

    const mac = await a.produto('MacBook');
    await a.req('POST', '/v1/ofertas', {
      token: mkt,
      corpo: { produto_id: mac.id, titulo: 'Mac dividido', fim: amanha(), pagador: 'DIVIDIDO', preco_promocional_usd_centavos: mac.preco_usd_centavos - 101, quantidade_total: 1, codigo: 'PICKGO-MACDIV' },
    });
    const t2 = await a.novoCliente('Divide Desconto');
    const p2 = await a.pedidoComPix(t2, { modo: 'RETIRADA_PORTAL', cupom: 'PICKGO-MACDIV', itens: [{ produto_id: mac.id, quantidade: 1 }] });
    await a.webhook(p2.pagamento.txid, p2.valores.total_brl_centavos);
    // Desconto em reais = diferença dos valores já convertidos e arredondados.
    const d2 = Math.round(mac.preco_usd_centavos * 5.5) - Math.round((mac.preco_usd_centavos - 101) * 5.5);
    const s2 = (await a.lancamentos(p2.id)).filter((l) => l.tipo === 'SUBSIDIO_CAMPANHA');
    assert.equal(s2[0]!.valor_centavos, Math.floor(d2 / 2), 'Portal paga a metade; o centavo ímpar fica com a loja');
  });
});

describe('campanha em cascata', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  it('público por filtros, canal por aceite, cascata sem leitura, clique e compra com oferta exclusiva', async () => {
    const zap = await a.novoCliente('Prefere WhatsApp', { aceite_mensagens_whatsapp: true, aceite_mensagens_sms: true });
    const mail = await a.novoCliente('Só E-mail', { aceite_mensagens_email: true, email: 'so.email@exemplo.com' });
    const nada = await a.novoCliente('Sem Aceite');
    const leu = await a.novoCliente('Lê na Hora', { aceite_mensagens_whatsapp: true, aceite_mensagens_sms: true });
    const fora = await a.novoCliente('Fora do Público', { aceite_mensagens_whatsapp: true });
    for (const t of [zap, mail, nada, leu]) await comprarERetirar(a, t, 'Bicicleta Trek');
    await a.rodarRotinas();

    const mkt = a.acesso('portal-marketing');
    const atalhos = (await a.req('GET', '/v1/publico/atalhos', { token: mkt })).corpo.atalhos;
    const preferenciais = atalhos.find((x: { id: string }) => x.id === 'preferenciais').segmento;
    let r = await a.req('POST', '/v1/publico/previa', { token: mkt, corpo: { segmento: preferenciais, canais: ['WHATSAPP', 'SMS', 'EMAIL'] } });
    assert.deepEqual([r.corpo.total, r.corpo.alcancaveis, r.corpo.por_canal], [4, 3, { WHATSAPP: 2, SMS: 2, EMAIL: 1 }]);

    a.config.limiteMarketingSemana = 1; // a cascata conta como uma campanha só
    const iphone = await a.produto('iPhone 16');
    r = await a.req('POST', '/v1/campanhas', {
      token: mkt,
      corpo: {
        nome: 'iPhone para clientes preferenciais',
        segmento: preferenciais,
        mensagem: 'Oi {nome}! {produto} por {preco} só até {fim}. Restam {restantes}. Use {cupom}: {link}',
        canais: ['WHATSAPP', 'SMS', 'EMAIL'],
        espera_horas: 4,
        oferta: { produto_id: iphone.id, titulo: 'iPhone preferencial', fim: amanha(), pagador: 'DIVIDIDO', preco_promocional_usd_centavos: 99_900, quantidade_total: 5, codigo: 'PICKGO-VIP16' },
        enviar: 'agora',
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    const campanha = r.corpo.id;
    await a.rodarRotinas();

    const passos = async (token: string) => {
      const c = await contatoDe(a, token);
      return (await a.db.query<{ canal: string; estado: string; conteudo: string }>(`select canal, estado, conteudo from mensagem where contato_id = $1 and campanha_id = $2 order by criado_em`, [c.id, campanha])).rows;
    };
    assert.deepEqual((await passos(zap)).map((m) => [m.canal, m.estado]), [['WHATSAPP', 'ENTREGUE']]);
    assert.match((await passos(zap))[0]!.conteudo, /^Oi Prefere! iPhone 16.*PICKGO-VIP16: http:\/\/localhost:3333\/l\/[A-Z0-9]{10}[\s\S]*PARAR/);
    assert.deepEqual((await passos(mail)).map((m) => m.canal), ['EMAIL']);
    assert.equal((await passos(nada)).length, 0);

    // "Lê na Hora" lê o WhatsApp: a cascata dele para.
    const sidLeu = (await a.db.query<{ provedor_id: string }>(`select m.provedor_id from mensagem m join contato c on c.id = m.contato_id where c.id = $1 and m.campanha_id = $2`, [(await contatoDe(a, leu)).id, campanha])).rows[0]!.provedor_id;
    await a.twilio('/v1/webhooks/twilio/status', { MessageSid: sidLeu, MessageStatus: 'read' });

    a.avancar(5 * 3_600_000);
    await a.rodarRotinas();
    assert.deepEqual((await passos(zap)).map((m) => [m.canal, m.estado]), [['WHATSAPP', 'ENTREGUE'], ['SMS', 'ENTREGUE']], 'sem leitura em 4 h, tenta o SMS');
    assert.deepEqual((await passos(leu)).map((m) => m.canal), ['WHATSAPP'], 'quem leu não recebe mais');

    // Clique no link: registra e leva ao app com o cupom.
    const link = /\/l\/([A-Z0-9]{10})/.exec((await passos(zap))[1]!.conteudo)![1]!;
    const red = await a.app.inject({ method: 'GET', url: `/l/${link}` });
    assert.equal(red.statusCode, 302);
    assert.match(red.headers.location!, /^http:\/\/localhost:5180\/#turista\?c=[A-Z0-9]{10}&oferta=PICKGO-VIP16$/);

    // Quem não está no público não usa a oferta exclusiva; quem está, compra.
    r = await a.req('POST', '/v1/pedidos', { token: fora, idem: true, corpo: { modo: 'RETIRADA_PORTAL', cupom: 'PICKGO-VIP16', itens: [{ produto_id: iphone.id, quantidade: 1 }] } });
    assert.equal(r.corpo.codigo, 'oferta-exclusiva');
    assert.equal((await a.req('GET', '/v1/ofertas', { token: fora })).corpo.ofertas.length, 0);
    assert.equal((await a.req('GET', '/v1/ofertas', { token: zap })).corpo.ofertas[0].codigo, 'PICKGO-VIP16', 'exclusiva aparece para o convidado');
    const p = await a.pedidoComPix(zap, { modo: 'RETIRADA_PORTAL', cupom: 'PICKGO-VIP16', campanha_link: link, itens: [{ produto_id: iphone.id, quantidade: 1 }] });
    await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos);

    a.avancar(5 * 3_600_000);
    await a.rodarRotinas();
    assert.equal((await passos(zap)).length, 2, 'comprou: não recebe o e-mail');

    const m = (await a.req('GET', `/v1/campanhas/${campanha}`, { token: mkt })).corpo;
    assert.equal(m.metricas.publico, 4);
    assert.equal(m.metricas.sem_canal, 1);
    assert.equal(m.metricas.cliques, 1);
    assert.equal(m.metricas.compras, 1);
    assert.equal(m.metricas.receita_brl_centavos, p.valores.total_brl_centavos);
    assert.equal(m.metricas.mensagens.lidas, 1);
    assert.equal(m.metricas.mensagens.bloqueadas, 0, 'a cascata não estourou o limite semanal');
    assert.equal(m.campanha.estado, 'CONCLUIDA');
    a.config.limiteMarketingSemana = 3;
  });

  it('cancelar a campanha bloqueia o que estava na fila; só marketing cria campanha', async () => {
    const t = await a.novoCliente('Vai Ser Cancelado', { aceite_mensagens_whatsapp: true });
    await comprarERetirar(a, t, 'JBL Charge');
    const mkt = a.acesso('portal-marketing');
    const corpo = { nome: 'Teste cancelamento', segmento: { etapas: ['CLIENTE_ATIVO', 'RECORRENTE'] }, mensagem: 'Oferta especial para você, {nome}!', canais: ['WHATSAPP'], enviar: 'agora' };
    assert.equal((await a.req('POST', '/v1/campanhas', { token: a.acesso('portal-atendimento'), corpo })).status, 403);
    assert.equal((await a.req('POST', '/v1/campanhas', { token: a.acesso('loja-gerente', 'mega'), corpo })).status, 403);
    const c = (await a.req('POST', '/v1/campanhas', { token: mkt, corpo })).corpo;
    const { processarCampanhas } = await import('../src/servicos/campanhas.ts');
    await processarCampanhas(a.ctx); // dispara, mas não envia
    await a.req('POST', `/v1/campanhas/${c.id}/cancelar`, { token: mkt, corpo: {} });
    await a.rodarRotinas();
    const m = await a.db.query<{ estado: string; motivo: string }>(`select estado, motivo from mensagem where campanha_id = $1`, [c.id]);
    assert.ok(m.rows.length > 0 && m.rows.every((x) => x.estado === 'BLOQUEADA' && x.motivo === 'campanha cancelada'));
    assert.equal((await a.req('GET', '/v1/campanhas', { token: a.acesso('portal-atendimento') })).status, 200, 'atendimento acompanha');
  });
});
