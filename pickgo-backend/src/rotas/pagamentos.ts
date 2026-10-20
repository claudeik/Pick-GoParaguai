import { z } from 'zod';
import { exigir, exigirPermissao } from '../auth.ts';
import { validar, type Modulo } from '../contexto.ts';
import { ErroHttp, naoEncontrado } from '../erros.ts';
import { assinar, type WebhookPix } from '../integracoes/pix.ts';
import { confirmarPix, estornarPagamento, type ResultadoConfirmacao } from '../servicos/pagamentos.ts';
import { verPedido } from '../servicos/pedidos.ts';
import { auditar, idempotente, transitar, travarPedido } from '../servicos/registro.ts';

// T3 Pix (RF-06, RF-07), split (RF-08) e estorno (RF-09).

const webhook = z.object({
  pix: z
    .array(
      z.object({
        endToEndId: z.string().min(1),
        txid: z.string().min(1),
        valor: z.string().regex(/^\d+\.\d{2}$/),
        horario: z.string(),
      }),
    )
    .min(1),
});

const centavos = (valor: string) => Math.round(Number(valor) * 100);

export const rotasPagamentos: Modulo = (app, { db, config, pix }) => {
  // Gera (ou devolve a já gerada) cobrança Pix do pedido.
  app.post<{ Params: { id: string } }>('/v1/pedidos/:id/pix', async (req, rep) => {
    const u = exigir(req, 'cliente');
    const pedidoId = z.uuid().parse(req.params.id);
    const r = await idempotente(db, `pix:${u.sub}`, req.headers['idempotency-key'] as string, async (q) => {
      let p = await travarPedido(q, pedidoId);
      if (p.cliente_id !== u.sub) throw naoEncontrado('pedido');
      if (p.estado === 'CRIADO') {
        const expiraEm = new Date(Date.now() + config.validadePixMinutos * 60_000);
        const cob = await pix.criarCobranca({ valorCentavos: p.total_brl_centavos as number, expiraEm });
        await q.query(
          `insert into pagamento (pedido_id, txid, estado, valor_brl_centavos, cotacao_e4, copia_e_cola, expira_em)
           values ($1, $2, 'PENDENTE', $3, $4, $5, $6)`,
          [p.id, cob.txid, p.total_brl_centavos, p.cotacao_e4, cob.copiaECola, expiraEm],
        );
        p = await transitar(q, p, 'AGUARDANDO_PIX', u);
      } else if (p.estado !== 'AGUARDANDO_PIX') {
        throw new ErroHttp(409, 'estado-invalido', `pedido em ${p.estado} não aceita cobrança Pix`);
      }
      return { status: 201, corpo: await verPedido(q, p.id, u, config.segredoToken) };
    });
    return rep.code(r.status).send(r.corpo);
  });

  // Webhook do provedor. Assinatura sobre o corpo bruto; responde 200 mesmo para
  // txid desconhecido, para o provedor não reenviar sem fim (fica na auditoria).
  app.post('/v1/webhooks/pix', async (req) => {
    if (!pix.assinaturaValida(req.corpoBruto ?? '', req.headers['x-pix-signature'] as string | undefined)) {
      throw new ErroHttp(401, 'assinatura-invalida', 'assinatura do webhook inválida');
    }
    const d = validar(webhook, req.body) as WebhookPix;
    const resultados: { txid: string; resultado: ResultadoConfirmacao }[] = [];
    for (const p of d.pix) {
      const resultado = await db.tx((q) =>
        confirmarPix(q, config, { txid: p.txid, endToEndId: p.endToEndId, valorCentavos: centavos(p.valor) }),
      );
      resultados.push({ txid: p.txid, resultado });
    }
    return { resultados };
  });

  app.post<{ Params: { id: string } }>('/v1/pagamentos/:id/estorno', async (req) => {
    const u = exigirPermissao(req, 'estorno.executar');
    const r = await idempotente(db, `estorno:${u.sub}`, req.headers['idempotency-key'] as string, async (q) => {
      const e = await estornarPagamento(q, z.uuid().parse(req.params.id), u);
      if (!e) throw naoEncontrado('pagamento');
      // Devolução no provedor Pix (MED/devolução) entra com o adaptador real. [D1]
      await auditar(q, u, 'pix.devolucao_solicitada', 'pagamento', req.params.id);
      return { status: 200, corpo: { pedido_id: e.pedido.id, estado: e.pedido.estado, transacao_id: e.transacao_id } };
    });
    return r.corpo;
  });

  // Simula o banco do cliente pagando o Pix: monta o webhook assinado e o envia.
  // Serve ao botão "Já paguei" do protótipo. Desligado em produção.
  if (config.permitirDevLogin) {
    app.post<{ Params: { txid: string } }>('/v1/dev/pix/:txid/pagar', async (req) => {
      const pag = await db.query<{ valor_brl_centavos: number }>(
        'select valor_brl_centavos from pagamento where txid = $1',
        [req.params.txid],
      );
      if (!pag.rows[0]) throw naoEncontrado('cobrança');
      const corpo = JSON.stringify({
        pix: [
          {
            endToEndId: `E${Date.now()}${Math.floor(Math.random() * 1e6)}`,
            txid: req.params.txid,
            valor: (pag.rows[0].valor_brl_centavos / 100).toFixed(2),
            horario: new Date().toISOString(),
          },
        ],
      });
      const r = await app.inject({
        method: 'POST',
        url: '/v1/webhooks/pix',
        headers: { 'content-type': 'application/json', 'x-pix-signature': assinar(corpo, config.segredoWebhookPix) },
        payload: corpo,
      });
      return r.json();
    });
  }
};
