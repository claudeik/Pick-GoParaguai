import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { cpf, criarAmbiente, type Ambiente } from './ambiente.ts';

// Login do cliente já cadastrado: código de 6 dígitos no WhatsApp do cadastro.

describe('login do cliente por código no WhatsApp', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  let base = 700_000_000;
  async function cadastrado(extra: Record<string, unknown> = {}) {
    const c = cpf(base++);
    const r = await a.req('POST', '/v1/clientes', {
      corpo: { cpf: c, nome: 'Marina Duarte', whatsapp: '+5511987654321', aceite_termos: true, versao_termos: 'v1', ...extra },
    });
    assert.equal(r.status, 201);
    return { cpf: c, token: r.corpo.token as string };
  }
  const pedirCodigo = (c: string) => a.req('POST', '/v1/clientes/codigo', { corpo: { cpf: c } });
  const entrar = (c: string, codigo: string) => a.req('POST', '/v1/clientes/entrar', { corpo: { cpf: c, codigo } });

  it('código enviado ao WhatsApp do cadastro, mesmo sem aceite de mensagens, entra na mesma conta', async () => {
    const c = await cadastrado();
    const eu = (await a.req('GET', '/v1/clientes/eu', { token: c.token })).corpo;
    const p = await pedirCodigo(c.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'));
    assert.equal(p.status, 202);
    assert.equal(p.corpo.enviado_para, '+55 •••••••4321');
    await a.rodarRotinas();
    const enviada = a.mensageiro.enviados.at(-1)!;
    assert.equal(enviada.canal, 'WHATSAPP');
    assert.equal(enviada.destino, '+5511987654321');
    assert.match(enviada.texto, new RegExp(p.corpo.codigo_dev));

    const r = await entrar(c.cpf, p.corpo.codigo_dev);
    assert.equal(r.status, 200);
    assert.equal((await a.req('GET', '/v1/clientes/eu', { token: r.corpo.token })).corpo.id, eu.id);
    // O código vale uma vez.
    assert.equal((await entrar(c.cpf, p.corpo.codigo_dev)).status, 401);
  });

  it('CPF sem cadastro recebe 404 e não gera código', async () => {
    const r = await pedirCodigo(cpf(base++));
    assert.equal(r.status, 404);
    assert.equal(r.corpo.codigo, 'cliente-nao-cadastrado');
  });

  it('novo código só depois de 1 minuto, e ele invalida o anterior', async () => {
    const c = await cadastrado();
    const p1 = await pedirCodigo(c.cpf);
    const p2 = await pedirCodigo(c.cpf);
    assert.equal(p2.status, 429);
    a.avancar(61_000);
    const p3 = await pedirCodigo(c.cpf);
    assert.equal(p3.status, 202);
    if (p1.corpo.codigo_dev !== p3.corpo.codigo_dev) assert.equal((await entrar(c.cpf, p1.corpo.codigo_dev)).status, 401);
    assert.equal((await entrar(c.cpf, p3.corpo.codigo_dev)).status, 200);
  });

  it('expira em 10 minutos e para de valer depois de 5 erros', async () => {
    const c = await cadastrado();
    const p = await pedirCodigo(c.cpf);
    a.avancar(10 * 60_000 + 1000);
    assert.equal((await entrar(c.cpf, p.corpo.codigo_dev)).status, 401);

    const q = await pedirCodigo(c.cpf);
    const errado = q.corpo.codigo_dev === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) assert.equal((await entrar(c.cpf, errado)).status, 401);
    assert.equal((await entrar(c.cpf, q.corpo.codigo_dev)).status, 401);
  });

  it('conta da revisão das lojas entra com o código fixo, sem WhatsApp', async () => {
    const c = await cadastrado();
    a.config.revisaoCpf = c.cpf;
    a.config.revisaoCodigo = '246810';
    try {
      await a.rodarRotinas();
      const antes = a.mensageiro.enviados.length;
      assert.equal((await pedirCodigo(c.cpf)).status, 202);
      await a.rodarRotinas();
      assert.equal(a.mensageiro.enviados.length, antes);
      assert.equal((await entrar(c.cpf, '135790')).status, 401);
      assert.equal((await entrar(c.cpf, '246810')).status, 200);
      assert.equal((await entrar(c.cpf, '246810')).status, 200);
    } finally {
      a.config.revisaoCpf = undefined;
      a.config.revisaoCodigo = undefined;
    }
  });
});
