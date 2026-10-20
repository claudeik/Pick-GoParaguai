-- CRM e atendimento (seções 3.9 e 3.10): contatos e funil, chamados e mensagens.

-- Contato: lead (sem cadastro) ou cliente do app. Todo cliente cadastrado tem um contato.
create table contato (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid unique references cliente(id),
  nome text not null,
  email text,
  whatsapp text,
  origem text not null check (origem in ('CADASTRO_APP', 'FORMULARIO', 'MANUAL', 'MENSAGEM_RECEBIDA', 'IMPORTACAO')),
  -- Etapa do funil. Avança sozinha com cadastro, primeira compra e retiradas; o atendimento também move.
  etapa text not null default 'LEAD' check (etapa in ('LEAD', 'CONTATO_FEITO', 'ONBOARDING', 'CLIENTE_ATIVO', 'RECORRENTE', 'PERDIDO')),
  responsavel text,
  tags text[] not null default '{}',
  -- Canais em que a pessoa pediu para parar (resposta PARAR/STOP). Vale também para lead sem cadastro.
  optout_canais text[] not null default '{}',
  -- Consentimento do lead do formulário (cliente cadastrado usa a tabela consentimento).
  aceites_canais text[] not null default '{}',
  notas text,
  -- Origem de campanha do lead (UTM, vídeo, cupom) para atribuição (RF-31).
  origem_detalhe jsonb,
  ultimo_contato_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index contato_etapa_idx on contato (etapa);
create index contato_whatsapp_idx on contato (whatsapp);
create index contato_email_idx on contato (lower(email));

insert into contato (cliente_id, nome, email, whatsapp, origem, etapa)
  select id, nome, email, whatsapp, 'CADASTRO_APP', 'ONBOARDING' from cliente;

-- Chamado de atendimento (RF-32, RF-33).
create table ticket (
  id uuid primary key default gen_random_uuid(),
  numero bigserial unique,
  contato_id uuid not null references contato(id),
  pedido_id uuid references pedido(id),
  tipo text not null check (tipo in ('DUVIDA', 'CANCELAMENTO', 'RETIRADA_ATRASADA', 'RECLAMACAO', 'DEFEITO', 'OUTRO')),
  estado text not null default 'ABERTO' check (estado in ('ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO_CLIENTE', 'RESOLVIDO')),
  prioridade text not null default 'NORMAL' check (prioridade in ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE')),
  canal text not null check (canal in ('WHATSAPP', 'SMS', 'EMAIL', 'APP', 'TELEFONE', 'INTERNO')),
  assunto text not null,
  responsavel text,
  automatico boolean not null default false,
  responder_ate timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  resolvido_em timestamptz
);
create index ticket_estado_idx on ticket (estado, prioridade);
create index ticket_contato_idx on ticket (contato_id);
-- No máximo um chamado automático aberto por pedido e tipo (rotina não duplica).
create unique index ticket_automatico_unico on ticket (pedido_id, tipo) where automatico and estado <> 'RESOLVIDO';

-- Mensagem enviada ou recebida. Saída é gravada PENDENTE e enviada pela rotina (outbox).
create table mensagem (
  id uuid primary key default gen_random_uuid(),
  contato_id uuid not null references contato(id),
  ticket_id uuid references ticket(id),
  pedido_id uuid references pedido(id),
  direcao text not null check (direcao in ('SAIDA', 'ENTRADA')),
  canal text not null check (canal in ('WHATSAPP', 'SMS', 'EMAIL', 'APP')),
  finalidade text not null default 'TRANSACIONAL' check (finalidade in ('TRANSACIONAL', 'ATENDIMENTO', 'MARKETING')),
  destino text,
  assunto text,
  conteudo text not null,
  modelo text,
  estado text not null check (estado in ('PENDENTE', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU', 'BLOQUEADA', 'RECEBIDA')),
  motivo text,
  provedor text,
  provedor_id text unique,
  tentativas integer not null default 0,
  proxima_tentativa_em timestamptz,
  autor text not null,
  -- clock_timestamp: mensagem recebida e resposta automática na mesma transação ficam em ordem.
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default now()
);
create index mensagem_contato_idx on mensagem (contato_id, criado_em desc);
create index mensagem_ticket_idx on mensagem (ticket_id, criado_em);
create index mensagem_pendente_idx on mensagem (proxima_tentativa_em) where estado = 'PENDENTE';

-- Lembrete de retirada enviado (antes do prazo de NAO_RETIRADO).
alter table pedido add column lembrete_retirada_em timestamptz;

-- Outbox: ordem garantida e tentativas por evento (um evento com erro não trava os outros).
alter table evento add column seq bigserial;
alter table evento add column tentativas integer not null default 0;
alter table evento add column ultimo_erro text;
create index evento_seq_pendente_idx on evento (seq) where publicado_em is null;
