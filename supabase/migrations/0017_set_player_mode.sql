-- Player modes: coach-only update via RPC (avoid direct profile updates)
-- Run in Supabase SQL Editor (safe to run once).

begin;

-- Helper used by roster RPCs; define defensively if missing.
create or replace function public.is_in_my_team(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and p.team_id = public.current_team_id()
  );
$$;

revoke all on function public.is_in_my_team(uuid) from public;
grant execute on function public.is_in_my_team(uuid) to authenticated;

create or replace function public.set_player_mode(p_user_id uuid, p_mode public.player_mode)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;

  if not public.is_in_my_team(p_user_id) then
    raise exception 'not_in_team';
  end if;

  update public.profiles
    set player_mode = p_mode
  where user_id = p_user_id;
end;
$$;

revoke all on function public.set_player_mode(uuid, public.player_mode) from public;
grant execute on function public.set_player_mode(uuid, public.player_mode) to authenticated;

commit;


