-- Lista mestre: catálogo de cada loja vindo do sistema dela (integração ou planilha).
-- O Pick & Go vende o subconjunto publicado (produto.ativo).

alter table produto add column codigo_loja text;
alter table produto add column descricao text;
alter table produto add column fotos jsonb not null default '[]'::jsonb;
-- Último estoque informado pelo sistema da loja; produto.estoque é o disponível no app
-- (informado menos o reservado em pedidos do Pick & Go ainda não retirados).
alter table produto add column estoque_loja integer check (estoque_loja >= 0);
alter table produto add column origem text not null default 'MANUAL' check (origem in ('MANUAL', 'INTEGRACAO', 'IMPORTACAO'));
alter table produto add column sincronizado_em timestamptz;
alter table produto add constraint produto_codigo_loja_unico unique (loja_id, codigo_loja);

update produto set fotos = jsonb_build_array(foto_url) where foto_url is not null;

-- Chave de API do sistema da loja: só o hash fica guardado; a chave aparece uma vez.
alter table loja add column chave_integracao_hash text unique;
alter table loja add column chave_integracao_criada_em timestamptz;

create table sincronizacao (
  id uuid primary key default gen_random_uuid(),
  loja_id text not null references loja(id),
  origem text not null check (origem in ('INTEGRACAO', 'IMPORTACAO')),
  ator text not null,
  completo boolean not null,
  recebidos integer not null,
  criados integer not null,
  atualizados integer not null,
  zerados integer not null,
  erros jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);
create index sincronizacao_loja_idx on sincronizacao (loja_id, criado_em desc);
