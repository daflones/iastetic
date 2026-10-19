-- Campanhas de prospecção: intervalo configurável + variação de mensagem por IA
alter table public.prospect_campaigns
  add column if not exists interval_sec int not null default 45,
  add column if not exists vary_messages boolean not null default true,
  add column if not exists image_prompt text;
