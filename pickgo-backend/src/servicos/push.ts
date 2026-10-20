import type { Contexto } from '../contexto.ts';
import type { Consulta } from '../db.ts';
import type { Plataforma } from '../integracoes/push.ts';

// Push do app do turista (outbox, como as mensagens): uma linha PENDENTE por aparelho,
// enviada pela rotina. Token recusado pelo FCM/APNs apaga o aparelho.

const MAX_TENTATIVAS = 5;

export async function enfileirarPush(q: Consulta, d: { clienteId: string; titulo: string; corpo: string; pedidoId: string | null }) {
  await q.query(
    `insert into push_envio (dispositivo_id, cliente_id, pedido_id, titulo, corpo)
     select id, cliente_id, $2, $3, $4 from dispositivo where cliente_id = $1`,
    [d.clienteId, d.pedidoId, d.titulo, d.corpo],
  );
}

interface PendenteLinha {
  id: string;
  dispositivo_id: string | null;
  pedido_id: string | null;
  titulo: string;
  corpo: string;
  tentativas: number;
  plataforma: Plataforma | null;
  token: string | null;
}

export async function despacharPush(ctx: Contexto): Promise<{ enviadas: number; falhas: number }> {
  const pend = await ctx.db.query<PendenteLinha>(
    `select p.id, p.dispositivo_id, p.pedido_id, p.titulo, p.corpo, p.tentativas, d.plataforma, d.token
     from push_envio p left join dispositivo d on d.id = p.dispositivo_id
     where p.estado = 'PENDENTE' and (p.proxima_tentativa_em is null or p.proxima_tentativa_em <= $1) order by p.criado_em limit 50`,
    [ctx.agora()],
  );
  const total = { enviadas: 0, falhas: 0 };
  for (const p of pend.rows) {
    if (!p.token || !p.plataforma) {
      await ctx.db.query(`update push_envio set estado = 'DESCARTADA', motivo = 'aparelho removido', atualizado_em = now() where id = $1`, [p.id]);
      continue;
    }
    // Reserva antes de enviar: outra rotina não pega a mesma linha enquanto esta envia.
    await ctx.db.query(`update push_envio set tentativas = tentativas + 1, proxima_tentativa_em = $2, atualizado_em = now() where id = $1`, [
      p.id,
      new Date(ctx.agora().getTime() + 2 ** p.tentativas * 60_000),
    ]);
    const r = await ctx.push.enviar({
      plataforma: p.plataforma,
      token: p.token,
      titulo: p.titulo,
      corpo: p.corpo,
      dados: p.pedido_id ? { pedido_id: p.pedido_id } : undefined,
    });
    if (r.ok) {
      await ctx.db.query(`update push_envio set estado = 'ENVIADA', provedor = $2, motivo = null, atualizado_em = now() where id = $1`, [p.id, r.provedor]);
      total.enviadas++;
      continue;
    }
    total.falhas++;
    if (r.tokenInvalido) await ctx.db.query('delete from dispositivo where id = $1', [p.dispositivo_id]);
    const fim = r.definitivo || p.tentativas + 1 >= MAX_TENTATIVAS;
    await ctx.db.query(`update push_envio set estado = $2, motivo = $3, atualizado_em = now() where id = $1`, [p.id, fim ? 'FALHOU' : 'PENDENTE', r.erro]);
  }
  return total;
}
