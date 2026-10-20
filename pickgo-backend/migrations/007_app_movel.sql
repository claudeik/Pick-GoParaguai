-- App do turista para Android e iOS: aparelhos para notificação push e exclusão da conta.

-- Aparelho do cliente. O token vem do sistema (FCM no Android, APNs no iOS) depois que a
-- pessoa autoriza as notificações: essa autorização é o aceite do canal.
create table dispositivo (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references cliente(id),
  plataforma text not null check (plataforma in ('android', 'ios')),
  token text not null unique,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index dispositivo_cliente_idx on dispositivo (cliente_id);

-- Push de saída (outbox), uma linha por aparelho: nasce PENDENTE e a rotina envia.
create table push_envio (
  id uuid primary key default gen_random_uuid(),
  dispositivo_id uuid references dispositivo(id) on delete set null,
  cliente_id uuid not null references cliente(id),
  pedido_id uuid references pedido(id),
  titulo text not null,
  corpo text not null,
  estado text not null default 'PENDENTE' check (estado in ('PENDENTE', 'ENVIADA', 'FALHOU', 'DESCARTADA')),
  motivo text,
  tentativas integer not null default 0,
  proxima_tentativa_em timestamptz,
  provedor text,
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default now()
);
create index push_envio_pendente_idx on push_envio (criado_em) where estado = 'PENDENTE';

-- Conta excluída pelo próprio cliente (exigência da App Store e direito do titular na LGPD).
-- Os pedidos ficam, sem os dados pessoais, porque o ledger e a parte fiscal precisam deles.
alter table cliente add column excluido_em timestamptz;
