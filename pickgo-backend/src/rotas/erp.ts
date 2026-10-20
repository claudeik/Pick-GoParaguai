import { z } from 'zod';
import { ator, exigirPermissao } from '../auth.ts';
import { validar, type Modulo } from '../contexto.ts';
import type { Consulta } from '../db.ts';
import { conflito, invalido, naoEncontrado } from '../erros.ts';
import { anularCompra, anularFatura, emitirFatura, emitirNotaCredito, faturarComissoes, novaCompra, novaFatura, novaNotaCredito, registrarCompra } from '../erp/documentos.ts';
import { abrirInventario, fecharInventario, movimentar, transferir } from '../erp/estoque.ts';
import { emPyg, lerRuc } from '../erp/fiscal.ts';
import { baixar, criarTitulos, estornarBaixa, parcelasIguais } from '../erp/financeiro.ts';
import { auditar } from '../servicos/registro.ts';

// ERP do Portal Paraguai (controle interno; a fatura eletrônica SIFEN/e-Kuatia vem depois).

const data = z.iso.date();
const hojeAsuncion = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Asuncion' });

const empresa = z.object({
  ruc: z.string().trim(),
  razao_social: z.string().trim().min(3).max(200),
  nome_fantasia: z.string().trim().max(200).optional(),
  endereco: z.string().trim().max(300).optional(),
  atividade: z.string().trim().max(300).optional(),
  timbrado: z.string().regex(/^\d{8}$/, 'timbrado com 8 dígitos'),
  timbrado_inicio: data,
  timbrado_fim: data,
  estabelecimento: z.string().regex(/^\d{3}$/).default('001'),
  ponto_expedicao: z.string().regex(/^\d{3}$/).default('001'),
  proximo_numero: z.number().int().min(1).max(9_999_999).optional(),
});

const terceiro = z
  .object({
    tipo_documento: z.enum(['RUC', 'CI', 'CPF', 'CNPJ', 'PASSAPORTE', 'EXTERIOR']),
    documento: z.string().trim().min(3).max(30),
    razao_social: z.string().trim().min(2).max(200),
    nome_fantasia: z.string().trim().max(200).optional(),
    email: z.email().optional(),
    telefone: z.string().max(40).optional(),
    endereco: z.string().max(300).optional(),
    cliente: z.boolean().default(false),
    fornecedor: z.boolean().default(false),
    loja_id: z.string().max(60).optional(),
  })
  .refine((t) => t.cliente || t.fornecedor, 'marque cliente, fornecedor ou os dois');

const item = z
  .object({
    codigo: z.string().trim().min(1).max(40),
    descricao: z.string().trim().min(2).max(200),
    unidade: z.enum(['UN', 'CX', 'KG', 'L', 'M', 'PCT', 'SRV']).default('UN'),
    tipo: z.enum(['MERCADORIA', 'INSUMO', 'SERVICO']),
    iva: z.enum(['10', '5', 'EXENTO']).default('10'),
    controla_estoque: z.boolean().optional(),
    estoque_minimo: z.number().min(0).default(0),
    preco_venda_pyg: z.number().int().min(0).optional(),
  })
  .transform((i) => ({ ...i, controla_estoque: i.tipo === 'SERVICO' ? false : (i.controla_estoque ?? true) }));

const movimentoManual = z.object({
  tipo: z.enum(['AJUSTE_ENTRADA', 'AJUSTE_SAIDA', 'CONSUMO_INTERNO', 'TRANSFERENCIA']),
  item_id: z.uuid(),
  deposito_id: z.uuid(),
  destino_id: z.uuid().optional(),
  quantidade: z.number().positive().max(1_000_000),
  custo_unitario_pyg: z.number().min(0).optional(),
  observacao: z.string().trim().min(3).max(300),
});

const tituloManual = z.object({
  tipo: z.enum(['PAGAR', 'RECEBER']),
  terceiro_id: z.uuid(),
  descricao: z.string().trim().min(3).max(200),
  emissao: data,
  moeda: z.enum(['PYG', 'USD']).default('PYG'),
  valor: z.number().int().positive(),
  parcelas: z.number().int().min(1).max(60).default(1),
  primeiro_vencimento: data,
  intervalo_dias: z.number().int().min(1).max(365).default(30),
});

const baixa = z.object({
  data,
  valor: z.number().int().positive(),
  meio: z.enum(['TRANSFERENCIA', 'EFECTIVO', 'CHEQUE', 'PIX', 'TARJETA']),
  observacao: z.string().max(300).optional(),
});

const periodo = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'período no formato AAAA-MM');

const csv = (v: unknown) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const dataBr = (d: unknown) => {
  const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const [a, m, dia] = s.split('-');
  return `${dia}/${m}/${a}`;
};

interface LinhaLivro {
  id: string;
  data: string;
  tipo_documento: string;
  documento: string;
  dv: number | null;
  razao_social: string;
  comprovante: string;
  timbrado: string;
  numero: string;
  condicao: string;
  moeda: 'PYG' | 'USD';
  tipo_cambio: number;
  total_10: number;
  iva_10: number;
  total_5: number;
  iva_5: number;
  exento: number;
  total: number;
  estado: string;
}

/** Livro de vendas ou de compras do mês, em guaranis. Anulados aparecem marcados e zerados. */
async function livro(q: Consulta, tipo: 'ventas' | 'compras', p: string) {
  const ini = `${p}-01`;
  const fim = new Date(`${ini}T12:00:00Z`);
  fim.setUTCMonth(fim.getUTCMonth() + 1);
  const sql =
    tipo === 'ventas'
      ? `select f.id, f.data, t.tipo_documento, t.documento, t.dv, t.razao_social, f.tipo as comprovante, f.timbrado, f.numero_formatado as numero, f.condicao,
           f.moeda, f.tipo_cambio, f.total_10, f.iva_10, f.total_5, f.iva_5, f.exento, f.total, f.estado
         from erp_fatura f join erp_terceiro t on t.id = f.terceiro_id where f.data >= $1 and f.data < $2 order by f.data, f.tipo, f.numero`
      : `select c.id, c.data, t.tipo_documento, t.documento, t.dv, t.razao_social, 'FACTURA' as comprovante, c.timbrado, c.numero, c.condicao,
           c.moeda, c.tipo_cambio, c.total_10, c.iva_10, c.total_5, c.iva_5, c.exento, c.total, c.estado
         from erp_compra c join erp_terceiro t on t.id = c.fornecedor_id where c.data >= $1 and c.data < $2 order by c.data, c.numero`;
  const linhas = (await q.query<LinhaLivro>(sql, [ini, fim.toISOString().slice(0, 10)])).rows.map((l) => {
    const anulado = l.estado === 'ANULADA';
    const g = (v: number) => (anulado ? 0 : emPyg(Number(v), l.moeda, l.tipo_cambio));
    return { ...l, anulado, pyg: { total_10: g(l.total_10), iva_10: g(l.iva_10), total_5: g(l.total_5), iva_5: g(l.iva_5), exento: g(l.exento), total: g(l.total) } };
  });
  const sinal = (l: (typeof linhas)[number]) => (l.comprovante === 'NOTA_CREDITO' ? -1 : 1);
  const soma = (k: 'total_10' | 'iva_10' | 'total_5' | 'iva_5' | 'exento' | 'total') => linhas.reduce((s, l) => s + sinal(l) * l.pyg[k], 0);
  return {
    periodo: p,
    linhas,
    totais: { total_10: soma('total_10'), iva_10: soma('iva_10'), total_5: soma('total_5'), iva_5: soma('iva_5'), exento: soma('exento'), total: soma('total'), iva: soma('iva_10') + soma('iva_5') },
  };
}

export const rotasErp: Modulo = (app, { db, config, agora }) => {
  const hoje = () => hojeAsuncion(agora());
  const nomeAutor = (u: Parameters<typeof ator>[0]) => ator(u);

  // --- Empresa e timbrado ---

  app.get('/v1/erp/empresa', async (req) => {
    exigirPermissao(req, 'erp.ver');
    return { empresa: (await db.query('select * from erp_empresa where id = 1')).rows[0] ?? null };
  });

  app.put('/v1/erp/empresa', async (req) => {
    const u = exigirPermissao(req, 'erp.fiscal');
    const d = validar(empresa, req.body);
    const ruc = lerRuc(d.ruc);
    if (!ruc) throw invalido('RUC inválido: confira o número e o dígito verificador');
    if (d.timbrado_fim <= d.timbrado_inicio) throw invalido('a vigência do timbrado termina antes de começar');
    return db.tx(async (q) => {
      const atual = (await q.query<{ proximo_numero: number }>('select proximo_numero from erp_empresa where id = 1 for update')).rows[0];
      if (atual && d.proximo_numero && d.proximo_numero < atual.proximo_numero) throw conflito('numeracao-retroativa', 'a numeração não pode voltar');
      const r = await q.query(
        `insert into erp_empresa (id, ruc, dv, razao_social, nome_fantasia, endereco, atividade, timbrado, timbrado_inicio, timbrado_fim, estabelecimento, ponto_expedicao, proximo_numero)
         values (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, coalesce($12, 1))
         on conflict (id) do update set ruc = excluded.ruc, dv = excluded.dv, razao_social = excluded.razao_social, nome_fantasia = excluded.nome_fantasia,
           endereco = excluded.endereco, atividade = excluded.atividade, timbrado = excluded.timbrado, timbrado_inicio = excluded.timbrado_inicio,
           timbrado_fim = excluded.timbrado_fim, estabelecimento = excluded.estabelecimento, ponto_expedicao = excluded.ponto_expedicao,
           proximo_numero = coalesce($12, erp_empresa.proximo_numero),
           proximo_numero_nc = case when excluded.timbrado <> erp_empresa.timbrado then 1 else erp_empresa.proximo_numero_nc end,
           atualizado_em = now()
         returning *`,
        [ruc.numero, ruc.dv, d.razao_social, d.nome_fantasia ?? null, d.endereco ?? null, d.atividade ?? null, d.timbrado, d.timbrado_inicio, d.timbrado_fim, d.estabelecimento, d.ponto_expedicao, d.proximo_numero ?? null],
      );
      await auditar(q, u, 'erp.empresa', 'erp_empresa', '1', d);
      return r.rows[0];
    });
  });

  // --- Cadastros ---

  app.get('/v1/erp/terceiros', async (req) => {
    exigirPermissao(req, 'erp.ver');
    const f = validar(z.object({ papel: z.enum(['cliente', 'fornecedor']).optional(), busca: z.string().max(80).optional() }), req.query);
    const cond = ['true'];
    const p: unknown[] = [];
    if (f.papel) cond.push(f.papel);
    if (f.busca) (p.push(`%${f.busca}%`), cond.push(`(razao_social ilike $1 or nome_fantasia ilike $1 or documento ilike $1)`));
    return { terceiros: (await db.query(`select t.*, l.nome as loja_nome from erp_terceiro t left join loja l on l.id = t.loja_id where ${cond.join(' and ')} order by razao_social limit 500`, p)).rows };
  });

  app.post('/v1/erp/terceiros', async (req, rep) => {
    const u = exigirPermissao(req, 'erp.fiscal');
    const d = validar(terceiro, req.body);
    let documento = d.documento.replace(/\s/g, '');
    let dv: number | null = null;
    if (d.tipo_documento === 'RUC') {
      const r = lerRuc(documento);
      if (!r) throw invalido('RUC inválido: confira o número e o dígito verificador');
      documento = r.numero;
      dv = r.dv;
    }
    if (d.loja_id && !d.cliente) throw invalido('loja vinculada precisa ser cliente (faturas de comissão)');
    const r = await db.tx(async (q) => {
      if (d.loja_id && !(await q.query('select 1 from loja where id = $1', [d.loja_id])).rows[0]) throw naoEncontrado('loja');
      const x = await q.query(
        `insert into erp_terceiro (tipo_documento, documento, dv, razao_social, nome_fantasia, email, telefone, endereco, cliente, fornecedor, loja_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
        [d.tipo_documento, documento, dv, d.razao_social, d.nome_fantasia ?? null, d.email ?? null, d.telefone ?? null, d.endereco ?? null, d.cliente, d.fornecedor, d.loja_id ?? null],
      );
      await auditar(q, u, 'erp.terceiro.criar', 'erp_terceiro', (x.rows[0] as { id: string }).id, d);
      return x.rows[0];
    });
    return rep.code(201).send(r);
  });

  app.patch<{ Params: { id: string } }>('/v1/erp/terceiros/:id', async (req) => {
    const u = exigirPermissao(req, 'erp.fiscal');
    const d = validar(z.object({ razao_social: z.string().trim().min(2).max(200).optional(), nome_fantasia: z.string().max(200).nullable().optional(), email: z.email().nullable().optional(), telefone: z.string().max(40).nullable().optional(), endereco: z.string().max(300).nullable().optional(), cliente: z.boolean().optional(), fornecedor: z.boolean().optional(), ativo: z.boolean().optional() }), req.body);
    const campos = Object.entries(d).filter(([, v]) => v !== undefined);
    if (!campos.length) throw invalido('nada para alterar');
    return db.tx(async (q) => {
      const r = await q.query(`update erp_terceiro set ${campos.map(([k], i) => `${k} = $${i + 2}`).join(', ')} where id = $1 returning *`, [z.uuid().parse(req.params.id), ...campos.map(([, v]) => v)]);
      if (!r.rows[0]) throw naoEncontrado('cadastro');
      await auditar(q, u, 'erp.terceiro.alterar', 'erp_terceiro', req.params.id, d);
      return r.rows[0];
    });
  });

  app.get('/v1/erp/depositos', async (req) => {
    exigirPermissao(req, 'erp.ver');
    return { depositos: (await db.query('select * from erp_deposito order by codigo')).rows };
  });

  app.post('/v1/erp/depositos', async (req, rep) => {
    const u = exigirPermissao(req, 'erp.estoque');
    const d = validar(z.object({ codigo: z.string().trim().min(1).max(20), nome: z.string().trim().min(2).max(120) }), req.body);
    const r = await db.tx(async (q) => {
      const x = await q.query('insert into erp_deposito (codigo, nome) values ($1, $2) returning *', [d.codigo.toUpperCase(), d.nome]);
      await auditar(q, u, 'erp.deposito.criar', 'erp_deposito', (x.rows[0] as { id: string }).id, d);
      return x.rows[0];
    });
    return rep.code(201).send(r);
  });

  app.get('/v1/erp/itens', async (req) => {
    exigirPermissao(req, 'erp.ver');
    const f = validar(z.object({ busca: z.string().max(80).optional() }), req.query);
    const r = await db.query(
      `select i.*, coalesce((select sum(quantidade) from erp_saldo s where s.item_id = i.id), 0)::float8 as saldo_total
       from erp_item i ${f.busca ? 'where i.codigo ilike $1 or i.descricao ilike $1' : ''} order by i.ativo desc, i.descricao limit 1000`,
      f.busca ? [`%${f.busca}%`] : [],
    );
    return { itens: r.rows };
  });

  app.post('/v1/erp/itens', async (req, rep) => {
    const u = exigirPermissao(req, 'erp.estoque', 'erp.fiscal');
    const d = validar(item, req.body);
    const r = await db.tx(async (q) => {
      const x = await q.query(
        `insert into erp_item (codigo, descricao, unidade, tipo, iva, controla_estoque, estoque_minimo, preco_venda_pyg) values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
        [d.codigo.toUpperCase(), d.descricao, d.unidade, d.tipo, d.iva, d.controla_estoque, d.estoque_minimo, d.preco_venda_pyg ?? null],
      );
      await auditar(q, u, 'erp.item.criar', 'erp_item', (x.rows[0] as { id: string }).id, d);
      return x.rows[0];
    });
    return rep.code(201).send(r);
  });

  app.patch<{ Params: { id: string } }>('/v1/erp/itens/:id', async (req) => {
    const u = exigirPermissao(req, 'erp.estoque', 'erp.fiscal');
    const d = validar(z.object({ descricao: z.string().trim().min(2).max(200).optional(), iva: z.enum(['10', '5', 'EXENTO']).optional(), estoque_minimo: z.number().min(0).optional(), preco_venda_pyg: z.number().int().min(0).nullable().optional(), ativo: z.boolean().optional() }), req.body);
    const campos = Object.entries(d).filter(([, v]) => v !== undefined);
    if (!campos.length) throw invalido('nada para alterar');
    return db.tx(async (q) => {
      const r = await q.query(`update erp_item set ${campos.map(([k], i) => `${k} = $${i + 2}`).join(', ')} where id = $1 returning *`, [z.uuid().parse(req.params.id), ...campos.map(([, v]) => v)]);
      if (!r.rows[0]) throw naoEncontrado('item');
      await auditar(q, u, 'erp.item.alterar', 'erp_item', req.params.id, d);
      return r.rows[0];
    });
  });

  // --- Estoque ---

  app.get('/v1/erp/estoque/saldos', async (req) => {
    exigirPermissao(req, 'erp.ver');
    const f = validar(z.object({ deposito_id: z.uuid().optional(), abaixo_minimo: z.coerce.boolean().optional() }), req.query);
    const r = await db.query(
      `select i.id as item_id, i.codigo, i.descricao, i.unidade, i.estoque_minimo, i.custo_medio_pyg, d.id as deposito_id, d.nome as deposito_nome,
         coalesce(s.quantidade, 0)::float8 as quantidade, round(coalesce(s.quantidade, 0) * i.custo_medio_pyg)::bigint as valor_pyg,
         (select coalesce(sum(quantidade), 0) from erp_saldo x where x.item_id = i.id)::float8 as total_item
       from erp_item i cross join erp_deposito d left join erp_saldo s on s.item_id = i.id and s.deposito_id = d.id
       where i.controla_estoque and i.ativo and d.ativo ${f.deposito_id ? 'and d.id = $1' : ''}
         and (coalesce(s.quantidade, 0) <> 0 or ${f.deposito_id ? 'true' : 'false'})
       order by i.descricao, d.codigo`,
      f.deposito_id ? [f.deposito_id] : [],
    );
    const linhas = f.abaixo_minimo ? r.rows.filter((x) => Number((x as { total_item: number }).total_item) < Number((x as { estoque_minimo: number }).estoque_minimo)) : r.rows;
    const abaixo = await db.query<{ n: number }>(
      `select count(*)::int as n from erp_item i where i.controla_estoque and i.ativo and i.estoque_minimo > 0
         and coalesce((select sum(quantidade) from erp_saldo s where s.item_id = i.id), 0) < i.estoque_minimo`,
    );
    return { saldos: linhas, abaixo_minimo: abaixo.rows[0]!.n };
  });

  // Kardex: movimentos do item (ou do depósito), do mais novo para o mais antigo.
  app.get('/v1/erp/estoque/movimentos', async (req) => {
    exigirPermissao(req, 'erp.ver');
    const f = validar(z.object({ item_id: z.uuid().optional(), deposito_id: z.uuid().optional(), limite: z.coerce.number().int().min(1).max(1000).default(200) }), req.query);
    const cond: string[] = [];
    const p: unknown[] = [];
    if (f.item_id) (p.push(f.item_id), cond.push(`m.item_id = $${p.length}`));
    if (f.deposito_id) (p.push(f.deposito_id), cond.push(`m.deposito_id = $${p.length}`));
    p.push(f.limite);
    const r = await db.query(
      `select m.*, i.codigo, i.descricao, d.nome as deposito_nome from erp_movimento m join erp_item i on i.id = m.item_id join erp_deposito d on d.id = m.deposito_id
       ${cond.length ? 'where ' + cond.join(' and ') : ''} order by m.seq desc limit $${p.length}`,
      p,
    );
    return { movimentos: r.rows };
  });

  app.post('/v1/erp/estoque/movimentos', async (req, rep) => {
    const u = exigirPermissao(req, 'erp.estoque');
    const d = validar(movimentoManual, req.body);
    const r = await db.tx(async (q) => {
      const autor = nomeAutor(u);
      const x =
        d.tipo === 'TRANSFERENCIA'
          ? await transferir(q, { itemId: d.item_id, origemId: d.deposito_id, destinoId: d.destino_id ?? invalidoDestino(), quantidade: d.quantidade, observacao: d.observacao, autor })
          : await movimentar(q, {
              itemId: d.item_id,
              depositoId: d.deposito_id,
              tipo: d.tipo,
              quantidade: d.tipo === 'AJUSTE_ENTRADA' ? d.quantidade : -d.quantidade,
              custoUnitarioPyg: d.custo_unitario_pyg,
              observacao: d.observacao,
              autor,
            });
      await auditar(q, u, `erp.estoque.${d.tipo.toLowerCase()}`, 'erp_item', d.item_id, d);
      return x;
    });
    return rep.code(201).send(r);
  });

  app.get('/v1/erp/inventarios', async (req) => {
    exigirPermissao(req, 'erp.ver');
    return {
      inventarios: (
        await db.query(
          `select v.*, d.nome as deposito_nome, (select count(*)::int from erp_inventario_item x where x.inventario_id = v.id) as itens,
             (select count(*)::int from erp_inventario_item x where x.inventario_id = v.id and x.quantidade_contada is not null) as contados
           from erp_inventario v join erp_deposito d on d.id = v.deposito_id order by v.aberto_em desc limit 50`,
        )
      ).rows,
    };
  });

  app.post('/v1/erp/inventarios', async (req, rep) => {
    const u = exigirPermissao(req, 'erp.estoque');
    const d = validar(z.object({ deposito_id: z.uuid(), observacao: z.string().max(300).optional() }), req.body);
    const r = await db.tx((q) => abrirInventario(q, d.deposito_id, nomeAutor(u), d.observacao));
    return rep.code(201).send(r);
  });

  app.get<{ Params: { id: string } }>('/v1/erp/inventarios/:id', async (req) => {
    exigirPermissao(req, 'erp.ver');
    const id = z.uuid().parse(req.params.id);
    const v = (await db.query('select v.*, d.nome as deposito_nome from erp_inventario v join erp_deposito d on d.id = v.deposito_id where v.id = $1', [id])).rows[0];
    if (!v) throw naoEncontrado('inventário');
    const itens = (
      await db.query(
        `select x.*, i.codigo, i.descricao, i.unidade from erp_inventario_item x join erp_item i on i.id = x.item_id where x.inventario_id = $1 order by i.descricao`,
        [id],
      )
    ).rows;
    return { inventario: v, itens };
  });

  app.patch<{ Params: { id: string } }>('/v1/erp/inventarios/:id/contagem', async (req) => {
    exigirPermissao(req, 'erp.estoque');
    const id = z.uuid().parse(req.params.id);
    const d = validar(z.object({ itens: z.array(z.object({ item_id: z.uuid(), quantidade_contada: z.number().min(0).nullable() })).min(1).max(2000) }), req.body);
    return db.tx(async (q) => {
      const v = (await q.query<{ estado: string }>('select estado from erp_inventario where id = $1 for update', [id])).rows[0];
      if (!v) throw naoEncontrado('inventário');
      if (v.estado !== 'ABERTO') throw conflito('inventario-fechado', 'inventário fechado');
      for (const i of d.itens) {
        await q.query('update erp_inventario_item set quantidade_contada = $3 where inventario_id = $1 and item_id = $2', [id, i.item_id, i.quantidade_contada]);
      }
      return { ok: true };
    });
  });

  app.post<{ Params: { id: string } }>('/v1/erp/inventarios/:id/fechar', async (req) => {
    const u = exigirPermissao(req, 'erp.estoque');
    const id = z.uuid().parse(req.params.id);
    return db.tx(async (q) => {
      const r = await fecharInventario(q, id, nomeAutor(u));
      await auditar(q, u, 'erp.inventario.fechar', 'erp_inventario', id, r);
      return r;
    });
  });

  // --- Compras ---

  app.get('/v1/erp/compras', async (req) => {
    exigirPermissao(req, 'erp.ver');
    return {
      compras: (
        await db.query(`select c.*, t.razao_social as fornecedor, d.nome as deposito_nome from erp_compra c join erp_terceiro t on t.id = c.fornecedor_id left join erp_deposito d on d.id = c.deposito_id order by c.data desc, c.criado_em desc limit 300`)
      ).rows,
    };
  });

  app.get<{ Params: { id: string } }>('/v1/erp/compras/:id', async (req) => {
    exigirPermissao(req, 'erp.ver');
    const id = z.uuid().parse(req.params.id);
    const c = (await db.query('select c.*, t.razao_social as fornecedor from erp_compra c join erp_terceiro t on t.id = c.fornecedor_id where c.id = $1', [id])).rows[0];
    if (!c) throw naoEncontrado('compra');
    return { compra: c, itens: (await db.query('select * from erp_compra_item where compra_id = $1', [id])).rows, titulos: (await db.query('select * from erp_titulo where compra_id = $1 order by parcela', [id])).rows };
  });

  app.post('/v1/erp/compras', async (req, rep) => {
    const u = exigirPermissao(req, 'erp.fiscal');
    const d = validar(novaCompra, req.body);
    const c = await db.tx(async (q) => {
      const c = await registrarCompra(q, d, nomeAutor(u));
      await auditar(q, u, 'erp.compra.registrar', 'erp_compra', c.id, { numero: d.numero, fornecedor: d.fornecedor_id });
      return c;
    });
    return rep.code(201).send(c);
  });

  app.post<{ Params: { id: string } }>('/v1/erp/compras/:id/anular', async (req) => {
    const u = exigirPermissao(req, 'erp.fiscal');
    const id = z.uuid().parse(req.params.id);
    await db.tx(async (q) => {
      await anularCompra(q, id, nomeAutor(u));
      await auditar(q, u, 'erp.compra.anular', 'erp_compra', id);
    });
    return { ok: true };
  });

  // --- Faturas e notas de crédito ---

  app.get('/v1/erp/faturas', async (req) => {
    exigirPermissao(req, 'erp.ver');
    return {
      faturas: (
        await db.query(
          `select f.*, t.razao_social as cliente, o.numero_formatado as origem_numero,
             (select coalesce(sum(saldo), 0)::bigint from erp_titulo x where x.fatura_id = f.id and x.tipo = 'RECEBER' and x.estado in ('ABERTO', 'PARCIAL')) as a_receber
           from erp_fatura f join erp_terceiro t on t.id = f.terceiro_id left join erp_fatura o on o.id = f.fatura_origem_id
           order by f.data desc, f.criado_em desc limit 300`,
        )
      ).rows,
    };
  });

  app.get<{ Params: { id: string } }>('/v1/erp/faturas/:id', async (req) => {
    exigirPermissao(req, 'erp.ver');
    const id = z.uuid().parse(req.params.id);
    const f = (await db.query('select f.*, t.razao_social as cliente, t.tipo_documento, t.documento, t.dv from erp_fatura f join erp_terceiro t on t.id = f.terceiro_id where f.id = $1', [id])).rows[0];
    if (!f) throw naoEncontrado('fatura');
    return {
      fatura: f,
      empresa: (await db.query('select * from erp_empresa where id = 1')).rows[0] ?? null,
      itens: (await db.query('select * from erp_fatura_item where fatura_id = $1', [id])).rows,
      titulos: (await db.query('select * from erp_titulo where fatura_id = $1 order by parcela', [id])).rows,
      notas: (await db.query(`select id, numero_formatado, data, total, estado from erp_fatura where fatura_origem_id = $1 order by numero`, [id])).rows,
    };
  });

  app.post('/v1/erp/faturas', async (req, rep) => {
    const u = exigirPermissao(req, 'erp.fiscal');
    const d = validar(novaFatura, req.body);
    const f = await db.tx(async (q) => {
      const f = await emitirFatura(q, d, nomeAutor(u));
      await auditar(q, u, 'erp.fatura.emitir', 'erp_fatura', f.id, { numero: f.numero_formatado });
      return f;
    });
    return rep.code(201).send(f);
  });

  app.post<{ Params: { id: string } }>('/v1/erp/faturas/:id/anular', async (req) => {
    const u = exigirPermissao(req, 'erp.fiscal');
    const id = z.uuid().parse(req.params.id);
    await db.tx(async (q) => {
      await anularFatura(q, id, nomeAutor(u));
      await auditar(q, u, 'erp.fatura.anular', 'erp_fatura', id);
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/v1/erp/faturas/:id/nota-credito', async (req, rep) => {
    const u = exigirPermissao(req, 'erp.fiscal');
    const id = z.uuid().parse(req.params.id);
    const d = validar(novaNotaCredito, req.body);
    const n = await db.tx(async (q) => {
      const n = await emitirNotaCredito(q, id, d, nomeAutor(u));
      await auditar(q, u, 'erp.nota_credito.emitir', 'erp_fatura', (n as { id: string }).id, { fatura: id, motivo: d.motivo });
      return n;
    });
    return rep.code(201).send(n);
  });

  // Faturas de comissão do mês para as lojas, a partir do ledger do Pick & Go.
  app.post('/v1/erp/faturas/comissoes', async (req) => {
    const u = exigirPermissao(req, 'erp.fiscal');
    const d = validar(z.object({ periodo }), req.body);
    return db.tx(async (q) => {
      const r = await faturarComissoes(q, d.periodo, config, hoje(), nomeAutor(u));
      await auditar(q, u, 'erp.faturas.comissoes', 'erp_fatura', d.periodo, { emitidas: r.emitidas.length });
      return r;
    });
  });

  // --- Contas a pagar e a receber ---

  app.get('/v1/erp/titulos', async (req) => {
    exigirPermissao(req, 'erp.ver');
    const f = validar(z.object({ tipo: z.enum(['PAGAR', 'RECEBER']).optional(), situacao: z.enum(['ABERTOS', 'VENCIDOS', 'QUITADOS', 'TODOS']).default('ABERTOS'), terceiro_id: z.uuid().optional() }), req.query);
    const cond: string[] = [];
    const p: unknown[] = [hoje()];
    if (f.tipo) (p.push(f.tipo), cond.push(`x.tipo = $${p.length}`));
    if (f.terceiro_id) (p.push(f.terceiro_id), cond.push(`x.terceiro_id = $${p.length}`));
    if (f.situacao === 'ABERTOS') cond.push(`x.estado in ('ABERTO', 'PARCIAL')`);
    if (f.situacao === 'VENCIDOS') cond.push(`x.estado in ('ABERTO', 'PARCIAL') and x.vencimento < $1`);
    if (f.situacao === 'QUITADOS') cond.push(`x.estado = 'QUITADO'`);
    const r = await db.query(
      `select x.*, t.razao_social, (x.estado in ('ABERTO', 'PARCIAL') and x.vencimento < $1) as vencido, ($1::date - x.vencimento) as dias_atraso
       from erp_titulo x join erp_terceiro t on t.id = x.terceiro_id ${cond.length ? 'where ' + cond.join(' and ') : ''}
       order by x.vencimento, x.parcela limit 500`,
      p,
    );
    return { titulos: r.rows };
  });

  app.get<{ Params: { id: string } }>('/v1/erp/titulos/:id', async (req) => {
    exigirPermissao(req, 'erp.ver');
    const id = z.uuid().parse(req.params.id);
    const t = (await db.query('select x.*, t.razao_social from erp_titulo x join erp_terceiro t on t.id = x.terceiro_id where x.id = $1', [id])).rows[0];
    if (!t) throw naoEncontrado('título');
    return { titulo: t, baixas: (await db.query('select * from erp_baixa where titulo_id = $1 order by criado_em', [id])).rows };
  });

  // Conta avulsa (aluguel, energia, serviço): sem documento fiscal registrado aqui.
  app.post('/v1/erp/titulos', async (req, rep) => {
    const u = exigirPermissao(req, 'erp.financeiro');
    const d = validar(tituloManual, req.body);
    const ids = await db.tx(async (q) => {
      const t = (await q.query<{ cliente: boolean; fornecedor: boolean }>('select cliente, fornecedor from erp_terceiro where id = $1', [d.terceiro_id])).rows[0];
      if (!t) throw naoEncontrado('cadastro');
      const ids = await criarTitulos(q, { tipo: d.tipo, terceiroId: d.terceiro_id, descricao: d.descricao, emissao: d.emissao, moeda: d.moeda, parcelas: parcelasIguais(d.valor, d.parcelas, d.primeiro_vencimento, d.intervalo_dias) });
      await auditar(q, u, 'erp.titulo.criar', 'erp_titulo', ids[0]!, d);
      return ids;
    });
    return rep.code(201).send({ ids });
  });

  app.post<{ Params: { id: string } }>('/v1/erp/titulos/:id/baixas', async (req, rep) => {
    const u = exigirPermissao(req, 'erp.financeiro');
    const d = validar(baixa, req.body);
    const id = z.uuid().parse(req.params.id);
    const b = await db.tx(async (q) => {
      const b = await baixar(q, id, d, nomeAutor(u));
      await auditar(q, u, 'erp.titulo.baixa', 'erp_titulo', id, d);
      return b;
    });
    return rep.code(201).send(b);
  });

  app.post<{ Params: { id: string } }>('/v1/erp/baixas/:id/estornar', async (req) => {
    const u = exigirPermissao(req, 'erp.financeiro');
    const id = z.uuid().parse(req.params.id);
    return db.tx(async (q) => {
      const r = await estornarBaixa(q, id);
      await auditar(q, u, 'erp.baixa.estornar', 'erp_baixa', id);
      return r;
    });
  });

  // --- Livros do IVA ---

  app.get<{ Params: { tipo: string } }>('/v1/erp/livros/:tipo', async (req, rep) => {
    exigirPermissao(req, 'erp.fiscal', 'erp.financeiro');
    const tipo = z.enum(['ventas', 'compras']).parse(req.params.tipo);
    const f = validar(z.object({ periodo, formato: z.enum(['json', 'csv']).default('json') }), req.query);
    const l = await livro(db, tipo, f.periodo);
    if (f.formato === 'json') return l;
    // Colunas na linha da RG 90 (registro de comprovantes); validar o leiaute com o contador.
    const cab = 'tipo_identificacion;identificacion;razon_social;tipo_comprobante;fecha;timbrado;numero;gravado_10;gravado_5;exento;total;condicion;moneda_extranjera;anulado';
    const linhas = l.linhas.map((x) =>
      [x.tipo_documento, x.dv !== null ? `${x.documento}-${x.dv}` : x.documento, x.razao_social, x.comprovante, dataBr(x.data), x.timbrado, x.numero, x.pyg.total_10, x.pyg.total_5, x.pyg.exento, x.pyg.total, x.condicao, x.moeda === 'PYG' ? 'N' : 'S', x.anulado ? 'S' : 'N']
        .map(csv)
        .join(';'),
    );
    return rep.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="libro-${tipo}-${f.periodo}.csv"`).send([cab, ...linhas].join('\n'));
  });

  // --- Painel ---

  app.get('/v1/erp/painel', async (req) => {
    exigirPermissao(req, 'erp.ver');
    const p = validar(z.object({ periodo: periodo.optional() }), req.query).periodo ?? hoje().slice(0, 7);
    const titulos = await db.query<{ tipo: string; moeda: string; aberto: number; vencido: number; vence_30: number }>(
      `select tipo, moeda, sum(saldo)::bigint as aberto,
         sum(case when vencimento < $1 then saldo else 0 end)::bigint as vencido,
         sum(case when vencimento >= $1 and vencimento < $1::date + 30 then saldo else 0 end)::bigint as vence_30
       from erp_titulo where estado in ('ABERTO', 'PARCIAL') group by tipo, moeda`,
      [hoje()],
    );
    const vendas = await livro(db, 'ventas', p);
    const compras = await livro(db, 'compras', p);
    const estoque = await db.query<{ valor: number; itens: number }>(
      `select coalesce(round(sum(s.quantidade * i.custo_medio_pyg)), 0)::bigint as valor, count(distinct i.id)::int as itens
       from erp_saldo s join erp_item i on i.id = s.item_id where s.quantidade > 0`,
    );
    const abaixo = await db.query<{ n: number }>(
      `select count(*)::int as n from erp_item i where i.controla_estoque and i.ativo and i.estoque_minimo > 0
         and coalesce((select sum(quantidade) from erp_saldo s where s.item_id = i.id), 0) < i.estoque_minimo`,
    );
    const empresaOk = (await db.query<{ timbrado_fim: string }>('select timbrado_fim from erp_empresa where id = 1')).rows[0];
    return {
      periodo: p,
      empresa_configurada: !!empresaOk,
      timbrado_fim: empresaOk?.timbrado_fim ?? null,
      titulos: titulos.rows,
      faturado_pyg: vendas.totais.total,
      comprado_pyg: compras.totais.total,
      iva_debito_pyg: vendas.totais.iva,
      iva_credito_pyg: compras.totais.iva,
      iva_a_pagar_pyg: vendas.totais.iva - compras.totais.iva,
      estoque_valor_pyg: estoque.rows[0]!.valor,
      estoque_itens: estoque.rows[0]!.itens,
      itens_abaixo_minimo: abaixo.rows[0]!.n,
    };
  });
};

function invalidoDestino(): never {
  throw invalido('transferência precisa do depósito de destino');
}
