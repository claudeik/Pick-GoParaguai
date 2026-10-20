-- Vídeos do YouTube com produtos e link inteligente (seção 3.11 · RF-31, RF-39 a RF-41).

-- Vídeo do Portal no YouTube. Título, canal e capa vêm do oEmbed do YouTube ao cadastrar.
create table video (
  id uuid primary key default gen_random_uuid(),
  youtube_id text not null unique check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  titulo text not null,
  canal text,
  descricao text,
  loja_id text references loja(id),
  estado text not null default 'RASCUNHO' check (estado in ('RASCUNHO', 'PUBLICADO', 'ARQUIVADO')),
  publicado_em timestamptz,
  criado_por text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index video_publicado_idx on video (estado, publicado_em desc);

-- Produto que aparece no vídeo: momento em que aparece, oferta opcional e o código
-- do link curto (/v/{codigo}), um por vídeo e produto (RF-39).
create table video_produto (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references video(id) on delete cascade,
  produto_id uuid not null references produto(id),
  oferta_id uuid references oferta(id),
  momento_s integer not null default 0 check (momento_s >= 0),
  ordem integer not null default 0,
  codigo text not null unique,
  criado_em timestamptz not null default now(),
  unique (video_id, produto_id)
);

-- Clique no link curto do vídeo. Anônimo: só a origem e se veio do app.
create table video_clique (
  id bigserial primary key,
  video_produto_id uuid not null references video_produto(id) on delete cascade,
  origem text,
  criado_em timestamptz not null default now()
);
create index video_clique_idx on video_clique (video_produto_id, criado_em);

-- Cliente identificado que abriu o produto pelo vídeo: base do lembrete de quem não comprou.
create table video_interesse (
  id uuid primary key default gen_random_uuid(),
  video_produto_id uuid not null references video_produto(id) on delete cascade,
  cliente_id uuid not null references cliente(id),
  criado_em timestamptz not null default now(),
  lembrado_em timestamptz,
  comprou_em timestamptz,
  unique (video_produto_id, cliente_id)
);
create index video_interesse_lembrete_idx on video_interesse (criado_em) where lembrado_em is null and comprou_em is null;

-- Origem da venda (RF-31): o vídeo e o produto do link que trouxe o cliente.
alter table pedido add column video_produto_id uuid references video_produto(id);
-- Campanha que divulga um vídeo: o link curto da campanha abre o vídeo no app.
alter table campanha add column video_id uuid references video(id);
