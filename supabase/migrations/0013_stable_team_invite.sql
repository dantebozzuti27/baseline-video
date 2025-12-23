-- Stable team invite link (no rotation)
-- Run in Supabase SQL Editor (safe to run once).

begin;

create extension if not exists pgcrypto with schema extensions;

-- Returns a non-expiring invite token for the current coach's team.
-- Creates one if missing.
create or replace function public.get_or_create_team_invite()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_token text;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;

  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  select token into v_token
  from public.invites
  where team_id = v_team_id
    and expires_at is null
  order by created_at desc
  limit 1;

  if v_token is not null then
    return v_token;
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.invites (team_id, created_by_user_id, token, expires_at, max_uses)
  values (v_team_id, auth.uid(), v_token, null, 100000);

  return v_token;
end;
$$;

revoke all on function public.get_or_create_team_invite() from public;
grant execute on function public.get_or_create_team_invite() to authenticated;

commit;


