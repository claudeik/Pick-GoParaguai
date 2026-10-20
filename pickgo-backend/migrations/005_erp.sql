-- ERP do Portal Paraguai (controle interno): empresa e timbrado, cadastros,
-- estoque, compras, faturas, contas a pagar e a receber e livros do IVA.
-- Valores em unidades mínimas da moeda: guaranis (PYG) ou centavos de dólar (USD).
-- Os livros e o estoque ficam em guaranis, com o tipo de câmbio de cada documento.

create table erp_empresa (
  id integer primary key default 1 check (id = 1),
  ruc text not null,
  dv integer not null,
  razao_social text not null,
  nome_fantasia text,
  endereco text,
  atividade text,
  timbrado text not null,
  timbrado_inicio date not null,
  timbrado_fim date not null,
  estabelecimento text not null default '001',
  ponto_expedicao text not null default '001',
  proximo_numero integer not null default 1,
  proximo_numero_nc integer not null default 1,
  atualizado_em timestamptz not null default now()
);

-- Cliente ou fornecedor. Loja do Pick & Go vira cliente do Portal (faturas de comissão).
create table erp_terceiro (
  id uuid primary key default gen_random_uuid(),
  tipo_documento text not null check (tipo_documento in ('RUC', 'CI', 'CPF', 'CNPJ', 'PASSAPORTE', 'EXTERIOR')),
  documento text not null,
  dv integer,
  razao_social text not null,
  nome_fantasia text,
  email text,
  telefone text,
  endereco text,
  cliente boolean not null default false,
  fornecedor boolean not null default false,
  loja_id text unique references loja(id),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (tipo_documento, documento),
  check (cliente or fornecedor)
);

create table erp_deposito (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  ativo boolean not null default true
);

create table erp_item (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  descricao text not null,
  unidade text not null default 'UN' check (unidade in ('UN', 'CX', 'KG', 'L', 'M', 'PCT', 'SRV')),
  tipo text not null check (tipo in ('MERCADORIA', 'INSUMO', 'SERVICO')),
  iva text not null check (iva in ('10', '5', 'EXENTO')),
  controla_estoque boolean not null,
  estoque_minimo numeric(14, 3) not null default 0,
  -- Custo médio ponderado em guaranis, sem o IVA recuperável.
  custo_medio_pyg numeric(18, 4) not null default 0,
  preco_venda_pyg bigint,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  check (not (tipo = 'SERVICO' and controla_estoque))
);

create table erp_saldo (
  item_id uuid not null references erp_item(id),
  deposito_id uuid not null references erp_deposito(id),
  quantidade numeric(14, 3) not null default 0 check (quantidade >= 0),
  primary key (item_id, deposito_id)
);

-- Movimentação de estoque: só inserção; correção é um movimento novo.
create table erp_movimento (
  id uuid primary key default gen_random_uuid(),
  seq bigserial unique,
  item_id uuid not null references erp_item(id),
  deposito_id uuid not null references erp_deposito(id),
  tipo text not null check (tipo in ('ENTRADA_COMPRA', 'SAIDA_VENDA', 'DEVOLUCAO_VENDA', 'ESTORNO_COMPRA', 'AJUSTE_ENTRADA', 'AJUSTE_SAIDA', 'CONSUMO_INTERNO', 'TRANSFERENCIA_SAIDA', 'TRANSFERENCIA_ENTRADA', 'INVENTARIO')),
  quantidade numeric(14, 3) not null check (quantidade <> 0),
  custo_unitario_pyg numeric(18, 4) not null,
  saldo_apos numeric(14, 3) not null,
  custo_medio_apos numeric(18, 4) not null,
  documento_tipo text,
  documento_id uuid,
  observacao text,
  autor text not null,
  criado_em timestamptz not null default clock_timestamp()
);
create index erp_movimento_item_idx on erp_movimento (item_id, seq);
create trigger erp_movimento_sem_update before update or delete on erp_movimento
  for each row execute function lancamento_imutavel();

create table erp_inventario (
  id uuid primary key default gen_random_uuid(),
  deposito_id uuid not null references erp_deposito(id),
  estado text not null default 'ABERTO' check (estado in ('ABERTO', 'FECHADO', 'CANCELADO')),
  observacao text,
  aberto_por text not null,
  aberto_em timestamptz not null default now(),
  fechado_por text,
  fechado_em timestamptz
);
-- Um inventário aberto por depósito de cada vez.
create unique index erp_inventario_aberto on erp_inventario (deposito_id) where estado = 'ABERTO';

create table erp_inventario_item (
  inventario_id uuid not null references erp_inventario(id),
  item_id uuid not null references erp_item(id),
  quantidade_sistema numeric(14, 3) not null,
  quantidade_contada numeric(14, 3) check (quantidade_contada >= 0),
  primary key (inventario_id, item_id)
);

-- Compra (fatura do fornecedor): entrada no estoque, contas a pagar e livro de compras.
create table erp_compra (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references erp_terceiro(id),
  timbrado text not null,
  numero text not null check (numero ~ '^\d{3}-\d{3}-\d{7}$'),
  data date not null,
  condicao text not null check (condicao in ('CONTADO', 'CREDITO')),
  moeda text not null check (moeda in ('PYG', 'USD')),
  tipo_cambio integer not null check (tipo_cambio > 0),
  deposito_id uuid references erp_deposito(id),
  total_10 bigint not null default 0,
  iva_10 bigint not null default 0,
  total_5 bigint not null default 0,
  iva_5 bigint not null default 0,
  exento bigint not null default 0,
  total bigint not null,
  estado text not null default 'REGISTRADA' check (estado in ('REGISTRADA', 'ANULADA')),
  observacao text,
  autor text not null,
  criado_em timestamptz not null default now(),
  unique (fornecedor_id, timbrado, numero)
);

create table erp_compra_item (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references erp_compra(id),
  item_id uuid not null references erp_item(id),
  descricao text not null,
  quantidade numeric(14, 3) not null check (quantidade > 0),
  preco_unitario bigint not null check (preco_unitario >= 0),
  iva text not null,
  total bigint not null
);

-- Fatura ou nota de crédito emitida pelo Portal.
create table erp_fatura (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('FACTURA', 'NOTA_CREDITO')),
  terceiro_id uuid not null references erp_terceiro(id),
  fatura_origem_id uuid references erp_fatura(id),
  timbrado text not null,
  estabelecimento text not null,
  ponto_expedicao text not null,
  numero integer not null,
  numero_formatado text not null,
  data date not null,
  condicao text not null check (condicao in ('CONTADO', 'CREDITO')),
  moeda text not null check (moeda in ('PYG', 'USD')),
  tipo_cambio integer not null check (tipo_cambio > 0),
  deposito_id uuid references erp_deposito(id),
  total_10 bigint not null default 0,
  iva_10 bigint not null default 0,
  total_5 bigint not null default 0,
  iva_5 bigint not null default 0,
  exento bigint not null default 0,
  total bigint not null,
  estado text not null default 'EMITIDA' check (estado in ('EMITIDA', 'ANULADA')),
  origem text not null default 'MANUAL' check (origem in ('MANUAL', 'COMISSAO')),
  periodo text,
  observacao text,
  autor text not null,
  criado_em timestamptz not null default now(),
  unique (timbrado, estabelecimento, ponto_expedicao, tipo, numero)
);
-- Uma fatura de comissão por loja e mês.
create unique index erp_fatura_comissao_unica on erp_fatura (terceiro_id, periodo) where origem = 'COMISSAO' and estado = 'EMITIDA';

create table erp_fatura_item (
  id uuid primary key default gen_random_uuid(),
  fatura_id uuid not null references erp_fatura(id),
  item_id uuid references erp_item(id),
  -- Na nota de crédito: a linha da fatura que está sendo creditada.
  item_origem_id uuid references erp_fatura_item(id),
  descricao text not null,
  quantidade numeric(14, 3) not null check (quantidade > 0),
  preco_unitario bigint not null check (preco_unitario >= 0),
  iva text not null,
  total bigint not null
);

-- Contas a pagar e a receber.
create table erp_titulo (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('PAGAR', 'RECEBER')),
  terceiro_id uuid not null references erp_terceiro(id),
  compra_id uuid references erp_compra(id),
  fatura_id uuid references erp_fatura(id),
  descricao text not null,
  parcela integer not null default 1,
  parcelas integer not null default 1,
  emissao date not null,
  vencimento date not null,
  moeda text not null check (moeda in ('PYG', 'USD')),
  valor bigint not null check (valor > 0),
  saldo bigint not null check (saldo >= 0),
  estado text not null default 'ABERTO' check (estado in ('ABERTO', 'PARCIAL', 'QUITADO', 'CANCELADO')),
  criado_em timestamptz not null default now()
);
create index erp_titulo_estado_idx on erp_titulo (tipo, estado, vencimento);

create table erp_baixa (
  id uuid primary key default gen_random_uuid(),
  titulo_id uuid not null references erp_titulo(id),
  data date not null,
  valor bigint not null check (valor > 0),
  meio text not null check (meio in ('TRANSFERENCIA', 'EFECTIVO', 'CHEQUE', 'PIX', 'TARJETA', 'RETENCAO_SPLIT')),
  observacao text,
  -- Pagamento à vista registrado junto com o documento (estornado se o documento for anulado).
  automatica boolean not null default false,
  estornada boolean not null default false,
  autor text not null,
  criado_em timestamptz not null default now()
);
create index erp_baixa_titulo_idx on erp_baixa (titulo_id);
