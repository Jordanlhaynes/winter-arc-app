-- Serialize quota claims across accounts as well as within each account.
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

  -- All users share this transaction lock for the UTC quota day.
  perform pg_catalog.pg_advisory_xact_lock(874120, (current_date - date '2000-01-01')::int);
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
