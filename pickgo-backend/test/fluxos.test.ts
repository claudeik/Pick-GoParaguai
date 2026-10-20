import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { calcularSplit, calcularTotais } from '../src/dominio/dinheiro.ts';
import { carregarConfig } from '../src/config.ts';
import { expirarCobrancas, marcarNaoRetirados } from '../src/servicos/rotinas.ts';
import { criarAmbiente, type Ambiente } from './ambiente.ts';

// Critérios de aceite da seção 14.2 e fluxos 6.1, 6.4 e 6.5 da especificação.

const soma = (xs: { valor_centavos: number }[]) => xs.reduce((s, x) => s + x.valor_centavos, 0);

describe('split (critério 14.2)', () => {
  it('venda de R$ 60.000,00 divide 51.000 / 4.500 / 4.500 e fecha com o valor pago', () => {
    const cfg = carregarConfig();
    const totais = calcularTotais(6_000_000, cfg);
    const partes = calcularSplit(new Map([['cellshop', 6_000_000]]), totais, cfg);
    const de = (tipo: string) => partes.find((p) => p.tipo === tipo)?.valor;
    assert.equal(de('REPASSE_LOJA'), 5_100_000);
    assert.equal(de('COMISSAO_PORTAL'), 450_000);
    assert.equal(de('COMISSAO_EPYX'), 450_000);
    assert.equal(de('TAXA_PIX'), 90_000);
    assert.equal(de('TAXA_CAMBIO'), 30_000);
    assert.equal(partes.reduce((s, p) => s + p.valor, 0), totais.total);
    assert.equal(totais.total, 6_120_000);
  });
});

describe('retirada na central do Portal (fluxos 6.1 e 6.5)', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  it('do Pix à entrega, com webhook duplicado e QR de uso único', async () => {
    const cliente = await a.novoCliente('Rafael');
    const bike = await a.produto('Bicicleta Trek');
    const perfume = await a.produto('Perfume Dior');
    const central = a.equipe('central');

    const p = await a.pedidoComPix(cliente, {
      modo: 'RETIRADA_PORTAL',
      itens: [
        { produto_id: bike.id, quantidade: 1 },
        { produto_id: perfume.id, quantidade: 1 },
      ],
    });
    assert.equal(p.estado, 'AGUARDANDO_PIX');
    assert.equal(p.valores.subtotal_brl_centavos, 6_000_000 + 107_250);
    assert.ok(p.pagamento.copia_e_cola.startsWith('000201'));
    assert.equal((await a.produto('Bicicleta Trek')).estoque, bike.estoque - 1, 'estoque reservado na criação');

    // Critério 14.2: o mesmo pagamento recebido duas vezes gera um único conjunto de lançamentos.
    const e2e = 'E12345678202610191200abcdef012345';
    const w1 = await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos, e2e);
    const w2 = await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos, e2e);
    assert.equal(w1.corpo.resultados[0].resultado, 'confirmado');
    assert.equal(w2.corpo.resultados[0].resultado, 'ja_processado');
    const lanc = await a.lancamentos(p.id);
    assert.equal(lanc.length, 8, '2 lojas × 3 linhas + taxa Pix + taxa câmbio');
    assert.equal(soma(lanc), p.valores.total_brl_centavos);
    assert.ok(lanc.every((l) => l.conta_debito === 'pix:recebimentos'));

    let r = await a.req('GET', `/v1/pedidos/${p.id}`, { token: cliente });
    assert.equal(r.corpo.estado, 'EM_SEPARACAO');
    const qr: string = r.corpo.qr;
    assert.ok(qr.startsWith('PG1.'));

    // Fila da central mostra o pedido com o nome do cliente.
    r = await a.req('GET', '/v1/central/fila', { token: central });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.pedidos.find((x: { id: string }) => x.id === p.id).cliente_nome, 'Rafael');

    r = await a.req('POST', `/v1/pedidos/${p.id}/cheguei`, { token: cliente, corpo: {} });
    assert.ok(r.corpo.cliente_chegou_em);

    r = await a.req('POST', `/v1/pedidos/${p.id}/coleta/iniciar`, { token: central, corpo: {} });
    assert.equal(r.corpo.estado, 'EM_COLETA');
    r = await a.req('POST', `/v1/pedidos/${p.id}/coleta/conferir`, { token: central, corpo: {} });
    assert.equal(r.corpo.estado, 'EM_TESTE_LOJA');

    // Teste da loja (RF-50): cada loja testa o seu item; lojista de outra loja não pode.
    const itemBike = r.corpo.itens.find((i: { produto_id: string }) => i.produto_id === bike.id);
    const itemPerfume = r.corpo.itens.find((i: { produto_id: string }) => i.produto_id === perfume.id);
    r = await a.req('POST', `/v1/pedidos/${p.id}/itens/${itemBike.id}/teste`, { token: a.equipe('lojista', 'nissei'), corpo: { resultado: 'APROVADO' } });
    assert.equal(r.status, 403);
    r = await a.req('POST', `/v1/pedidos/${p.id}/itens/${itemBike.id}/teste`, { token: a.equipe('lojista', 'cellshop'), corpo: { resultado: 'APROVADO' } });
    assert.equal(r.corpo.estado, 'EM_TESTE_LOJA');
    r = await a.req('POST', `/v1/pedidos/${p.id}/itens/${itemPerfume.id}/teste`, { token: a.equipe('lojista', 'shopping-china'), corpo: { resultado: 'APROVADO' } });
    assert.equal(r.corpo.estado, 'PRONTO_RETIRADA');

    // Conferência do QR e entrega.
    r = await a.req('POST', '/v1/retirada/consultar', { token: central, corpo: { qr } });
    assert.equal(r.corpo.id, p.id);
    r = await a.req('POST', `/v1/pedidos/${p.id}/retirada/confirmar`, { token: central, corpo: { qr, documento_conferido: false } });
    assert.equal(r.status, 422, 'exige documento conferido');
    r = await a.req('POST', `/v1/pedidos/${p.id}/retirada/confirmar`, { token: central, corpo: { qr, documento_conferido: true } });
    assert.equal(r.corpo.estado, 'RETIRADO');

    // Critério 14.2: um QR já usado não libera uma segunda retirada.
    r = await a.req('POST', `/v1/pedidos/${p.id}/retirada/confirmar`, { token: central, corpo: { qr, documento_conferido: true } });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.codigo, 'qr-ja-usado');
    r = await a.req('POST', '/v1/retirada/consultar', { token: central, corpo: { qr } });
    assert.equal(r.corpo.codigo, 'qr-ja-usado');

    // Painel da loja bate com o ledger.
    r = await a.req('GET', '/v1/relatorios/lojas/cellshop', { token: a.equipe('lojista', 'cellshop') });
    assert.equal(r.corpo.bruto_brl_centavos, 6_000_000);
    assert.equal(r.corpo.comissao_portal_brl_centavos, 450_000);
    assert.equal(r.corpo.liquido_brl_centavos, 5_100_000);
    r = await a.req('GET', '/v1/relatorios/lojas/cellshop', { token: a.equipe('lojista', 'nissei') });
    assert.equal(r.status, 403);
  });

  it('QR falso ou de outro pedido é recusado', async () => {
    const central = a.equipe('central');
    const r = await a.req('POST', '/v1/retirada/consultar', { token: central, corpo: { qr: 'PG1.00000000-0000-0000-0000-000000000000.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' } });
    assert.equal(r.status, 422);
  });

  it('webhook com assinatura inválida é rejeitado', async () => {
    const r = await a.app.inject({
      method: 'POST',
      url: '/v1/webhooks/pix',
      headers: { 'content-type': 'application/json', 'x-pix-signature': 'errada' },
      payload: JSON.stringify({ pix: [{ endToEndId: 'E1', txid: 'x', valor: '1.00', horario: 'agora' }] }),
    });
    assert.equal(r.statusCode, 401);
  });
});

describe('defeito no teste da loja (regra 3.3.2)', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  it('defeito volta para coleta, abre ocorrência da loja e fecha com a troca aprovada', async () => {
    const cliente = await a.novoCliente();
    const ps5 = await a.produto('PlayStation 5');
    const central = a.equipe('central');
    const lojista = a.equipe('lojista', 'atacado-games');
    const p = await a.pedidoComPix(cliente, { modo: 'RETIRADA_PORTAL', itens: [{ produto_id: ps5.id, quantidade: 1 }] });
    await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos);
    await a.req('POST', `/v1/pedidos/${p.id}/coleta/iniciar`, { token: central, corpo: {} });
    let r = await a.req('POST', `/v1/pedidos/${p.id}/coleta/conferir`, { token: central, corpo: {} });
    const item = r.corpo.itens[0];

    r = await a.req('POST', `/v1/pedidos/${p.id}/itens/${item.id}/teste`, { token: lojista, corpo: { resultado: 'DEFEITO', descricao: 'não liga' } });
    assert.equal(r.corpo.estado, 'EM_COLETA');
    r = await a.req('GET', `/v1/ocorrencias?pedido_id=${p.id}`, { token: central });
    assert.equal(r.corpo.ocorrencias.length, 1);
    assert.equal(r.corpo.ocorrencias[0].tipo, 'DEFEITO_TESTE');
    assert.equal(r.corpo.ocorrencias[0].responsavel, 'LOJA');
    assert.equal(r.corpo.ocorrencias[0].estado, 'ABERTA');
    r = await a.req('GET', '/v1/ocorrencias', { token: lojista });
    assert.equal(r.corpo.ocorrencias.length, 1, 'a loja vê a ocorrência dela');

    r = await a.req('POST', `/v1/ocorrencias/${(await a.req('GET', `/v1/ocorrencias?pedido_id=${p.id}`, { token: central })).corpo.ocorrencias[0].id}/resolver`, {
      token: central,
      corpo: { resolucao: 'TROCA' },
      idem: true,
    });
    assert.equal(r.status, 409, 'defeito no teste não se resolve à mão');

    // A loja troca a unidade, o Portal confere de novo e o novo teste é aprovado.
    r = await a.req('POST', `/v1/pedidos/${p.id}/coleta/conferir`, { token: central, corpo: {} });
    assert.equal(r.corpo.itens[0].teste_resultado, null);
    r = await a.req('POST', `/v1/pedidos/${p.id}/itens/${item.id}/teste`, { token: lojista, corpo: { resultado: 'APROVADO' } });
    assert.equal(r.corpo.estado, 'PRONTO_RETIRADA');
    r = await a.req('GET', `/v1/ocorrencias?pedido_id=${p.id}`, { token: central });
    assert.equal(r.corpo.ocorrencias[0].estado, 'RESOLVIDA');
    assert.equal(r.corpo.ocorrencias[0].resolucao, 'TROCA');
    assert.equal((await a.lancamentos(p.id)).filter((l) => l.tipo === 'AJUSTE_OCORRENCIA').length, 0, 'sem ônus no ledger');
  });
});

describe('ocorrências com acerto na fatura (critério 14.2)', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  it('item faltante com acerto na fatura divide o ajuste entre loja e Portal; defeito pós-saída não lança nada', async () => {
    const cliente = await a.novoCliente();
    const jbl = await a.produto('JBL Charge');
    const central = a.equipe('central');
    const p = await a.pedidoComPix(cliente, { modo: 'RETIRADA_LOJA', itens: [{ produto_id: jbl.id, quantidade: 2 }] });
    await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos);

    let r = await a.req('POST', '/v1/ocorrencias', { token: central, corpo: { pedido_id: p.id, tipo: 'ITEM_FALTANTE', descricao: 'veio 1 de 2' } });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.responsavel, 'LOJA_E_PORTAL');
    const oc = r.corpo.id;

    r = await a.req('POST', `/v1/ocorrencias/${oc}/resolver`, { token: central, corpo: { resolucao: 'TROCA' }, idem: true });
    assert.equal(r.status, 422, 'troca não é resolução de item faltante');
    r = await a.req('POST', `/v1/ocorrencias/${oc}/resolver`, { token: central, corpo: { resolucao: 'ACERTO_FATURA', valor_ajuste_centavos: 10_001 }, idem: true });
    assert.equal(r.corpo.estado, 'RESOLVIDA');
    const ajustes = (await a.lancamentos(p.id)).filter((l) => l.tipo === 'AJUSTE_OCORRENCIA');
    assert.deepEqual(
      ajustes.map((l) => [l.conta_debito, l.valor_centavos]).sort(),
      [
        ['loja:mega:repasse', 5_001],
        ['portal:comissao', 5_000],
      ],
    );
    r = await a.req('GET', '/v1/relatorios/lojas/mega', { token: a.equipe('admin') });
    assert.equal(r.corpo.ajustes_brl_centavos, 5_001);

    // A loja separa no balcão e entrega.
    const lojista = a.equipe('lojista', 'mega');
    r = await a.req('GET', `/v1/pedidos/${p.id}`, { token: cliente });
    const qr = r.corpo.qr;
    r = await a.req('POST', `/v1/pedidos/${p.id}/itens/${r.corpo.itens[0].id}/separar`, { token: lojista, corpo: {} });
    assert.equal(r.corpo.estado, 'PRONTO_RETIRADA');
    r = await a.req('POST', `/v1/pedidos/${p.id}/retirada/confirmar`, { token: lojista, corpo: { qr, documento_conferido: true } });
    assert.equal(r.corpo.estado, 'RETIRADO');

    // Depois da saída: ticket para a loja, sem lançamento contra o Portal.
    const antes = (await a.lancamentos(p.id)).length;
    r = await a.req('POST', '/v1/ocorrencias', { token: cliente, corpo: { pedido_id: p.id, tipo: 'DEFEITO_POS_SAIDA', descricao: 'parou de carregar' } });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.responsavel, 'LOJA');
    assert.equal(r.corpo.resolucao, 'TICKET_LOJA');
    assert.equal((await a.lancamentos(p.id)).length, antes);
    r = await a.req('POST', '/v1/ocorrencias', { token: central, corpo: { pedido_id: p.id, tipo: 'ITEM_FALTANTE', descricao: 'x' } });
    assert.equal(r.status, 409, 'depois da saída não cabe item faltante');
  });
});

describe('Scan & Go (fluxo 6.4)', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  it('divergência na saída segura a liberação até ser resolvida', async () => {
    const cliente = await a.novoCliente();
    const perfume = await a.produto('Perfume Dior');
    const central = a.equipe('central');
    const p = await a.pedidoComPix(cliente, {
      modo: 'SCAN_GO',
      loja_id: 'shopping-china',
      itens: [{ codigo_barras: perfume.codigo_barras, quantidade: 1 }],
    });
    await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos);
    let r = await a.req('GET', `/v1/pedidos/${p.id}`, { token: cliente });
    assert.equal(r.corpo.estado, 'LIBERADO_SAIDA');
    const qr = r.corpo.qr;

    r = await a.req('POST', `/v1/pedidos/${p.id}/saida/liberar`, { token: central, corpo: { qr, conferencia: 'TOTAL', divergencia: { descricao: '1 perfume a mais' } } });
    assert.equal(r.corpo.estado, 'LIBERADO_SAIDA');
    r = await a.req('POST', `/v1/pedidos/${p.id}/saida/liberar`, { token: central, corpo: { qr, conferencia: 'TOTAL' } });
    assert.equal(r.corpo.codigo, 'ocorrencia-aberta');

    const oc = (await a.req('GET', `/v1/ocorrencias?pedido_id=${p.id}`, { token: central })).corpo.ocorrencias[0];
    assert.equal(oc.responsavel, 'A_DEFINIR');
    r = await a.req('POST', `/v1/ocorrencias/${oc.id}/resolver`, { token: central, corpo: { resolucao: 'DEVOLUCAO' }, idem: true });
    assert.equal(r.status, 422, 'exige definir o responsável');
    r = await a.req('POST', `/v1/ocorrencias/${oc.id}/resolver`, { token: central, corpo: { resolucao: 'DEVOLUCAO', responsavel: 'LOJA' }, idem: true });
    assert.equal(r.corpo.responsavel, 'LOJA');

    r = await a.req('POST', `/v1/pedidos/${p.id}/saida/liberar`, { token: a.equipe('operador', 'nissei'), corpo: { qr, conferencia: 'AMOSTRAGEM' } });
    assert.equal(r.status, 403, 'operador de outra loja');
    r = await a.req('POST', `/v1/pedidos/${p.id}/saida/liberar`, { token: a.equipe('operador', 'shopping-china'), corpo: { qr, conferencia: 'AMOSTRAGEM' } });
    assert.equal(r.corpo.estado, 'RETIRADO');
    assert.equal(r.corpo.operacao.conferencia_saida, 'AMOSTRAGEM');
  });

  it('Scan & Go com item de outra loja é recusado', async () => {
    const cliente = await a.novoCliente();
    const mac = await a.produto('MacBook');
    const r = await a.req('POST', '/v1/pedidos', {
      token: cliente,
      idem: true,
      corpo: { modo: 'SCAN_GO', loja_id: 'nissei', itens: [{ produto_id: mac.id, quantidade: 1 }] },
    });
    assert.equal(r.status, 422);
  });
});

describe('estorno (critério 14.2)', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  it('estornar reverte o split, devolve o estoque e zera as contas das partes', async () => {
    const cliente = await a.novoCliente();
    const iphone = await a.produto('iPhone 16');
    const admin = a.equipe('admin');
    const p = await a.pedidoComPix(cliente, { modo: 'RETIRADA_PORTAL', itens: [{ produto_id: iphone.id, quantidade: 2 }] });
    await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos);

    let r = await a.req('POST', `/v1/pagamentos/${p.pagamento.id}/estorno`, { token: a.equipe('central'), corpo: {}, idem: true });
    assert.equal(r.status, 403, 'só o admin estorna');
    const chave = 'estorno-teste-0001';
    r = await a.req('POST', `/v1/pagamentos/${p.pagamento.id}/estorno`, { token: admin, corpo: {}, idem: chave });
    assert.equal(r.corpo.estado, 'REEMBOLSADO');
    r = await a.req('POST', `/v1/pagamentos/${p.pagamento.id}/estorno`, { token: admin, corpo: {}, idem: chave });
    assert.equal(r.corpo.estado, 'REEMBOLSADO', 'mesma chave devolve a mesma resposta');

    const lanc = await a.lancamentos(p.id);
    const saldo = new Map<string, number>();
    for (const l of lanc) {
      saldo.set(l.conta_credito, (saldo.get(l.conta_credito) ?? 0) + l.valor_centavos);
      saldo.set(l.conta_debito, (saldo.get(l.conta_debito) ?? 0) - l.valor_centavos);
    }
    for (const [conta, v] of saldo) {
      if (conta === 'pix:recebimentos') assert.equal(v, -p.valores.total_brl_centavos);
      else if (conta === 'pix:estornos_a_pagar') assert.equal(v, p.valores.total_brl_centavos);
      else assert.equal(v, 0, `${conta} zerada`);
    }
    assert.equal((await a.produto('iPhone 16')).estoque, iphone.estoque);

    r = await a.req('GET', '/v1/relatorios/plataforma', { token: admin });
    assert.equal(r.corpo.gmv_brl_centavos, 0);
    assert.equal(r.corpo.saldos_por_conta['pix:estornos_a_pagar'], p.valores.total_brl_centavos);
    r = await a.req('GET', `/v1/lancamentos?pedido_id=${p.id}`, { token: admin });
    assert.equal(r.corpo.lancamentos.length, lanc.length);
  });
});

describe('prazos', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  it('Pix vencido expira o pedido, devolve o estoque, e o pagamento atrasado fica para devolução', async () => {
    const cliente = await a.novoCliente();
    const quest = await a.produto('Meta Quest');
    const p = await a.pedidoComPix(cliente, { modo: 'RETIRADA_PORTAL', itens: [{ produto_id: quest.id, quantidade: 1 }] });
    assert.equal((await a.produto('Meta Quest')).estoque, quest.estoque - 1);

    a.avancar((a.config.validadePixMinutos + 1) * 60_000);
    assert.equal(await expirarCobrancas(a.ctx), 1);
    let r = await a.req('GET', `/v1/pedidos/${p.id}`, { token: cliente });
    assert.equal(r.corpo.estado, 'EXPIRADO');
    assert.equal((await a.produto('Meta Quest')).estoque, quest.estoque);

    const w = await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos);
    assert.equal(w.corpo.resultados[0].resultado, 'fora_do_prazo');
    const lanc = await a.lancamentos(p.id);
    assert.equal(lanc.length, 1);
    assert.equal(lanc[0]!.conta_credito, 'pix:estornos_a_pagar');
  });

  it('pedido pronto e não retirado no prazo vira NAO_RETIRADO', async () => {
    const cliente = await a.novoCliente();
    const jbl = await a.produto('JBL Charge');
    const p = await a.pedidoComPix(cliente, { modo: 'RETIRADA_LOJA', itens: [{ produto_id: jbl.id, quantidade: 1 }] });
    await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos);
    const item = (await a.req('GET', `/v1/pedidos/${p.id}`, { token: cliente })).corpo.itens[0];
    await a.req('POST', `/v1/pedidos/${p.id}/itens/${item.id}/separar`, { token: a.equipe('lojista', 'mega'), corpo: {} });
    a.avancar((a.config.prazoRetiradaHoras + 1) * 3_600_000);
    assert.equal(await marcarNaoRetirados(a.ctx), 1);
    const r = await a.req('GET', `/v1/pedidos/${p.id}`, { token: cliente });
    assert.equal(r.corpo.estado, 'NAO_RETIRADO');
  });
});

describe('acesso', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  it('cliente não vê pedido de outro cliente; sem token é 401', async () => {
    const c1 = await a.novoCliente();
    const c2 = await a.novoCliente();
    const jbl = await a.produto('JBL Charge');
    const p = await a.pedidoComPix(c1, { modo: 'RETIRADA_PORTAL', itens: [{ produto_id: jbl.id, quantidade: 1 }] });
    assert.equal((await a.req('GET', `/v1/pedidos/${p.id}`, { token: c2 })).status, 404);
    assert.equal((await a.req('GET', `/v1/pedidos/${p.id}`)).status, 401);
    assert.equal((await a.req('GET', '/v1/central/fila', { token: c1 })).status, 403);
    const r = await a.req('POST', '/v1/pedidos', { token: c1, corpo: { modo: 'RETIRADA_PORTAL', itens: [{ produto_id: jbl.id, quantidade: 1 }] } });
    assert.equal(r.status, 409, 'pedido sem Idempotency-Key');
  });
});
