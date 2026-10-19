-- Quotas por plano + recargas (top-ups)
alter type pay_kind add value if not exists 'quota_topup';

alter table plans add column if not exists assistant_audio_quota int not null default 20;
alter table plans add column if not exists customer_audio_quota int not null default 30;

alter table companies add column if not exists quota_credits jsonb not null default '{}'::jsonb;

create table if not exists quota_topups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  resource text not null,
  units int not null default 1,
  credits_added int not null,
  payment_id uuid references payments(id) on delete set null,
  applied boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists quota_topups_company_idx on quota_topups(company_id);
alter table quota_topups enable row level security;
create policy "quota_topups member all" on quota_topups for all
  using (is_company_member(company_id)) with check (is_company_member(company_id));
