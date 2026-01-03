-- Coach schedule settings + availability (busy intervals) + stronger holds
-- Run in Supabase SQL Editor (safe to run once).

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.coach_schedule_settings (
  coach_user_id uuid primary key references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  work_start_min integer not null default 480, -- 08:00
  work_end_min integer not null default 1080, -- 18:00
  slot_min integer not null default 15,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_schedule_bounds_chk check (
    work_start_min >= 0 and work_end_min <= 1440 and work_end_min > work_start_min
  ),
  constraint coach_schedule_slot_chk check (slot_min in (5, 10, 15, 20, 30, 60))
);

create index if not exists coach_schedule_team_idx on public.coach_schedule_settings (team_id);

drop trigger if exists trg_coach_schedule_settings_updated_at on public.coach_schedule_settings;
create trigger trg_coach_schedule_settings_updated_at
before update on public.coach_schedule_settings
for each row execute function public.set_updated_at();

alter table public.coach_schedule_settings enable row level security;

drop policy if exists coach_schedule_select_team on public.coach_schedule_settings;
create policy coach_schedule_select_team on public.coach_schedule_settings
for select
to authenticated
using (team_id = public.current_team_id());

revoke insert, update, delete on public.coach_schedule_settings from authenticated;
grant select on public.coach_schedule_settings to authenticated;

-- Create defaults on demand (coach-only).
create or replace function public.get_or_create_coach_schedule_settings()
returns table (work_start_min integer, work_end_min integer, slot_min integer)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;

  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  insert into public.coach_schedule_settings (coach_user_id, team_id)
  values (auth.uid(), v_team_id)
  on conflict (coach_user_id) do nothing;

  return query
  select css.work_start_min, css.work_end_min, css.slot_min
  from public.coach_schedule_settings css
  where css.coach_user_id = auth.uid();
end;
$$;

revoke all on function public.get_or_create_coach_schedule_settings() from public;
grant execute on function public.get_or_create_coach_schedule_settings() to authenticated;

create or replace function public.set_my_coach_schedule_settings(p_work_start_min integer, p_work_end_min integer, p_slot_min integer)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;
  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  insert into public.coach_schedule_settings (coach_user_id, team_id, work_start_min, work_end_min, slot_min)
  values (auth.uid(), v_team_id, p_work_start_min, p_work_end_min, p_slot_min)
  on conflict (coach_user_id) do update
    set work_start_min = excluded.work_start_min,
        work_end_min = excluded.work_end_min,
        slot_min = excluded.slot_min,
        team_id = excluded.team_id,
        updated_at = now();
end;
$$;

revoke all on function public.set_my_coach_schedule_settings(integer, integer, integer) from public;
grant execute on function public.set_my_coach_schedule_settings(integer, integer, integer) to authenticated;

-- Availability: return busy intervals without leaking player info.
create or replace function public.get_coach_busy(p_coach_user_id uuid, p_start_at timestamptz, p_end_at timestamptz)
returns table (start_at timestamptz, end_at timestamptz, kind text)
language sql
stable
security definer
set search_path = public
as $$
  with team_ok as (
    select 1
    from public.profiles p
    where p.user_id = p_coach_user_id
      and p.team_id = public.current_team_id()
      and p.role = 'coach'
  )
  select b.start_at, b.end_at, 'blocked'::text
  from public.coach_time_blocks b
  where exists (select 1 from team_ok)
    and b.coach_user_id = p_coach_user_id
    and b.start_at < p_end_at
    and b.end_at > p_start_at
  union all
  select l.start_at, l.end_at, case when l.status = 'requested' then 'held' else 'booked' end as kind
  from public.lessons l
  where exists (select 1 from team_ok)
    and l.coach_user_id = p_coach_user_id
    and l.status in ('approved', 'requested')
    and l.start_at < p_end_at
    and l.end_at > p_start_at;
$$;

revoke all on function public.get_coach_busy(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_coach_busy(uuid, timestamptz, timestamptz) to authenticated;

-- Stronger holds: treat requested lessons as busy for conflicts/blocks too.
create or replace function public.request_lesson(
  p_coach_user_id uuid,
  p_mode public.lesson_mode,
  p_start_at timestamptz,
  p_minutes integer,
  p_timezone text default 'UTC',
  p_notes text default null,
  p_second_player_user_id uuid default null
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
  if public.is_coach() then
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

  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_coach_user_id
      and p.team_id = v_team_id
      and p.role = 'coach'
  ) then
    raise exception 'invalid_coach';
  end if;

  if exists (
    select 1
    from public.lessons l
    where l.team_id = v_team_id
      and l.coach_user_id = p_coach_user_id
      and l.status in ('approved', 'requested')
      and l.start_at < v_end_at
      and l.end_at > p_start_at
  ) then
    raise exception 'conflict';
  end if;

  if exists (
    select 1
    from public.coach_time_blocks b
    where b.team_id = v_team_id
      and b.coach_user_id = p_coach_user_id
      and b.start_at < v_end_at
      and b.end_at > p_start_at
  ) then
    raise exception 'blocked';
  end if;

  insert into public.lessons (team_id, coach_user_id, created_by_user_id, mode, start_at, end_at, timezone, status, notes)
  values (v_team_id, p_coach_user_id, auth.uid(), p_mode, p_start_at, v_end_at, coalesce(nullif(trim(p_timezone), ''), 'UTC'), 'requested', nullif(trim(p_notes), ''))
  returning id into v_lesson_id;

  insert into public.lesson_participants (lesson_id, user_id, invite_status, is_primary, invited_by_user_id, invited_at, responded_at)
  values (v_lesson_id, auth.uid(), 'accepted', true, auth.uid(), now(), now());

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
    values (v_lesson_id, p_second_player_user_id, 'invited', false, auth.uid())
    on conflict do nothing;
  end if;

  begin
    perform public.log_event('lesson_requested', 'lesson', v_lesson_id, jsonb_build_object('mode', p_mode, 'start_at', p_start_at, 'minutes', p_minutes));
  exception when undefined_function then
    null;
  end;

  return v_lesson_id;
end;
$$;

grant execute on function public.request_lesson(uuid, public.lesson_mode, timestamptz, integer, text, text, uuid) to authenticated;

create or replace function public.reschedule_lesson(
  p_lesson_id uuid,
  p_start_at timestamptz,
  p_minutes integer,
  p_timezone text default 'UTC',
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_l public.lessons%rowtype;
  v_end_at timestamptz;
  v_is_coach boolean;
  v_is_participant boolean;
  v_new_status public.lesson_status;
begin
  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  if p_minutes is null or p_minutes < 15 or p_minutes > 180 then
    raise exception 'invalid_duration';
  end if;

  v_end_at := p_start_at + make_interval(mins => p_minutes);

  select * into v_l
  from public.lessons l
  where l.id = p_lesson_id
    and l.team_id = v_team_id
  for update;

  if v_l.id is null then
    raise exception 'not_found';
  end if;

  v_is_coach := public.is_coach() and v_l.coach_user_id = auth.uid();
  v_is_participant := exists (
    select 1 from public.lesson_participants lp
    where lp.lesson_id = v_l.id
      and lp.user_id = auth.uid()
  );

  if not (v_is_coach or v_is_participant) then
    raise exception 'forbidden';
  end if;

  if exists (
    select 1
    from public.coach_time_blocks b
    where b.team_id = v_team_id
      and b.coach_user_id = v_l.coach_user_id
      and b.start_at < v_end_at
      and b.end_at > p_start_at
  ) then
    raise exception 'blocked';
  end if;

  if exists (
    select 1
    from public.lessons l2
    where l2.team_id = v_team_id
      and l2.coach_user_id = v_l.coach_user_id
      and l2.status in ('approved', 'requested')
      and l2.id <> v_l.id
      and l2.start_at < v_end_at
      and l2.end_at > p_start_at
  ) then
    raise exception 'conflict';
  end if;

  v_new_status := case when v_is_coach then v_l.status else 'requested' end;

  update public.lessons
    set start_at = p_start_at,
        end_at = v_end_at,
        timezone = coalesce(nullif(trim(p_timezone), ''), timezone),
        status = v_new_status,
        coach_response_note = coalesce(nullif(trim(p_note), ''), coach_response_note)
  where id = v_l.id;

  if not v_is_coach then
    update public.lesson_participants
      set invite_status = 'invited',
          responded_at = null,
          invited_at = now(),
          invited_by_user_id = auth.uid()
    where lesson_id = v_l.id
      and is_primary = false;
  end if;

  begin
    perform public.log_event('lesson_rescheduled', 'lesson', v_l.id, jsonb_build_object('by', auth.uid(), 'status', v_new_status));
  exception when undefined_function then
    null;
  end;
end;
$$;

revoke all on function public.reschedule_lesson(uuid, timestamptz, integer, text, text) from public;
grant execute on function public.reschedule_lesson(uuid, timestamptz, integer, text, text) to authenticated;

commit;


