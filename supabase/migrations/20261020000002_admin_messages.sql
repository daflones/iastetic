-- Chat da instância WhatsApp do admin (IAstetic) — inbox visível no painel
create table if not exists public.admin_messages (
  id uuid primary key default gen_random_uuid(),
  remote_jid text not null,
  phone text,
  direction text not null check (direction in ('in', 'out')),
  kind text not null default 'text',
  content text,
  media_url text,
  source text not null default 'bot', -- bot | admin | campaign
  created_at timestamptz not null default now()
);
create index if not exists admin_messages_jid on public.admin_messages(remote_jid, created_at);
create index if not exists admin_messages_recent on public.admin_messages(created_at desc);
alter table public.admin_messages enable row level security; -- só service_role (Edge Functions)
