-- Oyster DeckRoom schema. Paste into Supabase SQL Editor and run once.
-- All access goes through the `api` Edge Function (service role). RLS is on with no policies,
-- so the public anon key can read nothing.

create table if not exists documents (
  id text primary key, name text, version int default 0, pending_version int, pages int default 0, ratio real default 0.5625,
  created_at bigint, updated_at bigint
);
create table if not exists links (
  id text primary key, slug text unique, name text, investor_name text, investor_email text, firm text, doc_ids text default '[]',
  require_email int default 1, verify_email int default 0, allow_download int default 0, watermark int default 1, password_hash text,
  expires_at bigint, allow_emails text, block_emails text, block_domains text, notify int default 1, cta_url text, cta_label text, message text,
  active int default 1, created_at bigint
);
create table if not exists visitors (
  id text primary key, link_id text references links(id) on delete cascade, email text, name text, device text,
  verified int default 0, forwarded int default 0, first_seen bigint, last_seen bigint
);
create index if not exists ix_vis_link on visitors(link_id, email);
create table if not exists sessions (
  id text primary key, link_id text references links(id) on delete cascade, visitor_id text references visitors(id) on delete cascade,
  started_at bigint, last_ping bigint, duration bigint default 0, ip text, country text, city text, device text, referrer text
);
create index if not exists ix_sess_vis on sessions(visitor_id);
create table if not exists page_time (
  session_id text references sessions(id) on delete cascade, doc_id text, page int, ms bigint default 0, views int default 1,
  primary key (session_id, doc_id, page)
);
create table if not exists messages (
  id bigserial primary key, link_id text, visitor_id text references visitors(id) on delete cascade, doc_id text, page int, body text, created_at bigint
);
create table if not exists events (id bigserial primary key, link_id text, visitor_id text, type text, meta text, created_at bigint);
create table if not exists otps (link_id text, email text, code text, expires_at bigint, name text, tries int default 0, primary key (link_id, email));
create table if not exists investors (email text primary key, name text, firm text, stage text, notes text, updated_at bigint);

alter table documents enable row level security;
alter table links enable row level security;
alter table visitors enable row level security;
alter table sessions enable row level security;
alter table page_time enable row level security;
alter table messages enable row level security;
alter table events enable row level security;
alter table otps enable row level security;
alter table investors enable row level security;

-- private bucket for slide images and original PDFs
insert into storage.buckets (id, name, public) values ('decks', 'decks', false) on conflict (id) do nothing;
