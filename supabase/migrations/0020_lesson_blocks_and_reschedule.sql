-- Coach time blocks + rescheduling + stronger conflict checks
-- Run in Supabase SQL Editor (safe to run once).

begin;

create table if not exists public.coach_time_blocks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null default 'UTC',
  note text null check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_block_end_after_start_chk check (end_at > start_at)
);

create index if not exists coach_time_blocks_coach_start_idx
  on public.coach_time_blocks (coach_user_id, start_at desc);
create index if not exists coach_time_blocks_team_start_idx
  on public.coach_time_blocks (team_id, start_at desc);

drop trigger if exists trg_coach_time_blocks_updated_at on public.coach_time_blocks;
create trigger trg_coach_time_blocks_updated_at
before update on public.coach_time_blocks
for each row execute function public.set_updated_at();

alter table public.coach_time_blocks enable row level security;

-- Team members can view blocks for scheduling; only coach can create/delete their own.
drop policy if exists coach_time_blocks_select_team on public.coach_time_blocks;
create policy coach_time_blocks_select_team on public.coach_time_blocks
for select
to authenticated
using (team_id = public.current_team_id());

revoke insert, update, delete on public.coach_time_blocks from authenticated;
grant select on public.coach_time_blocks to authenticated;

create or replace function public.create_coach_time_block(
  p_start_at timestamptz,
  p_minutes integer,
  p_timezone text default 'UTC',
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_end_at timestamptz;
  v_id uuid;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;

  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  if p_minutes is null or p_minutes < 15 or p_minutes > 24*60 then
    raise exception 'invalid_duration';
  end if;

  v_end_at := p_start_at + make_interval(mins => p_minutes);

  -- Don't allow creating a block that overlaps an approved lesson (keeps schedule sane).
  if exists (
    select 1
    from public.lesson_requests lr
    where lr.team_id = v_team_id
      and lr.coach_user_id = auth.uid()
      and lr.status = 'approved'
      and lr.start_at < v_end_at
      and lr.end_at > p_start_at
  ) then
    raise exception 'conflict';
  end if;

  insert into public.coach_time_blocks (team_id, coach_user_id, start_at, end_at, timezone, note)
  values (v_team_id, auth.uid(), p_start_at, v_end_at, coalesce(nullif(trim(p_timezone), ''), 'UTC'), nullif(trim(p_note), ''))
  returning id into v_id;

  begin
    perform public.log_event('coach_block_created', 'coach_time_block', v_id, jsonb_build_object('start_at', p_start_at, 'minutes', p_minutes));
  exception when undefined_function then
    null;
  end;

  return v_id;
end;
$$;

revoke all on function public.create_coach_time_block(timestamptz, integer, text, text) from public;
grant execute on function public.create_coach_time_block(timestamptz, integer, text, text) to authenticated;

create or replace function public.delete_coach_time_block(p_block_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;
  v_team_id := public.current_team_id();
  delete from public.coach_time_blocks
  where id = p_block_id
    and team_id = v_team_id
    and coach_user_id = auth.uid();
end;
$$;

revoke all on function public.delete_coach_time_block(uuid) from public;
grant execute on function public.delete_coach_time_block(uuid) to authenticated;

-- Strengthen request_lesson: reject if coach is already booked or blocked.
create or replace function public.request_lesson(
  p_coach_user_id uuid,
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

  -- Block if coach has an approved lesson overlapping.
  if exists (
    select 1
    from public.lesson_requests lr
    where lr.team_id = v_team_id
      and lr.coach_user_id = p_coach_user_id
      and lr.status = 'approved'
      and lr.start_at < v_end_at
      and lr.end_at > p_start_at
  ) then
    raise exception 'conflict';
  end if;

  -- Block if coach has a time block overlapping.
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

  insert into public.lesson_requests (team_id, coach_user_id, player_user_id, mode, start_at, end_at, timezone, status, notes)
  values (v_team_id, p_coach_user_id, auth.uid(), p_mode, p_start_at, v_end_at, coalesce(nullif(trim(p_timezone), ''), 'UTC'), 'requested', nullif(trim(p_notes), ''))
  returning id into v_lesson_id;

  begin
    perform public.log_event('lesson_requested', 'lesson_request', v_lesson_id, jsonb_build_object('mode', p_mode, 'start_at', p_start_at, 'minutes', p_minutes));
  exception when undefined_function then
    null;
  end;

  return v_lesson_id;
end;
$$;

grant execute on function public.request_lesson(uuid, public.lesson_mode, timestamptz, integer, text, text) to authenticated;

-- Strengthen approval conflict check: include blocks too.
create or replace function public.respond_to_lesson_request(
  p_lesson_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l public.lesson_requests%rowtype;
  v_team_id uuid;
  v_new_status public.lesson_status;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;

  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  select * into v_l
  from public.lesson_requests
  where id = p_lesson_id
    and team_id = v_team_id
    and coach_user_id = auth.uid()
  for update;

  if v_l.id is null then
    raise exception 'not_found';
  end if;

  v_new_status := case when p_approve then 'approved' else 'declined' end;

  if p_approve then
    if exists (
      select 1
      from public.lesson_requests lr
      where lr.team_id = v_team_id
        and lr.coach_user_id = v_l.coach_user_id
        and lr.status = 'approved'
        and lr.id <> v_l.id
        and lr.start_at < v_l.end_at
        and lr.end_at > v_l.start_at
    ) then
      raise exception 'conflict';
    end if;

    if exists (
      select 1
      from public.coach_time_blocks b
      where b.team_id = v_team_id
        and b.coach_user_id = v_l.coach_user_id
        and b.start_at < v_l.end_at
        and b.end_at > v_l.start_at
    ) then
      raise exception 'blocked';
    end if;
  end if;

  update public.lesson_requests
    set status = v_new_status,
        coach_response_note = nullif(trim(p_note), '')
  where id = v_l.id;

  begin
    perform public.log_event('lesson_' || v_new_status::text, 'lesson_request', v_l.id, jsonb_build_object('status', v_new_status));
  exception when undefined_function then
    null;
  end;
end;
$$;

grant execute on function public.respond_to_lesson_request(uuid, boolean, text) to authenticated;

-- Reschedule: both coach and player can move time. Coach keeps approval; player requires re-approval.
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
  v_l public.lesson_requests%rowtype;
  v_end_at timestamptz;
  v_is_coach boolean;
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
  from public.lesson_requests
  where id = p_lesson_id
    and team_id = v_team_id
  for update;

  if v_l.id is null then
    raise exception 'not_found';
  end if;

  v_is_coach := public.is_coach();
  if not (
    (v_is_coach and v_l.coach_user_id = auth.uid())
    or ((not v_is_coach) and v_l.player_user_id = auth.uid())
  ) then
    raise exception 'forbidden';
  end if;

  -- Cannot reschedule into coach blocks or approved overlaps (excluding itself).
  if exists (
    select 1 from public.coach_time_blocks b
    where b.team_id = v_team_id
      and b.coach_user_id = v_l.coach_user_id
      and b.start_at < v_end_at
      and b.end_at > p_start_at
  ) then
    raise exception 'blocked';
  end if;

  if exists (
    select 1 from public.lesson_requests lr
    where lr.team_id = v_team_id
      and lr.coach_user_id = v_l.coach_user_id
      and lr.status = 'approved'
      and lr.id <> v_l.id
      and lr.start_at < v_end_at
      and lr.end_at > p_start_at
  ) then
    raise exception 'conflict';
  end if;

  v_new_status := case
    when v_is_coach then v_l.status
    else 'requested'
  end;

  update public.lesson_requests
    set start_at = p_start_at,
        end_at = v_end_at,
        timezone = coalesce(nullif(trim(p_timezone), ''), timezone),
        status = v_new_status,
        coach_response_note = coalesce(nullif(trim(p_note), ''), coach_response_note)
  where id = v_l.id;

  begin
    perform public.log_event('lesson_rescheduled', 'lesson_request', v_l.id, jsonb_build_object('by', auth.uid(), 'start_at', p_start_at, 'minutes', p_minutes, 'status', v_new_status));
  exception when undefined_function then
    null;
  end;
end;
$$;

revoke all on function public.reschedule_lesson(uuid, timestamptz, integer, text, text) from public;
grant execute on function public.reschedule_lesson(uuid, timestamptz, integer, text, text) to authenticated;

commit;


