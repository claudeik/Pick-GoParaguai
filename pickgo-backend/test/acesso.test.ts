import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { criarVerificadorOidc } from '../src/auth.ts';
import { GestorMemoria } from '../src/integracoes/identidade.ts';
import { criarAmbiente, type Ambiente } from './ambiente.ts';

// Controle de acesso da equipe (seção 11): token do Keycloak, permissões por
// perfil e regras de gestão de usuários por organização.

const EMISSOR = 'http://keycloak.teste/realms/pickgo';

describe('token do Keycloak', () => {
  let a: Ambiente;
  let assinar: (claims: Record<string, unknown>, o?: { aud?: string; exp?: string }) => Promise<string>;

  before(async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const verificarOidc = criarVerificadorOidc({ emissor: EMISSOR, audiencia: 'pickgo-api', chaves: createLocalJWKSet({ keys: [jwk] }) });
    a = await criarAmbiente({ verificarOidc });
    assinar = (claims, o = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(EMISSOR)
        .setAudience(o.aud ?? 'pickgo-api')
        .setSubject(String(claims.sub ?? 'u-1'))
        .setIssuedAt()
        .setExpirationTime(o.exp ?? '5m')
        .sign(privateKey);
  });
  after(() => a.fechar());

  const operadorCellshop = {
    sub: 'kc-op-1',
    email: 'op@cellshop.com.py',
    name: 'Operador Cellshop',
    organizacao: 'LOJA',
    loja_id: 'cellshop',
    realm_access: { roles: ['loja-operador', 'default-roles-pickgo', 'offline_access'] },
  };

  it('token válido vira usuário com as permissões do perfil e o escopo da loja', async () => {
    const t = await assinar(operadorCellshop);
    let r = await a.req('GET', '/v1/acesso/eu', { token: t });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.organizacao, 'LOJA');
    assert.equal(r.corpo.loja_nome, 'Cellshop Importados PY');
    assert.deepEqual(r.corpo.perfis, [{ id: 'loja-operador', nome: 'Operador da loja' }]);
    assert.ok(r.corpo.permissoes.includes('retirada.entregar'));
    assert.ok(!r.corpo.permissoes.includes('catalogo.editar'));

    r = await a.req('GET', '/v1/loja/pedidos', { token: t });
    assert.equal(r.status, 200);
    r = await a.req('POST', '/v1/loja/produtos', { token: t, corpo: { nome: 'X', categoria: 'Teste', preco_usd_centavos: 100, estoque: 1 } });
    assert.equal(r.status, 403, 'operador não edita catálogo');
  });

  it('recusa audiência errada, token vencido e papel de outra organização', async () => {
    assert.equal((await a.req('GET', '/v1/acesso/eu', { token: await assinar(operadorCellshop, { aud: 'outro-client' }) })).status, 401);
    assert.equal((await a.req('GET', '/v1/acesso/eu', { token: await assinar(operadorCellshop, { exp: '-1m' }) })).status, 401);
    const escalada = { ...operadorCellshop, realm_access: { roles: ['portal-admin'] } };
    assert.equal((await a.req('GET', '/v1/acesso/eu', { token: await assinar(escalada) })).status, 401, 'portal-admin num usuário de loja não vale');
    const semLoja = { ...operadorCellshop, loja_id: undefined };
    assert.equal((await a.req('GET', '/v1/acesso/eu', { token: await assinar(semLoja) })).status, 401);
  });
});

describe('permissões por perfil', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  it('estoque da loja edita a lista mestre mas não publica no Pick & Go', async () => {
    const t = a.acesso('loja-estoque', 'mega');
    let r = await a.req('POST', '/v1/loja/produtos', { token: t, corpo: { nome: 'Mouse Logitech MX', categoria: 'Informática', preco_usd_centavos: 9_900, estoque: 3 } });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.ativo, false, 'entra fora do Pick & Go');
    const id = r.corpo.id;
    r = await a.req('PATCH', `/v1/loja/produtos/${id}`, { token: t, corpo: { ativo: true } });
    assert.equal(r.status, 403);
    r = await a.req('PATCH', `/v1/loja/produtos/${id}`, { token: t, corpo: { estoque: 5 } });
    assert.equal(r.corpo.estoque, 5);
    r = await a.req('PATCH', `/v1/loja/produtos/${id}`, { token: a.acesso('loja-gerente', 'mega'), corpo: { ativo: true } });
    assert.equal(r.corpo.ativo, true, 'o gerente publica');
  });

  it('EPYX acompanha sem operar; financeiro vê a plataforma; atendimento não estorna', async () => {
    const suporte = a.acesso('epyx-suporte');
    assert.equal((await a.req('GET', '/v1/central/fila', { token: suporte })).status, 200);
    assert.equal((await a.req('GET', '/v1/loja/produtos?loja_id=nissei', { token: suporte })).status, 200);
    assert.equal((await a.req('GET', '/v1/relatorios/plataforma', { token: suporte })).status, 403);
    assert.equal((await a.req('POST', '/v1/lojas/nissei/chave-integracao', { token: suporte, corpo: {} })).status, 200, 'suporte cuida da integração');

    const cliente = await a.novoCliente();
    const jbl = await a.produto('JBL Charge');
    const p = await a.pedidoComPix(cliente, { modo: 'RETIRADA_PORTAL', itens: [{ produto_id: jbl.id, quantidade: 1 }] });
    await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos);
    assert.equal((await a.req('POST', `/v1/pedidos/${p.id}/coleta/iniciar`, { token: suporte, corpo: {} })).status, 403);

    assert.equal((await a.req('GET', '/v1/relatorios/plataforma', { token: a.acesso('epyx-financeiro') })).status, 200);
    assert.equal((await a.req('POST', `/v1/pagamentos/${p.pagamento.id}/estorno`, { token: a.acesso('portal-atendimento'), corpo: {}, idem: true })).status, 403);
    assert.equal((await a.req('POST', `/v1/pagamentos/${p.pagamento.id}/estorno`, { token: a.acesso('portal-financeiro'), corpo: {}, idem: true })).status, 200);
  });

  it('equipe de loja não vê a fila da central nem o relatório de outra loja', async () => {
    const g = a.acesso('loja-gerente', 'cellshop');
    assert.equal((await a.req('GET', '/v1/central/fila', { token: g })).status, 403);
    assert.equal((await a.req('GET', '/v1/pedidos', { token: g })).status, 403);
    assert.equal((await a.req('GET', '/v1/relatorios/lojas/nissei', { token: g })).status, 403);
    assert.equal((await a.req('GET', '/v1/relatorios/lojas/cellshop', { token: g })).status, 200);
    assert.equal((await a.req('GET', '/v1/relatorios/lojas/cellshop', { token: a.acesso('loja-operador', 'cellshop') })).status, 403);
  });
});

describe('gestão de usuários', () => {
  let a: Ambiente;
  let idGerenteNissei: string;
  before(async () => {
    const identidade = new GestorMemoria();
    a = await criarAmbiente({ identidade });
    const r = await identidade.criar({ email: 'gerente@nissei.com.py', nome: 'Gerente Nissei', organizacao: 'LOJA', loja_id: 'nissei', perfil: 'loja-gerente', senhaTemporaria: 'x' });
    idGerenteNissei = r.id;
    await identidade.criar({ email: 'central@portal.com', nome: 'Central Portal', organizacao: 'PORTAL', loja_id: null, perfil: 'portal-central', senhaTemporaria: 'x' });
  });
  after(() => a.fechar());

  it('gerente de loja cadastra a própria equipe, só com perfis de loja', async () => {
    const g = a.acesso('loja-gerente', 'cellshop', 'gerente-cellshop');
    let r = await a.req('POST', '/v1/usuarios', { token: g, corpo: { email: 'balcao@cellshop.com.py', nome: 'Balcão Cellshop', organizacao: 'LOJA', perfil: 'loja-operador' } });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.usuario.loja_id, 'cellshop', 'a loja vem do gerente');
    assert.match(r.corpo.senha_temporaria, /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@#%&*+!?]).{14}$/);

    r = await a.req('POST', '/v1/usuarios', { token: g, corpo: { email: 'x@cellshop.com.py', nome: 'Intruso Central', organizacao: 'PORTAL', perfil: 'portal-central' } });
    assert.equal(r.status, 403);
    r = await a.req('POST', '/v1/usuarios', { token: g, corpo: { email: 'y@nissei.com.py', nome: 'Outra Loja', organizacao: 'LOJA', loja_id: 'nissei', perfil: 'loja-operador' } });
    assert.equal(r.status, 403);
    r = await a.req('POST', '/v1/usuarios', { token: g, corpo: { email: 'balcao@cellshop.com.py', nome: 'Repetido', organizacao: 'LOJA', perfil: 'loja-operador' } });
    assert.equal(r.status, 409);

    r = await a.req('GET', '/v1/usuarios', { token: g });
    assert.deepEqual(r.corpo.usuarios.map((u: { email: string }) => u.email), ['balcao@cellshop.com.py']);
    assert.ok(r.corpo.perfis_que_concedo.every((p: string) => p.startsWith('loja-')));

    // A equipe da Nissei não aparece nem pode ser editada pela Cellshop.
    r = await a.req('PATCH', `/v1/usuarios/${idGerenteNissei}`, { token: g, corpo: { ativo: false } });
    assert.equal(r.status, 404);
  });

  it('EPYX gerencia só a EPYX; Portal gerencia todos; ninguém altera o próprio acesso', async () => {
    const epyx = a.acesso('epyx-admin', undefined, 'epyx-admin-1');
    let r = await a.req('POST', '/v1/usuarios', { token: epyx, corpo: { email: 'dev@epyx.com.br', nome: 'Dev EPYX', organizacao: 'EPYX', perfil: 'epyx-suporte' } });
    assert.equal(r.status, 201);
    const idDev = r.corpo.usuario.id;
    r = await a.req('POST', '/v1/usuarios', { token: epyx, corpo: { email: 'z@cellshop.com.py', nome: 'Loja Via EPYX', organizacao: 'LOJA', loja_id: 'cellshop', perfil: 'loja-gerente' } });
    assert.equal(r.status, 403);
    r = await a.req('GET', '/v1/usuarios', { token: epyx });
    assert.deepEqual(r.corpo.usuarios.map((u: { organizacao: string }) => u.organizacao), ['EPYX']);

    const admin = a.acesso('portal-admin', undefined, 'admin-1');
    r = await a.req('GET', '/v1/usuarios', { token: admin });
    assert.equal(r.corpo.usuarios.length, 4);
    r = await a.req('PATCH', `/v1/usuarios/${idDev}`, { token: admin, corpo: { perfil: 'loja-gerente' } });
    assert.equal(r.status, 422, 'perfil de outra organização');
    r = await a.req('PATCH', `/v1/usuarios/${idDev}`, { token: admin, corpo: { perfil: 'epyx-financeiro', ativo: false } });
    assert.deepEqual([r.corpo.perfil, r.corpo.ativo], ['epyx-financeiro', false]);
    r = await a.req('POST', `/v1/usuarios/${idDev}/senha-temporaria`, { token: admin, corpo: {} });
    assert.equal(r.corpo.senha_temporaria.length, 14);

    const self = a.acesso('portal-admin', undefined, idDev);
    r = await a.req('PATCH', `/v1/usuarios/${idDev}`, { token: self, corpo: { ativo: true } });
    assert.equal(r.status, 403);

    assert.equal((await a.req('GET', '/v1/usuarios', { token: a.acesso('portal-central') })).status, 403);
    const aud = await a.db.query<{ acao: string }>(`select acao from auditoria where entidade = 'usuario' order by id`);
    assert.deepEqual(
      aud.rows.map((x) => x.acao),
      ['usuario.criar', 'usuario.criar', 'usuario.alterar', 'usuario.senha_temporaria'],
    );
  });
});

describe('modelo de acesso', () => {
  it('cada perfil só concede perfis da própria organização, e só o admin do Portal concede tudo', async () => {
    const { PERFIS_ACESSO, perfilPorId, podeConceder, PERMISSOES } = await import('../src/acesso/modelo.ts');
    for (const p of PERFIS_ACESSO) {
      for (const c of p.concede) {
        if (c === '*') assert.equal(p.id, 'portal-admin');
        else assert.equal(perfilPorId.get(c)?.organizacao, p.organizacao, `${p.id} concede ${c}`);
      }
      for (const perm of p.permissoes) assert.ok(perm in PERMISSOES, `${p.id}: ${perm}`);
      if (p.concede.length) assert.ok(p.permissoes.includes('usuarios.gerenciar'), `${p.id} concede perfis mas não gerencia usuários`);
    }
    assert.equal(podeConceder(['loja-gerente'], 'portal-admin'), false);
    assert.equal(podeConceder(['loja-gerente'], 'loja-operador'), true);
    assert.equal(podeConceder(['epyx-admin'], 'loja-gerente'), false);
    assert.equal(podeConceder(['loja-operador'], 'loja-operador'), false);
    assert.equal(podeConceder(['portal-admin'], 'epyx-admin'), true);
  });
});

describe('realm do Keycloak', () => {
  it('declara exatamente os perfis do modelo, com os atributos e a audiência da API', async () => {
    const { readFile } = await import('node:fs/promises');
    const { PERFIS_ACESSO } = await import('../src/acesso/modelo.ts');
    const realm = JSON.parse(await readFile(new URL('../../pickgo-keycloak/realm-pickgo.json', import.meta.url), 'utf8'));
    assert.deepEqual(realm.roles.realm.map((r: { name: string }) => r.name).sort(), PERFIS_ACESSO.map((p) => p.id).sort());
    const web = realm.clients.find((c: { clientId: string }) => c.clientId === 'pickgo-web');
    assert.equal(web.publicClient, true);
    assert.equal(web.attributes['pkce.code.challenge.method'], 'S256');
    assert.equal(web.directAccessGrantsEnabled, false, 'sem login por senha direto na API');
    const mapeia = web.protocolMappers.map((m: { name: string }) => m.name).sort();
    assert.deepEqual(mapeia, ['audiencia-api', 'loja_id', 'organizacao']);
    for (const u of realm.users.filter((x: { serviceAccountClientId?: string }) => !x.serviceAccountClientId)) {
      const perfil = PERFIS_ACESSO.find((p) => p.id === u.realmRoles[0]);
      assert.equal(u.attributes.organizacao[0], perfil?.organizacao, u.username);
    }
  });
});
