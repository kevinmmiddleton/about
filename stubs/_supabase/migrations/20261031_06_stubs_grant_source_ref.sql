-- The Letterboxd sync (runs as the caller) stores each row's Letterboxd URI.
grant insert (source_ref) on public.stubs_list_items to authenticated;
