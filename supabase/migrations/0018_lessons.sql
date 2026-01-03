-- Lessons v1 (player requests -> coach approves)
-- Run in Supabase SQL Editor (safe to run once).

begin;

create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type public.lesson_mode as enum ('in_person', 'remote');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.lesson_status as enum ('requested', 'approved', 'declined', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.lesson_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  coach_user_id uuid null references auth.users(id) on delete set null,
  player_user_id uuid null references auth.users(id) on delete set null,
  mode public.lesson_mode not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null default 'UTC',
  status public.lesson_status not null default 'requested',
  notes text null check (notes is null or char_length(notes) <= 2000),
  coach_response_note text null check (coach_response_note is null or char_length(coach_response_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_end_after_start_chk check (end_at > start_at)
);

create index if not exists lesson_requests_team_status_start_idx
  on public.lesson_requests (team_id, status, start_at desc);
create index if not exists lesson_requests_coach_start_idx
  on public.lesson_requests (coach_user_id, start_at desc);
create index if not exists lesson_requests_player_start_idx
  on public.lesson_requests (player_user_id, start_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_lesson_requests_updated_at on public.lesson_requests;
create trigger trg_lesson_requests_updated_at
before update on public.lesson_requests
for each row execute function public.set_updated_at();

alter table public.lesson_requests enable row level security;

drop policy if exists lesson_requests_select_self on public.lesson_requests;
create policy lesson_requests_select_self on public.lesson_requests
for select
to authenticated
using (
  team_id = public.current_team_id()
  and (coach_user_id = auth.uid() or player_user_id = auth.uid())
);

-- No direct inserts/updates/deletes from clients; use RPCs below.
revoke insert, update, delete on public.lesson_requests from authenticated;
grant select on public.lesson_requests to authenticated;

-- RPC: player requests lesson with coach on their team.
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

  -- Validate coach belongs to same team and has role coach.
  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_coach_user_id
      and p.team_id = v_team_id
      and p.role = 'coach'
  ) then
    raise exception 'invalid_coach';
  end if;

  insert into public.lesson_requests (team_id, coach_user_id, player_user_id, mode, start_at, end_at, timezone, status, notes)
  values (v_team_id, p_coach_user_id, auth.uid(), p_mode, p_start_at, v_end_at, coalesce(nullif(trim(p_timezone), ''), 'UTC'), 'requested', nullif(trim(p_notes), ''))
  returning id into v_lesson_id;

  -- Best-effort audit (if events table exists in this project).
  begin
    perform public.log_event('lesson_requested', 'lesson_request', v_lesson_id, jsonb_build_object('mode', p_mode, 'start_at', p_start_at, 'minutes', p_minutes));
  exception when undefined_function then
    null;
  end;

  return v_lesson_id;
end;
$$;

revoke all on function public.request_lesson(uuid, public.lesson_mode, timestamptz, integer, text, text) from public;
grant execute on function public.request_lesson(uuid, public.lesson_mode, timestamptz, integer, text, text) to authenticated;

-- RPC: coach approves/declines a request assigned to them (with conflict check on approval).
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

revoke all on function public.respond_to_lesson_request(uuid, boolean, text) from public;
grant execute on function public.respond_to_lesson_request(uuid, boolean, text) to authenticated;

-- RPC: cancel (coach or the requesting player).
create or replace function public.cancel_lesson(
  p_lesson_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_l public.lesson_requests%rowtype;
  v_allowed boolean;
begin
  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  select * into v_l
  from public.lesson_requests
  where id = p_lesson_id
    and team_id = v_team_id
  for update;

  if v_l.id is null then
    raise exception 'not_found';
  end if;

  v_allowed :=
    (public.is_coach() and v_l.coach_user_id = auth.uid())
    or (not public.is_coach() and v_l.player_user_id = auth.uid());

  if not v_allowed then
    raise exception 'forbidden';
  end if;

  update public.lesson_requests
    set status = 'cancelled',
        coach_response_note = coalesce(nullif(trim(p_note), ''), coach_response_note)
  where id = v_l.id;

  begin
    perform public.log_event('lesson_cancelled', 'lesson_request', v_l.id, jsonb_build_object('by', auth.uid()));
  exception when undefined_function then
    null;
  end;
end;
$$;

revoke all on function public.cancel_lesson(uuid, text) from public;
grant execute on function public.cancel_lesson(uuid, text) to authenticated;

commit;


