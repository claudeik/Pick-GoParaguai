-- Fase 1: catálogo, pedidos, Pix, ledger, retirada, central e ocorrências.
-- Valores monetários em centavos (bigint). Nada de float.

create table loja (
  id text primary key,
  nome text not null,
  ponto_retirada_tipo text not null default 'DENTRO' check (ponto_retirada_tipo in ('DENTRO', 'ANEXO')),
  ponto_retirada_descricao text,
  horario_abertura time not null default '08:00',
  horario_fechamento time not null default '18:00',
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create table produto (
  id uuid primary key default gen_random_uuid(),
  loja_id text not null references loja(id),
  nome text not null,
  categoria text not null,
  preco_usd_centavos bigint not null check (preco_usd_centavos > 0),
  estoque integer not null check (estoque >= 0),
  foto_url text,
  codigo_barras text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (loja_id, codigo_barras)
);
create index produto_categoria_idx on produto (categoria);

-- CPF nunca em claro: hash com segredo do servidor + versão mascarada para exibição.
create table cliente (
  id uuid primary key default gen_random_uuid(),
  cpf_hash text not null unique,
  cpf_mascarado text not null,
  nome text not null,
  whatsapp text not null,
  email text,
  criado_em timestamptz not null default now()
);

-- Só inserção: cada mudança de aceite é uma nova linha.
create table consentimento (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references cliente(id),
  finalidade text not null,
  concedido boolean not null,
  versao_texto text not null,
  criado_em timestamptz not null default now()
);

create sequence pedido_codigo_seq;

create table pedido (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  cliente_id uuid not null references cliente(id),
  modo text not null check (modo in ('RETIRADA_PORTAL', 'RETIRADA_LOJA', 'SCAN_GO', 'ENVIO_BRASIL')),
  estado text not null,
  loja_scan_go text references loja(id),
  janela_chegada text,
  total_usd_centavos bigint not null,
  cotacao_e4 bigint not null,
  subtotal_brl_centavos bigint not null,
  taxa_pix_brl_centavos bigint not null,
  taxa_cambio_brl_centavos bigint not null,
  total_brl_centavos bigint not null,
  qr_usado_em timestamptz,
  cliente_chegou_em timestamptz,
  coletado_por text,
  coletado_em timestamptz,
  conferido_portal_por text,
  conferido_portal_em timestamptz,
  pronto_em timestamptz,
  retirado_por text,
  retirado_em timestamptz,
  documento_conferido boolean,
  conferencia_saida text check (conferencia_saida in ('AMOSTRAGEM', 'TOTAL')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index pedido_cliente_idx on pedido (cliente_id);
create index pedido_estado_idx on pedido (estado);

create table pedido_item (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedido(id),
  produto_id uuid not null references produto(id),
  loja_id text not null references loja(id),
  nome_produto text not null,
  quantidade integer not null check (quantidade > 0),
  preco_usd_centavos bigint not null,
  subtotal_usd_centavos bigint not null,
  subtotal_brl_centavos bigint not null,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'SEPARADO')),
  separado_por text,
  separado_em timestamptz,
  teste_resultado text check (teste_resultado in ('APROVADO', 'DEFEITO')),
  testado_por text,
  testado_em timestamptz
);
create index pedido_item_pedido_idx on pedido_item (pedido_id);
create index pedido_item_loja_idx on pedido_item (loja_id);

create table pagamento (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedido(id),
  txid text not null unique,
  end_to_end_id text unique,
  estado text not null check (estado in ('PENDENTE', 'CONFIRMADO', 'EXPIRADO', 'ESTORNADO', 'RECEBIDO_FORA_DO_PRAZO')),
  valor_brl_centavos bigint not null,
  cotacao_e4 bigint not null,
  copia_e_cola text not null,
  expira_em timestamptz not null,
  confirmado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index pagamento_pedido_idx on pagamento (pedido_id);

-- Ledger de dupla entrada. Cada linha debita uma conta e credita outra.
-- Lançamentos são imutáveis: correção é um novo lançamento.
create table lancamento (
  id uuid primary key default gen_random_uuid(),
  transacao_id uuid not null,
  pagamento_id uuid references pagamento(id),
  ocorrencia_id uuid,
  -- Loja à qual a linha se refere (repasse, comissão e ajustes), para o painel da loja.
  loja_id text references loja(id),
  conta_debito text not null,
  conta_credito text not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  moeda text not null default 'BRL',
  tipo text not null,
  criado_em timestamptz not null default now(),
  check (conta_debito <> conta_credito)
);
create index lancamento_pagamento_idx on lancamento (pagamento_id);
create index lancamento_debito_idx on lancamento (conta_debito);
create index lancamento_credito_idx on lancamento (conta_credito);
create index lancamento_loja_idx on lancamento (loja_id);

create function lancamento_imutavel() returns trigger language plpgsql as $$
begin
  raise exception 'lancamento é imutável: crie um lançamento de estorno';
end;
$$;
create trigger lancamento_sem_update before update or delete on lancamento
  for each row execute function lancamento_imutavel();

create table ocorrencia (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedido(id),
  item_id uuid references pedido_item(id),
  loja_id text references loja(id),
  tipo text not null check (tipo in ('ITEM_FALTANTE', 'ITEM_A_MAIS', 'DEFEITO_TESTE', 'DEFEITO_POS_SAIDA', 'DIVERGENCIA_SAIDA')),
  responsavel text not null check (responsavel in ('LOJA', 'PORTAL', 'LOJA_E_PORTAL', 'A_DEFINIR')),
  estado text not null default 'ABERTA' check (estado in ('ABERTA', 'RESOLVIDA')),
  descricao text,
  resolucao text check (resolucao in ('ACERTO_FATURA', 'REPOSICAO', 'TROCA', 'DEVOLUCAO', 'TICKET_LOJA')),
  valor_ajuste_centavos bigint,
  aberta_por text not null,
  aberta_em timestamptz not null default now(),
  resolvida_por text,
  resolvida_em timestamptz
);
create index ocorrencia_estado_idx on ocorrencia (estado);

-- Outbox: eventos gravados na mesma transação da mudança, publicados depois.
create table evento (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  versao integer not null default 1,
  ocorrido_em timestamptz not null default now(),
  correlacao_id text,
  payload jsonb not null,
  publicado_em timestamptz
);
create index evento_nao_publicado_idx on evento (ocorrido_em) where publicado_em is null;

create table auditoria (
  id bigserial primary key,
  ator text not null,
  perfil text not null,
  acao text not null,
  entidade text not null,
  entidade_id text not null,
  dados jsonb,
  criado_em timestamptz not null default now()
);

create table idempotencia (
  escopo text not null,
  chave text not null,
  status integer not null,
  resposta jsonb not null,
  criado_em timestamptz not null default now(),
  primary key (escopo, chave)
);
