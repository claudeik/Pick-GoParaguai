import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { publicar } from '../src/servicos/registro.ts';
import { cpf, criarAmbiente, type Ambiente } from './ambiente.ts';

// App do turista para Android e iOS: CORS do app instalado, push e exclusão da conta.

describe('app móvel do turista', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  let base = 800_000_000;
  async function cadastrado() {
    const c = cpf(base++);
    const r = await a.req('POST', '/v1/clientes', {
      corpo: { cpf: c, nome: 'Paula Rezende', whatsapp: '+5511912345678', aceite_termos: true, versao_termos: 'v1' },
    });
    assert.equal(r.status, 201);
    return { cpf: c, token: r.corpo.token as string };
  }
  const aparelho = (token: string, plataforma: 'android' | 'ios', t: string) =>
    a.req('PUT', '/v1/clientes/eu/dispositivos', { token, corpo: { plataforma, token: t } });

  it('libera CORS só para a origem do app instalado', async () => {
    const ios = await a.app.inject({ method: 'OPTIONS', url: '/v1/produtos', headers: { origin: 'capacitor://localhost', 'access-control-request-method': 'GET' } });
    assert.equal(ios.statusCode, 204);
    assert.equal(ios.headers['access-control-allow-origin'], 'capacitor://localhost');
    const outro = await a.app.inject({ method: 'GET', url: '/v1/produtos', headers: { origin: 'https://site-qualquer.com' } });
    assert.equal(outro.headers['access-control-allow-origin'], undefined);
  });

  it('aviso do pedido vai por push para cada aparelho; o código de login não', async () => {
    const c = await cadastrado();
    assert.equal((await aparelho(c.token, 'android', 'fcm-token-android-0001')).status, 204);
    assert.equal((await aparelho(c.token, 'ios', 'a1b2c3d4e5f60718293a4b5c6d7e8f90')).status, 204);
    const antes = a.push.enviados.length;

    const jbl = await a.produto('JBL Charge');
    const p = await a.pedidoComPix(c.token, { modo: 'RETIRADA_LOJA', itens: [{ produto_id: jbl.id, quantidade: 1 }] });
    await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos);
    await a.rodarRotinas();
    const novos = a.push.enviados.slice(antes).filter((x) => x.titulo === 'Pagamento confirmado');
    assert.deepEqual(novos.map((x) => x.plataforma).sort(), ['android', 'ios']);
    assert.ok(novos.every((x) => x.dados?.pedido_id === p.id));

    const n = a.push.enviados.length;
    await a.req('POST', '/v1/clientes/codigo', { corpo: { cpf: c.cpf } });
    await a.rodarRotinas();
    assert.equal(a.push.enviados.length, n);
  });

  it('token recusado pela loja de apps apaga o aparelho; sair da conta também', async () => {
    const c = await cadastrado();
    await aparelho(c.token, 'android', 'fcm-token-velho-000001');
    await aparelho(c.token, 'ios', 'ios-token-que-vai-sair-0001');
    const eu = (await a.req('GET', '/v1/clientes/eu', { token: c.token })).corpo;
    await a.req('POST', '/v1/clientes/eu/dispositivos/remover', { token: c.token, corpo: { token: 'ios-token-que-vai-sair-0001' } });

    a.push.falharProximo = { definitivo: true, tokenInvalido: true, erro: 'aparelho não registrado no FCM' };
    await a.db.query(`insert into push_envio (dispositivo_id, cliente_id, titulo, corpo) select id, cliente_id, 't', 'c' from dispositivo where cliente_id = $1`, [eu.id]);
    await a.rodarRotinas();
    const restantes = await a.db.query('select 1 from dispositivo where cliente_id = $1', [eu.id]);
    assert.equal(restantes.rows.length, 0);
  });

  it('com pedido pago não retirado, a exclusão é recusada', async () => {
    const c = await cadastrado();
    const jbl = await a.produto('JBL Charge');
    const p = await a.pedidoComPix(c.token, { modo: 'RETIRADA_LOJA', itens: [{ produto_id: jbl.id, quantidade: 1 }] });
    await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos);
    const r = await a.req('DELETE', '/v1/clientes/eu', { token: c.token });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.codigo, 'pedidos-em-andamento');
  });

  it('excluir a conta apaga os dados pessoais, cancela o Pix em aberto e derruba o token', async () => {
    const c = await cadastrado();
    await aparelho(c.token, 'android', 'fcm-token-exclusao-0001');
    const eu = (await a.req('GET', '/v1/clientes/eu', { token: c.token })).corpo;
    const jbl = await a.produto('JBL Charge');
    const p = await a.pedidoComPix(c.token, { modo: 'RETIRADA_LOJA', itens: [{ produto_id: jbl.id, quantidade: 1 }] });
    const estoque = (await a.produto('JBL Charge')).estoque;
    await a.rodarRotinas();

    assert.equal((await a.req('DELETE', '/v1/clientes/eu', { token: c.token })).status, 204);
    assert.equal((await a.req('GET', '/v1/clientes/eu', { token: c.token })).status, 404);

    const cli = (await a.db.query<{ nome: string; whatsapp: string; email: string | null }>('select nome, whatsapp, email from cliente where id = $1', [eu.id])).rows[0]!;
    assert.deepEqual(cli, { nome: 'Conta excluída', whatsapp: '', email: null });
    const contato = (await a.db.query<{ whatsapp: string | null }>('select whatsapp from contato where cliente_id = $1', [eu.id])).rows[0]!;
    assert.equal(contato.whatsapp, null);
    assert.equal((await a.db.query('select 1 from dispositivo where cliente_id = $1', [eu.id])).rows.length, 0);
    assert.equal((await a.db.query<{ estado: string }>('select estado from pedido where id = $1', [p.id])).rows[0]!.estado, 'CANCELADO');
    assert.ok((await a.produto('JBL Charge')).estoque >= estoque);

    // O CPF fica livre: não entra mais na conta antiga e pode criar uma nova.
    assert.equal((await a.req('POST', '/v1/clientes/codigo', { corpo: { cpf: c.cpf } })).status, 404);
    // Evento antigo da conta excluída não recria contato nem manda mensagem.
    const msgs = async () => (await a.db.query('select 1 from mensagem m join contato c on c.id = m.contato_id where c.cliente_id = $1', [eu.id])).rows.length;
    const n = await msgs();
    await publicar(a.db, 'ClienteCadastrado', { cliente_id: eu.id }, eu.id);
    await a.rodarRotinas();
    assert.equal(await msgs(), n);
    const nova = await a.req('POST', '/v1/clientes', {
      corpo: { cpf: c.cpf, nome: 'Paula Rezende', whatsapp: '+5511912345678', aceite_termos: true, versao_termos: 'v1' },
    });
    assert.equal(nova.status, 201);
  });
});
