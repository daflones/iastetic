-- Página pública de agendamento por estabelecimento
alter table companies add column if not exists slug text;
alter table companies add column if not exists logo_url text;
alter table companies add column if not exists cover_url text;
alter table companies add column if not exists booking_config jsonb not null default '{}';

create unique index if not exists companies_slug_key on companies (slug) where slug is not null;

-- slug automático a partir do nome
create extension if not exists unaccent;

create or replace function slugify(txt text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(unaccent(txt)), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function set_company_slug() returns trigger language plpgsql as $$
declare base text; cand text; i int := 0;
begin
  if new.slug is not null and new.slug <> '' then
    new.slug := slugify(new.slug); return new;
  end if;
  base := coalesce(nullif(slugify(new.name), ''), 'estabelecimento');
  cand := base;
  while exists (select 1 from companies where slug = cand and id <> new.id) loop
    i := i + 1; cand := base || '-' || i;
  end loop;
  new.slug := cand;
  return new;
end $$;

drop trigger if exists trg_company_slug on companies;
create trigger trg_company_slug before insert or update of name, slug on companies
  for each row execute function set_company_slug();

update companies set name = name where slug is null;

-- dados públicos da página (leitura anônima via RPC, sem expor tabela)
create or replace function public_company(p_slug text)
returns json language plpgsql security definer stable as $$
declare c companies%rowtype;
begin
  select * into c from companies where slug = p_slug;
  if not found then return null; end if;
  return json_build_object(
    'id', c.id, 'name', c.name, 'slug', c.slug, 'niche', c.niche,
    'logo_url', c.logo_url, 'cover_url', c.cover_url,
    'address', c.address, 'city', c.city, 'state', c.state,
    'instagram', c.instagram, 'whatsapp_public', c.whatsapp_public,
    'business_hours', c.business_hours, 'extra', c.extra,
    'booking_config', c.booking_config,
    'services', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'category', s.category, 'description', s.description,
        'duration_min', s.duration_min, 'price_cents', s.price_cents,
        'professional_ids', s.professional_ids) order by s.sort), '[]'::jsonb)
       from services s where s.company_id = c.id and s.active),
    'professionals', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'specialties', p.specialties) order by p.name), '[]'::jsonb)
       from professionals p where p.company_id = c.id and p.active)
  );
end $$;

grant execute on function public_company(text) to anon, authenticated;
