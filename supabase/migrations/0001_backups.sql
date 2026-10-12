-- Winter Arc: encrypted-at-rest cloud backup, one snapshot per user.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.backups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  schema_version int not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.backups enable row level security;

-- Newer Supabase projects don't auto-grant table access; signed-in users only (never anon).
grant select, insert, update, delete on public.backups to authenticated;

-- Each user can only touch their own row, and only after passing 2-factor (aal2).
drop policy if exists "own backup, mfa required" on public.backups;
create policy "own backup, mfa required" on public.backups
  for all
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'aal') = 'aal2'
  )
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'aal') = 'aal2'
  );
