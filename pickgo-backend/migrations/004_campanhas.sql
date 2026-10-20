-- Campanhas e ofertas (seções 3.8 e 3.10 · RF-28 a RF-31, RF-36 a RF-38).

-- Oferta por quantidade e por tempo limitado num produto. Pública aparece no
-- catálogo; exclusiva só vale para o público da campanha (pelo cupom).
create table oferta (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  produto_id uuid not null references produto(id),
  titulo text not null,
  preco_promocional_usd_centavos bigint not null check (preco_promocional_usd_centavos > 0),
  quantidade_total integer not null check (quantidade_total > 0),
  quantidade_restante integer not null check (quantidade_restante >= 0),
  limite_por_cliente integer not null default 1 check (limite_por_cliente > 0),
  inicio timestamptz not null,
  fim timestamptz not null,
  exclusiva boolean not null default false,
  -- Quem paga o desconto (RF-29): a loja abre mão, o Portal subsidia ou os dois dividem.
  pagador text not null check (pagador in ('LOJA', 'PORTAL', 'DIVIDIDO')),
  campanha_id uuid,
  estado text not null default 'ATIVA' check (estado in ('ATIVA', 'ENCERRADA')),
  criado_por text not null,
  criado_em timestamptz not null default now(),
  check (fim > inicio)
);
create index oferta_ativa_idx on oferta (estado, fim);

-- Unidades da oferta usadas por pedido; voltam se o Pix expirar, o pedido for cancelado ou estornado.
create table oferta_uso (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references oferta(id),
  pedido_id uuid not null references pedido(id),
  cliente_id uuid not null references cliente(id),
  quantidade integer not null check (quantidade > 0),
  devolvido boolean not null default false,
  criado_em timestamptz not null default now()
);
create index oferta_uso_cliente_idx on oferta_uso (oferta_id, cliente_id) where not devolvido;
create index oferta_uso_pedido_idx on oferta_uso (pedido_id);

alter table pedido_item add column oferta_id uuid references oferta(id);
alter table pedido_item add column preco_cheio_usd_centavos bigint;
alter table pedido_item add column desconto_brl_centavos bigint not null default 0;
alter table pedido_item add column pagador_desconto text check (pagador_desconto in ('LOJA', 'PORTAL', 'DIVIDIDO'));
alter table pedido add column cupom text;
alter table pedido add column campanha_id uuid;

create table campanha (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  -- Filtros do público (segmento), guardados para reproduzir quem recebeu.
  segmento jsonb not null,
  oferta_id uuid references oferta(id),
  mensagem text not null,
  -- Cascata de canais (RF-36): tenta o primeiro canal aceito; sem leitura nem clique, passa ao próximo.
  canais text[] not null,
  espera_horas integer not null default 4 check (espera_horas between 1 and 168),
  agendada_para timestamptz,
  estado text not null default 'RASCUNHO' check (estado in ('RASCUNHO', 'AGENDADA', 'ENVIANDO', 'CONCLUIDA', 'CANCELADA')),
  criado_por text not null,
  criado_em timestamptz not null default now(),
  disparada_em timestamptz,
  concluida_em timestamptz
);
alter table oferta add constraint oferta_campanha_fk foreign key (campanha_id) references campanha(id);
alter table pedido add constraint pedido_campanha_fk foreign key (campanha_id) references campanha(id);

-- Uma linha por pessoa do público: em que passo da cascata está e o que fez.
create table campanha_envio (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references campanha(id),
  contato_id uuid not null references contato(id),
  passo integer not null default 0,
  canal_atual text,
  mensagem_id uuid references mensagem(id),
  estado text not null default 'NA_FILA' check (estado in ('NA_FILA', 'ENVIADA', 'ENTREGUE', 'LIDA', 'CLICOU', 'COMPROU', 'SEM_CANAL', 'ESGOTADO')),
  -- Código do link curto (/l/{codigo}) para registrar o clique (RF-39).
  codigo_link text not null unique,
  proximo_passo_em timestamptz,
  clicou_em timestamptz,
  comprou_em timestamptz,
  pedido_id uuid references pedido(id),
  criado_em timestamptz not null default now(),
  unique (campanha_id, contato_id)
);
create index campanha_envio_proximo_idx on campanha_envio (proximo_passo_em) where estado in ('NA_FILA', 'ENVIADA', 'ENTREGUE');

-- O limite semanal de ofertas conta uma vez por campanha, não cada canal da cascata.
alter table mensagem add column campanha_id uuid references campanha(id);
create index mensagem_campanha_idx on mensagem (campanha_id);
