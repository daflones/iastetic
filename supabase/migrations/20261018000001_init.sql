-- IAstetic — schema inicial
create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- =========================================================
-- ENUMS
-- =========================================================
create type niche_type as enum ('salao','unhas','olhar');
create type sub_status as enum ('trial','active','past_due','cancelled','expired');
create type contact_stage as enum ('novo','interessado','agendado','cliente','inativo','perdido');
create type conv_mode as enum ('ai','human');
create type msg_direction as enum ('in','out');
create type msg_sender as enum ('contact','ai','human','system');
create type msg_type as enum ('text','audio','image','video','document','sticker','location','payment','system');
create type appt_status as enum ('scheduled','confirmed','done','cancelled','no_show');
create type pay_kind as enum ('subscription','customer_charge','wallet_deposit','withdrawal');
create type pay_provider as enum ('mercosulpay','stripe','wallet');
create type pay_status as enum ('created','pending','completed','failed','uncertain','review','refunded');
create type followup_trigger as enum ('after_appointment','no_show','inactive_days','abandoned_lead','maintenance','birthday','custom');
create type followup_channel as enum ('text','audio','image');
create type job_status as enum ('pending','sent','failed','cancelled');

-- =========================================================
-- PLATFORM
-- =========================================================
create table platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into platform_settings(key,value) values
 ('fees', '{"withdrawal_percent":5,"min_withdrawal_cents":2000}'),
 ('trial', '{"days":7}'),
 ('branding', '{"name":"IAstetic","support_whatsapp":""}');

create table plans (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  niche niche_type null,
  description text,
  price_cents int not null default 0,
  yearly_price_cents int,
  instances_limit int not null default 1,
  professionals_limit int not null default 3,
  monthly_messages_limit int not null default 2000,
  features jsonb not null default '{}'::jsonb,
  stripe_price_id text,
  stripe_yearly_price_id text,
  highlight boolean not null default false,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- =========================================================
-- COMPANIES & USERS
-- =========================================================
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  niche niche_type not null,
  owner_id uuid references auth.users(id) on delete cascade,   -- null = empresa demo
  is_demo boolean not null default false,
  phone text,
  email text,
  whatsapp_public text,
  address text,
  city text,
  state text,
  instagram text,
  logo_url text,
  timezone text not null default 'America/Sao_Paulo',
  business_hours jsonb not null default '{"mon":[["09:00","18:00"]],"tue":[["09:00","18:00"]],"wed":[["09:00","18:00"]],"thu":[["09:00","18:00"]],"fri":[["09:00","18:00"]],"sat":[["09:00","14:00"]],"sun":[]}'::jsonb,
  extra jsonb not null default '{}'::jsonb,
  ai_config jsonb not null default '{"name":"Íris","tone":"Acolhedora e profissional","allowed":"","forbidden":"","greeting":"","send_images":false,"send_audio":false,"payments_enabled":false,"require_deposit":false,"deposit_percent":30,"language":"pt-BR","reply_delay_sec":2,"auto_confirm":true}'::jsonb,
  plan_id uuid references plans(id),
  subscription_status sub_status not null default 'trial',
  subscription_until timestamptz,
  trial_until timestamptz not null default now() + interval '7 days',
  stripe_customer_id text,
  onboarding_step int not null default 0,
  onboarding_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on companies(owner_id);
create index on companies(is_demo) where is_demo;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  company_id uuid references companies(id) on delete set null,
  role text not null default 'owner' check (role in ('owner','staff')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into profiles(id,full_name,email,phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email, new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- =========================================================
-- CATALOG
-- =========================================================
create table professionals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  avatar_url text,
  specialties text[] not null default '{}',
  working_hours jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on professionals(company_id);

create table services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  category text,
  description text,
  duration_min int not null default 60,
  price_cents int not null default 0,
  image_url text,
  professional_ids uuid[] not null default '{}',
  buffer_min int not null default 0,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index on services(company_id);

create table company_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  kind text not null default 'image' check (kind in ('image','document','link')),
  title text not null,
  url text not null,
  description text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on company_files(company_id);

-- =========================================================
-- WHATSAPP INSTANCES
-- =========================================================
create table instances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  instance_name text unique not null,
  label text,
  phone text,
  status text not null default 'disconnected',
  qr_base64 text,
  pairing_code text,
  ai_enabled boolean not null default true,
  ai_overrides jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index on instances(company_id);

-- =========================================================
-- CRM
-- =========================================================
create table contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  phone text not null,
  name text,
  push_name text,
  email text,
  birthday date,
  stage contact_stage not null default 'novo',
  tags text[] not null default '{}',
  notes text,
  avatar_url text,
  source text default 'whatsapp',
  ai_paused boolean not null default false,
  preferred_professional_id uuid references professionals(id) on delete set null,
  total_spent_cents int not null default 0,
  visits int not null default 0,
  last_visit_at timestamptz,
  last_message_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(company_id, phone)
);
create index on contacts(company_id, stage);
create index on contacts(company_id, last_message_at desc);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  instance_id uuid references instances(id) on delete set null,
  remote_jid text not null,
  status text not null default 'open' check (status in ('open','closed')),
  mode conv_mode not null default 'ai',
  unread_count int not null default 0,
  last_message_at timestamptz,
  last_message_preview text,
  summary text,
  ai_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(company_id, remote_jid)
);
create index on conversations(company_id, last_message_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  direction msg_direction not null,
  sender msg_sender not null,
  type msg_type not null default 'text',
  content text,
  media_url text,
  media_mime text,
  transcription text,
  wa_message_id text,
  status text default 'sent',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on messages(conversation_id, created_at);
create index on messages(company_id, created_at desc);
create unique index messages_wa_id_uniq on messages(company_id, wa_message_id) where wa_message_id is not null;

-- =========================================================
-- AGENDA
-- =========================================================
create table appointments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  professional_id uuid references professionals(id) on delete set null,
  service_id uuid references services(id) on delete set null,
  service_name text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status appt_status not null default 'scheduled',
  price_cents int not null default 0,
  paid_cents int not null default 0,
  notes text,
  created_by text not null default 'human' check (created_by in ('ai','human','client')),
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on appointments(company_id, starts_at);
create index on appointments(professional_id, starts_at);
create index on appointments(contact_id);

-- =========================================================
-- FINANCEIRO
-- =========================================================
create table wallets (
  company_id uuid primary key references companies(id) on delete cascade,
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  reserved_cents bigint not null default 0 check (reserved_cents >= 0),
  pix_key text,
  pix_key_type text check (pix_key_type in ('cpf','cnpj','email','phone','evp')),
  recipient_document text,
  updated_at timestamptz not null default now()
);

create table wallet_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  kind text not null check (kind in ('credit','debit','fee','reserve','release')),
  amount_cents bigint not null,
  balance_after_cents bigint,
  reference_type text,
  reference_id uuid,
  description text,
  created_at timestamptz not null default now()
);
create index on wallet_entries(company_id, created_at desc);

create table payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  kind pay_kind not null,
  provider pay_provider not null,
  status pay_status not null default 'created',
  amount_cents bigint not null check (amount_cents > 0),
  fee_cents bigint not null default 0,
  net_cents bigint,
  provider_id text,
  provider_total_debit_cents bigint,
  contact_id uuid references contacts(id) on delete set null,
  appointment_id uuid references appointments(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  plan_id uuid references plans(id),
  period text check (period in ('monthly','yearly')),
  qr_code text,
  qr_code_image text,
  checkout_url text,
  destination jsonb,
  description text,
  reason text,
  idempotency_key text unique,
  attempts int not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on payments(company_id, created_at desc);
create index on payments(status) where status in ('created','pending','uncertain');
create index on payments(provider, provider_id);

create table webhook_deliveries (
  delivery_id text primary key,
  provider text not null,
  event_type text,
  payload_hash text,
  status text not null default 'received',
  payment_id uuid references payments(id),
  created_at timestamptz not null default now()
);

-- =========================================================
-- FOLLOW-UPS
-- =========================================================
create table followup_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  trigger followup_trigger not null,
  delay_hours int not null default 24,
  channel followup_channel not null default 'text',
  template text not null,
  image_url text,
  use_ai_variation boolean not null default true,
  only_stage contact_stage[],
  service_ids uuid[],
  active boolean not null default true,
  send_window jsonb not null default '{"from":"09:00","to":"20:00"}'::jsonb,
  created_at timestamptz not null default now()
);
create index on followup_rules(company_id);

create table followup_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  rule_id uuid references followup_rules(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  scheduled_at timestamptz not null,
  status job_status not null default 'pending',
  sent_content text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on followup_jobs(status, scheduled_at);
create index on followup_jobs(company_id, created_at desc);

-- =========================================================
-- IA / DEMO / ASSISTENTE
-- =========================================================
create table ai_usage (
  id bigint generated always as identity primary key,
  company_id uuid references companies(id) on delete cascade,
  kind text not null,
  model text,
  prompt_tokens int default 0,
  completion_tokens int default 0,
  created_at timestamptz not null default now()
);
create index on ai_usage(company_id, created_at desc);

create table demo_sessions (
  id uuid primary key default gen_random_uuid(),
  niche niche_type not null,
  ip_hash text,
  messages jsonb not null default '[]'::jsonb,
  turns int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table assistant_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index on notifications(company_id, read, created_at desc);

-- =========================================================
-- HELPERS
-- =========================================================
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_companies_upd before update on companies for each row execute function set_updated_at();
create trigger t_appointments_upd before update on appointments for each row execute function set_updated_at();
create trigger t_payments_upd before update on payments for each row execute function set_updated_at();
create trigger t_wallets_upd before update on wallets for each row execute function set_updated_at();
create trigger t_demo_upd before update on demo_sessions for each row execute function set_updated_at();
create trigger t_threads_upd before update on assistant_threads for each row execute function set_updated_at();

create or replace function my_company_id() returns uuid language sql stable security definer set search_path=public as $$
  select company_id from profiles where id = auth.uid()
$$;
create or replace function is_platform_admin() returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;
create or replace function is_company_member(cid uuid) returns boolean language sql stable security definer set search_path=public as $$
  select cid is not null and (cid = (select company_id from profiles where id = auth.uid()) or is_platform_admin())
$$;

create or replace function on_company_created() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into wallets(company_id) values (new.id) on conflict do nothing;
  if new.owner_id is not null then
    update profiles set company_id = new.id, role='owner' where id = new.owner_id and company_id is null;
  end if;
  return new;
end $$;
create trigger t_company_created after insert on companies for each row execute function on_company_created();

create or replace function on_message_inserted() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update conversations set
    last_message_at = new.created_at,
    last_message_preview = left(coalesce(new.content, new.transcription, '['||new.type::text||']'), 120),
    unread_count = case when new.direction='in' then unread_count+1 else unread_count end
  where id = new.conversation_id;
  update contacts set last_message_at = new.created_at
  where id = (select contact_id from conversations where id = new.conversation_id);
  return new;
end $$;
create trigger t_message_inserted after insert on messages for each row execute function on_message_inserted();

-- =========================================================
-- CARTEIRA
-- =========================================================
create or replace function wallet_credit(p_company uuid, p_amount bigint, p_ref_type text, p_ref_id uuid, p_desc text)
returns wallets language plpgsql security definer set search_path=public as $$
declare w wallets;
begin
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_ref_id is not null and exists(select 1 from wallet_entries where reference_type=p_ref_type and reference_id=p_ref_id and kind='credit') then
    select * into w from wallets where company_id=p_company; return w;
  end if;
  update wallets set balance_cents = balance_cents + p_amount where company_id = p_company returning * into w;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  insert into wallet_entries(company_id,kind,amount_cents,balance_after_cents,reference_type,reference_id,description)
  values (p_company,'credit',p_amount,w.balance_cents,p_ref_type,p_ref_id,p_desc);
  return w;
end $$;

create or replace function wallet_debit(p_company uuid, p_amount bigint, p_ref_type text, p_ref_id uuid, p_desc text)
returns wallets language plpgsql security definer set search_path=public as $$
declare w wallets;
begin
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  select * into w from wallets where company_id=p_company for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  if w.balance_cents < p_amount then raise exception 'INSUFFICIENT_FUNDS'; end if;
  update wallets set balance_cents = balance_cents - p_amount where company_id = p_company returning * into w;
  insert into wallet_entries(company_id,kind,amount_cents,balance_after_cents,reference_type,reference_id,description)
  values (p_company,'debit',-p_amount,w.balance_cents,p_ref_type,p_ref_id,p_desc);
  return w;
end $$;

create or replace function wallet_withdraw_prepare(p_company uuid, p_amount bigint, p_destination jsonb, p_key text)
returns payments language plpgsql security definer set search_path=public as $$
declare w wallets; p payments; fee_pct numeric; min_cents bigint; fee bigint;
begin
  select (value->>'withdrawal_percent')::numeric, (value->>'min_withdrawal_cents')::bigint into fee_pct, min_cents from platform_settings where key='fees';
  if p_amount < coalesce(min_cents,2000) then raise exception 'BELOW_MINIMUM'; end if;
  select * into p from payments where idempotency_key = p_key; if found then return p; end if;
  select * into w from wallets where company_id=p_company for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  if w.balance_cents < p_amount then raise exception 'INSUFFICIENT_FUNDS'; end if;
  fee := ceil(p_amount * coalesce(fee_pct,5) / 100.0);
  update wallets set balance_cents = balance_cents - p_amount, reserved_cents = reserved_cents + p_amount where company_id=p_company returning * into w;
  insert into payments(company_id,kind,provider,status,amount_cents,fee_cents,net_cents,destination,idempotency_key,description)
  values (p_company,'withdrawal','mercosulpay','created',p_amount,fee,p_amount-fee,p_destination,p_key,'Saque para chave Pix') returning * into p;
  insert into wallet_entries(company_id,kind,amount_cents,balance_after_cents,reference_type,reference_id,description)
  values (p_company,'reserve',-p_amount,w.balance_cents,'withdrawal',p.id,'Reserva para saque');
  return p;
end $$;

create or replace function wallet_withdraw_finalize(p_payment uuid, p_status pay_status, p_provider_id text, p_total_debit bigint, p_reason text)
returns payments language plpgsql security definer set search_path=public as $$
declare p payments; w wallets;
begin
  select * into p from payments where id=p_payment for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p.status in ('completed','failed') then return p; end if;
  if p_status = 'completed' then
    update wallets set reserved_cents = reserved_cents - p.amount_cents where company_id=p.company_id returning * into w;
    insert into wallet_entries(company_id,kind,amount_cents,balance_after_cents,reference_type,reference_id,description) values
      (p.company_id,'fee',-p.fee_cents,w.balance_cents,'withdrawal',p.id,'Taxa da plataforma'),
      (p.company_id,'debit',-(p.net_cents),w.balance_cents,'withdrawal',p.id,'Pix enviado');
  elsif p_status = 'failed' then
    update wallets set reserved_cents = reserved_cents - p.amount_cents, balance_cents = balance_cents + p.amount_cents where company_id=p.company_id returning * into w;
    insert into wallet_entries(company_id,kind,amount_cents,balance_after_cents,reference_type,reference_id,description)
      values (p.company_id,'release',p.amount_cents,w.balance_cents,'withdrawal',p.id,'Saque estornado');
  else
    update payments set status=p_status, provider_id=coalesce(p_provider_id,provider_id), reason=coalesce(p_reason,reason) where id=p.id returning * into p;
    return p;
  end if;
  update payments set status=p_status, provider_id=coalesce(p_provider_id,provider_id), provider_total_debit_cents=coalesce(p_total_debit,provider_total_debit_cents), reason=coalesce(p_reason,reason)
    where id=p.id returning * into p;
  return p;
end $$;

create or replace function activate_subscription(p_company uuid, p_plan uuid, p_period text)
returns void language plpgsql security definer set search_path=public as $$
declare base timestamptz;
begin
  select greatest(coalesce(subscription_until, now()), now()) into base from companies where id=p_company;
  update companies set plan_id=p_plan, subscription_status='active',
    subscription_until = base + case when p_period='yearly' then interval '1 year' else interval '1 month' end
  where id=p_company;
end $$;

create or replace function pay_subscription_with_wallet(p_company uuid, p_plan uuid, p_period text)
returns payments language plpgsql security definer set search_path=public as $$
declare pl plans; amount bigint; p payments;
begin
  select * into pl from plans where id=p_plan and active; if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  amount := case when p_period='yearly' then coalesce(pl.yearly_price_cents, pl.price_cents*12) else pl.price_cents end;
  perform wallet_debit(p_company, amount, 'subscription', null, 'Mensalidade '||pl.name);
  insert into payments(company_id,kind,provider,status,amount_cents,plan_id,period,description)
    values (p_company,'subscription','wallet','completed',amount,p_plan,p_period,'Assinatura '||pl.name||' paga com saldo') returning * into p;
  update wallet_entries set reference_id=p.id where company_id=p_company and reference_type='subscription' and reference_id is null;
  perform activate_subscription(p_company, p_plan, p_period);
  return p;
end $$;

-- =========================================================
-- DASHBOARD STATS
-- =========================================================
create or replace function dashboard_stats(p_company uuid, p_from timestamptz default now()-interval '30 days', p_to timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb;
begin
  if not is_company_member(p_company) then raise exception 'FORBIDDEN'; end if;
  select jsonb_build_object(
    'contacts_total', (select count(*) from contacts where company_id=p_company),
    'contacts_new', (select count(*) from contacts where company_id=p_company and created_at between p_from and p_to),
    'conversations_open', (select count(*) from conversations where company_id=p_company and status='open'),
    'messages_in', (select count(*) from messages where company_id=p_company and direction='in' and created_at between p_from and p_to),
    'messages_ai', (select count(*) from messages where company_id=p_company and sender='ai' and created_at between p_from and p_to),
    'appointments', (select count(*) from appointments where company_id=p_company and starts_at between p_from and p_to and status<>'cancelled'),
    'appointments_ai', (select count(*) from appointments where company_id=p_company and created_by='ai' and created_at between p_from and p_to),
    'appointments_today', (select count(*) from appointments where company_id=p_company and (starts_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date and status<>'cancelled'),
    'no_shows', (select count(*) from appointments where company_id=p_company and status='no_show' and starts_at between p_from and p_to),
    'revenue_cents', (select coalesce(sum(price_cents),0) from appointments where company_id=p_company and status='done' and starts_at between p_from and p_to),
    'received_cents', (select coalesce(sum(amount_cents),0) from payments where company_id=p_company and kind='customer_charge' and status='completed' and created_at between p_from and p_to),
    'stages', (select coalesce(jsonb_object_agg(stage, c),'{}'::jsonb) from (select stage, count(*) c from contacts where company_id=p_company group by stage) s),
    'top_services', (select coalesce(jsonb_agg(jsonb_build_object('name',service_name,'count',c,'revenue',rev) order by c desc),'[]'::jsonb) from (select service_name, count(*) c, sum(price_cents) rev from appointments where company_id=p_company and status<>'cancelled' and starts_at between p_from and p_to group by service_name limit 6) t),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day',d,'messages',m,'appointments',a) order by d),'[]'::jsonb) from (
        select d::date d,
          (select count(*) from messages where company_id=p_company and direction='in' and created_at::date=d::date) m,
          (select count(*) from appointments where company_id=p_company and status<>'cancelled' and starts_at::date=d::date) a
        from generate_series(p_from::date, p_to::date, '1 day') d) x),
    'wallet', (select jsonb_build_object('balance',balance_cents,'reserved',reserved_cents) from wallets where company_id=p_company)
  ) into r;
  return r;
end $$;

-- =========================================================
-- RLS
-- =========================================================
alter table platform_settings enable row level security;
alter table plans enable row level security;
alter table companies enable row level security;
alter table profiles enable row level security;
alter table professionals enable row level security;
alter table services enable row level security;
alter table company_files enable row level security;
alter table instances enable row level security;
alter table contacts enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table appointments enable row level security;
alter table wallets enable row level security;
alter table wallet_entries enable row level security;
alter table payments enable row level security;
alter table webhook_deliveries enable row level security;
alter table followup_rules enable row level security;
alter table followup_jobs enable row level security;
alter table ai_usage enable row level security;
alter table demo_sessions enable row level security;
alter table assistant_threads enable row level security;
alter table notifications enable row level security;

create policy "settings read" on platform_settings for select using (true);
create policy "settings admin" on platform_settings for all using (is_platform_admin()) with check (is_platform_admin());
create policy "plans read" on plans for select using (active or is_platform_admin());
create policy "plans admin" on plans for all using (is_platform_admin()) with check (is_platform_admin());

create policy "profiles read" on profiles for select using (id = auth.uid() or is_platform_admin() or (company_id is not null and company_id = my_company_id()));
create policy "profiles update self" on profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "companies member read" on companies for select using (is_company_member(id) or owner_id = auth.uid() or is_demo);
create policy "companies insert owner" on companies for insert with check (owner_id = auth.uid() and my_company_id() is null);
create policy "companies update" on companies for update using (owner_id = auth.uid() or is_platform_admin())
  with check (owner_id = auth.uid() or is_platform_admin());

do $$ declare t text; begin
  foreach t in array array['professionals','services','company_files','instances','contacts','conversations','messages','appointments','followup_rules','followup_jobs','notifications','assistant_threads'] loop
    execute format('create policy "%s member all" on %I for all using (is_company_member(company_id)) with check (is_company_member(company_id))', t, t);
  end loop;
end $$;

create policy "wallet read" on wallets for select using (is_company_member(company_id));
create policy "wallet update keys" on wallets for update using (is_company_member(company_id));
create policy "wallet entries read" on wallet_entries for select using (is_company_member(company_id));
create policy "payments read" on payments for select using (is_company_member(company_id));
create policy "ai usage read" on ai_usage for select using (is_company_member(company_id));

-- =========================================================
-- REALTIME
-- =========================================================
alter publication supabase_realtime add table messages, conversations, contacts, appointments, instances, notifications, payments;
alter table messages replica identity full;
alter table conversations replica identity full;

-- =========================================================
-- STORAGE
-- =========================================================
insert into storage.buckets (id, name, public) values ('media','media',true), ('logos','logos',true), ('files','files',true) on conflict do nothing;
create policy "public read media" on storage.objects for select using (bucket_id in ('media','logos','files'));
create policy "member upload" on storage.objects for insert with check (bucket_id in ('media','logos','files') and auth.role() = 'authenticated' and (storage.foldername(name))[1] = my_company_id()::text);
create policy "member delete" on storage.objects for delete using (bucket_id in ('media','logos','files') and (storage.foldername(name))[1] = my_company_id()::text);

-- =========================================================
-- PLANOS INICIAIS
-- =========================================================
insert into plans(slug,name,niche,description,price_cents,yearly_price_cents,instances_limit,professionals_limit,monthly_messages_limit,features,highlight,sort) values
 ('start',  'Start',  null, 'Para quem está começando: 1 WhatsApp com IA, agenda e CRM.', 9700, 97000, 1, 2, 1500, '{"audio":false,"images":false,"payments":false,"followups":true,"assistant":false}', false, 1),
 ('pro',    'Pro',    null, 'IA completa com áudio, imagens, pagamentos e assistente de gestão.', 19700, 197000, 2, 6, 6000, '{"audio":true,"images":true,"payments":true,"followups":true,"assistant":true}', true, 2),
 ('studio', 'Studio', null, 'Para estúdios com várias unidades e equipes grandes.', 39700, 397000, 5, 20, 20000, '{"audio":true,"images":true,"payments":true,"followups":true,"assistant":true,"priority":true}', false, 3);
