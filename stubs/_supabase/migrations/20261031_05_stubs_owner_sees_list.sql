-- A brand-new list must be visible to its owner inside the INSERT ... RETURNING,
-- before the after-insert trigger has added the owner as a member.
drop policy stubs_lists_read on public.stubs_lists;
create policy stubs_lists_read on public.stubs_lists for select to anon, authenticated
  using (owner_id = (select auth.uid()) or (select stubs_private.can_view(id)));
