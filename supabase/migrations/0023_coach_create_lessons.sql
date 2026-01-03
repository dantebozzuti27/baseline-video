-- Coach can schedule lessons directly (approved) like Outlook
-- Adds RPC: public.create_lesson_as_coach(...)

begin;

create or replace function public.create_lesson_as_coach(
  p_primary_player_user_id uuid,
  p_second_player_user_id uuid default null,
  p_mode public.lesson_mode,
  p_start_at timestamptz,
  p_minutes integer,
  p_timezone text default 'UTC',
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_end_at timestamptz;
  v_lesson_id uuid;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;

  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  if p_minutes is null or p_minutes < 15 or p_minutes > 180 then
    raise exception 'invalid_duration';
  end if;

  if p_start_at is null then
    raise exception 'invalid_start';
  end if;

  v_end_at := p_start_at + make_interval(mins => p_minutes);

  if p_primary_player_user_id is null then
    raise exception 'invalid_primary_player';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_primary_player_user_id
      and p.team_id = v_team_id
      and p.role = 'player'
      and (p.is_active is null or p.is_active = true)
  ) then
    raise exception 'invalid_primary_player';
  end if;

  if p_second_player_user_id is not null then
    if p_second_player_user_id = p_primary_player_user_id then
      raise exception 'invalid_second_player';
    end if;
    if not exists (
      select 1 from public.profiles p
      where p.user_id = p_second_player_user_id
        and p.team_id = v_team_id
        and p.role = 'player'
        and (p.is_active is null or p.is_active = true)
    ) then
      raise exception 'invalid_second_player';
    end if;
  end if;

  -- Conflicts: blocks and any approved/requested lessons for this coach.
  if exists (
    select 1
    from public.coach_time_blocks b
    where b.team_id = v_team_id
      and b.coach_user_id = auth.uid()
      and b.start_at < v_end_at
      and b.end_at > p_start_at
  ) then
    raise exception 'blocked';
  end if;

  if exists (
    select 1
    from public.lessons l
    where l.team_id = v_team_id
      and l.coach_user_id = auth.uid()
      and l.status in ('approved', 'requested')
      and l.start_at < v_end_at
      and l.end_at > p_start_at
  ) then
    raise exception 'conflict';
  end if;

  insert into public.lessons (team_id, coach_user_id, created_by_user_id, mode, start_at, end_at, timezone, status, notes)
  values (
    v_team_id,
    auth.uid(),
    auth.uid(),
    p_mode,
    p_start_at,
    v_end_at,
    coalesce(nullif(trim(p_timezone), ''), 'UTC'),
    'approved',
    nullif(trim(p_notes), '')
  )
  returning id into v_lesson_id;

  -- Primary player is accepted by default (no extra confirmation).
  insert into public.lesson_participants (lesson_id, user_id, invite_status, is_primary, invited_by_user_id, invited_at, responded_at)
  values (v_lesson_id, p_primary_player_user_id, 'accepted', true, auth.uid(), now(), now());

  -- Second player must accept/decline.
  if p_second_player_user_id is not null then
    insert into public.lesson_participants (lesson_id, user_id, invite_status, is_primary, invited_by_user_id)
    values (v_lesson_id, p_second_player_user_id, 'invited', false, auth.uid())
    on conflict do nothing;
  end if;

  begin
    perform public.log_event(
      'lesson_created_by_coach',
      'lesson',
      v_lesson_id,
      jsonb_build_object('mode', p_mode, 'start_at', p_start_at, 'minutes', p_minutes)
    );
  exception when undefined_function then
    null;
  end;

  return v_lesson_id;
end;
$$;

revoke all on function public.create_lesson_as_coach(uuid, uuid, public.lesson_mode, timestamptz, integer, text, text) from public;
grant execute on function public.create_lesson_as_coach(uuid, uuid, public.lesson_mode, timestamptz, integer, text, text) to authenticated;

commit;


