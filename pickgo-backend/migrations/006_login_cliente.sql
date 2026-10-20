-- Login do cliente já cadastrado: código de 6 dígitos enviado ao WhatsApp do cadastro.
-- Guardamos só o hash do código; vale 10 minutos, uma vez, e até 5 tentativas.
create table codigo_acesso (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references cliente(id),
  codigo_hash text not null,
  expira_em timestamptz not null,
  tentativas integer not null default 0,
  usado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index codigo_acesso_cliente_idx on codigo_acesso (cliente_id, criado_em desc);
