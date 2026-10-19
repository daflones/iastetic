-- Escalada de handoff: verifica a cada 1 min se algum cliente que pediu
-- atendimento humano ficou sem resposta por 2+ min e avisa o atendente.
select cron.schedule('handoffs-escalate', '* * * * *', $$
  select net.http_post(
    url := 'https://ndnypgqieourcxpghffd.supabase.co/functions/v1/followups-cron',
    headers := '{"Content-Type":"application/json","x-cron-secret":"6ec0d3ce-f3fa-476b-bc87-c4961adb66c1"}'::jsonb,
    body := '{"handoffs":true}'::jsonb
  )
$$);
