-- Posts gerados pela assistente de marketing (preview IG/FB/story)
create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  caption text not null,
  hashtags text,
  image_url text,
  platform text not null default 'instagram' check (platform in ('instagram','facebook')),
  format text not null default 'feed' check (format in ('feed','story')),
  used boolean not null default false,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists social_posts_company_idx on social_posts(company_id, created_at desc);
alter table social_posts enable row level security;
create policy "social_posts member all" on social_posts for all
  using (is_company_member(company_id)) with check (is_company_member(company_id));
