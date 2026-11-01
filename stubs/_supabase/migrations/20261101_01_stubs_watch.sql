-- Stubs: nationwide "in theaters" and streaming alerts from TMDB, a home ZIP
-- setting, and New York showtimes only for people who want them.
-- Additive: new tables and columns; the alerts kind check is widened.

-- ---------------------------------------------------------------- settings
-- Private per person (profiles are public, a ZIP is not).
create table public.stubs_settings (
  user_id uuid primary key references public.stubs_profiles(id) on delete cascade,
  home_zip text check (home_zip ~ '^[0-9]{5}$'),
  nyc_showtimes boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.stubs_settings enable row level security;
revoke all on public.stubs_settings from anon, authenticated;
grant select, insert (user_id, home_zip, nyc_showtimes, updated_at),
  update (home_zip, nyc_showtimes, updated_at) on public.stubs_settings to authenticated;
create policy stubs_settings_read on public.stubs_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy stubs_settings_insert on public.stubs_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy stubs_settings_update on public.stubs_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- NYC ZIPs: Manhattan 100-102, Staten Island 103, Bronx 104, Brooklyn 112,
-- Queens 111/113/114/116 plus 11004-11005.
create or replace function stubs_private.is_nyc_zip(z text)
returns boolean language sql immutable set search_path = '' as $$
  select z ~ '^(10[0-4]|11[1-46])[0-9]{2}$' or z in ('11004', '11005');
$$;

-- New York showtimes go to people with a NYC ZIP, or no ZIP at all, unless
-- they turned them off.
create or replace function stubs_private.wants_nyc(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select s.nyc_showtimes and (s.home_zip is null or stubs_private.is_nyc_zip(s.home_zip))
                   from public.stubs_settings s where s.user_id = p_user), true);
$$;

create or replace function stubs_private.urlenc(t text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(string_agg(case when c ~ '[A-Za-z0-9._~-]' then c
    else regexp_replace(upper(encode(convert_to(c, 'UTF8'), 'hex')), '(..)', '%\1', 'g') end, '' order by i), '')
  from regexp_split_to_table(t, '') with ordinality as x(c, i);
$$;

-- ----------------------------------------------------- what TMDB says now
-- One row per film on any list, written by the stubs-watch edge function.
-- Public read: the film page shows where to watch.
create table public.stubs_film_watch (
  film_id bigint primary key references public.stubs_films(id) on delete cascade,
  tmdb_id integer not null,
  in_theaters boolean not null default false,
  theaters_since date,
  theaters_last_seen date,
  us_release date,
  stream jsonb not null default '[]',     -- [{id, name, logo}] flatrate, free, ads
  rent_buy jsonb not null default '[]',   -- [{id, name, logo}] rent or buy
  watch_link text,                        -- TMDB's where-to-watch page (JustWatch data)
  checked_at timestamptz not null default now()
);
alter table public.stubs_film_watch enable row level security;
revoke all on public.stubs_film_watch from anon, authenticated;
grant select on public.stubs_film_watch to anon, authenticated;
create policy stubs_film_watch_read on public.stubs_film_watch for select to anon, authenticated using (true);

-- A film newly streaming or newly out to rent/buy. key is unique so a service
-- that leaves and comes back never alerts twice.
create table public.stubs_watch_events (
  id bigint generated always as identity primary key,
  film_id bigint not null references public.stubs_films(id) on delete cascade,
  kind text not null check (kind in ('stream', 'rent_buy')),
  label text not null,                    -- "Netflix and Max"
  providers jsonb not null default '[]',
  key text not null unique,
  created_at timestamptz not null default now()
);
create index stubs_watch_events_film_idx on public.stubs_watch_events (film_id, created_at desc);
alter table public.stubs_watch_events enable row level security;
revoke all on public.stubs_watch_events from anon, authenticated;

-- ------------------------------------------------------------------ alerts
alter table public.stubs_alerts add column links jsonb;
alter table public.stubs_alerts drop constraint stubs_alerts_kind_check;
alter table public.stubs_alerts add constraint stubs_alerts_kind_check
  check (kind in ('screening', 'added', 'import', 'theaters', 'streaming'));

-- The alerts TMDB state implies, per person on a list with the film.
-- In theaters: once per film per theatrical run. Streaming: events from the
-- last 3 days, so someone adding a film later doesn't hear stale news.
create or replace function stubs_private.watch_alerts(p_film bigint default null)
returns table (user_id uuid, kind text, list_id uuid, film_id bigint, title text, body text,
               url text, links jsonb, dedupe_key text)
language sql stable security definer set search_path = '' as $$
  with who as (
    select distinct on (m.user_id, i.film_id) m.user_id, i.list_id, i.film_id
    from public.stubs_list_items i
    join public.stubs_list_members m on m.list_id = i.list_id
    where p_film is null or i.film_id = p_film
    order by m.user_id, i.film_id, i.added_at
  ), theaters as (
    select w.user_id, 'theaters'::text as kind, w.list_id, w.film_id,
           f.title || ' is in theaters' as title,
           case when s.home_zip is not null then 'Find showtimes near ' || s.home_zip || '.'
                else 'Find showtimes near you.' end
             || case when stubs_private.wants_nyc(w.user_id)
                      and exists (select 1 from public.stubs_screenings x where x.film_id = w.film_id)
                     then ' Exact New York times are on its page.' else '' end as body,
           'https://www.fandango.com/search?q=' || stubs_private.urlenc(f.title) || '&mode=general' as url,
           jsonb_build_array(
             jsonb_build_object('label', 'Fandango',
               'url', 'https://www.fandango.com/search?q=' || stubs_private.urlenc(f.title) || '&mode=general'),
             jsonb_build_object('label', 'Showtimes near ' || coalesce(s.home_zip, 'me'),
               'url', 'https://www.google.com/search?q='
                 || stubs_private.urlenc(f.title || ' showtimes near ' || coalesce(s.home_zip, 'me')))) as links,
           'thr:' || w.film_id || ':' || fw.theaters_since as dedupe_key
    from who w
    join public.stubs_film_watch fw on fw.film_id = w.film_id and fw.in_theaters and fw.theaters_since is not null
    join public.stubs_films f on f.id = w.film_id
    left join public.stubs_settings s on s.user_id = w.user_id
  ), streaming as (
    select w.user_id, 'streaming'::text, w.list_id, w.film_id,
           case when e.kind = 'stream' then f.title || ' is streaming on ' || e.label
                else f.title || ' is out to rent or buy' end,
           case when e.kind = 'stream' then 'New this week. Where-to-watch info from JustWatch.'
                else 'On ' || e.label || '. Where-to-watch info from JustWatch.' end,
           null::text,
           null::jsonb,
           'str:' || e.key
    from who w
    join public.stubs_watch_events e on e.film_id = w.film_id and e.created_at > now() - interval '3 days'
    join public.stubs_films f on f.id = w.film_id
  )
  select * from theaters union all select * from streaming;
$$;

create or replace function stubs_private.fanout_watch(p_film bigint default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with ins as (
    insert into public.stubs_alerts (user_id, kind, list_id, film_id, title, body, url, links, dedupe_key)
    select a.user_id, a.kind, a.list_id, a.film_id, a.title, a.body, a.url, a.links, a.dedupe_key
    from stubs_private.watch_alerts(p_film) a
    on conflict (user_id, dedupe_key) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;

-- New York screening alerts, now only for people who want New York times.
-- (Same as 20261031_02 otherwise; "Just one show." replaces the old phrase.)
create or replace function stubs_private.fanout_screenings(p_film bigint default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with runs as (
    select s.film_id, s.run_key, s.venue_slug, min(s.venue_name) as venue_name,
           min(s.starts_at) as first_at, count(*) as shows,
           (array_agg(s.url order by s.starts_at))[1] as url
    from public.stubs_screenings s
    where s.starts_at >= (now() at time zone 'America/New_York')
      and (p_film is null or s.film_id = p_film)
    group by s.film_id, s.run_key, s.venue_slug
  ), who as (
    select distinct on (m.user_id, r.film_id, r.run_key)
           m.user_id, i.list_id, r.*
    from runs r
    join public.stubs_list_items i on i.film_id = r.film_id
    join public.stubs_list_members m on m.list_id = i.list_id
    where stubs_private.wants_nyc(m.user_id)
    order by m.user_id, r.film_id, r.run_key, i.added_at
  ), ins as (
    insert into public.stubs_alerts (user_id, kind, list_id, film_id, title, body, url, starts_at, dedupe_key)
    select w.user_id, 'screening', w.list_id, w.film_id,
           f.title || ' is playing at ' || w.venue_name,
           'First show ' || to_char(w.first_at, 'Dy Mon FMDD, FMHH12:MI AM')
             || case when w.shows > 1 then '. ' || w.shows || ' showtimes.' else '. Just one show.' end,
           w.url, w.first_at, 'scr:' || w.film_id || ':' || w.run_key
    from who w join public.stubs_films f on f.id = w.film_id
    on conflict (user_id, dedupe_key) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;

-- Adds and joins also pick up what TMDB already knows.
create or replace function stubs_private.on_item_added()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_list text; v_film text; v_who text;
begin
  select kind, name into v_kind, v_list from public.stubs_lists where id = new.list_id;
  if v_kind is distinct from 'letterboxd' and new.added_by is not null then
    select title || coalesce(' (' || year || ')', '') into v_film from public.stubs_films where id = new.film_id;
    select display_name into v_who from public.stubs_profiles where id = new.added_by;
    insert into public.stubs_alerts (user_id, kind, list_id, film_id, actor_id, title, body, dedupe_key)
    select m.user_id, 'added', new.list_id, new.film_id, new.added_by,
           coalesce(v_who, 'Someone') || ' added ' || v_film,
           'On ' || v_list || '.', 'add:' || new.id
    from public.stubs_list_members m
    where m.list_id = new.list_id and m.user_id <> new.added_by
    on conflict (user_id, dedupe_key) do nothing;
  end if;
  perform stubs_private.fanout_screenings(new.film_id);
  perform stubs_private.fanout_watch(new.film_id);
  return new;
end $$;

create or replace function stubs_private.on_member_added()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform stubs_private.fanout_screenings(i.film_id)
  from public.stubs_list_items i
  where i.list_id = new.list_id
    and exists (select 1 from public.stubs_screenings s where s.film_id = i.film_id);
  perform stubs_private.fanout_watch(i.film_id)
  from public.stubs_list_items i
  where i.list_id = new.list_id
    and exists (select 1 from public.stubs_film_watch w where w.film_id = i.film_id);
  return new;
end $$;

-- ------------------------------------------------- service-role entry points
create or replace function public.stubs_run_watch_fanout()
returns integer language sql security definer set search_path = '' as $$
  select stubs_private.fanout_watch(null);
$$;

-- Dry run: what fanout would send, and whether each one already went out.
create or replace function public.stubs_watch_preview()
returns table (user_id uuid, handle text, kind text, film_id bigint, title text, body text,
               url text, links jsonb, dedupe_key text, already_sent boolean)
language sql stable security definer set search_path = '' as $$
  select a.user_id, p.handle, a.kind, a.film_id, a.title, a.body, a.url, a.links, a.dedupe_key,
         exists (select 1 from public.stubs_alerts x where x.user_id = a.user_id and x.dedupe_key = a.dedupe_key)
  from stubs_private.watch_alerts(null) a join public.stubs_profiles p on p.id = a.user_id;
$$;

-- The TMDB read token lives in Supabase Vault (name stubs_tmdb_token).
create or replace function public.stubs_tmdb_token()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'stubs_tmdb_token' limit 1;
$$;
-- Set or rotate it (service role only): rpc stubs_set_tmdb_token { p_token }.
create or replace function public.stubs_set_tmdb_token(p_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_token is null or length(p_token) < 20 then raise exception 'that does not look like a token'; end if;
  select id into v_id from vault.secrets where name = 'stubs_tmdb_token';
  if v_id is null then perform vault.create_secret(p_token, 'stubs_tmdb_token', 'TMDB API read access token for Stubs');
  else perform vault.update_secret(v_id, p_token); end if;
  return true;
end $$;

revoke all on function stubs_private.is_nyc_zip(text), stubs_private.wants_nyc(uuid), stubs_private.urlenc(text),
  stubs_private.watch_alerts(bigint), stubs_private.fanout_watch(bigint) from public, anon, authenticated;
revoke all on function public.stubs_run_watch_fanout(), public.stubs_watch_preview(), public.stubs_tmdb_token(),
  public.stubs_set_tmdb_token(text) from public, anon, authenticated;
grant execute on function public.stubs_run_watch_fanout(), public.stubs_watch_preview(), public.stubs_tmdb_token(),
  public.stubs_set_tmdb_token(text) to service_role;
grant execute on function stubs_private.fanout_watch(bigint) to service_role;
