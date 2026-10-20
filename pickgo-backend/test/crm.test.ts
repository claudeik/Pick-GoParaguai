import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { enfileirarMensagem, lembrarRetiradas } from '../src/servicos/crm.ts';
import { marcarNaoRetirados } from '../src/servicos/rotinas.ts';
import { criarAmbiente, type Ambiente } from './ambiente.ts';

// CRM e atendimento (seções 3.9 e 3.10): jornadas, consentimento, chamados e Twilio.

interface Msg {
  modelo: string | null;
  canal: string;
  estado: string;
  motivo: string | null;
  direcao: string;
  conteudo: string;
  finalidade: string;
}

describe('jornada do cliente no CRM', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  const contatoDe = async (token: string) => {
    const eu = (await a.req('GET', '/v1/clientes/eu', { token })).corpo;
    return (await a.db.query<{ id: string; etapa: string }>('select id, etapa from contato where cliente_id = $1', [eu.id])).rows[0]!;
  };
  const mensagens = async (contatoId: string) =>
    (await a.db.query<Msg>('select modelo, canal, estado, motivo, direcao, conteudo, finalidade from mensagem where contato_id = $1 order by criado_em', [contatoId])).rows;

  it('cadastro com aceite de WhatsApp: contato em onboarding e boas-vindas entregue pelo WhatsApp', async () => {
    const t = await a.novoCliente('Rafael Mendonça', { aceite_mensagens_whatsapp: true });
    await a.rodarRotinas();
    const c = await contatoDe(t);
    assert.equal(c.etapa, 'ONBOARDING');
    const m = await mensagens(c.id);
    assert.deepEqual(m.map((x) => [x.modelo, x.canal, x.estado]), [['boas_vindas', 'WHATSAPP', 'ENTREGUE']]);
    assert.ok(a.mensageiro.enviados.at(-1)!.destino.startsWith('+55'));
    assert.match(a.mensageiro.enviados.at(-1)!.texto, /Rafael/);
  });

  it('sem aceite em nenhum canal, a mensagem fica só na caixa do app', async () => {
    const antes = a.mensageiro.enviados.length;
    const t = await a.novoCliente('Sem Aceite');
    await a.rodarRotinas();
    const m = await mensagens((await contatoDe(t)).id);
    assert.deepEqual(m.map((x) => [x.canal, x.estado]), [['APP', 'ENTREGUE']]);
    assert.equal(a.mensageiro.enviados.length, antes, 'nada saiu pela Twilio');
    const r = await a.req('GET', '/v1/atendimento', { token: t });
    assert.equal(r.corpo.mensagens.length, 1);
  });

  it('pedido: avisos de pagamento e de pronto, lembrete com chamado de retirada atrasada, retirada fecha o chamado', async () => {
    const t = await a.novoCliente('Mariana Costa', { aceite_mensagens_whatsapp: true });
    const jbl = await a.produto('JBL Charge');
    const p = await a.pedidoComPix(t, { modo: 'RETIRADA_LOJA', itens: [{ produto_id: jbl.id, quantidade: 1 }] });
    await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos);
    const item = (await a.req('GET', `/v1/pedidos/${p.id}`, { token: t })).corpo.itens[0];
    await a.req('POST', `/v1/pedidos/${p.id}/itens/${item.id}/separar`, { token: a.equipe('lojista', 'mega'), corpo: {} });
    await a.rodarRotinas();
    const c = await contatoDe(t);
    let m = await mensagens(c.id);
    assert.deepEqual(m.map((x) => x.modelo), ['boas_vindas', 'pagamento_confirmado', 'pedido_pronto']);
    assert.match(m[2]!.conteudo, /Mega Eletrônicos/);

    a.avancar((a.config.lembreteRetiradaHoras + 1) * 3_600_000);
    assert.equal(await lembrarRetiradas(a.ctx), 1);
    assert.equal(await lembrarRetiradas(a.ctx), 0, 'um lembrete por pedido');
    await a.rodarRotinas();
    m = await mensagens(c.id);
    assert.equal(m.at(-1)!.modelo, 'lembrete_retirada');
    const central = a.acesso('portal-atendimento');
    let tk = (await a.req('GET', '/v1/crm/tickets', { token: central })).corpo.tickets.filter((x: { pedido_id: string }) => x.pedido_id === p.id);
    assert.deepEqual(tk.map((x: { tipo: string; prioridade: string }) => [x.tipo, x.prioridade]), [['RETIRADA_ATRASADA', 'NORMAL']]);

    const qr = (await a.req('GET', `/v1/pedidos/${p.id}`, { token: t })).corpo.qr;
    await a.req('POST', `/v1/pedidos/${p.id}/retirada/confirmar`, { token: a.equipe('lojista', 'mega'), corpo: { qr, documento_conferido: true } });
    await a.rodarRotinas();
    tk = (await a.req('GET', '/v1/crm/tickets', { token: central })).corpo.tickets.filter((x: { pedido_id: string }) => x.pedido_id === p.id);
    assert.equal(tk.length, 0, 'retirada resolve o chamado automático');
    assert.equal((await contatoDe(t)).etapa, 'CLIENTE_ATIVO');

    const ficha = (await a.req('GET', `/v1/crm/contatos/${c.id}`, { token: central })).corpo;
    assert.deepEqual(ficha.onboarding.map((x: { feito: boolean }) => x.feito), [true, true, true, true, false]);
  });

  it('pedido não retirado no prazo vira chamado de prioridade alta', async () => {
    const t = await a.novoCliente('Prazo Vencido', { aceite_mensagens_email: true, email: 'prazo@exemplo.com' });
    const jbl = await a.produto('JBL Charge');
    const p = await a.pedidoComPix(t, { modo: 'RETIRADA_LOJA', itens: [{ produto_id: jbl.id, quantidade: 1 }] });
    await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos);
    const item = (await a.req('GET', `/v1/pedidos/${p.id}`, { token: t })).corpo.itens[0];
    await a.req('POST', `/v1/pedidos/${p.id}/itens/${item.id}/separar`, { token: a.equipe('lojista', 'mega'), corpo: {} });
    a.avancar((a.config.lembreteRetiradaHoras + 1) * 3_600_000);
    await lembrarRetiradas(a.ctx);
    a.avancar(a.config.prazoRetiradaHoras * 3_600_000);
    await marcarNaoRetirados(a.ctx);
    await a.rodarRotinas();
    const tk = (await a.req('GET', '/v1/crm/tickets', { token: a.acesso('portal-atendimento') })).corpo.tickets.filter((x: { pedido_id: string }) => x.pedido_id === p.id);
    assert.deepEqual(tk.map((x: { tipo: string; prioridade: string }) => [x.tipo, x.prioridade]), [['RETIRADA_ATRASADA', 'ALTA']], 'o mesmo chamado sobe de prioridade');
    const m = await mensagens((await contatoDe(t)).id);
    assert.equal(m.at(-1)!.modelo, 'nao_retirado');
    assert.equal(m.at(-1)!.canal, 'EMAIL');
  });
});

describe('WhatsApp pela Twilio', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  const entrada = (de: string, corpo: string, sid: string) =>
    a.twilio('/v1/webhooks/twilio/entrada', { From: `whatsapp:${de}`, To: 'whatsapp:+14155238886', Body: corpo, MessageSid: sid, ProfileName: 'João Turista' });

  it('mensagem de número desconhecido vira lead e chamado, com resposta automática na janela de 24 h', async () => {
    assert.equal((await a.twilio('/v1/webhooks/twilio/entrada', { From: 'whatsapp:+5521988887777', Body: 'oi', MessageSid: 'SMx' }, 'assinatura-falsa')).status, 401);
    let r = await entrada('+5521988887777', 'Vocês têm iPhone 16 na Nissei?', 'SM001');
    assert.equal(r.status, 200);
    await entrada('+5521988887777', 'Vocês têm iPhone 16 na Nissei?', 'SM001'); // reenvio da Twilio
    await a.rodarRotinas();
    const c = (await a.db.query<{ id: string; etapa: string; origem: string; nome: string }>(`select * from contato where whatsapp = '+5521988887777'`)).rows[0]!;
    assert.deepEqual([c.etapa, c.origem, c.nome], ['LEAD', 'MENSAGEM_RECEBIDA', 'João Turista']);
    const m = (await a.db.query<Msg>('select * from mensagem where contato_id = $1 order by criado_em', [c.id])).rows;
    assert.deepEqual(m.map((x) => [x.direcao, x.estado]), [['ENTRADA', 'RECEBIDA'], ['SAIDA', 'ENTREGUE']], 'mensagem duplicada ignorada; confirmação enviada');

    const atendimento = a.acesso('portal-atendimento');
    const tk = (await a.req('GET', '/v1/crm/tickets', { token: atendimento })).corpo.tickets[0];
    assert.equal(tk.canal, 'WHATSAPP');
    r = await a.req('POST', `/v1/crm/tickets/${tk.id}/mensagens`, { token: atendimento, corpo: { canal: 'WHATSAPP', texto: 'Temos sim, US$ 1.120. Quer reservar?' } });
    assert.equal(r.status, 201);
    await a.rodarRotinas();
    assert.equal(a.mensageiro.enviados.at(-1)!.texto, 'Temos sim, US$ 1.120. Quer reservar?');
    const detalhe = (await a.req('GET', `/v1/crm/tickets/${tk.id}`, { token: atendimento })).corpo;
    assert.equal(detalhe.ticket.estado, 'AGUARDANDO_CLIENTE');
    await entrada('+5521988887777', 'Quero sim!', 'SM002');
    assert.equal((await a.req('GET', `/v1/crm/tickets/${tk.id}`, { token: atendimento })).corpo.ticket.estado, 'EM_ATENDIMENTO', 'resposta do cliente reabre');

    assert.equal((await a.req('POST', `/v1/crm/tickets/${tk.id}/mensagens`, { token: a.acesso('loja-gerente', 'nissei'), corpo: { canal: 'WHATSAPP', texto: 'x' } })).status, 403);
  });

  it('PARAR desliga o canal: confirma uma vez e bloqueia as próximas', async () => {
    const t = await a.novoCliente('Pede Parar', { aceite_mensagens_whatsapp: true });
    await a.rodarRotinas();
    const eu = (await a.req('GET', '/v1/clientes/eu', { token: t })).corpo;
    await entrada(eu.whatsapp, 'PARAR', 'SM100');
    await a.rodarRotinas();
    const c = (await a.db.query<{ id: string; optout_canais: string[] }>('select id, optout_canais from contato where cliente_id = $1', [eu.id])).rows[0]!;
    assert.deepEqual(c.optout_canais, ['WHATSAPP']);
    await a.db.tx((q) => enfileirarMensagem(q, { contatoId: c.id, canal: 'WHATSAPP', finalidade: 'TRANSACIONAL', texto: 'depois do parar', autor: 'sistema' }));
    await a.rodarRotinas();
    const m = (await a.db.query<Msg>(`select * from mensagem where contato_id = $1 and direcao = 'SAIDA' order by criado_em`, [c.id])).rows;
    assert.deepEqual(m.map((x) => [x.modelo, x.estado]), [['boas_vindas', 'ENTREGUE'], ['optout', 'ENTREGUE'], [null, 'BLOQUEADA']]);
    assert.match(m[2]!.motivo!, /parar/);
    const consent = await a.db.query<{ concedido: boolean }>(`select concedido from consentimento where cliente_id = $1 and finalidade = 'MENSAGENS_WHATSAPP' order by criado_em desc limit 1`, [eu.id]);
    assert.equal(consent.rows[0]!.concedido, false, 'consentimento revogado registrado (LGPD)');
  });

  it('status da Twilio atualiza a entrega sem voltar estado; falha temporária tenta de novo', async () => {
    const t = await a.novoCliente('Status Twilio', { aceite_mensagens_whatsapp: true });
    a.mensageiro.falharProximo = { definitivo: false, erro: 'Twilio 503' };
    let r = await a.rodarRotinas();
    assert.equal(r.falhas, 1);
    const eu = (await a.req('GET', '/v1/clientes/eu', { token: t })).corpo;
    const sel = () => a.db.query<{ estado: string; provedor_id: string; tentativas: number }>(
      `select m.estado, m.provedor_id, m.tentativas from mensagem m join contato c on c.id = m.contato_id where c.cliente_id = $1`,
      [eu.id],
    );
    assert.deepEqual([(await sel()).rows[0]!.estado, (await sel()).rows[0]!.tentativas], ['PENDENTE', 1]);
    r = await a.rodarRotinas();
    assert.equal(r.enviadas, 0, 'espera o intervalo antes de tentar de novo');
    a.avancar(2 * 60_000);
    r = await a.rodarRotinas();
    assert.equal(r.enviadas, 1);
    const sid = (await sel()).rows[0]!.provedor_id;
    await a.twilio('/v1/webhooks/twilio/status', { MessageSid: sid, MessageStatus: 'read' });
    await a.twilio('/v1/webhooks/twilio/status', { MessageSid: sid, MessageStatus: 'sent' });
    assert.equal((await sel()).rows[0]!.estado, 'LIDA');
  });

  it('marketing respeita o limite semanal', async () => {
    const t = await a.novoCliente('Recebe Ofertas', { aceite_mensagens_whatsapp: true });
    await a.rodarRotinas();
    const eu = (await a.req('GET', '/v1/clientes/eu', { token: t })).corpo;
    const c = (await a.db.query<{ id: string }>('select id from contato where cliente_id = $1', [eu.id])).rows[0]!;
    for (let i = 0; i <= a.config.limiteMarketingSemana; i++) {
      await a.db.tx((q) => enfileirarMensagem(q, { contatoId: c.id, canal: 'WHATSAPP', finalidade: 'MARKETING', texto: `oferta ${i}`, autor: 'sistema' }));
      await a.rodarRotinas();
    }
    const m = (await a.db.query<Msg>(`select * from mensagem where contato_id = $1 and finalidade = 'MARKETING' order by criado_em`, [c.id])).rows;
    assert.deepEqual(m.map((x) => x.estado), [...Array(a.config.limiteMarketingSemana).fill('ENTREGUE'), 'BLOQUEADA']);
  });
});

describe('leads e atendimento pelo app', () => {
  let a: Ambiente;
  before(async () => (a = await criarAmbiente()));
  after(() => a.fechar());

  it('formulário público cria lead com aceite por canal; robô é ignorado; lead que se cadastra vira o mesmo contato', async () => {
    let r = await a.req('POST', '/v1/leads', { corpo: { nome: 'Lead do Vídeo', whatsapp: '+55 11 97777-1234', aceite_whatsapp: true, interesse: 'bicicleta', origem: { utm_source: 'youtube', video: 'VID-BIKE' } } });
    assert.equal(r.status, 201);
    r = await a.req('POST', '/v1/leads', { corpo: { nome: 'Robô', email: 'bot@x.com', site: '' } });
    r = await a.req('POST', '/v1/leads', { corpo: { nome: 'Robô', email: 'bot@x.com', site: 'http://spam' } });
    assert.equal(r.status, 422, 'campo armadilha preenchido');
    const lead = (await a.db.query<{ id: string; aceites_canais: string[]; tags: string[] }>(`select * from contato where nome = 'Lead do Vídeo'`)).rows[0]!;
    assert.deepEqual([lead.aceites_canais, lead.tags], [['WHATSAPP'], ['interesse:bicicleta']]);

    const t = await a.novoCliente('Lead Virou Cliente', { whatsapp: '+5511977771234' });
    await a.rodarRotinas();
    const c = (await a.db.query<{ id: string; etapa: string; nome: string }>(`select c.* from contato c join cliente k on k.id = c.cliente_id where k.whatsapp = '+5511977771234'`)).rows[0]!;
    assert.equal(c.id, lead.id, 'mesmo contato, com o histórico do lead');
    assert.equal(c.etapa, 'ONBOARDING');
    void t;
  });

  it('cliente pede cancelamento pelo app; atendente responde no app; cliente vê a resposta', async () => {
    const t = await a.novoCliente('Quer Cancelar');
    const jbl = await a.produto('JBL Charge');
    const p = await a.pedidoComPix(t, { modo: 'RETIRADA_PORTAL', itens: [{ produto_id: jbl.id, quantidade: 1 }] });
    await a.webhook(p.pagamento.txid, p.valores.total_brl_centavos);
    let r = await a.req('POST', '/v1/atendimento', { token: t, corpo: { pedido_id: p.id, tipo: 'CANCELAMENTO', texto: 'Mudei de ideia, quero cancelar' } });
    assert.equal(r.status, 201);
    const atendimento = a.acesso('portal-atendimento');
    const tk = (await a.req('GET', '/v1/crm/tickets?tipo=CANCELAMENTO', { token: atendimento })).corpo.tickets[0];
    assert.deepEqual([tk.prioridade, tk.canal, tk.pedido_codigo], ['ALTA', 'APP', p.codigo]);
    await a.req('POST', `/v1/crm/tickets/${tk.id}/mensagens`, { token: atendimento, corpo: { canal: 'APP', texto: 'Cancelamos e o estorno sai em até 1 dia útil.' } });
    await a.req('PATCH', `/v1/crm/tickets/${tk.id}`, { token: atendimento, corpo: { estado: 'RESOLVIDO' } });
    r = await a.req('GET', '/v1/atendimento', { token: t });
    assert.equal(r.corpo.tickets[0].estado, 'RESOLVIDO');
    assert.ok(r.corpo.mensagens.some((m: { conteudo: string }) => m.conteudo.startsWith('Cancelamos')));
    assert.equal((await a.req('POST', '/v1/atendimento', { token: a.equipe('admin'), corpo: { tipo: 'DUVIDA', texto: 'x x x' } })).status, 403);
  });

  it('funil e lista de contatos só para quem tem CRM', async () => {
    assert.equal((await a.req('GET', '/v1/crm/funil', { token: a.acesso('portal-atendimento') })).status, 200);
    assert.equal((await a.req('GET', '/v1/crm/contatos', { token: a.acesso('epyx-suporte') })).status, 403, 'EPYX não vê dados pessoais de clientes');
    assert.equal((await a.req('GET', '/v1/crm/contatos', { token: a.acesso('loja-gerente', 'cellshop') })).status, 403);
    const r = await a.req('POST', '/v1/crm/contatos', { token: a.acesso('portal-central'), corpo: { nome: 'X', email: 'x@x.com' } });
    assert.equal(r.status, 403, 'central vê e responde, mas não edita o funil');
  });
});
