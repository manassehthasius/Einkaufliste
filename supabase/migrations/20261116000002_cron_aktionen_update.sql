-- Aktionen 2x täglich automatisch aktualisieren (pg_cron + pg_net -> Edge Function)
-- Der Bearer-Token ist der öffentliche anon-Key (steht ohnehin in der Webseite).
create extension if not exists pg_cron;
create extension if not exists pg_net schema extensions;

-- UTC: 03:30 und 15:30 -> 04:30 / 16:30 Uhr Schweizer Winterzeit
select cron.schedule(
  'aktionen-update-morgens',
  '30 3 * * *',
  $$ select net.http_post(
       url := 'https://bjuutzhkmyaunamdojpm.supabase.co/functions/v1/aktionen-update',
       headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 120000
     ); $$
);
select cron.schedule(
  'aktionen-update-nachmittags',
  '30 15 * * *',
  $$ select net.http_post(
       url := 'https://bjuutzhkmyaunamdojpm.supabase.co/functions/v1/aktionen-update',
       headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 120000
     ); $$
);

-- Logs klein halten
select cron.schedule('scrape-log-aufraeumen', '0 2 * * 0',
  $$ delete from public.scrape_log where gestartet < now() - interval '30 days'; $$);
