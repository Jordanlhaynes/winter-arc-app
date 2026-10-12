-- Winter Arc: let the database be the clock for notes.
-- The app merges live changes by comparing updated_at (journalStore.upsert keeps the newer row).
-- When each device stamps its own updated_at, a phone and a browser whose clocks differ by a few
-- seconds silently reject each other's edits. This trigger stamps every update server-side instead.
-- Apply BEFORE shipping the client that stops sending updated_at (src/sync/journal.ts updateNote).
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Overwrites whatever the client sent (older app versions still send their own clock), so the
  -- stamp always comes from the database. now() is the transaction start: one stamp per edit.
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_touch_updated_at on public.notes;
create trigger notes_touch_updated_at
  before update on public.notes
  for each row
  execute function public.touch_updated_at();
