-- Stubs: run the TMDB watch job twice a day, 11:20 and 23:20 UTC (morning and
-- evening in New York). Same shared secret as stubs-match.
select cron.schedule('stubs-watch', '20 11,23 * * *', $$
  select net.http_post(
    url := 'https://jpwwsvvtfufocvteysuh.supabase.co/functions/v1/stubs-watch',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-stubs-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'stubs_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
$$);
