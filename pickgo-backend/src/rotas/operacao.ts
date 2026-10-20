import { z } from 'zod';
import { ator, ehDaLoja, exigirPermissao, type Usuario } from '../auth.ts';
import { validar, type Modulo } from '../contexto.ts';
import type { Consulta } from '../db.ts';
import { conflito, invalido, naoEncontrado, proibido } from '../erros.ts';
import { inserirOcorrencia, resolverDefeitoTrocado } from '../servicos/ocorrencias.ts';
import { carregarPedidos, lerQr, publico, verPedido } from '../servicos/pedidos.ts';
import { auditar, transitar, travarPedido, type PedidoLinha } from '../servicos/registro.ts';

// T30 · RF-42 a RF-50: fila da central do Portal, coleta na loja, conferência,
// teste da loja, separação no balcão, entrega por QR (T7) e saída do Scan & Go.

const ESTADOS_ATIVOS = ['PAGO', 'EM_SEPARACAO', 'EM_COLETA', 'EM_TESTE_LOJA', 'PRONTO_RETIRADA', 'LIBERADO_SAIDA'];
const ESTADOS_NAO_PAGOS = ['CRIADO', 'AGUARDANDO_PIX', 'EXPIRADO', 'CANCELADO'];

const uuid = z.uuid();

const conferencia = z.object({
  divergencias: z
    .array(
      z.object({
        item_id: z.uuid(),
        tipo: z.enum(['ITEM_FALTANTE', 'ITEM_A_MAIS']),
        descricao: z.string().min(1).max(1000),
      }),
    )
    .max(50)
    .default([]),
});

const teste = z.object({
  resultado: z.enum(['APROVADO', 'DEFEITO']),
  descricao: z.string().max(1000).optional(),
});

const comQr = z.object({ qr: z.string().min(10).max(200) });

const retirada = comQr.extend({ documento_conferido: z.boolean() });

const saida = comQr.extend({
  conferencia: z.enum(['AMOSTRAGEM', 'TOTAL']),
  divergencia: z.object({ descricao: z.string().min(1).max(1000) }).optional(),
});

interface ItemLinha {
  id: string;
  loja_id: string;
  status: 'PENDENTE' | 'SEPARADO';
  teste_resultado: 'APROVADO' | 'DEFEITO' | null;
}

const itensDo = (q: Consulta, pedidoId: string) =>
  q.query<ItemLinha>('select id, loja_id, status, teste_resultado from pedido_item where pedido_id = $1 for update', [pedidoId]).then((r) => r.rows);

/** Quem é de loja age só sobre itens e pedidos da própria loja. */
function exigirLoja(u: Usuario, lojas: string[]) {
  if (ehDaLoja(u) && !lojas.includes(u.loja_id ?? '')) {
    throw proibido('pedido de outra loja');
  }
}

/** Quem pode entregar ou liberar este pedido. */
function exigirQuemEntrega(u: Usuario, p: PedidoLinha, lojas: string[]) {
  if (!ehDaLoja(u)) return;
  // Retirada na loja: o balcão da loja entrega. Scan & Go: a porta da loja confere.
  if (p.modo === 'RETIRADA_LOJA' || p.modo === 'SCAN_GO') return exigirLoja(u, lojas);
  throw proibido('a entrega deste pedido é feita pela central do Portal');
}

export const rotasOperacao: Modulo = (app, { db, config }) => {
  const segredo = config.segredoToken;

  app.get('/v1/config/publica', async () => ({
    cotacao_usd_brl: config.cotacaoUsdBrlE4 / 10_000,
    taxa_pix_bps: config.taxaPixBps,
    taxa_cambio_bps: config.taxaCambioBps,
    comissao_portal_bps: config.comissaoPortalBps,
    comissao_epyx_bps: config.comissaoEpyxBps,
    cota_usd_centavos: config.cotaUsdCentavos,
    validade_pix_minutos: config.validadePixMinutos,
    prazo_retirada_horas: config.prazoRetiradaHoras,
  }));

  // RF-42 e RF-47: fila com os pedidos ativos e os retirados nas últimas 24 h.
  app.get('/v1/central/fila', async (req) => {
    const u = exigirPermissao(req, 'operacao.central', 'pedidos.ver');
    if (ehDaLoja(u)) throw proibido('a fila da central não é visível para lojas');
    const ids = await db.query<{ id: string }>(
      `select id from pedido
       where estado = any($1::text[]) or (estado = 'RETIRADO' and retirado_em > now() - interval '24 hours')
       order by (cliente_chegou_em is not null and estado <> 'RETIRADO') desc, criado_em
       limit 300`,
      [ESTADOS_ATIVOS],
    );
    const pedidos = (await carregarPedidos(db, ids.rows.map((r) => r.id), u, segredo)).map(publico);

    const porEstado = await db.query<{ estado: string; n: number }>('select estado, count(*)::int as n from pedido group by estado');
    const ind = await db.query<{ abertas: number; nao_retirados: number; separacao: number | null; entrega: number | null }>(
      `select
         (select count(*)::int from ocorrencia where estado = 'ABERTA') as abertas,
         (select count(*)::int from pedido where estado = 'NAO_RETIRADO') as nao_retirados,
         (select avg(extract(epoch from (p.pronto_em - g.confirmado_em)) / 60)::float8
            from pedido p join pagamento g on g.pedido_id = p.id and g.confirmado_em is not null
            where p.pronto_em is not null) as separacao,
         (select avg(extract(epoch from (retirado_em - pronto_em)) / 60)::float8
            from pedido where retirado_em is not null and pronto_em is not null) as entrega`,
    );
    const i = ind.rows[0]!;
    return {
      pedidos,
      indicadores: {
        por_estado: Object.fromEntries(porEstado.rows.map((r) => [r.estado, r.n])),
        ocorrencias_abertas: i.abertas,
        nao_retirados: i.nao_retirados,
        tempo_medio_separacao_min: i.separacao,
        tempo_medio_entrega_min: i.entrega,
      },
    };
  });

  // T9: pedidos pagos com itens da loja.
  app.get('/v1/loja/pedidos', async (req) => {
    const u = exigirPermissao(req, 'pedidos.ver');
    if (!ehDaLoja(u)) throw proibido('rota da equipe da loja');
    const ids = await db.query<{ id: string }>(
      `select p.id from pedido p
       where exists (select 1 from pedido_item i where i.pedido_id = p.id and i.loja_id = $1)
         and not (p.estado = any($2::text[]))
       order by p.criado_em desc limit 200`,
      [u.loja_id, ESTADOS_NAO_PAGOS],
    );
    return { pedidos: (await carregarPedidos(db, ids.rows.map((r) => r.id), u, segredo)).map(publico) };
  });

  // RF-43: a equipe do Portal vai à loja buscar os itens.
  app.post<{ Params: { id: string } }>('/v1/pedidos/:id/coleta/iniciar', async (req) => {
    const u = exigirPermissao(req, 'operacao.central');
    return db.tx(async (q) => {
      const p = await travarPedido(q, uuid.parse(req.params.id));
      if (p.modo !== 'RETIRADA_PORTAL') throw conflito('modo-invalido', 'só pedidos com retirada no Portal passam pela coleta');
      await transitar(q, p, 'EM_COLETA', u, { coletado_por: ator(u), coletado_em: new Date() });
      return verPedido(q, p.id, u, segredo);
    });
  });

  // RF-43 e RF-15: conferência na saída da loja; divergência abre ocorrência.
  app.post<{ Params: { id: string } }>('/v1/pedidos/:id/coleta/conferir', async (req) => {
    const u = exigirPermissao(req, 'operacao.central');
    const d = validar(conferencia, req.body ?? {});
    return db.tx(async (q) => {
      const p = await travarPedido(q, uuid.parse(req.params.id));
      const itens = await itensDo(q, p.id);
      for (const div of d.divergencias) {
        const item = itens.find((i) => i.id === div.item_id);
        if (!item) throw invalido('item não pertence ao pedido', { item_id: div.item_id });
        await inserirOcorrencia(q, u, { pedidoId: p.id, itemId: item.id, lojaId: item.loja_id, tipo: div.tipo, descricao: div.descricao });
      }
      await transitar(q, p, 'EM_TESTE_LOJA', u, { conferido_portal_por: ator(u), conferido_portal_em: new Date() });
      // Item trocado depois de um defeito volta a ser testado.
      await q.query(
        `update pedido_item set status = 'SEPARADO', separado_por = coalesce(separado_por, $2), separado_em = coalesce(separado_em, now()),
           teste_resultado = case when teste_resultado = 'DEFEITO' then null else teste_resultado end,
           testado_por = case when teste_resultado = 'DEFEITO' then null else testado_por end,
           testado_em = case when teste_resultado = 'DEFEITO' then null else testado_em end
         where pedido_id = $1`,
        [p.id, ator(u)],
      );
      return verPedido(q, p.id, u, segredo);
    });
  });

  // RF-50: a loja testa cada item antes da liberação ao cliente.
  app.post<{ Params: { id: string; itemId: string } }>('/v1/pedidos/:id/itens/:itemId/teste', async (req) => {
    const u = exigirPermissao(req, 'operacao.loja', 'operacao.central');
    const d = validar(teste, req.body);
    return db.tx(async (q) => {
      const p = await travarPedido(q, uuid.parse(req.params.id));
      const itens = await itensDo(q, p.id);
      const item = itens.find((i) => i.id === req.params.itemId);
      if (!item) throw naoEncontrado('item');
      exigirLoja(u, [item.loja_id]);
      if (p.estado !== 'EM_TESTE_LOJA') throw conflito('estado-invalido', `pedido em ${p.estado} não está no teste da loja`);
      if (item.teste_resultado) throw conflito('item-ja-testado', `item já testado: ${item.teste_resultado}`);

      await q.query('update pedido_item set teste_resultado = $2, testado_por = $3, testado_em = now() where id = $1', [
        item.id,
        d.resultado,
        ator(u),
      ]);
      await auditar(q, u, `item.teste_${d.resultado.toLowerCase()}`, 'pedido_item', item.id, { pedido_id: p.id, descricao: d.descricao });

      if (d.resultado === 'DEFEITO') {
        // Regra 3.3.2: defeito antes da saída é da loja, que troca o item; o Portal coleta de novo.
        await inserirOcorrencia(q, u, {
          pedidoId: p.id,
          itemId: item.id,
          lojaId: item.loja_id,
          tipo: 'DEFEITO_TESTE',
          descricao: d.descricao ?? null,
        });
        await transitar(q, p, 'EM_COLETA', u);
      } else {
        await resolverDefeitoTrocado(q, item.id, u);
        const pendentes = itens.filter((i) => i.id !== item.id && i.teste_resultado !== 'APROVADO');
        if (!pendentes.length) await transitar(q, p, 'PRONTO_RETIRADA', u, { pronto_em: new Date() });
      }
      return verPedido(q, p.id, u, segredo);
    });
  });

  // RF-11: retirada no balcão da loja; a loja separa e o pedido fica pronto.
  app.post<{ Params: { id: string; itemId: string } }>('/v1/pedidos/:id/itens/:itemId/separar', async (req) => {
    const u = exigirPermissao(req, 'operacao.loja');
    return db.tx(async (q) => {
      const p = await travarPedido(q, uuid.parse(req.params.id));
      if (p.modo !== 'RETIRADA_LOJA') throw conflito('modo-invalido', 'a separação pela loja vale para retirada na loja');
      if (p.estado !== 'EM_SEPARACAO') throw conflito('estado-invalido', `pedido em ${p.estado} não está em separação`);
      const itens = await itensDo(q, p.id);
      const item = itens.find((i) => i.id === req.params.itemId);
      if (!item) throw naoEncontrado('item');
      exigirLoja(u, [item.loja_id]);
      if (item.status === 'SEPARADO') throw conflito('item-ja-separado', 'item já separado');
      await q.query(`update pedido_item set status = 'SEPARADO', separado_por = $2, separado_em = now() where id = $1`, [item.id, ator(u)]);
      await auditar(q, u, 'item.separar', 'pedido_item', item.id, { pedido_id: p.id });
      if (itens.every((i) => i.id === item.id || i.status === 'SEPARADO')) {
        await transitar(q, p, 'PRONTO_RETIRADA', u, { pronto_em: new Date() });
      }
      return verPedido(q, p.id, u, segredo);
    });
  });

  // T7: lê o QR e mostra o pedido, sem consumir o QR.
  app.post('/v1/retirada/consultar', async (req) => {
    const u = exigirPermissao(req, 'retirada.entregar');
    const d = validar(comQr, req.body);
    const id = lerQr(d.qr, segredo);
    const [p] = await carregarPedidos(db, [id], u, segredo);
    if (!p) throw naoEncontrado('pedido');
    const linha = (await db.query<PedidoLinha>('select * from pedido where id = $1', [id])).rows[0]!;
    exigirQuemEntrega(u, linha, p._lojas);
    if (p.operacao.qr_usado_em) throw conflito('qr-ja-usado', 'este QR já foi usado; a retirada não pode ser repetida', { pedido: p.codigo });
    return publico(p);
  });

  // RF-13 e RF-44: entrega ao cliente. Marco da mudança de responsabilidade (3.3.2).
  app.post<{ Params: { id: string } }>('/v1/pedidos/:id/retirada/confirmar', async (req) => {
    const u = exigirPermissao(req, 'retirada.entregar');
    const d = validar(retirada, req.body);
    return db.tx(async (q) => {
      const id = uuid.parse(req.params.id);
      if (lerQr(d.qr, segredo) !== id) throw invalido('o QR não é deste pedido');
      const p = await travarPedido(q, id);
      const lojas = (await itensDo(q, id)).map((i) => i.loja_id);
      exigirQuemEntrega(u, p, lojas);
      if (p.qr_usado_em) throw conflito('qr-ja-usado', 'este QR já foi usado; a retirada não pode ser repetida', { pedido: p.codigo });
      if (!d.documento_conferido) throw invalido('confira o documento com foto do cliente antes de entregar');
      const agora = new Date();
      await transitar(q, p, 'RETIRADO', u, {
        qr_usado_em: agora,
        retirado_por: ator(u),
        retirado_em: agora,
        documento_conferido: true,
      });
      return verPedido(q, id, u, segredo);
    });
  });

  // RF-14 e RF-45: saída do Scan & Go, conferida por amostragem ou total.
  // Divergência abre ocorrência e segura a saída até ser resolvida.
  app.post<{ Params: { id: string } }>('/v1/pedidos/:id/saida/liberar', async (req) => {
    const u = exigirPermissao(req, 'retirada.entregar');
    const d = validar(saida, req.body);
    return db.tx(async (q) => {
      const id = uuid.parse(req.params.id);
      if (lerQr(d.qr, segredo) !== id) throw invalido('o QR não é deste pedido');
      const p = await travarPedido(q, id);
      if (p.modo !== 'SCAN_GO') throw conflito('modo-invalido', 'saída liberada vale para Scan & Go; use a confirmação de retirada');
      const lojas = (await itensDo(q, id)).map((i) => i.loja_id);
      exigirQuemEntrega(u, p, lojas);
      if (p.qr_usado_em) throw conflito('qr-ja-usado', 'este QR já foi usado; a saída não pode ser repetida', { pedido: p.codigo });
      if (p.estado !== 'LIBERADO_SAIDA') throw conflito('estado-invalido', `pedido em ${p.estado} não aguarda saída`);

      if (d.divergencia) {
        await inserirOcorrencia(q, u, {
          pedidoId: id,
          lojaId: (p.loja_scan_go as string | null) ?? lojas[0] ?? null,
          tipo: 'DIVERGENCIA_SAIDA',
          descricao: d.divergencia.descricao,
        });
        await q.query('update pedido set conferencia_saida = $2, atualizado_em = now() where id = $1', [id, d.conferencia]);
        await auditar(q, u, 'saida.divergencia', 'pedido', id, { conferencia: d.conferencia });
        return verPedido(q, id, u, segredo);
      }

      const aberta = await q.query(`select 1 from ocorrencia where pedido_id = $1 and tipo = 'DIVERGENCIA_SAIDA' and estado = 'ABERTA'`, [id]);
      if (aberta.rows[0]) throw conflito('ocorrencia-aberta', 'resolva a divergência de saída antes de liberar');
      const agora = new Date();
      await transitar(q, p, 'RETIRADO', u, {
        qr_usado_em: agora,
        retirado_por: ator(u),
        retirado_em: agora,
        conferencia_saida: d.conferencia,
      });
      return verPedido(q, id, u, segredo);
    });
  });
};
