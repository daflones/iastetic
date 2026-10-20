-- Posts de Instagram gerados pela "Marqueteira" (admin): carrosséis com legenda/hashtags.
create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slides jsonb not null default '[]'::jsonb,   -- [{role: 'dor'|'solucao'|'cta', headline, sub, image_url, image_prompt}]
  caption text not null default '',
  hashtags text[] not null default '{}',
  status text not null default 'rascunho' check (status in ('rascunho','pronto','publicado')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_posts_created_idx on public.social_posts(created_at desc);

alter table public.social_posts enable row level security;
create policy social_posts_admin_all on public.social_posts for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin));

create or replace function public.social_posts_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists social_posts_touch on public.social_posts;
create trigger social_posts_touch before update on public.social_posts
  for each row execute function public.social_posts_touch();
