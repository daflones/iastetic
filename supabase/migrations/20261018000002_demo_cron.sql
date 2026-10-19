-- Demo companies (landing "teste ao vivo") + cron de follow-ups
alter table companies alter column owner_id drop not null;
alter table companies add column if not exists is_demo boolean not null default false;

-- Empresas de demonstração por nicho
insert into companies(id,name,niche,owner_id,city,state,address,instagram,ai_config,subscription_status,subscription_until,onboarding_done,is_demo,extra) values
 ('d0000000-0000-4000-8000-0000000000a1','Studio Aurora','salao',null,'São Paulo','SP','Rua das Flores, 123 - Jardins','@studioaurora',
  '{"name":"Bia","tone":"Acolhedora e descontraída","allowed":"","forbidden":"Falar mal de concorrentes; prometer resultados de química sem avaliação","greeting":"","send_images":false,"send_audio":false,"payments_enabled":true,"require_deposit":false,"language":"pt-BR","reply_delay_sec":1,"auto_confirm":true}',
  'active', now() + interval '10 years', true, true,
  '{"brands":"Wella, Kérastase","chemical_policy":"Mechas e coloração exigem avaliação prévia gratuita","kids":"A partir de 6 anos"}'),
 ('d0000000-0000-4000-8000-0000000000a2','Espaço Manu Nails','unhas',null,'Belo Horizonte','MG','Av. Afonso Pena, 456 - Centro','@manunails',
  '{"name":"Nina","tone":"Divertida e cheia de emoji","allowed":"","forbidden":"Não falar preço de nail art personalizada sem avaliar a arte","greeting":"","send_images":false,"send_audio":false,"payments_enabled":true,"require_deposit":false,"language":"pt-BR","reply_delay_sec":1,"auto_confirm":true}',
  'active', now() + interval '10 years', true, true,
  '{"techniques":"Fibra de vidro, gel na tips, banho de gel, blindagem","maintenance_days":"21","nail_art":"Somente simples"}'),
 ('d0000000-0000-4000-8000-0000000000a3','Olhar Studio','olhar',null,'Curitiba','PR','Rua XV de Novembro, 789 - Centro','@olharstudio',
  '{"name":"Íris","tone":"Sofisticada e delicada","allowed":"","forbidden":"Não garantir resultado de micropigmentação; não atender gestante para brow lamination","greeting":"","send_images":false,"send_audio":false,"payments_enabled":true,"require_deposit":false,"language":"pt-BR","reply_delay_sec":1,"auto_confirm":true}',
  'active', now() + interval '10 years', true, true,
  '{"aftercare":"Não molhar por 24h; evitar maquiagem na região por 48h; não dormir de bruços na primeira noite","contraindications":"Gestantes (brow lamination), alergia a henna, conjuntivite ativa","maintenance_days":"15"}')
on conflict (id) do nothing;

insert into services(company_id,name,category,duration_min,price_cents,description,sort) values
 -- salão
 ('d0000000-0000-4000-8000-0000000000a1','Corte feminino','Corte',60,9000,'Corte com lavagem e finalização',1),
 ('d0000000-0000-4000-8000-0000000000a1','Corte masculino','Corte',40,5000,'',2),
 ('d0000000-0000-4000-8000-0000000000a1','Escova','Finalização',50,7000,'',3),
 ('d0000000-0000-4000-8000-0000000000a1','Coloração','Química',120,22000,'Exige avaliação prévia gratuita',4),
 ('d0000000-0000-4000-8000-0000000000a1','Mechas / Luzes','Química',180,38000,'Exige avaliação prévia gratuita',5),
 ('d0000000-0000-4000-8000-0000000000a1','Hidratação','Tratamento',45,8000,'',6),
 ('d0000000-0000-4000-8000-0000000000a1','Progressiva','Química',150,30000,'Exige avaliação prévia gratuita',7),
 -- unhas
 ('d0000000-0000-4000-8000-0000000000a2','Manicure tradicional','Mãos',45,4000,'',1),
 ('d0000000-0000-4000-8000-0000000000a2','Pedicure tradicional','Pés',50,4500,'',2),
 ('d0000000-0000-4000-8000-0000000000a2','Mão + pé','Combo',90,8000,'',3),
 ('d0000000-0000-4000-8000-0000000000a2','Esmaltação em gel','Gel',60,7000,'',4),
 ('d0000000-0000-4000-8000-0000000000a2','Alongamento em fibra','Alongamento',150,18000,'',5),
 ('d0000000-0000-4000-8000-0000000000a2','Manutenção de alongamento','Alongamento',90,11000,'A cada ~21 dias',6),
 ('d0000000-0000-4000-8000-0000000000a2','Spa dos pés','Pés',60,9000,'',7),
 -- olhar
 ('d0000000-0000-4000-8000-0000000000a3','Design de sobrancelha','Sobrancelha',30,4500,'',1),
 ('d0000000-0000-4000-8000-0000000000a3','Design com henna','Sobrancelha',45,6500,'',2),
 ('d0000000-0000-4000-8000-0000000000a3','Brow lamination','Sobrancelha',60,15000,'Não indicado para gestantes',3),
 ('d0000000-0000-4000-8000-0000000000a3','Micropigmentação','Sobrancelha',150,60000,'Inclui avaliação + retorno em 30 dias',4),
 ('d0000000-0000-4000-8000-0000000000a3','Extensão de cílios clássico','Cílios',120,18000,'',5),
 ('d0000000-0000-4000-8000-0000000000a3','Extensão volume russo','Cílios',150,25000,'',6),
 ('d0000000-0000-4000-8000-0000000000a3','Lash lifting','Cílios',60,13000,'',7),
 ('d0000000-0000-4000-8000-0000000000a3','Manutenção de cílios','Cílios',75,12000,'A cada ~15 dias',8);

insert into professionals(company_id,name,specialties) values
 ('d0000000-0000-4000-8000-0000000000a1','Carla','{"Corte","Finalização"}'),
 ('d0000000-0000-4000-8000-0000000000a1','Rafael','{"Química","Corte"}'),
 ('d0000000-0000-4000-8000-0000000000a2','Manu','{"Gel","Alongamento"}'),
 ('d0000000-0000-4000-8000-0000000000a2','Pri','{"Mãos","Pés"}'),
 ('d0000000-0000-4000-8000-0000000000a3','Ísis','{"Sobrancelha","Micropigmentação"}'),
 ('d0000000-0000-4000-8000-0000000000a3','Carol','{"Cílios","Sobrancelha"}');

-- Cron de follow-ups: a cada 15 min
select cron.schedule('followups-dispatch', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://ndnypgqieourcxpghffd.supabase.co/functions/v1/followups-cron',
    headers := '{"Content-Type":"application/json","x-cron-secret":"6ec0d3ce-f3fa-476b-bc87-c4961adb66c1"}'::jsonb,
    body := '{}'::jsonb
  )
$$);

-- Lembretes de agendamento (24h antes) — roda com o mesmo cron dentro do followups-cron? mantido separado:
select cron.schedule('appointments-reminder', '*/30 * * * *', $$
  select net.http_post(
    url := 'https://ndnypgqieourcxpghffd.supabase.co/functions/v1/followups-cron',
    headers := '{"Content-Type":"application/json","x-cron-secret":"6ec0d3ce-f3fa-476b-bc87-c4961adb66c1"}'::jsonb,
    body := '{"reminders":true}'::jsonb
  )
$$);
