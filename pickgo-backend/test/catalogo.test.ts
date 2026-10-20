import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { criarAmbiente, type Ambiente } from './ambiente.ts';

// Gestão do catálogo do Pick & Go: admin em qualquer loja, lojista só na própria.

describe('gestão do catálogo', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  it('admin cadastra, edita e desativa produto; o app do turista acompanha', async () => {
    const admin = a.equipe('admin');
    let r = await a.req('POST', '/v1/loja/produtos', {
      token: admin,
      corpo: { nome: 'Garmin Edge 1050', categoria: 'Ciclismo', preco_usd_centavos: 69_900, estoque: 3, codigo_barras: '7899001199001' },
    });
    assert.equal(r.status, 422, 'admin precisa dizer a loja');
    r = await a.req('POST', '/v1/loja/produtos', {
      token: admin,
      corpo: { loja_id: 'cellshop', nome: 'Garmin Edge 1050', categoria: 'Ciclismo', preco_usd_centavos: 69_900, estoque: 3, codigo_barras: '7899001199001' },
    });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.loja_nome, 'Cellshop Importados PY');
    const id = r.corpo.id;

    r = await a.req('GET', '/v1/produtos?busca=Garmin');
    assert.equal(r.corpo.produtos.length, 1, 'aparece no catálogo público');

    r = await a.req('PATCH', `/v1/loja/produtos/${id}`, { token: admin, corpo: { preco_usd_centavos: 64_900, estoque: 0 } });
    assert.equal(r.corpo.preco_usd_centavos, 64_900);
    r = await a.req('GET', '/v1/loja/produtos?loja_id=cellshop&situacao=SEM_ESTOQUE', { token: admin });
    assert.deepEqual(r.corpo.produtos.map((p: { id: string }) => p.id), [id]);

    r = await a.req('PATCH', `/v1/loja/produtos/${id}`, { token: admin, corpo: { ativo: false } });
    assert.equal(r.corpo.ativo, false);
    r = await a.req('GET', '/v1/produtos?busca=Garmin');
    assert.equal(r.corpo.produtos.length, 0, 'desativado sai do app');
    r = await a.req('GET', '/v1/loja/produtos?loja_id=cellshop&situacao=INATIVOS', { token: admin });
    assert.equal(r.corpo.produtos.length, 1, 'e continua na gestão');

    const auditoria = await a.db.query<{ acao: string }>(`select acao from auditoria where entidade_id = $1 order by id`, [id]);
    assert.deepEqual(auditoria.rows.map((x) => x.acao), ['produto.criar', 'produto.alterar', 'produto.alterar']);
  });

  it('lojista só mexe na própria loja e não repete código de barras', async () => {
    const cellshop = a.equipe('lojista', 'cellshop');
    let r = await a.req('POST', '/v1/loja/produtos', {
      token: cellshop,
      corpo: { loja_id: 'nissei', nome: 'Intruso', categoria: 'Teste', preco_usd_centavos: 100, estoque: 1 },
    });
    assert.equal(r.status, 403);
    r = await a.req('POST', '/v1/loja/produtos', {
      token: cellshop,
      corpo: { nome: 'Capacete repetido', categoria: 'Ciclismo', preco_usd_centavos: 100, estoque: 1, codigo_barras: '7899001122335' },
    });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.codigo, 'codigo-barras-duplicado');

    const iphone = await a.produto('iPhone 16');
    r = await a.req('PATCH', `/v1/loja/produtos/${iphone.id}`, { token: cellshop, corpo: { estoque: 0 } });
    assert.equal(r.status, 403, 'produto da Nissei');

    r = await a.req('GET', '/v1/loja/produtos', { token: cellshop });
    assert.ok(r.corpo.produtos.every((p: { loja_id: string }) => p.loja_id === 'cellshop'));
    assert.equal(r.corpo.resumo.total, r.corpo.produtos.length);
  });

  it('mudar o preço não altera pedido já feito', async () => {
    const cliente = await a.novoCliente();
    const jbl = await a.produto('JBL Charge');
    const p = await a.pedidoComPix(cliente, { modo: 'RETIRADA_PORTAL', itens: [{ produto_id: jbl.id, quantidade: 1 }] });
    await a.req('PATCH', `/v1/loja/produtos/${jbl.id}`, { token: a.equipe('lojista', 'mega'), corpo: { preco_usd_centavos: jbl.preco_usd_centavos * 2 } });
    const r = await a.req('GET', `/v1/pedidos/${p.id}`, { token: cliente });
    assert.equal(r.corpo.itens[0].preco_usd_centavos, jbl.preco_usd_centavos);
    const g = await a.req('GET', '/v1/loja/produtos?busca=JBL', { token: a.equipe('admin') });
    assert.equal(g.corpo.produtos[0].vendidos, 0, 'pedido ainda não pago não conta como vendido');
  });
});
