-- Quota de geração de imagem por plano + campanhas de marketing
alter table plans add column if not exists image_quota int not null default 4;

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  message text not null,
  image_url text,
  audience text not null default 'all',
  status text not null default 'draft' check (status in ('draft','sent')),
  sent_count int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists campaigns_company_idx on campaigns(company_id);
alter table campaigns enable row level security;
create policy "campaigns member all" on campaigns for all
  using (is_company_member(company_id)) with check (is_company_member(company_id));
alter table plans add column if not exists image_storage_limit int not null default 10;
