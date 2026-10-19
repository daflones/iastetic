-- Chamados de suporte: empresa abre pelo painel, admin atende.
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subject text not null,
  category text not null default 'duvida',  -- duvida | bug | financeiro | whatsapp | sugestao
  status text not null default 'aberto',    -- aberto | em_atendimento | aguardando_empresa | resolvido
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_company on public.support_tickets(company_id, status);
create index if not exists support_tickets_status on public.support_tickets(status, updated_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender text not null check (sender in ('company','admin')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket on public.support_messages(ticket_id, created_at);

drop trigger if exists t_support_tickets_upd on public.support_tickets;
create trigger t_support_tickets_upd before update on public.support_tickets for each row execute function set_updated_at();

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

-- empresa lê/abre os próprios chamados
create policy "support tickets member read" on public.support_tickets
  for select using (is_company_member(company_id));
create policy "support tickets member insert" on public.support_tickets
  for insert with check (is_company_member(company_id));
create policy "support tickets member update" on public.support_tickets
  for update using (is_company_member(company_id));

create policy "support messages member read" on public.support_messages
  for select using (exists (select 1 from support_tickets t where t.id = ticket_id and is_company_member(t.company_id)));
create policy "support messages member insert" on public.support_messages
  for insert with check (sender = 'company' and exists (select 1 from support_tickets t where t.id = ticket_id and is_company_member(t.company_id)));
