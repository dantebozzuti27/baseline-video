-- Auto-approve lessons and better availability settings
-- Calendly-style booking improvements
-- Run in Supabase SQL Editor

begin;

-- Add auto_approve option to coach_schedule_settings
alter table public.coach_schedule_settings
  add column if not exists auto_approve_lessons boolean not null default false;

-- Add booking buffer (minimum hours before lesson can be booked)
alter table public.coach_schedule_settings
  add column if not exists booking_buffer_hours integer not null default 2
  check (booking_buffer_hours between 0 and 48);

-- Add max advance booking days
alter table public.coach_schedule_settings
  add column if not exists max_advance_days integer not null default 30
  check (max_advance_days between 1 and 180);

-- Create recurring availability slots table
create table if not exists public.coach_availability_slots (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users (id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time_minutes integer not null check (start_time_minutes between 0 and 1439),
  end_time_minutes integer not null check (end_time_minutes between 0 and 1440),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  
  constraint valid_time_range check (end_time_minutes > start_time_minutes)
);

create index if not exists coach_availability_slots_coach_idx 
  on public.coach_availability_slots (coach_user_id, day_of_week);

-- RLS for availability slots
alter table public.coach_availability_slots enable row level security;

-- Coaches can manage their own slots
drop policy if exists availability_slots_select_own on public.coach_availability_slots;
create policy availability_slots_select_own on public.coach_availability_slots
for select
to authenticated
using (coach_user_id = auth.uid());

drop policy if exists availability_slots_insert_own on public.coach_availability_slots;
create policy availability_slots_insert_own on public.coach_availability_slots
for insert
to authenticated
with check (coach_user_id = auth.uid() and public.is_coach());

drop policy if exists availability_slots_update_own on public.coach_availability_slots;
create policy availability_slots_update_own on public.coach_availability_slots
for update
to authenticated
using (coach_user_id = auth.uid())
with check (coach_user_id = auth.uid());

drop policy if exists availability_slots_delete_own on public.coach_availability_slots;
create policy availability_slots_delete_own on public.coach_availability_slots
for delete
to authenticated
using (coach_user_id = auth.uid());

-- Players/parents can see their coach's availability
drop policy if exists availability_slots_select_team on public.coach_availability_slots;
create policy availability_slots_select_team on public.coach_availability_slots
for select
to authenticated
using (
  coach_user_id in (
    select p.user_id from public.profiles p
    where p.team_id = public.current_team_id()
      and p.role = 'coach'
  )
);

grant select, insert, update, delete on public.coach_availability_slots to authenticated;

-- Update request_lesson to support auto-approve
create or replace function public.request_lesson(
  p_coach_user_id uuid,
  p_mode text,
  p_start_at text,
  p_minutes integer,
  p_timezone text,
  p_second_player_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_lesson_id uuid;
  v_auto_approve boolean;
  v_status public.lesson_status;
begin
  -- Validate caller is a player on coach's team
  select team_id into v_team_id
  from public.profiles
  where user_id = auth.uid()
    and role = 'player'
    and (is_active is null or is_active = true);

  if v_team_id is null then
    raise exception 'forbidden';
  end if;

  -- Validate coach is on same team
  if not exists (
    select 1 from public.profiles
    where user_id = p_coach_user_id
      and team_id = v_team_id
      and role = 'coach'
  ) then
    raise exception 'invalid_coach';
  end if;

  -- Check auto-approve setting
  select coalesce(auto_approve_lessons, false) into v_auto_approve
  from public.coach_schedule_settings
  where coach_user_id = p_coach_user_id;

  if v_auto_approve then
    v_status := 'approved';
  else
    v_status := 'requested';
  end if;

  -- Mode validation
  if p_mode not in ('in_person', 'remote') then
    raise exception 'invalid_mode';
  end if;

  -- Duration validation
  if p_minutes < 15 or p_minutes > 180 then
    raise exception 'invalid_duration';
  end if;

  -- Create lesson
  insert into public.lessons (
    coach_user_id, team_id, mode, status, start_at, duration_minutes, timezone
  )
  values (
    p_coach_user_id, v_team_id, p_mode::public.lesson_mode, v_status,
    p_start_at::timestamptz, p_minutes, p_timezone
  )
  returning id into v_lesson_id;

  -- Add requesting player as primary participant (auto-accepted)
  insert into public.lesson_participants (
    lesson_id, user_id, invite_status, is_primary, invited_by_user_id, invited_at, responded_at
  )
  values (v_lesson_id, auth.uid(), 'accepted', true, auth.uid(), now(), now());

  -- Optional second player
  if p_second_player_user_id is not null and p_second_player_user_id <> auth.uid() then
    if not exists (
      select 1 from public.profiles p
      where p.user_id = p_second_player_user_id
        and p.team_id = v_team_id
        and p.role = 'player'
        and (p.is_active is null or p.is_active = true)
    ) then
      raise exception 'invalid_second_player';
    end if;

    insert into public.lesson_participants (lesson_id, user_id, invite_status, is_primary, invited_by_user_id)
    values (v_lesson_id, p_second_player_user_id, 'invited', false, auth.uid());
  end if;

  return v_lesson_id;
end;
$$;

-- RPC to get coach availability slots
create or replace function public.get_coach_availability_slots(p_coach_user_id uuid)
returns setof public.coach_availability_slots
language sql
stable
security definer
set search_path = public
as $$
  select * from public.coach_availability_slots
  where coach_user_id = p_coach_user_id
    and is_active = true
  order by day_of_week, start_time_minutes;
$$;

grant execute on function public.get_coach_availability_slots(uuid) to authenticated;

-- RPC to set coach availability slot
create or replace function public.set_coach_availability_slot(
  p_day_of_week integer,
  p_start_time_minutes integer,
  p_end_time_minutes integer,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot_id uuid;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;

  -- Validate day
  if p_day_of_week < 0 or p_day_of_week > 6 then
    raise exception 'invalid_day';
  end if;

  -- Validate times
  if p_start_time_minutes < 0 or p_start_time_minutes >= 1440 then
    raise exception 'invalid_start_time';
  end if;

  if p_end_time_minutes <= p_start_time_minutes or p_end_time_minutes > 1440 then
    raise exception 'invalid_end_time';
  end if;

  -- Upsert slot
  insert into public.coach_availability_slots (
    coach_user_id, day_of_week, start_time_minutes, end_time_minutes, is_active
  )
  values (auth.uid(), p_day_of_week, p_start_time_minutes, p_end_time_minutes, p_is_active)
  on conflict (coach_user_id, day_of_week, start_time_minutes) do update
    set end_time_minutes = excluded.end_time_minutes,
        is_active = excluded.is_active
  returning id into v_slot_id;

  return v_slot_id;
end;
$$;

grant execute on function public.set_coach_availability_slot(integer, integer, integer, boolean) to authenticated;

-- RPC to delete coach availability slot
create or replace function public.delete_coach_availability_slot(p_slot_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.coach_availability_slots
  where id = p_slot_id
    and coach_user_id = auth.uid();
  
  return found;
end;
$$;

grant execute on function public.delete_coach_availability_slot(uuid) to authenticated;

-- Add unique constraint for availability slots
alter table public.coach_availability_slots
  drop constraint if exists coach_availability_slots_unique;
alter table public.coach_availability_slots
  add constraint coach_availability_slots_unique 
  unique (coach_user_id, day_of_week, start_time_minutes);

commit;

