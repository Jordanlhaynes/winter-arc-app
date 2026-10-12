-- Winter Arc: give back a claimed AI quota unit when the Claude call itself fails.
-- Without this, a few transient API errors lock a user out of planning for the rest of the day.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run. Requires 0002_ai_quota.sql.
-- Run it BEFORE deploying the edge functions: they call this on failure, and without it every refund
-- fails quietly (a console.error in the function logs) and the unit stays consumed.
--
-- Only the edge functions may refund, via the service role. If end users could call this, anyone
-- signed in could reset their own daily cap from a browser console and the spending guard in
-- 0002_ai_quota.sql would be decorative.

drop function if exists public.release_ai_quota(text);

create or replace function public.release_ai_quota(p_user_id uuid, p_kind text, p_day date default current_date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Defense in depth on top of the grants below.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'release_ai_quota is reserved for the service role';
  end if;
  update public.ai_usage u
    set count = greatest(u.count - 1, 0)
    where u.user_id = p_user_id and u.day = p_day and u.kind = p_kind;
end;
$$;

revoke all on function public.release_ai_quota(uuid, text, date) from public, anon, authenticated;
grant execute on function public.release_ai_quota(uuid, text, date) to service_role;
