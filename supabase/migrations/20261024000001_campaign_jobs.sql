-- Campanhas agendadas: envio 1 a 1 com intervalo configurável
alter table campaigns drop constraint if exists campaigns_status_check;
alter table campaigns add constraint campaigns_status_check check (status in ('draft','sending','sent'));
alter table campaigns add column if not exists interval_minutes int not null default 5;
alter table campaigns add column if not exists total_targets int not null default 0;

create table if not exists campaign_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  phone text not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists campaign_jobs_due_idx on campaign_jobs(status, scheduled_at);
alter table campaign_jobs enable row level security;
create policy "campaign_jobs member all" on campaign_jobs for all
  using (is_company_member(company_id)) with check (is_company_member(company_id));
