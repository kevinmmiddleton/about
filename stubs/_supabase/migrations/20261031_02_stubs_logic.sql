-- Stubs: triggers, alert fan-out, and the few RPCs the client calls.

-- New profile -> feed token.
create or replace function stubs_private.on_profile_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.stubs_feed_tokens (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger stubs_profile_created after insert on public.stubs_profiles
  for each row execute function stubs_private.on_profile_created();

-- New list -> its owner is a member.
create or replace function stubs_private.on_list_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.stubs_list_members (list_id, user_id, role)
  values (new.id, new.owner_id, 'owner') on conflict do nothing;
  return new;
end $$;
create trigger stubs_list_created after insert on public.stubs_lists
  for each row execute function stubs_private.on_list_created();

-- Screening alerts: one per person, per film, per run at a venue. Idempotent
-- (dedupe_key), so the matcher and the add-trigger can both call it freely.
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
    order by m.user_id, r.film_id, r.run_key, i.added_at
  ), ins as (
    insert into public.stubs_alerts (user_id, kind, list_id, film_id, title, body, url, starts_at, dedupe_key)
    select w.user_id, 'screening', w.list_id, w.film_id,
           f.title || ' is playing at ' || w.venue_name,
           'First show ' || to_char(w.first_at, 'Dy Mon FMDD, FMHH12:MI AM')
             || case when w.shows > 1 then '. ' || w.shows || ' showtimes.' else '. One night only.' end,
           w.url, w.first_at, 'scr:' || w.film_id || ':' || w.run_key
    from who w join public.stubs_films f on f.id = w.film_id
    on conflict (user_id, dedupe_key) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;

-- Someone added a film to a list you're on -> alert (not for Letterboxd syncs,
-- which would bury you in hundreds). Also fire screening alerts right away if
-- the film is already known to be playing.
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
  return new;
end $$;
create trigger stubs_item_added after insert on public.stubs_list_items
  for each row execute function stubs_private.on_item_added();

-- New member -> screening alerts for what's already on the list.
create or replace function stubs_private.on_member_added()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform stubs_private.fanout_screenings(i.film_id)
  from public.stubs_list_items i
  where i.list_id = new.list_id
    and exists (select 1 from public.stubs_screenings s where s.film_id = i.film_id);
  return new;
end $$;
create trigger stubs_member_added after insert on public.stubs_list_members
  for each row execute function stubs_private.on_member_added();

revoke all on function stubs_private.on_profile_created(), stubs_private.on_list_created(),
  stubs_private.on_item_added(), stubs_private.on_member_added(),
  stubs_private.fanout_screenings(bigint) from public, anon, authenticated;
grant execute on function stubs_private.fanout_screenings(bigint) to service_role;

-- ------------------------------------------------------------------ RPCs
-- Join a list from its share link. Returns the list id.
create or replace function public.stubs_join_list(p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_list uuid; v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  if not exists (select 1 from public.stubs_profiles where id = v_uid) then
    raise exception 'pick a handle first';
  end if;
  select id into v_list from public.stubs_lists where invite_token = p_token and kind <> 'letterboxd';
  if v_list is null then raise exception 'that invite link does not work anymore'; end if;
  insert into public.stubs_list_members (list_id, user_id, role) values (v_list, v_uid, 'editor')
  on conflict (list_id, user_id) do update set role = 'editor'
    where public.stubs_list_members.role = 'follower';
  return v_list;
end $$;

-- Peek at a list from its share link before joining (name, owner, size).
create or replace function public.stubs_invite_preview(p_token uuid)
returns table (list_id uuid, name text, owner_name text, films integer, members integer)
language sql stable security definer set search_path = '' as $$
  select l.id, l.name, p.display_name,
         (select count(*)::int from public.stubs_list_items i where i.list_id = l.id),
         (select count(*)::int from public.stubs_list_members m where m.list_id = l.id and m.role <> 'follower')
  from public.stubs_lists l join public.stubs_profiles p on p.id = l.owner_id
  where l.invite_token = p_token and l.kind <> 'letterboxd';
$$;

-- The share link token, for owners and editors only.
create or replace function public.stubs_invite_token(p_list uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select l.invite_token from public.stubs_lists l
  where l.id = p_list and exists (select 1 from public.stubs_list_members m
    where m.list_id = l.id and m.user_id = (select auth.uid()) and m.role in ('owner','editor'));
$$;

-- New share link (old one stops working). Owner only.
create or replace function public.stubs_reset_invite(p_list uuid)
returns uuid language sql security definer set search_path = '' as $$
  update public.stubs_lists set invite_token = gen_random_uuid()
  where id = p_list and owner_id = (select auth.uid())
  returning invite_token;
$$;

create or replace function public.stubs_rotate_feed_token()
returns uuid language sql security definer set search_path = '' as $$
  update public.stubs_feed_tokens set token = gen_random_uuid()
  where user_id = (select auth.uid()) returning token;
$$;

-- Letterboxd watchlist import / refresh. Runs as the caller (RLS applies).
-- p_films: film ids in export order; p_refs: the matching Letterboxd URIs.
-- Returns what changed so the page can show it.
create or replace function public.stubs_sync_letterboxd(
  p_list uuid, p_name text, p_films bigint[], p_refs text[], p_unmatched integer default 0)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_list uuid := p_list;
  v_added bigint[]; v_removed bigint[]; v_kept integer; v_diff jsonb;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  if coalesce(array_length(p_films, 1), 0) > 3000 then raise exception 'that watchlist is too big (3,000 max)'; end if;
  if v_list is null then
    insert into public.stubs_lists (owner_id, name, kind, description)
    values (v_uid, left('Letterboxd: ' || coalesce(nullif(trim(p_name), ''), 'my watchlist'), 80), 'letterboxd',
            'Imported from a Letterboxd export. Upload a fresh export to refresh it.')
    returning id into v_list;
  elsif not exists (select 1 from public.stubs_lists where id = v_list and owner_id = v_uid and kind = 'letterboxd') then
    raise exception 'not your Letterboxd list';
  end if;

  select coalesce(array_agg(i.film_id), '{}') into v_removed
  from public.stubs_list_items i where i.list_id = v_list and not (i.film_id = any (p_films));
  delete from public.stubs_list_items i where i.list_id = v_list and i.film_id = any (v_removed);

  with incoming as (
    select distinct on (f) f as film_id, r as ref
    from unnest(p_films, p_refs) as u(f, r) where f is not null
  ), ins as (
    insert into public.stubs_list_items (list_id, film_id, added_by, source_ref)
    select v_list, film_id, v_uid, ref from incoming
    on conflict (list_id, film_id) do nothing
    returning film_id
  )
  select coalesce(array_agg(film_id), '{}') into v_added from ins;

  select count(*) into v_kept from public.stubs_list_items where list_id = v_list;
  v_kept := v_kept - coalesce(array_length(v_added, 1), 0);
  v_diff := jsonb_build_object('added', to_jsonb(v_added), 'removed', to_jsonb(v_removed),
                               'kept', v_kept, 'unmatched', p_unmatched, 'at', now());
  update public.stubs_lists set lb_synced_at = now(), lb_last_diff = v_diff where id = v_list;
  return v_diff || jsonb_build_object('list_id', v_list);
end $$;
grant update (lb_synced_at, lb_last_diff) on public.stubs_lists to authenticated;

revoke all on function public.stubs_join_list(uuid), public.stubs_invite_preview(uuid),
  public.stubs_invite_token(uuid), public.stubs_reset_invite(uuid), public.stubs_rotate_feed_token(),
  public.stubs_sync_letterboxd(uuid, text, bigint[], text[], integer) from public, anon;
grant execute on function public.stubs_join_list(uuid), public.stubs_invite_token(uuid),
  public.stubs_reset_invite(uuid), public.stubs_rotate_feed_token(),
  public.stubs_sync_letterboxd(uuid, text, bigint[], text[], integer) to authenticated;
grant execute on function public.stubs_invite_preview(uuid) to anon, authenticated;

-- Realtime for shared lists.
alter publication supabase_realtime add table public.stubs_list_items, public.stubs_votes,
  public.stubs_list_members, public.stubs_alerts;
