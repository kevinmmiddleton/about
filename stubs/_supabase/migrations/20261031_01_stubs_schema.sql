-- Stubs: a movie diary with shared watchlists and NYC screening alerts.
-- Lives in Kevin's personal project next to unrelated tables, so everything is
-- prefixed stubs_, RLS is on for every table, and helpers that need to bypass
-- RLS live in stubs_private (not exposed through the API).

create schema if not exists stubs_private;
revoke all on schema stubs_private from public;
grant usage on schema stubs_private to anon, authenticated, service_role;

-- ---------------------------------------------------------------- profiles
create table public.stubs_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{2,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio text check (char_length(bio) <= 200),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- films
-- Written only by the stubs-films edge function (service role).
create table public.stubs_films (
  id bigint generated always as identity primary key,
  wikidata_id text unique,
  tmdb_id integer unique,
  title text not null,
  year smallint,
  director text,
  runtime_min smallint,
  genres text[] not null default '{}',
  overview text,
  poster_url text,
  backdrop_url text,
  wiki_title text,
  source text not null default 'wikidata' check (source in ('wikidata','tmdb')),
  norm_title text generated always as (
    regexp_replace(lower(title), '[^a-z0-9]+', '', 'g')) stored,
  updated_at timestamptz not null default now()
);
create index stubs_films_norm_idx on public.stubs_films (norm_title, year);

-- name+year -> film, so re-imports and repeat searches skip the network.
create table public.stubs_film_lookup (
  key text primary key,
  film_id bigint references public.stubs_films(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index stubs_film_lookup_film_idx on public.stubs_film_lookup (film_id);

-- -------------------------------------------------------------------- diary
create table public.stubs_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.stubs_profiles(id) on delete cascade,
  film_id bigint not null references public.stubs_films(id) on delete cascade,
  watched_on date not null default (now() at time zone 'America/New_York')::date,
  rating numeric(2,1) check (rating is null or (rating between 0.5 and 5 and rating * 2 = floor(rating * 2))),
  liked boolean not null default false,
  rewatch boolean not null default false,
  review text check (char_length(review) <= 1000),
  created_at timestamptz not null default now()
);
create index stubs_logs_user_idx on public.stubs_logs (user_id, watched_on desc);
create index stubs_logs_film_idx on public.stubs_logs (film_id);
create index stubs_logs_recent_idx on public.stubs_logs (created_at desc);

create table public.stubs_follows (
  follower_id uuid not null references public.stubs_profiles(id) on delete cascade,
  followee_id uuid not null references public.stubs_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index stubs_follows_followee_idx on public.stubs_follows (followee_id);

-- -------------------------------------------------------------------- lists
create table public.stubs_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.stubs_profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 300),
  kind text not null default 'shared' check (kind in ('personal','shared','letterboxd')),
  is_public boolean not null default false,
  invite_token uuid not null default gen_random_uuid() unique,
  lb_synced_at timestamptz,
  lb_last_diff jsonb,
  created_at timestamptz not null default now()
);
create index stubs_lists_owner_idx on public.stubs_lists (owner_id);

create table public.stubs_list_members (
  list_id uuid not null references public.stubs_lists(id) on delete cascade,
  user_id uuid not null references public.stubs_profiles(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner','editor','follower')),
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index stubs_list_members_user_idx on public.stubs_list_members (user_id);

create table public.stubs_list_items (
  id bigint generated always as identity primary key,
  list_id uuid not null references public.stubs_lists(id) on delete cascade,
  film_id bigint not null references public.stubs_films(id) on delete cascade,
  added_by uuid references public.stubs_profiles(id) on delete set null,
  note text check (char_length(note) <= 200),
  source_ref text check (char_length(source_ref) <= 300),
  added_at timestamptz not null default now(),
  unique (list_id, film_id)
);
create index stubs_list_items_film_idx on public.stubs_list_items (film_id);
create index stubs_list_items_added_by_idx on public.stubs_list_items (added_by);

create table public.stubs_votes (
  item_id bigint not null references public.stubs_list_items(id) on delete cascade,
  list_id uuid not null references public.stubs_lists(id) on delete cascade,
  user_id uuid not null references public.stubs_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index stubs_votes_list_idx on public.stubs_votes (list_id);
create index stubs_votes_user_idx on public.stubs_votes (user_id);

-- --------------------------------------------------------------- screenings
-- Upcoming NYC screenings for films that sit on some list, copied from One
-- Night Only's public screenings.json by the stubs-match edge function.
create table public.stubs_screenings (
  uid text primary key,
  film_id bigint not null references public.stubs_films(id) on delete cascade,
  venue_slug text not null,
  venue_name text not null,
  venue_address text,
  starts_at timestamp not null,            -- America/New_York wall time
  url text,
  format text,
  run_key text not null,
  title_raw text not null,
  seen_at timestamptz not null default now()
);
create index stubs_screenings_film_idx on public.stubs_screenings (film_id, starts_at);

-- ------------------------------------------------------------------- alerts
create table public.stubs_alerts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.stubs_profiles(id) on delete cascade,
  kind text not null check (kind in ('screening','added','import')),
  list_id uuid references public.stubs_lists(id) on delete cascade,
  film_id bigint references public.stubs_films(id) on delete cascade,
  actor_id uuid references public.stubs_profiles(id) on delete set null,
  title text not null,
  body text,
  url text,
  starts_at timestamp,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);
create index stubs_alerts_user_idx on public.stubs_alerts (user_id, created_at desc);
create index stubs_alerts_list_idx on public.stubs_alerts (list_id);
create index stubs_alerts_film_idx on public.stubs_alerts (film_id);
create index stubs_alerts_actor_idx on public.stubs_alerts (actor_id);

-- Secret token per user for the iCal and RSS feeds.
create table public.stubs_feed_tokens (
  user_id uuid primary key references public.stubs_profiles(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Ops tables: service role only.
create table public.stubs_runs (
  id bigint generated always as identity primary key,
  job text not null,
  ok boolean not null,
  detail jsonb,
  ran_at timestamptz not null default now()
);
create table public.stubs_login_requests (
  id bigint generated always as identity primary key,
  email text not null,
  outcome text not null,
  requested_at timestamptz not null default now()
);
create index stubs_login_requests_email_idx on public.stubs_login_requests (email, requested_at desc);

-- ------------------------------------------------------------------ helpers
create or replace function stubs_private.can_view(p_list uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.stubs_lists l where l.id = p_list and l.is_public)
      or exists (select 1 from public.stubs_list_members m
                 where m.list_id = p_list and m.user_id = (select auth.uid()));
$$;

create or replace function stubs_private.can_edit(p_list uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.stubs_list_members m
                 where m.list_id = p_list and m.user_id = (select auth.uid())
                   and m.role in ('owner','editor'));
$$;

create or replace function stubs_private.is_owner(p_list uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.stubs_lists l
                 where l.id = p_list and l.owner_id = (select auth.uid()));
$$;

revoke all on function stubs_private.can_view(uuid), stubs_private.can_edit(uuid),
  stubs_private.is_owner(uuid) from public;
grant execute on function stubs_private.can_view(uuid) to anon, authenticated;
grant execute on function stubs_private.can_edit(uuid), stubs_private.is_owner(uuid) to authenticated;

-- --------------------------------------------------------------------- RLS
alter table public.stubs_profiles enable row level security;
alter table public.stubs_films enable row level security;
alter table public.stubs_film_lookup enable row level security;
alter table public.stubs_logs enable row level security;
alter table public.stubs_follows enable row level security;
alter table public.stubs_lists enable row level security;
alter table public.stubs_list_members enable row level security;
alter table public.stubs_list_items enable row level security;
alter table public.stubs_votes enable row level security;
alter table public.stubs_screenings enable row level security;
alter table public.stubs_alerts enable row level security;
alter table public.stubs_feed_tokens enable row level security;
alter table public.stubs_runs enable row level security;
alter table public.stubs_login_requests enable row level security;

-- Supabase grants everything on new public tables to anon/authenticated by
-- default. Take it all back, then grant only what each table needs.
revoke all on public.stubs_profiles, public.stubs_films, public.stubs_film_lookup,
  public.stubs_logs, public.stubs_follows, public.stubs_lists, public.stubs_list_members,
  public.stubs_list_items, public.stubs_votes, public.stubs_screenings, public.stubs_alerts,
  public.stubs_feed_tokens, public.stubs_runs, public.stubs_login_requests
  from anon, authenticated;

-- profiles: public read; you write only your own, and never is_demo.
grant select on public.stubs_profiles to anon, authenticated;
grant insert (id, handle, display_name, bio) on public.stubs_profiles to authenticated;
grant update (handle, display_name, bio) on public.stubs_profiles to authenticated;
create policy stubs_profiles_read on public.stubs_profiles for select to anon, authenticated using (true);
create policy stubs_profiles_insert on public.stubs_profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy stubs_profiles_update on public.stubs_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- films + screenings: public catalogue, written by the service role.
grant select on public.stubs_films, public.stubs_screenings to anon, authenticated;
create policy stubs_films_read on public.stubs_films for select to anon, authenticated using (true);
create policy stubs_screenings_read on public.stubs_screenings for select to anon, authenticated using (true);

-- diary: public read (like any film diary), owner-only writes.
grant select on public.stubs_logs to anon, authenticated;
grant insert (user_id, film_id, watched_on, rating, liked, rewatch, review) on public.stubs_logs to authenticated;
grant update (watched_on, rating, liked, rewatch, review) on public.stubs_logs to authenticated;
grant delete on public.stubs_logs to authenticated;
create policy stubs_logs_read on public.stubs_logs for select to anon, authenticated using (true);
create policy stubs_logs_insert on public.stubs_logs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy stubs_logs_update on public.stubs_logs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy stubs_logs_delete on public.stubs_logs for delete to authenticated
  using (user_id = (select auth.uid()));

-- follows
grant select on public.stubs_follows to anon, authenticated;
grant insert (follower_id, followee_id), delete on public.stubs_follows to authenticated;
create policy stubs_follows_read on public.stubs_follows for select to anon, authenticated using (true);
create policy stubs_follows_insert on public.stubs_follows for insert to authenticated
  with check (follower_id = (select auth.uid()));
create policy stubs_follows_delete on public.stubs_follows for delete to authenticated
  using (follower_id = (select auth.uid()));

-- lists: members (or anyone, if public) can see; invite_token is never
-- selectable directly (column grant), only through stubs_invite_token().
grant select (id, owner_id, name, description, kind, is_public, lb_synced_at, lb_last_diff, created_at)
  on public.stubs_lists to anon, authenticated;
grant insert (owner_id, name, description, kind, is_public) on public.stubs_lists to authenticated;
grant update (name, description, is_public) on public.stubs_lists to authenticated;
grant delete on public.stubs_lists to authenticated;
create policy stubs_lists_read on public.stubs_lists for select to anon, authenticated
  using ((select stubs_private.can_view(id)));
create policy stubs_lists_insert on public.stubs_lists for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy stubs_lists_update on public.stubs_lists for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy stubs_lists_delete on public.stubs_lists for delete to authenticated
  using (owner_id = (select auth.uid()));

-- members: joining as an editor goes through stubs_join_list(); anyone may
-- follow a public list; you may leave; the owner may remove people.
grant select on public.stubs_list_members to anon, authenticated;
grant insert (list_id, user_id, role), delete on public.stubs_list_members to authenticated;
create policy stubs_members_read on public.stubs_list_members for select to anon, authenticated
  using ((select stubs_private.can_view(list_id)));
create policy stubs_members_follow on public.stubs_list_members for insert to authenticated
  with check (user_id = (select auth.uid()) and role = 'follower'
              and exists (select 1 from public.stubs_lists l where l.id = list_id and l.is_public));
create policy stubs_members_leave on public.stubs_list_members for delete to authenticated
  using ((user_id = (select auth.uid()) and role <> 'owner')
         or (role <> 'owner' and (select stubs_private.is_owner(list_id))));

-- items + votes: visible with the list, editable by owner/editors.
grant select on public.stubs_list_items, public.stubs_votes to anon, authenticated;
grant insert (list_id, film_id, added_by, note), delete on public.stubs_list_items to authenticated;
grant insert (item_id, list_id, user_id), delete on public.stubs_votes to authenticated;
create policy stubs_items_read on public.stubs_list_items for select to anon, authenticated
  using ((select stubs_private.can_view(list_id)));
create policy stubs_items_insert on public.stubs_list_items for insert to authenticated
  with check (added_by = (select auth.uid()) and (select stubs_private.can_edit(list_id)));
create policy stubs_items_delete on public.stubs_list_items for delete to authenticated
  using ((select stubs_private.can_edit(list_id)));
create policy stubs_votes_read on public.stubs_votes for select to anon, authenticated
  using ((select stubs_private.can_view(list_id)));
create policy stubs_votes_insert on public.stubs_votes for insert to authenticated
  with check (user_id = (select auth.uid()) and (select stubs_private.can_edit(list_id))
              and exists (select 1 from public.stubs_list_items i where i.id = item_id and i.list_id = stubs_votes.list_id));
create policy stubs_votes_delete on public.stubs_votes for delete to authenticated
  using (user_id = (select auth.uid()));

-- alerts: yours only; the client may only mark them read.
grant select, update (read_at) on public.stubs_alerts to authenticated;
create policy stubs_alerts_read on public.stubs_alerts for select to authenticated
  using (user_id = (select auth.uid()));
create policy stubs_alerts_mark on public.stubs_alerts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- feed tokens: yours only, read-only (rotate through stubs_rotate_feed_token()).
grant select on public.stubs_feed_tokens to authenticated;
create policy stubs_feed_tokens_read on public.stubs_feed_tokens for select to authenticated
  using (user_id = (select auth.uid()));

-- stubs_film_lookup, stubs_runs, stubs_login_requests: no client access at all.
