-- Winter Arc: spending guard for Claude calls.
-- Every AI request must first claim quota here. Limits are enforced in the database,
-- so a buggy app or a stranger with an account can't run up the Anthropic bill.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  kind text not null,
  count int not null default 0,
  primary key (user_id, day, kind)
);

-- Locked down: no policies and no grants, so only the function below can touch it.
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

create or replace function public.claim_ai_quota(p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  per_user_limit int;
  global_limit constant int := 60;  -- all users combined, per day
  used int;
  total int;
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'sign in with 2-factor first';
  end if;

  per_user_limit := case p_kind
    when 'plan' then 4    -- 10-day plan batches
    when 'coach' then 4   -- morning + evening, with a little slack
    else 0
  end;
  if per_user_limit = 0 then
    raise exception 'unknown quota kind %', p_kind;
  end if;

  select coalesce(sum(u.count), 0) into total from public.ai_usage u where u.day = current_date;
  if total >= global_limit then
    return false;
  end if;

  insert into public.ai_usage as u (user_id, day, kind, count)
  values (auth.uid(), current_date, p_kind, 1)
  on conflict (user_id, day, kind) do update set count = u.count + 1
  returning u.count into used;

  if used > per_user_limit then
    update public.ai_usage u set count = per_user_limit
      where u.user_id = auth.uid() and u.day = current_date and u.kind = p_kind;
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.claim_ai_quota(text) from public, anon;
grant execute on function public.claim_ai_quota(text) to authenticated;
