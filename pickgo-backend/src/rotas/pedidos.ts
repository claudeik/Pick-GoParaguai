import { z } from 'zod';
import { ehDaLoja, exigir, exigirClienteOu } from '../auth.ts';
import { validar, type Modulo } from '../contexto.ts';
import { calcularTotais, usdParaBrl } from '../dominio/dinheiro.ts';
import { conflito, invalido, naoEncontrado, proibido } from '../erros.ts';
import { devolverEstoque } from '../servicos/pagamentos.ts';
import { registrarConversao, reservarOferta, type OfertaLinha } from '../servicos/campanhas.ts';
import { verPedido } from '../servicos/pedidos.ts';
import { idempotente, publicar, transitar, travarPedido, auditar } from '../servicos/registro.ts';

// T2 Sacola (RF-02, RF-03, RF-05), T4 Retirada (RF-12), T19 Meus pedidos.

const item = z
  .object({
    produto_id: z.uuid().optional(),
    codigo_barras: z.string().optional(),
    quantidade: z.number().int().min(1).max(20),
  })
  .refine((i) => i.produto_id || i.codigo_barras, 'informe produto_id ou codigo_barras');

const novoPedido = z.object({
  modo: z.enum(['RETIRADA_PORTAL', 'RETIRADA_LOJA', 'SCAN_GO', 'ENVIO_BRASIL']),
  /** Obrigatório no Scan & Go: a loja onde o cliente está. */
  loja_id: z.string().optional(),
  janela_chegada: z.string().max(60).optional(),
  itens: z.array(item).min(1).max(50),
  /** Cupom de uma oferta (PICKGO-XXXX): preço promocional no produto da oferta. */
  cupom: z.string().trim().max(40).optional(),
  /** Código do link curto da campanha que trouxe o cliente (atribuição, RF-31). */
  campanha_link: z.string().trim().max(40).optional(),
});

interface ProdutoLinha {
  id: string;
  loja_id: string;
  nome: string;
  preco_usd_centavos: number;
}

export const rotasPedidos: Modulo = (app, { db, config, agora }) => {
  app.post('/v1/pedidos', async (req, rep) => {
    const u = exigir(req, 'cliente');
    const d = validar(novoPedido, req.body);
    if (d.modo === 'ENVIO_BRASIL') throw invalido('envio ao Brasil entra na Fase 4 (decisão D7)');
    if (d.modo === 'SCAN_GO' && !d.loja_id) throw invalido('Scan & Go exige loja_id');

    const r = await idempotente(db, `pedido:${u.sub}`, req.headers['idempotency-key'] as string, async (q) => {
      const linhas: { produto: ProdutoLinha; quantidade: number }[] = [];
      for (const i of d.itens) {
        // Reserva o estoque já na criação; volta se o Pix expirar ou o pedido for cancelado.
        const p = await q.query<ProdutoLinha>(
          `update produto set estoque = estoque - $1, atualizado_em = now()
           where ${i.produto_id ? 'id = $2' : 'codigo_barras = $2 and loja_id = $3'} and ativo and estoque >= $1
           returning id, loja_id, nome, preco_usd_centavos`,
          i.produto_id ? [i.quantidade, i.produto_id] : [i.quantidade, i.codigo_barras, d.loja_id ?? null],
        );
        if (!p.rows[0]) {
          throw conflito('estoque-insuficiente', 'produto sem estoque ou inexistente', {
            produto: i.produto_id ?? i.codigo_barras,
          });
        }
        linhas.push({ produto: p.rows[0], quantidade: i.quantidade });
      }

      const lojas = new Set(linhas.map((l) => l.produto.loja_id));
      if (d.modo === 'SCAN_GO' && [...lojas].some((l) => l !== d.loja_id)) {
        throw invalido('no Scan & Go todos os itens são da loja onde o cliente está');
      }
      // Pedido com várias lojas e retirada em cada loja depende da decisão D6.
      if (d.modo === 'RETIRADA_LOJA' && lojas.size > 1) {
        throw invalido('retirada em cada loja aceita uma loja por pedido; use RETIRADA_PORTAL para várias lojas');
      }

      // Cupom de oferta: reserva unidades e aplica o preço promocional no produto dela.
      let oferta: OfertaLinha | null = null;
      if (d.cupom) {
        const alvo = (await q.query<{ produto_id: string }>('select produto_id from oferta where codigo = $1', [d.cupom.toUpperCase()])).rows[0];
        if (!alvo) throw invalido('cupom inválido');
        const linha = linhas.find((l) => l.produto.id === alvo.produto_id);
        if (!linha) throw invalido('o cupom não vale para os produtos da sacola');
        oferta = await reservarOferta(q, d.cupom, u.sub, linha.produto.id, linha.quantidade, agora());
      }

      const cotacao = config.cotacaoUsdBrlE4;
      const itens = linhas.map((l) => {
        const cheio = l.produto.preco_usd_centavos * l.quantidade;
        const naOferta = oferta && l.produto.id === oferta.produto_id;
        const unitario = naOferta ? oferta!.preco_promocional_usd_centavos : l.produto.preco_usd_centavos;
        const usd = unitario * l.quantidade;
        const brl = usdParaBrl(usd, cotacao);
        return {
          ...l,
          unitario,
          usd,
          brl,
          oferta_id: naOferta ? oferta!.id : null,
          preco_cheio: naOferta ? l.produto.preco_usd_centavos : null,
          desconto_brl: naOferta ? usdParaBrl(cheio, cotacao) - brl : 0,
          pagador: naOferta ? oferta!.pagador : null,
        };
      });
      const totalUsd = itens.reduce((s, i) => s + i.usd, 0);
      const totais = calcularTotais(
        itens.reduce((s, i) => s + i.brl, 0),
        config,
      );

      const seq = await q.query<{ n: number }>("select nextval('pedido_codigo_seq') as n");
      const codigo = `PP-${String(seq.rows[0]!.n).padStart(4, '0')}`;
      const ped = await q.query<{ id: string }>(
        `insert into pedido (codigo, cliente_id, modo, estado, loja_scan_go, janela_chegada, total_usd_centavos,
           cotacao_e4, subtotal_brl_centavos, taxa_pix_brl_centavos, taxa_cambio_brl_centavos, total_brl_centavos, cupom)
         values ($1, $2, $3, 'CRIADO', $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
        [
          codigo,
          u.sub,
          d.modo,
          d.modo === 'SCAN_GO' ? d.loja_id : null,
          d.janela_chegada ?? null,
          totalUsd,
          cotacao,
          totais.subtotal,
          totais.taxaPix,
          totais.taxaCambio,
          totais.total,
          oferta?.codigo ?? null,
        ],
      );
      const pedidoId = ped.rows[0]!.id;
      for (const i of itens) {
        await q.query(
          `insert into pedido_item (pedido_id, produto_id, loja_id, nome_produto, quantidade,
             preco_usd_centavos, subtotal_usd_centavos, subtotal_brl_centavos, oferta_id, preco_cheio_usd_centavos, desconto_brl_centavos, pagador_desconto)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [pedidoId, i.produto.id, i.produto.loja_id, i.produto.nome, i.quantidade, i.unitario, i.usd, i.brl, i.oferta_id, i.preco_cheio, i.desconto_brl, i.pagador],
        );
        if (i.oferta_id) {
          await q.query('insert into oferta_uso (oferta_id, pedido_id, cliente_id, quantidade) values ($1, $2, $3, $4)', [i.oferta_id, pedidoId, u.sub, i.quantidade]);
        }
      }

      // Origem da venda (RF-31): a campanha da oferta ou a do link que o cliente abriu.
      let campanhaId = oferta?.campanha_id ?? null;
      if (!campanhaId && d.campanha_link) {
        const e = await q.query<{ campanha_id: string }>(
          `select e.campanha_id from campanha_envio e join contato c on c.id = e.contato_id where e.codigo_link = $1 and c.cliente_id = $2`,
          [d.campanha_link, u.sub],
        );
        campanhaId = e.rows[0]?.campanha_id ?? null;
      }
      if (campanhaId) {
        await q.query('update pedido set campanha_id = $2 where id = $1', [pedidoId, campanhaId]);
        await registrarConversao(q, campanhaId, u.sub, pedidoId);
      }
      await publicar(q, 'PedidoCriado', { pedido_id: pedidoId, codigo, modo: d.modo }, pedidoId);
      await auditar(q, u, 'pedido.criar', 'pedido', pedidoId, { modo: d.modo, itens: d.itens.length });

      // RF-05: aviso de cota (US$ 500 por terra, regra de 2020 a reconfirmar). [D3]
      const avisos =
        totalUsd > config.cotaUsdCentavos
          ? [
              {
                codigo: 'COTA_EXCEDIDA',
                mensagem: `Compra acima da cota de US$ ${(config.cotaUsdCentavos / 100).toFixed(0)} por pessoa por via terrestre; o excedente pode ser tributado na Receita Federal.`,
              },
            ]
          : [];
      return { status: 201, corpo: { ...(await verPedido(q, pedidoId, u, config.segredoToken)), avisos } };
    });
    return rep.code(r.status).send(r.corpo);
  });

  // Cliente vê os próprios pedidos; central e admin veem todos (painel da plataforma).
  app.get('/v1/pedidos', async (req) => {
    // Equipe de loja usa /loja/pedidos, que só traz a própria loja.
    const u = exigirClienteOu(req, 'pedidos.ver');
    if (ehDaLoja(u)) throw proibido('use /v1/loja/pedidos');
    const f = validar(z.object({ estado: z.string().max(30).optional(), limite: z.coerce.number().int().min(1).max(500).default(100) }), req.query);
    const cond: string[] = [];
    const params: unknown[] = [];
    if (u.perfil === 'cliente') {
      params.push(u.sub);
      cond.push(`cliente_id = $${params.length}`);
    }
    if (f.estado) {
      params.push(f.estado);
      cond.push(`estado = $${params.length}`);
    }
    params.push(f.limite);
    const r = await db.query(
      `select id, codigo, modo, estado, total_brl_centavos, total_usd_centavos, criado_em
       from pedido ${cond.length ? 'where ' + cond.join(' and ') : ''} order by criado_em desc limit $${params.length}`,
      params,
    );
    return { pedidos: r.rows };
  });

  app.get<{ Params: { id: string } }>('/v1/pedidos/:id', async (req) => {
    const u = exigirClienteOu(req, 'pedidos.ver');
    return verPedido(db, z.uuid().parse(req.params.id), u, config.segredoToken);
  });

  app.post<{ Params: { id: string } }>('/v1/pedidos/:id/cancelar', async (req) => {
    const u = exigirClienteOu(req, 'estorno.executar');
    return db.tx(async (q) => {
      const p = await travarPedido(q, z.uuid().parse(req.params.id));
      if (u.perfil === 'cliente' && p.cliente_id !== u.sub) throw naoEncontrado('pedido');
      await transitar(q, p, 'CANCELADO', u);
      await q.query(`update pagamento set estado = 'EXPIRADO' where pedido_id = $1 and estado = 'PENDENTE'`, [p.id]);
      await devolverEstoque(q, p.id);
      return verPedido(q, p.id, u, config.segredoToken);
    });
  });

  // "Avisar que cheguei" (RF-12): aparece como "Chegou" na central (T30).
  app.post<{ Params: { id: string } }>('/v1/pedidos/:id/cheguei', async (req) => {
    const u = exigir(req, 'cliente');
    return db.tx(async (q) => {
      const p = await travarPedido(q, req.params.id);
      if (p.cliente_id !== u.sub) throw naoEncontrado('pedido');
      if (!['EM_SEPARACAO', 'EM_COLETA', 'EM_TESTE_LOJA', 'PRONTO_RETIRADA'].includes(p.estado)) {
        throw conflito('estado-invalido', `pedido em ${p.estado} não aguarda retirada`);
      }
      await q.query('update pedido set cliente_chegou_em = now() where id = $1', [p.id]);
      await publicar(q, 'ClienteChegou', { pedido_id: p.id, codigo: p.codigo }, p.id);
      return verPedido(q, p.id, u, config.segredoToken);
    });
  });
};
