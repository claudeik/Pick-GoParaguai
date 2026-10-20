import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { emitirToken, PERFIS } from '../auth.ts';
import { validar, type Modulo } from '../contexto.ts';
import { perfilPorId } from '../acesso/modelo.ts';
import { conflito, invalido, naoEncontrado } from '../erros.ts';
import { auditar, publicar } from '../servicos/registro.ts';

// Cadastro mínimo (RF-18 e RF-41): CPF, nome, WhatsApp, e-mail e aceites.
// KYC por documento e selfie é Fase 2.

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

export const rotasClientes: Modulo = (app, { db, config }) => {
  app.post('/v1/clientes', async (req, rep) => {
    const d = validar(novoCliente, req.body);
    const cpfHash = createHmac('sha256', config.segredoCpf).update(d.cpf).digest('hex');
    const cliente = await db.tx(async (q) => {
      const existe = await q.query('select 1 from cliente where cpf_hash = $1', [cpfHash]);
      // Sem login por código ainda (Fase 2): não devolvemos token para CPF já cadastrado.
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
