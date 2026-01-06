-- Increase lesson participant limit from 2 to 6
-- This allows clinics and group lessons beyond just 2-on-1
-- Run in Supabase SQL Editor

begin;

-- Add max_participants setting to coach_schedule_settings
alter table public.coach_schedule_settings
  add column if not exists max_participants_per_lesson integer not null default 2
  check (max_participants_per_lesson between 1 and 6);

-- Update create_lesson_as_coach to support multiple additional players
-- Drop and recreate the function with new signature
drop function if exists public.create_lesson_as_coach(uuid, uuid, text, text, integer, text, text);

create or replace function public.create_lesson_as_coach(
  p_primary_player_user_id uuid,
  p_additional_player_ids uuid[] default array[]::uuid[],
  p_mode text default 'in_person',
  p_start_at text default null,
  p_minutes integer default 60,
  p_timezone text default 'UTC',
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_coach_user_id uuid;
  v_team_id uuid;
  v_lesson_id uuid;
  v_player_user_id uuid;
  v_max_participants integer;
begin
  -- Coach check
  select p.user_id, p.team_id into v_coach_user_id, v_team_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.role = 'coach'
    and (p.is_active is null or p.is_active = true);
  
  if v_coach_user_id is null then
    raise exception 'forbidden';
  end if;
  
  -- Get max participants setting
  select coalesce(max_participants_per_lesson, 2) into v_max_participants
  from public.coach_schedule_settings
  where coach_user_id = v_coach_user_id;
  
  if v_max_participants is null then
    v_max_participants := 2;
  end if;
  
  -- Check total participants (1 primary + additional)
  if 1 + array_length(p_additional_player_ids, 1) > v_max_participants then
    raise exception 'too_many_participants: max is %', v_max_participants;
  end if;
  
  -- Validate primary player
  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_primary_player_user_id
      and p.team_id = v_team_id
      and p.role = 'player'
      and (p.is_active is null or p.is_active = true)
  ) then
    raise exception 'invalid_primary_player';
  end if;
  
  -- Validate additional players
  if array_length(p_additional_player_ids, 1) > 0 then
    foreach v_player_user_id in array p_additional_player_ids
    loop
      if v_player_user_id = p_primary_player_user_id then
        raise exception 'duplicate_player';
      end if;
      
      if not exists (
        select 1 from public.profiles p
        where p.user_id = v_player_user_id
          and p.team_id = v_team_id
          and p.role = 'player'
          and (p.is_active is null or p.is_active = true)
      ) then
        raise exception 'invalid_additional_player: %', v_player_user_id;
      end if;
    end loop;
  end if;
  
  -- Mode validation
  if p_mode not in ('in_person', 'remote') then
    raise exception 'invalid_mode';
  end if;
  
  -- Duration validation
  if p_minutes < 15 or p_minutes > 180 then
    raise exception 'invalid_duration';
  end if;
  
  -- Check for time conflicts and blocked time
  -- (Simplified - full implementation would check blocks and existing lessons)
  
  -- Create lesson
  insert into public.lessons (
    coach_user_id, team_id, mode, status, start_at, duration_minutes, timezone, coach_notes
  )
  values (
    v_coach_user_id, v_team_id, p_mode::public.lesson_mode, 'approved',
    p_start_at::timestamptz, p_minutes, p_timezone, p_notes
  )
  returning id into v_lesson_id;
  
  -- Add primary participant (auto-accepted)
  insert into public.lesson_participants (lesson_id, user_id, invite_status, is_primary, invited_by_user_id, invited_at, responded_at)
  values (v_lesson_id, p_primary_player_user_id, 'accepted', true, v_coach_user_id, now(), now());
  
  -- Add additional participants (invited)
  if array_length(p_additional_player_ids, 1) > 0 then
    foreach v_player_user_id in array p_additional_player_ids
    loop
      insert into public.lesson_participants (lesson_id, user_id, invite_status, is_primary, invited_by_user_id)
      values (v_lesson_id, v_player_user_id, 'invited', false, v_coach_user_id);
    end loop;
  end if;
  
  return v_lesson_id;
end;
$$;

grant execute on function public.create_lesson_as_coach(uuid, uuid[], text, text, integer, text, text) to authenticated;

-- Update coach_set_lesson_participant to check max participants
create or replace function public.coach_set_lesson_participant(
  p_lesson_id uuid,
  p_player_user_id uuid,
  p_add boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_lesson public.lessons%rowtype;
  v_max_participants integer;
  v_current_count integer;
begin
  -- Get lesson
  select * into v_lesson from public.lessons where id = p_lesson_id;
  
  if v_lesson.id is null then
    raise exception 'lesson_not_found';
  end if;
  
  -- Must be the coach
  if v_lesson.coach_user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;
  
  -- Validate player is on same team
  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_player_user_id
      and p.team_id = v_lesson.team_id
      and p.role = 'player'
      and (p.is_active is null or p.is_active = true)
  ) then
    raise exception 'invalid_player';
  end if;
  
  if p_add then
    -- Get max participants
    select coalesce(max_participants_per_lesson, 2) into v_max_participants
    from public.coach_schedule_settings
    where coach_user_id = v_lesson.coach_user_id;
    
    if v_max_participants is null then
      v_max_participants := 6; -- Default to 6 if no setting
    end if;
    
    -- Check current count
    select count(*) into v_current_count
    from public.lesson_participants
    where lesson_id = p_lesson_id;
    
    if v_current_count >= v_max_participants then
      raise exception 'max_participants_reached';
    end if;
    
    -- Add participant
    insert into public.lesson_participants (lesson_id, user_id, invite_status, is_primary, invited_by_user_id)
    values (p_lesson_id, p_player_user_id, 'invited', false, auth.uid())
    on conflict (lesson_id, user_id) do update
      set invite_status = 'invited', invited_by_user_id = auth.uid(), invited_at = now();
  else
    -- Remove non-primary participant
    delete from public.lesson_participants
    where lesson_id = p_lesson_id
      and user_id = p_player_user_id
      and is_primary = false;
  end if;
  
  return true;
end;
$$;

commit;

