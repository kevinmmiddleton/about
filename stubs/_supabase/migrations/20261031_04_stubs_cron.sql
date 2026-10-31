-- Stubs: run the screening matcher twice a day, 06:10 and 20:10 UTC, about
-- 50 minutes after One Night Only's 05:20 and 19:20 UTC builds publish. The shared secret lives in Supabase Vault as
-- stubs_cron_secret and as the STUBS_CRON_SECRET function secret.
select cron.schedule('stubs-match', '10 6,20 * * *', $$
  select net.http_post(
    url := 'https://jpwwsvvtfufocvteysuh.supabase.co/functions/v1/stubs-match',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-stubs-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'stubs_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
$$);
