-- Stubs: service-only helpers for the edge functions.

-- stubs-login: does this address already have an account? (service role only)
create or replace function public.stubs_user_exists(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users where lower(email) = lower(p_email));
$$;

-- stubs-match: run the screening fan-out for every film. (service role only)
create or replace function public.stubs_run_fanout()
returns integer language sql security definer set search_path = '' as $$
  select stubs_private.fanout_screenings(null);
$$;

revoke all on function public.stubs_user_exists(text), public.stubs_run_fanout() from public, anon, authenticated;
grant execute on function public.stubs_user_exists(text), public.stubs_run_fanout() to service_role;
