-- Secrets gerenciados pelo painel admin (fallback: env vars das Edge Functions).
-- Tabela separada de platform_settings porque esta é legível via anon key (policy select true);
-- platform_secrets NÃO tem policies de leitura — só o service_role (Edge Functions) acessa.

create table if not exists platform_secrets (
  name text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table platform_secrets enable row level security;
-- nenhuma policy: anon/authenticated não leem nem escrevem; service_role bypassa RLS.

create or replace function touch_platform_secrets() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_platform_secrets_touch on platform_secrets;
create trigger trg_platform_secrets_touch before update on platform_secrets
  for each row execute function touch_platform_secrets();
