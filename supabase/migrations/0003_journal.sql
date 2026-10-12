-- Winter Arc: notes and a general log, shared live between the phone app and the web page.
-- Unlike the Arc (local SQLite + snapshot backup), these live in the cloud so every device sees the same rows.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists notes_user_updated on public.notes (user_id, updated_at desc);
create index if not exists log_entries_user_created on public.log_entries (user_id, created_at desc);

alter table public.notes enable row level security;
alter table public.log_entries enable row level security;

grant select, insert, update, delete on public.notes to authenticated;
grant select, insert, update, delete on public.log_entries to authenticated;

-- Same rule as backups: your own rows only, and only after passing 2-factor (aal2).
drop policy if exists "own notes, mfa required" on public.notes;
create policy "own notes, mfa required" on public.notes
  for all
  to authenticated
  using ((select auth.uid()) = user_id and (select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.uid()) = user_id and (select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "own log, mfa required" on public.log_entries;
create policy "own log, mfa required" on public.log_entries
  for all
  to authenticated
  using ((select auth.uid()) = user_id and (select auth.jwt() ->> 'aal') = 'aal2')
  with check ((select auth.uid()) = user_id and (select auth.jwt() ->> 'aal') = 'aal2');

-- Realtime: push inserts/updates/deletes to the other device (RLS still applies per subscriber).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notes') then
    alter publication supabase_realtime add table public.notes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'log_entries') then
    alter publication supabase_realtime add table public.log_entries;
  end if;
end $$;
