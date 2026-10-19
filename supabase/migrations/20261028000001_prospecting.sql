-- Prospecção: varredura de estabelecimentos (OSM/Google) + campanhas de disparo pelo WhatsApp do admin.
-- Acesso exclusivo via service role (função admin); sem policies públicas.

create table if not exists public.prospect_scans (
  id uuid primary key default gen_random_uuid(),
  niche text not null,
  city text not null,
  uf text,
  radius_m int not null default 5000,
  found int not null default 0,
  saved int not null default 0,
  whatsapp_valid int not null default 0,
  without_site int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.prospect_leads (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references public.prospect_scans(id) on delete set null,
  name text not null,
  phone text,
  whatsapp_valid boolean,
  has_site boolean not null default false,
  site_url text,
  instagram text,
  facebook text,
  niche text,
  city text,
  uf text,
  address text,
  lat double precision,
  lon double precision,
  tags text[] not null default '{}',
  status text not null default 'novo', -- novo | contatado | respondeu | convertido | descartado
  notes text,
  source text not null default 'osm',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone)
);
create index if not exists prospect_leads_niche on public.prospect_leads(niche);
create index if not exists prospect_leads_status on public.prospect_leads(status);
create index if not exists prospect_leads_city on public.prospect_leads(city);

create table if not exists public.prospect_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  message text not null,
  image_url text,
  audience text not null default 'no_site_whatsapp', -- no_site_whatsapp | all_valid | custom
  status text not null default 'draft', -- draft | sending | sent
  sent_count int not null default 0,
  failed_count int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.prospect_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.prospect_campaigns(id) on delete cascade,
  lead_id uuid references public.prospect_leads(id) on delete cascade,
  phone text not null,
  status text not null default 'pending', -- pending | sent | failed
  error text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, phone)
);
create index if not exists prospect_jobs_pending on public.prospect_jobs(status, scheduled_at);

alter table public.prospect_scans enable row level security;
alter table public.prospect_leads enable row level security;
alter table public.prospect_campaigns enable row level security;
alter table public.prospect_jobs enable row level security;

-- bucket público p/ imagens de campanha de prospecção
insert into storage.buckets (id, name, public)
values ('prospect', 'prospect', true)
on conflict (id) do nothing;
