import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { criarAmbiente, type Ambiente } from './ambiente.ts';

// Lista mestre: o sistema da loja envia o catálogo; o Pick & Go vende o que está publicado.

const item = (codigo: string, extra: Record<string, unknown> = {}) => ({
  codigo_loja: codigo,
  nome: `Produto ${codigo}`,
  descricao: 'Descrição vinda do sistema da loja',
  categoria: 'Informática',
  preco_usd_centavos: 10_000,
  estoque: 5,
  codigo_barras: `789${codigo.replace(/\D/g, '').padStart(10, '0')}`,
  fotos: [`https://cdn.loja.example/${codigo}-1.jpg`, `https://cdn.loja.example/${codigo}-2.jpg`],
  ...extra,
});

describe('lista mestre e integração com o sistema da loja', () => {
  let a: Ambiente;
  let chave: string;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  const enviar = (corpo: unknown, k = chave) =>
    a.req('PUT', '/v1/integracao/catalogo', { corpo, headers: { 'x-chave-loja': k } });

  it('só o admin gera a chave; sem chave válida a integração é recusada', async () => {
    let r = await a.req('POST', '/v1/lojas/mega/chave-integracao', { token: a.equipe('lojista', 'mega'), corpo: {} });
    assert.equal(r.status, 403);
    r = await a.req('POST', '/v1/lojas/mega/chave-integracao', { token: a.equipe('admin'), corpo: {} });
    chave = r.corpo.chave;
    assert.ok(chave.startsWith('pgk_mega_'));
    r = await enviar({ produtos: [item('M-1')] }, 'pgk_mega_chave-errada-123456');
    assert.equal(r.status, 401);
  });

  it('cria fora do Pick & Go, atualiza pelo código da loja e o publicado aparece no app', async () => {
    let r = await enviar({ produtos: [item('M-1'), item('M-2')] });
    assert.equal(r.status, 200);
    assert.deepEqual([r.corpo.criados, r.corpo.atualizados, r.corpo.erros.length], [2, 0, 0]);

    const admin = a.equipe('admin');
    r = await a.req('GET', '/v1/loja/produtos?loja_id=mega&busca=M-1', { token: admin });
    const p = r.corpo.produtos[0];
    assert.equal(p.ativo, false, 'item novo da integração não entra no app sozinho');
    assert.equal(p.origem, 'INTEGRACAO');
    assert.equal(p.descricao, 'Descrição vinda do sistema da loja');
    assert.equal(p.fotos.length, 2);
    assert.equal(p.foto_url, p.fotos[0]);
    assert.equal((await a.req('GET', '/v1/produtos?busca=M-1')).corpo.produtos.length, 0);

    await a.req('PATCH', `/v1/loja/produtos/${p.id}`, { token: a.equipe('lojista', 'mega'), corpo: { ativo: true } });
    r = await a.req('GET', '/v1/produtos?busca=Produto M-1');
    assert.equal(r.corpo.produtos[0].descricao, 'Descrição vinda do sistema da loja');

    r = await enviar({ produtos: [item('M-1', { preco_usd_centavos: 12_000, nome: 'Produto M-1 v2' })] });
    assert.deepEqual([r.corpo.criados, r.corpo.atualizados], [0, 1]);
    r = await a.req('GET', `/v1/produtos/${p.id}`);
    assert.equal(r.corpo.preco_usd_centavos, 12_000);
    assert.equal(r.corpo.nome, 'Produto M-1 v2');
  });

  it('o disponível no app desconta o que já está reservado em pedidos do Pick & Go', async () => {
    const admin = a.equipe('admin');
    const p = (await a.req('GET', '/v1/loja/produtos?loja_id=mega&busca=M-1', { token: admin })).corpo.produtos[0];
    const cliente = await a.novoCliente();
    await a.pedidoComPix(cliente, { modo: 'RETIRADA_PORTAL', itens: [{ produto_id: p.id, quantidade: 2 }] });

    await enviar({ produtos: [item('M-1', { estoque: 10 })] });
    const r = await a.req('GET', '/v1/loja/produtos?loja_id=mega&busca=M-1', { token: admin });
    assert.equal(r.corpo.produtos[0].estoque_loja, 10);
    assert.equal(r.corpo.produtos[0].reservado, 2);
    assert.equal(r.corpo.produtos[0].estoque, 8);
  });

  it('envio completo zera o que a loja não mandou e erros por item não travam o resto', async () => {
    const manual = await a.req('POST', '/v1/loja/produtos', {
      token: a.equipe('admin'),
      corpo: { loja_id: 'mega', nome: 'Cabo avulso', categoria: 'Informática', preco_usd_centavos: 900, estoque: 7 },
    });
    assert.equal(manual.status, 201);
    const r = await enviar({
      completo: true,
      produtos: [
        item('M-1'),
        item('M-3', { codigo_barras: '7899001122005' }), // EAN do MacBook, outro produto da Mega
        item('M-1'),
      ],
    });
    // M-2 e os 3 produtos do seed da Mega (que têm código da loja) ficaram fora do envio.
    assert.equal(r.corpo.zerados, 4);
    assert.deepEqual(
      r.corpo.erros.map((e: { codigo_loja: string }) => e.codigo_loja),
      ['M-3', 'M-1'],
    );
    const m2 = (await a.req('GET', '/v1/loja/produtos?loja_id=mega&busca=M-2', { token: a.equipe('admin') })).corpo.produtos[0];
    assert.equal(m2.estoque, 0);
    assert.equal((await a.produto('Cabo avulso')).estoque, 7, 'produto cadastrado à mão, sem código da loja, não é zerado');
    assert.equal((await a.produto('JBL Charge')).estoque, 0, 'produto da loja que não veio no envio completo');

    const h = await a.req('GET', '/v1/loja/sincronizacoes?loja_id=mega', { token: a.equipe('admin') });
    assert.equal(h.corpo.sincronizacoes.length, 4);
    assert.equal(h.corpo.lojas[0].tem_chave, true);
  });

  it('a planilha do lojista entra na própria loja; trocar a chave revoga a anterior', async () => {
    let r = await a.req('POST', '/v1/loja/catalogo/importar', { token: a.equipe('lojista', 'nissei'), corpo: { produtos: [item('N-1')] } });
    assert.equal(r.corpo.criados, 1);
    r = await a.req('GET', '/v1/loja/produtos?busca=N-1', { token: a.equipe('admin') });
    assert.equal(r.corpo.produtos[0].loja_id, 'nissei');
    assert.equal(r.corpo.produtos[0].origem, 'IMPORTACAO');

    const antiga = chave;
    r = await a.req('POST', '/v1/lojas/mega/chave-integracao', { token: a.equipe('admin'), corpo: {} });
    chave = r.corpo.chave;
    assert.equal((await enviar({ produtos: [item('M-9')] }, antiga)).status, 401);
    assert.equal((await enviar({ produtos: [item('M-9')] })).status, 200);
  });
});
