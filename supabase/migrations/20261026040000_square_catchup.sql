-- Every 15 minutes the database asks the square Edge Function to pull anything Square sent that didn't arrive
-- (a notice that failed for longer than Square's day of retries, while nobody opened Sole). It runs on Supabase alone.
-- The call carries a token made and kept inside the database (Vault); the function checks it with cron_token_ok(),
-- which only the service role may run, so the token never leaves the database or appears in the repository.
create extension if not exists pg_net;

select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'sole_cron_token', 'Square catch-up job')
where not exists (select 1 from vault.secrets where name = 'sole_cron_token');

create or replace function public.cron_token_ok(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'sole_cron_token' and decrypted_secret = t)
$$;
revoke all on function public.cron_token_ok(text) from public, anon, authenticated;
grant execute on function public.cron_token_ok(text) to service_role;

select cron.unschedule('sole-square-catchup') where exists (select 1 from cron.job where jobname = 'sole-square-catchup');
select cron.schedule('sole-square-catchup', '*/15 * * * *', $job$
  select net.http_post(
    url := 'https://qfimqsqmxiqiydjexkfc.supabase.co/functions/v1/square',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sole-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'sole_cron_token')),
    body := '{"cron":true}'::jsonb,
    timeout_milliseconds := 60000)
$job$);
