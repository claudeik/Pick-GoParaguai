import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { emitirToken, exigir, PERFIS } from '../auth.ts';
import { validar, type Modulo } from '../contexto.ts';
import { perfilPorId } from '../acesso/modelo.ts';
import { conflito, ErroHttp, invalido, naoEncontrado } from '../erros.ts';
import { contatoDoCliente, enfileirarMensagem } from '../servicos/crm.ts';
import { devolverEstoque } from '../servicos/pagamentos.ts';
import { auditar, publicar, transitar, travarPedido } from '../servicos/registro.ts';

// Cadastro mínimo (RF-18 e RF-41): CPF, nome, WhatsApp, e-mail e aceites.
// Quem já tem cadastro entra com um código de 6 dígitos enviado ao WhatsApp do cadastro.
// KYC por documento e selfie é Fase 2.

const VALIDADE_CODIGO_MIN = 10;
const MAX_TENTATIVAS_CODIGO = 5;
const ESPERA_NOVO_CODIGO_S = 60;

export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(cpf[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

const novoCliente = z.object({
  cpf: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .refine(cpfValido, 'CPF inválido'),
  nome: z.string().min(2).max(120),
  whatsapp: z.string().regex(/^\+?\d{10,15}$/, 'WhatsApp com DDI e DDD, só números'),
  email: z.email().optional(),
  aceite_termos: z.literal(true, 'é preciso aceitar os termos'),
  aceite_mensagens_whatsapp: z.boolean().default(false),
  aceite_mensagens_email: z.boolean().default(false),
  aceite_mensagens_sms: z.boolean().default(false),
  versao_termos: z.string().min(1).max(20),
});

const soCpf = z.object({
  cpf: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .refine(cpfValido, 'CPF inválido'),
});
const novoDispositivo = z.object({
  plataforma: z.enum(['android', 'ios']),
  token: z.string().min(16).max(4096),
});
const entrada = soCpf.extend({ codigo: z.string().regex(/^\d{6}$/, 'o código tem 6 dígitos') });

/** +5511987654321 → +55 •••••••4321 */
const mascararTelefone = (t: string) => `${t.slice(0, 3)} •••••••${t.slice(-4)}`;

export const rotasClientes: Modulo = (app, { db, config, agora }) => {
  const hashCpf = (cpf: string) => createHmac('sha256', config.segredoCpf).update(cpf).digest('hex');
  const hashCodigo = (id: string, codigo: string) => createHmac('sha256', config.segredoToken).update(`${id}:${codigo}`).digest();

  app.post('/v1/clientes', async (req, rep) => {
    const d = validar(novoCliente, req.body);
    const cpfHash = hashCpf(d.cpf);
    const cliente = await db.tx(async (q) => {
      const existe = await q.query('select 1 from cliente where cpf_hash = $1', [cpfHash]);
      // Não devolvemos token para CPF já cadastrado: a pessoa entra pelo código no WhatsApp.
      if (existe.rows[0]) throw conflito('cliente-ja-cadastrado', 'CPF já cadastrado; entre com o código enviado por WhatsApp');
      const c = await q.query<{ id: string }>(
        `insert into cliente (cpf_hash, cpf_mascarado, nome, whatsapp, email)
         values ($1, $2, $3, $4, $5) returning id`,
        [cpfHash, `***.${d.cpf.slice(3, 6)}.***-**`, d.nome, d.whatsapp, d.email ?? null],
      );
      const id = c.rows[0]!.id;
      const aceites: [string, boolean][] = [
        ['TERMOS', true],
        ['MENSAGENS_WHATSAPP', d.aceite_mensagens_whatsapp],
        ['MENSAGENS_EMAIL', d.aceite_mensagens_email],
        ['MENSAGENS_SMS', d.aceite_mensagens_sms],
      ];
      for (const [finalidade, concedido] of aceites) {
        await q.query(
          'insert into consentimento (cliente_id, finalidade, concedido, versao_texto) values ($1, $2, $3, $4)',
          [id, finalidade, concedido, d.versao_termos],
        );
      }
      await publicar(q, 'ClienteCadastrado', { cliente_id: id }, id);
      await auditar(q, { sub: id, perfil: 'cliente', exp: 0 }, 'cliente.cadastrar', 'cliente', id);
      return id;
    });
    return rep.code(201).send({
      cliente_id: cliente,
      token: emitirToken({ sub: cliente, perfil: 'cliente' }, config.segredoToken),
    });
  });

  // Pede o código de acesso: vai para o WhatsApp do cadastro (uma vez a cada minuto).
  // Conta da revisão das lojas: o revisor não recebe o nosso WhatsApp, então entra com um código fixo.
  const ehRevisao = (cpf: string) => !!config.revisaoCpf && !!config.revisaoCodigo && cpf === config.revisaoCpf;

  app.post('/v1/clientes/codigo', async (req, rep) => {
    const d = validar(soCpf, req.body);
    if (ehRevisao(d.cpf)) return rep.code(202).send({ enviado_para: 'conta de revisão', validade_min: VALIDADE_CODIGO_MIN });
    const r = await db.tx(async (q) => {
      const c = (await q.query<{ id: string; whatsapp: string }>('select id, whatsapp from cliente where cpf_hash = $1', [hashCpf(d.cpf)])).rows[0];
      if (!c) throw new ErroHttp(404, 'cliente-nao-cadastrado', 'Não encontramos cadastro com este CPF. Crie sua conta.');
      const ultimo = (await q.query<{ criado_em: Date }>('select criado_em from codigo_acesso where cliente_id = $1 order by criado_em desc limit 1', [c.id])).rows[0];
      const espera = ultimo ? ESPERA_NOVO_CODIGO_S - Math.floor((agora().getTime() - new Date(ultimo.criado_em).getTime()) / 1000) : 0;
      if (espera > 0) throw new ErroHttp(429, 'aguarde-novo-codigo', `Aguarde ${espera} s para pedir um novo código`, { aguardar_s: espera });
      // Um código novo invalida os anteriores.
      await q.query('update codigo_acesso set usado_em = $2 where cliente_id = $1 and usado_em is null', [c.id, agora()]);
      const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const id = (
        await q.query<{ id: string }>(
          `insert into codigo_acesso (cliente_id, codigo_hash, expira_em, criado_em) values ($1, '', $2, $3) returning id`,
          [c.id, new Date(agora().getTime() + VALIDADE_CODIGO_MIN * 60_000), agora()],
        )
      ).rows[0]!.id;
      await q.query('update codigo_acesso set codigo_hash = $2 where id = $1', [id, hashCodigo(id, codigo).toString('hex')]);
      const contato = await contatoDoCliente(q, c.id);
      await enfileirarMensagem(q, { contatoId: contato.id, canal: 'WHATSAPP', finalidade: 'TRANSACIONAL', modelo: 'codigo_acesso', variaveis: { codigo }, autor: 'sistema' });
      return { whatsapp: c.whatsapp, codigo };
    });
    return rep.code(202).send({
      enviado_para: mascararTelefone(r.whatsapp),
      validade_min: VALIDADE_CODIGO_MIN,
      // Sem Twilio de verdade o WhatsApp é simulado: em desenvolvimento devolvemos o código para testar.
      ...(config.permitirDevLogin ? { codigo_dev: r.codigo } : {}),
    });
  });

  // Entra com CPF e código: devolve o mesmo token do cadastro.
  app.post('/v1/clientes/entrar', async (req) => {
    const d = validar(entrada, req.body);
    const erro = new ErroHttp(401, 'codigo-invalido', 'Código inválido ou expirado. Peça um novo código.');
    const r = await db.tx(async (q) => {
      const c = (await q.query<{ id: string }>('select id from cliente where cpf_hash = $1', [hashCpf(d.cpf)])).rows[0];
      if (!c) return null;
      if (ehRevisao(d.cpf)) {
        const ok = timingSafeEqual(hashCodigo(c.id, d.codigo), hashCodigo(c.id, config.revisaoCodigo!));
        if (ok) await auditar(q, { sub: c.id, perfil: 'cliente', exp: 0 }, 'cliente.entrar_revisao', 'cliente', c.id);
        return ok ? c.id : null;
      }
      const k = (
        await q.query<{ id: string; codigo_hash: string; tentativas: number }>(
          `select id, codigo_hash, tentativas from codigo_acesso
           where cliente_id = $1 and usado_em is null and expira_em > $2 order by criado_em desc limit 1 for update`,
          [c.id, agora()],
        )
      ).rows[0];
      if (!k || k.tentativas >= MAX_TENTATIVAS_CODIGO) return null;
      if (!timingSafeEqual(hashCodigo(k.id, d.codigo), Buffer.from(k.codigo_hash, 'hex'))) {
        // Na quinta tentativa errada o código deixa de valer.
        await q.query('update codigo_acesso set tentativas = tentativas + 1 where id = $1', [k.id]);
        return null;
      }
      await q.query('update codigo_acesso set usado_em = $2 where id = $1', [k.id, agora()]);
      await auditar(q, { sub: c.id, perfil: 'cliente', exp: 0 }, 'cliente.entrar', 'cliente', c.id);
      return c.id;
    });
    if (!r) throw erro;
    return { cliente_id: r, token: emitirToken({ sub: r, perfil: 'cliente' }, config.segredoToken) };
  });

  // Aparelho com o app: o token de push vem do sistema depois que a pessoa autoriza as notificações.
  app.put('/v1/clientes/eu/dispositivos', async (req, rep) => {
    const u = exigir(req, 'cliente');
    const d = validar(novoDispositivo, req.body);
    // O mesmo aparelho pode trocar de conta: o token passa a ser do cliente atual.
    await db.query(
      `insert into dispositivo (cliente_id, plataforma, token) values ($1, $2, $3)
       on conflict (token) do update set cliente_id = excluded.cliente_id, plataforma = excluded.plataforma, atualizado_em = now()`,
      [u.sub, d.plataforma, d.token],
    );
    return rep.code(204).send();
  });

  // Ao sair da conta, o aparelho para de receber os avisos dela.
  app.post('/v1/clientes/eu/dispositivos/remover', async (req, rep) => {
    const u = exigir(req, 'cliente');
    const d = validar(z.object({ token: z.string().min(1) }), req.body);
    await db.query('delete from dispositivo where cliente_id = $1 and token = $2', [u.sub, d.token]);
    return rep.code(204).send();
  });

  // Exclusão da conta pelo próprio cliente (App Store 5.1.1(v) e LGPD, art. 18).
  // Apaga os dados pessoais e mantém os pedidos anônimos para o ledger e a parte fiscal.
  app.delete('/v1/clientes/eu', async (req, rep) => {
    const u = exigir(req, 'cliente');
    await db.tx(async (q) => {
      const ativos = await q.query<{ codigo: string }>(
        `select codigo from pedido where cliente_id = $1 and estado in ('PAGO', 'EM_SEPARACAO', 'EM_COLETA', 'EM_TESTE_LOJA', 'PRONTO_RETIRADA', 'LIBERADO_SAIDA', 'NAO_RETIRADO') limit 5`,
        [u.sub],
      );
      if (ativos.rows[0]) {
        throw conflito('pedidos-em-andamento', 'Você tem pedidos pagos ainda não retirados. Retire ou peça o reembolso antes de excluir a conta.', {
          pedidos: ativos.rows.map((p) => p.codigo),
        });
      }
      // Pix ainda não pago é cancelado como no botão Cancelar: a cobrança deixa de valer e o estoque volta.
      const abertos = await q.query<{ id: string }>(`select id from pedido where cliente_id = $1 and estado in ('CRIADO', 'AGUARDANDO_PIX')`, [u.sub]);
      for (const { id } of abertos.rows) {
        const p = await travarPedido(q, id);
        await transitar(q, p, 'CANCELADO', u);
        await q.query(`update pagamento set estado = 'EXPIRADO' where pedido_id = $1 and estado = 'PENDENTE'`, [id]);
        await devolverEstoque(q, id);
      }
      const r = await q.query(
        `update cliente set cpf_hash = 'excluido:' || id, cpf_mascarado = '***.***.***-**', nome = 'Conta excluída', whatsapp = '', email = null, excluido_em = $2
         where id = $1 and excluido_em is null returning id`,
        [u.sub, agora()],
      );
      if (!r.rows[0]) throw naoEncontrado('cliente');
      for (const finalidade of ['MENSAGENS_WHATSAPP', 'MENSAGENS_EMAIL', 'MENSAGENS_SMS']) {
        await q.query('insert into consentimento (cliente_id, finalidade, concedido, versao_texto) values ($1, $2, false, $3)', [u.sub, finalidade, 'exclusao-conta']);
      }
      await q.query(
        `update contato set nome = 'Conta excluída', email = null, whatsapp = null, notas = null, tags = '{}', origem_detalhe = null,
         optout_canais = array['WHATSAPP', 'SMS', 'EMAIL'], aceites_canais = '{}', atualizado_em = now() where cliente_id = $1`,
        [u.sub],
      );
      await q.query(`update mensagem set destino = null where contato_id in (select id from contato where cliente_id = $1)`, [u.sub]);
      await q.query(`update mensagem set estado = 'BLOQUEADA', motivo = 'conta excluída' where estado = 'PENDENTE' and contato_id in (select id from contato where cliente_id = $1)`, [u.sub]);
      await q.query(`update push_envio set estado = 'DESCARTADA', motivo = 'conta excluída' where cliente_id = $1 and estado = 'PENDENTE'`, [u.sub]);
      await q.query('delete from dispositivo where cliente_id = $1', [u.sub]);
      await q.query('delete from codigo_acesso where cliente_id = $1', [u.sub]);
      await q.query('delete from video_interesse where cliente_id = $1', [u.sub]);
      await auditar(q, u, 'cliente.excluir_conta', 'cliente', u.sub);
    });
    return rep.code(204).send();
  });

  app.get('/v1/clientes/eu', async (req) => {
    if (req.usuario?.perfil !== 'cliente') throw naoEncontrado('cliente');
    const r = await db.query(
      'select id, cpf_mascarado, nome, whatsapp, email, criado_em from cliente where id = $1',
      [req.usuario.sub],
    );
    if (!r.rows[0]) throw naoEncontrado('cliente');
    return r.rows[0];
  });

  // Login de desenvolvimento: emite token para qualquer perfil. Desligado em produção.
  if (config.permitirDevLogin) {
    // perfil antigo (admin, central, lojista, operador) ou um perfil de acesso novo (ex.: epyx-suporte).
    const devLogin = z.object({
      perfil: z.enum(PERFIS).optional(),
      perfil_acesso: z.string().refine((p) => perfilPorId.has(p), 'perfil de acesso inexistente').optional(),
      sub: z.string().min(1),
      nome: z.string().optional(),
      loja_id: z.string().optional(),
    });
    app.post('/v1/dev/login', async (req) => {
      const d = validar(devLogin, req.body);
      if (d.perfil_acesso) {
        const p = perfilPorId.get(d.perfil_acesso)!;
        if (p.organizacao === 'LOJA' && !d.loja_id) throw invalido('perfil de loja exige loja_id');
        return {
          token: emitirToken(
            { sub: d.sub, nome: d.nome, perfil: p.id, perfis_acesso: [p.id], organizacao: p.organizacao, loja_id: p.organizacao === 'LOJA' ? d.loja_id : undefined },
            config.segredoToken,
          ),
        };
      }
      if (!d.perfil) throw invalido('informe perfil ou perfil_acesso');
      return { token: emitirToken({ sub: d.sub, perfil: d.perfil, loja_id: d.loja_id }, config.segredoToken) };
    });
  }
};
