import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dvRuc, ivaIncluido, lerRuc, totaisFiscais } from '../src/erp/fiscal.ts';
import { criarAmbiente, type Ambiente } from './ambiente.ts';

// ERP do Portal Paraguai: fiscal, estoque, compras, faturas, contas, livros e comissões.

const ruc = (n: string) => `${n}-${dvRuc(n)}`;

describe('regras fiscais', () => {
  it('RUC com dígito verificador e IVA incluído no preço', () => {
    for (const n of ['80012345', '4004034', '80026157', '1234567']) {
      assert.deepEqual(lerRuc(ruc(n)), { numero: n, dv: dvRuc(n) });
      assert.equal(lerRuc(`${n}-${(dvRuc(n) + 1) % 10}`), null, 'DV errado é recusado');
    }
    assert.equal(ivaIncluido(110_000, '10'), 10_000);
    assert.equal(ivaIncluido(105_000, '5'), 5_000);
    assert.equal(ivaIncluido(50_000, 'EXENTO'), 0);
    assert.deepEqual(totaisFiscais([{ total: 110_000, iva: '10' }, { total: 21_000, iva: '5' }, { total: 7_000, iva: 'EXENTO' }]), {
      total_10: 110_000, iva_10: 10_000, total_5: 21_000, iva_5: 1_000, exento: 7_000, total: 138_000,
    });
  });
});

describe('ERP do Portal', () => {
  let a: Ambiente;
  let fin: string;
  let alm: string;
  const ids: Record<string, string> = {};
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Asuncion' });
  const periodo = hoje.slice(0, 7);
  const ano = Number(hoje.slice(0, 4));

  before(async () => {
    a = await criarAmbiente();
    fin = a.acesso('portal-financeiro', undefined, 'financeiro-1');
    alm = a.acesso('portal-almoxarifado', undefined, 'almox-1');
  });
  after(() => a.fechar());

  const saldo = async (item: string, dep: string) =>
    Number((await a.db.query<{ quantidade: number }>('select quantidade from erp_saldo where item_id = $1 and deposito_id = $2', [ids[item], ids[dep]])).rows[0]?.quantidade ?? 0);

  it('empresa, timbrado e cadastros (RUC conferido)', async () => {
    let r = await a.req('POST', '/v1/erp/faturas', { token: fin, corpo: {} });
    assert.equal(r.status, 422);
    r = await a.req('PUT', '/v1/erp/empresa', {
      token: fin,
      corpo: { ruc: '80012345-0', razao_social: 'Portal Paraguay S.A.', timbrado: '12345678', timbrado_inicio: `${ano}-01-01`, timbrado_fim: `${ano + 1}-12-31` },
    });
    assert.equal(r.status, dvRuc('80012345') === 0 ? 200 : 422, 'DV errado recusado');
    r = await a.req('PUT', '/v1/erp/empresa', {
      token: fin,
      corpo: { ruc: ruc('80012345'), razao_social: 'Portal Paraguay S.A.', timbrado: '12345678', timbrado_inicio: `${ano}-01-01`, timbrado_fim: `${ano + 1}-12-31` },
    });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.proximo_numero, 1);

    r = await a.req('POST', '/v1/erp/terceiros', { token: fin, corpo: { tipo_documento: 'RUC', documento: ruc('80026157'), razao_social: 'Embalajes del Este S.R.L.', fornecedor: true } });
    assert.equal(r.status, 201);
    ids.fornecedor = r.corpo.id;
    r = await a.req('POST', '/v1/erp/terceiros', { token: fin, corpo: { tipo_documento: 'RUC', documento: ruc('4004034'), razao_social: 'Cellshop Importados S.A.', cliente: true, loja_id: 'cellshop' } });
    ids.cellshop = r.corpo.id;
    r = await a.req('POST', '/v1/erp/terceiros', { token: fin, corpo: { tipo_documento: 'RUC', documento: ruc('4004034'), razao_social: 'Repetido', cliente: true } });
    assert.equal(r.status, 409, 'documento repetido');

    for (const [k, codigo, nome] of [['central', 'CENTRAL', 'Central do Portal'], ['anexo', 'ANEXO', 'Anexo Cellshop']] as const) {
      r = await a.req('POST', '/v1/erp/depositos', { token: alm, corpo: { codigo, nome } });
      ids[k] = r.corpo.id;
    }
    r = await a.req('POST', '/v1/erp/itens', { token: alm, corpo: { codigo: 'sacola-pg', descricao: 'Sacola Pick & Go', tipo: 'MERCADORIA', iva: '10', estoque_minimo: 100 } });
    assert.equal(r.corpo.codigo, 'SACOLA-PG');
    ids.sacola = r.corpo.id;
    r = await a.req('POST', '/v1/erp/itens', { token: alm, corpo: { codigo: 'ETQ', descricao: 'Etiqueta térmica', tipo: 'INSUMO', estoque_minimo: 10 } });
    ids.etiqueta = r.corpo.id;
    r = await a.req('POST', '/v1/erp/itens', { token: fin, corpo: { codigo: 'FRETE', descricao: 'Frete', tipo: 'SERVICO' } });
    assert.equal(r.corpo.controla_estoque, false);
    ids.frete = r.corpo.id;
  });

  it('compras: estoque pelo custo sem IVA, custo médio, contas a pagar em parcelas ou à vista', async () => {
    let r = await a.req('POST', '/v1/erp/compras', {
      token: fin,
      corpo: { fornecedor_id: ids.fornecedor, timbrado: '87654321', numero: '001-002-0000101', data: hoje, condicao: 'CREDITO', parcelas: 3, primeiro_vencimento: hoje, deposito_id: ids.central, itens: [{ item_id: ids.sacola, quantidade: 1000, preco_unitario: 1_100 }] },
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.deepEqual([r.corpo.total, r.corpo.iva_10], [1_100_000, 100_000]);
    ids.compra1 = r.corpo.id;
    let d = (await a.req('GET', `/v1/erp/compras/${ids.compra1}`, { token: fin })).corpo;
    assert.deepEqual(d.titulos.map((t: { valor: number }) => t.valor), [366_666, 366_666, 366_668]);
    assert.equal(await saldo('sacola', 'central'), 1000);
    let it = (await a.req('GET', '/v1/erp/itens?busca=SACOLA', { token: alm })).corpo.itens[0];
    assert.equal(Number(it.custo_medio_pyg), 1000);

    r = await a.req('POST', '/v1/erp/compras', {
      token: fin,
      corpo: { fornecedor_id: ids.fornecedor, timbrado: '87654321', numero: '001-002-0000102', data: hoje, condicao: 'CONTADO', meio: 'TRANSFERENCIA', deposito_id: ids.central, itens: [{ item_id: ids.sacola, quantidade: 500, preco_unitario: 1_650 }] },
    });
    ids.compra2 = r.corpo.id;
    d = (await a.req('GET', `/v1/erp/compras/${ids.compra2}`, { token: fin })).corpo;
    assert.equal(d.titulos[0].estado, 'QUITADO', 'à vista sai quitada');
    it = (await a.req('GET', '/v1/erp/itens?busca=SACOLA', { token: alm })).corpo.itens[0];
    assert.equal(Number(it.custo_medio_pyg), 1166.6667);

    r = await a.req('POST', '/v1/erp/compras', {
      token: fin,
      corpo: { fornecedor_id: ids.fornecedor, timbrado: '87654321', numero: '001-002-0000102', data: hoje, condicao: 'CONTADO', deposito_id: ids.central, itens: [{ item_id: ids.sacola, quantidade: 1, preco_unitario: 1 }] },
    });
    assert.equal(r.corpo.codigo, 'compra-repetida');
    r = await a.req('POST', '/v1/erp/compras', {
      token: fin,
      corpo: { fornecedor_id: ids.fornecedor, timbrado: '87654321', numero: '001-002-0000103', data: hoje, condicao: 'CONTADO', moeda: 'USD', tipo_cambio: 1, itens: [{ item_id: ids.frete, quantidade: 1, preco_unitario: 5000 }] },
    });
    assert.equal(r.status, 422, 'compra em dólar exige tipo de câmbio');
  });

  it('estoque: transferência, consumo, saída maior que o saldo e kardex', async () => {
    let r = await a.req('POST', '/v1/erp/estoque/movimentos', { token: alm, corpo: { tipo: 'TRANSFERENCIA', item_id: ids.sacola, deposito_id: ids.central, destino_id: ids.anexo, quantidade: 200, observacao: 'abastecer anexo' } });
    assert.equal(r.status, 201);
    r = await a.req('POST', '/v1/erp/estoque/movimentos', { token: alm, corpo: { tipo: 'CONSUMO_INTERNO', item_id: ids.sacola, deposito_id: ids.anexo, quantidade: 50, observacao: 'sacolas usadas na entrega' } });
    assert.deepEqual([await saldo('sacola', 'central'), await saldo('sacola', 'anexo')], [1300, 150]);
    r = await a.req('POST', '/v1/erp/estoque/movimentos', { token: alm, corpo: { tipo: 'CONSUMO_INTERNO', item_id: ids.sacola, deposito_id: ids.anexo, quantidade: 151, observacao: 'mais do que tem' } });
    assert.equal(r.corpo.codigo, 'estoque-insuficiente');
    r = await a.req('POST', '/v1/erp/estoque/movimentos', { token: alm, corpo: { tipo: 'AJUSTE_ENTRADA', item_id: ids.frete, deposito_id: ids.anexo, quantidade: 1, custo_unitario_pyg: 1, observacao: 'serviço não tem estoque' } });
    assert.equal(r.status, 422);
    const k = (await a.req('GET', `/v1/erp/estoque/movimentos?item_id=${ids.sacola}`, { token: alm })).corpo.movimentos;
    assert.deepEqual(k.map((m: { tipo: string }) => m.tipo), ['CONSUMO_INTERNO', 'TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SAIDA', 'ENTRADA_COMPRA', 'ENTRADA_COMPRA']);
    assert.ok(k.every((m: { custo_unitario_pyg: number }) => Number(m.custo_unitario_pyg) > 0));
    const imutavel = await a.db.query('update erp_movimento set quantidade = 1').catch((e: Error) => e);
    assert.ok(imutavel instanceof Error, 'movimento não se altera');
  });

  it('fatura com saída de estoque, nota de crédito parcial com devolução, baixa e estorno', async () => {
    let r = await a.req('POST', '/v1/erp/faturas', {
      token: fin,
      corpo: { terceiro_id: ids.cellshop, data: hoje, condicao: 'CREDITO', parcelas: 2, primeiro_vencimento: hoje, deposito_id: ids.central, itens: [{ item_id: ids.sacola, quantidade: 300, preco_unitario: 2_200 }] },
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.numero_formatado, '001-001-0000001');
    ids.fatura = r.corpo.id;
    assert.equal(await saldo('sacola', 'central'), 1000);
    assert.equal((await a.req('POST', '/v1/erp/faturas', { token: alm, corpo: {} })).status, 403, 'almoxarifado não fatura');

    r = await a.req('POST', `/v1/erp/faturas/${ids.fatura}/nota-credito`, { token: fin, corpo: { data: hoje, motivo: 'devolução de 100 sacolas', itens: [{ fatura_item_id: (await a.req('GET', `/v1/erp/faturas/${ids.fatura}`, { token: fin })).corpo.itens[0].id, quantidade: 100 }] } });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.deepEqual([r.corpo.tipo, r.corpo.numero_formatado, r.corpo.total], ['NOTA_CREDITO', '001-001-0000001', 220_000]);
    assert.equal(await saldo('sacola', 'central'), 1100, 'devolução volta ao estoque');
    const d = (await a.req('GET', `/v1/erp/faturas/${ids.fatura}`, { token: fin })).corpo;
    assert.deepEqual(d.titulos.map((t: { saldo: number }) => t.saldo), [330_000, 110_000], 'abatido da última parcela');
    r = await a.req('POST', `/v1/erp/faturas/${ids.fatura}/nota-credito`, { token: fin, corpo: { data: hoje, motivo: 'excesso', itens: [{ fatura_item_id: d.itens[0].id, quantidade: 201 }] } });
    assert.equal(r.status, 422, 'não credita mais do que sobrou');

    r = await a.req('POST', `/v1/erp/titulos/${d.titulos[0].id}/baixas`, { token: fin, corpo: { data: hoje, valor: 100_000, meio: 'TRANSFERENCIA' } });
    assert.equal(r.status, 201);
    const b = r.corpo.id;
    let t = (await a.req('GET', `/v1/erp/titulos/${d.titulos[0].id}`, { token: fin })).corpo.titulo;
    assert.deepEqual([t.estado, t.saldo], ['PARCIAL', 230_000]);
    assert.equal((await a.req('POST', `/v1/erp/titulos/${d.titulos[0].id}/baixas`, { token: fin, corpo: { data: hoje, valor: 230_001, meio: 'EFECTIVO' } })).status, 422);
    await a.req('POST', `/v1/erp/baixas/${b}/estornar`, { token: fin, corpo: {} });
    t = (await a.req('GET', `/v1/erp/titulos/${d.titulos[0].id}`, { token: fin })).corpo.titulo;
    assert.deepEqual([t.estado, t.saldo], ['ABERTO', 330_000]);
    assert.equal((await a.req('POST', `/v1/erp/baixas/${b}/estornar`, { token: fin, corpo: {} })).status, 409);

    assert.equal((await a.req('POST', `/v1/erp/faturas/${ids.fatura}/anular`, { token: fin, corpo: {} })).corpo.codigo, 'fatura-com-nota');
  });

  it('anulação: compra paga à vista volta o estoque; fatura com recebimento manual exige estorno antes', async () => {
    let r = await a.req('POST', `/v1/erp/compras/${ids.compra2}/anular`, { token: fin, corpo: {} });
    assert.equal(r.status, 200);
    assert.equal(await saldo('sacola', 'central'), 600);
    r = await a.req('POST', '/v1/erp/faturas', { token: fin, corpo: { terceiro_id: ids.cellshop, data: hoje, condicao: 'CREDITO', itens: [{ item_id: ids.frete, quantidade: 1, preco_unitario: 55_000 }] } });
    const f2 = r.corpo.id;
    assert.equal(r.corpo.numero_formatado, '001-001-0000002');
    const tit = (await a.req('GET', `/v1/erp/faturas/${f2}`, { token: fin })).corpo.titulos[0];
    const bx = (await a.req('POST', `/v1/erp/titulos/${tit.id}/baixas`, { token: fin, corpo: { data: hoje, valor: 55_000, meio: 'EFECTIVO' } })).corpo;
    assert.equal((await a.req('POST', `/v1/erp/faturas/${f2}/anular`, { token: fin, corpo: {} })).corpo.codigo, 'titulo-com-baixa');
    await a.req('POST', `/v1/erp/baixas/${bx.id}/estornar`, { token: fin, corpo: {} });
    assert.equal((await a.req('POST', `/v1/erp/faturas/${f2}/anular`, { token: fin, corpo: {} })).status, 200);
    r = await a.req('POST', '/v1/erp/faturas', { token: fin, corpo: { terceiro_id: ids.cellshop, data: hoje, condicao: 'CONTADO', itens: [{ item_id: ids.frete, quantidade: 1, preco_unitario: 11_000 }] } });
    assert.equal(r.corpo.numero_formatado, '001-001-0000003', 'número anulado não é reaproveitado');
    r = await a.req('POST', '/v1/erp/faturas', { token: fin, corpo: { terceiro_id: ids.cellshop, data: `${ano + 2}-01-10`, condicao: 'CONTADO', itens: [{ item_id: ids.frete, quantidade: 1, preco_unitario: 11_000 }] } });
    assert.equal(r.corpo.codigo, 'timbrado-vencido');
  });

  it('inventário: diferença de contagem vira ajuste; um inventário aberto por depósito', async () => {
    let r = await a.req('POST', '/v1/erp/inventarios', { token: alm, corpo: { deposito_id: ids.central } });
    const inv = r.corpo.id;
    assert.equal((await a.req('POST', '/v1/erp/inventarios', { token: alm, corpo: { deposito_id: ids.central } })).corpo.codigo, 'inventario-aberto');
    const itens = (await a.req('GET', `/v1/erp/inventarios/${inv}`, { token: alm })).corpo.itens;
    assert.equal(Number(itens.find((x: { item_id: string }) => x.item_id === ids.sacola).quantidade_sistema), 600);
    await a.req('PATCH', `/v1/erp/inventarios/${inv}/contagem`, { token: alm, corpo: { itens: [{ item_id: ids.sacola, quantidade_contada: 595 }] } });
    r = await a.req('POST', `/v1/erp/inventarios/${inv}/fechar`, { token: alm, corpo: {} });
    assert.deepEqual([r.corpo.ajustes, r.corpo.contados], [1, 1]);
    assert.equal(await saldo('sacola', 'central'), 595);
    const s = (await a.req('GET', '/v1/erp/estoque/saldos?abaixo_minimo=true', { token: alm })).corpo;
    assert.equal(s.abaixo_minimo, 1, 'etiqueta sem estoque abaixo do mínimo');
  });

  it('livros do IVA em guaranis, com CSV, e painel', async () => {
    let r = await a.req('GET', `/v1/erp/livros/ventas?periodo=${periodo}`, { token: fin });
    // Fatura 1 (660.000) − nota de crédito (220.000) + fatura 3 (11.000); fatura 2 anulada.
    assert.equal(r.corpo.totais.total, 451_000);
    assert.equal(r.corpo.totais.iva, 60_000 - 20_000 + 1_000);
    assert.equal(r.corpo.linhas.filter((l: { anulado: boolean }) => l.anulado).length, 1);
    r = await a.req('GET', `/v1/erp/livros/compras?periodo=${periodo}`, { token: fin });
    assert.deepEqual([r.corpo.totais.total, r.corpo.totais.iva], [1_100_000, 100_000], 'compra anulada sai do livro');
    const csv = await a.app.inject({ method: 'GET', url: `/v1/erp/livros/ventas?periodo=${periodo}&formato=csv`, headers: { authorization: `Bearer ${fin}` } });
    const linhas = csv.body.split('\n');
    assert.match(linhas[0]!, /^tipo_identificacion;identificacion;razon_social;tipo_comprobante;fecha;timbrado;numero;gravado_10/);
    assert.match(linhas[1]!, new RegExp(`^RUC;${ruc('4004034')};Cellshop Importados S\\.A\\.;FACTURA;\\d{2}/\\d{2}/\\d{4};12345678;001-001-0000001;660000;0;0;660000;CREDITO;N;N$`));
    const p = (await a.req('GET', '/v1/erp/painel', { token: fin })).corpo;
    assert.equal(p.iva_a_pagar_pyg, 41_000 - 100_000, 'crédito fiscal maior que o débito');
    assert.ok(p.estoque_valor_pyg > 0);
    assert.equal(p.itens_abaixo_minimo, 1);
  });

  it('faturas de comissão do mês a partir do ledger, uma por loja, quitadas por retenção', async () => {
    const t = await a.novoCliente('Compra Bike');
    const bike = await a.produto('Bicicleta Trek');
    const ped = await a.pedidoComPix(t, { modo: 'RETIRADA_PORTAL', itens: [{ produto_id: bike.id, quantidade: 1 }] });
    await a.webhook(ped.pagamento.txid, ped.valores.total_brl_centavos);
    let r = await a.req('POST', '/v1/erp/faturas/comissoes', { token: fin, corpo: { periodo } });
    assert.equal(r.corpo.emitidas.length, 1);
    assert.equal(r.corpo.emitidas[0].total_pyg, Math.round(450_000 * a.config.cotacaoBrlPyg / 100), 'R$ 4.500 de comissão em guaranis');
    const f = (await a.req('GET', '/v1/erp/faturas', { token: fin })).corpo.faturas.find((x: { origem: string }) => x.origem === 'COMISSAO');
    const det = (await a.req('GET', `/v1/erp/faturas/${f.id}`, { token: fin })).corpo;
    assert.equal(det.titulos[0].estado, 'QUITADO');
    const bx = (await a.req('GET', `/v1/erp/titulos/${det.titulos[0].id}`, { token: fin })).corpo.baixas[0];
    assert.equal(bx.meio, 'RETENCAO_SPLIT');
    r = await a.req('POST', '/v1/erp/faturas/comissoes', { token: fin, corpo: { periodo } });
    assert.deepEqual([r.corpo.emitidas.length, r.corpo.pendentes[0].motivo], [0, 'comissão do mês já faturada']);
  });

  it('acesso: ERP só para o Portal com permissão', async () => {
    assert.equal((await a.req('GET', '/v1/erp/painel', { token: a.acesso('loja-gerente', 'cellshop') })).status, 403);
    assert.equal((await a.req('GET', '/v1/erp/painel', { token: a.acesso('epyx-financeiro') })).status, 403);
    assert.equal((await a.req('GET', '/v1/erp/painel', { token: a.acesso('portal-central') })).status, 403);
    assert.equal((await a.req('POST', '/v1/erp/estoque/movimentos', { token: fin, corpo: { tipo: 'AJUSTE_SAIDA', item_id: ids.sacola, deposito_id: ids.central, quantidade: 1, observacao: 'teste de permissão' } })).status, 403, 'financeiro não mexe no estoque');
    assert.equal((await a.req('POST', '/v1/erp/titulos', { token: alm, corpo: {} })).status, 403);
  });
});
