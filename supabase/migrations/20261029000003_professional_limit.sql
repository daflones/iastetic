-- Limite de profissionais ativos por plano (plans.professionals_limit).
-- Sem plano (trial/free) = 3. Respeitado no banco: insert e reativação.
create or replace function public.enforce_professional_limit()
returns trigger language plpgsql as $$
declare lim int; cnt int; st text;
begin
  select c.subscription_status, p.professionals_limit into st, lim
  from public.companies c left join public.plans p on p.id = c.plan_id
  where c.id = new.company_id;

  if st = 'trial' then lim := least(coalesce(lim, 3), 3) end if;
  lim := coalesce(lim, 3);

  if coalesce(new.active, true) then
    select count(*) into cnt from public.professionals
    where company_id = new.company_id and active and id <> new.id;
    if cnt >= lim then
      raise exception 'PRO_LIMIT: Limite do plano atingido — até % profissional(is). Faça upgrade para adicionar mais.', lim;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists t_professional_limit on public.professionals;
create trigger t_professional_limit
  before insert or update of active on public.professionals
  for each row execute function public.enforce_professional_limit();
