-- Group lessons (2 players + 1 coach) with participant confirmation and coach flexibility
-- Adds new lessons model: lessons + lesson_participants (many-to-many).
-- Backfills existing lesson_requests into new tables.
-- Replaces lesson RPCs to use new tables and enforce coach blocks + booking conflicts.
-- Run in Supabase SQL Editor (safe to run once).

begin;

create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type public.lesson_participant_status as enum ('invited', 'accepted', 'declined');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  mode public.lesson_mode not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null default 'UTC',
  status public.lesson_status not null default 'requested',
  notes text null check (notes is null or char_length(notes) <= 2000),
  coach_response_note text null check (coach_response_note is null or char_length(coach_response_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_end_after_start_chk check (end_at > start_at)
);

create index if not exists lessons_team_status_start_idx on public.lessons (team_id, status, start_at desc);
create index if not exists lessons_coach_start_idx on public.lessons (coach_user_id, start_at desc);

drop trigger if exists trg_lessons_updated_at on public.lessons;
create trigger trg_lessons_updated_at
before update on public.lessons
for each row execute function public.set_updated_at();

create table if not exists public.lesson_participants (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invite_status public.lesson_participant_status not null default 'invited',
  is_primary boolean not null default false,
  invited_by_user_id uuid null references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  responded_at timestamptz null,
  primary key (lesson_id, user_id)
);

create index if not exists lesson_participants_user_idx on public.lesson_participants (user_id);

alter table public.lessons enable row level security;
alter table public.lesson_participants enable row level security;

-- Read access:
-- - Coach can read their lessons on team
-- - Any participant (invited/accepted/declined) can read their lesson
drop policy if exists lessons_select_visible on public.lessons;
create policy lessons_select_visible on public.lessons
for select
to authenticated
using (
  team_id = public.current_team_id()
  and (
    coach_user_id = auth.uid()
    or exists (
      select 1 from public.lesson_participants lp
      where lp.lesson_id = lessons.id
        and lp.user_id = auth.uid()
    )
  )
);

drop policy if exists lesson_participants_select_visible on public.lesson_participants;
create policy lesson_participants_select_visible on public.lesson_participants
for select
to authenticated
using (
  exists (
    select 1
    from public.lessons l
    where l.id = lesson_participants.lesson_id
      and l.team_id = public.current_team_id()
      and (l.coach_user_id = auth.uid() or lesson_participants.user_id = auth.uid())
  )
);

-- No direct writes from clients; use RPCs.
revoke insert, update, delete on public.lessons from authenticated;
revoke insert, update, delete on public.lesson_participants from authenticated;
grant select on public.lessons to authenticated;
grant select on public.lesson_participants to authenticated;

-- Backfill from legacy lesson_requests (if table exists and rows are present).
do $$
declare
  r record;
  v_new_id uuid;
begin
  if to_regclass('public.lesson_requests') is null then
    return;
  end if;

  for r in
    select *
    from public.lesson_requests
  loop
    -- Skip if already backfilled (best-effort): match by (team, coach, start, end, created_at)
    if exists (
      select 1 from public.lessons l
      where l.team_id = r.team_id
        and l.coach_user_id = r.coach_user_id
        and l.start_at = r.start_at
        and l.end_at = r.end_at
        and l.created_at = r.created_at
    ) then
      continue;
    end if;

    insert into public.lessons (team_id, coach_user_id, created_by_user_id, mode, start_at, end_at, timezone, status, notes, coach_response_note, created_at, updated_at)
    values (r.team_id, r.coach_user_id, r.player_user_id, r.mode, r.start_at, r.end_at, r.timezone, r.status, r.notes, r.coach_response_note, r.created_at, r.updated_at)
    returning id into v_new_id;

    -- Primary participant = original player
    if r.player_user_id is not null then
      insert into public.lesson_participants (lesson_id, user_id, invite_status, is_primary, invited_by_user_id, invited_at, responded_at)
      values (v_new_id, r.player_user_id, 'accepted', true, r.player_user_id, r.created_at, r.created_at)
      on conflict do nothing;
    end if;
  end loop;
end $$;

-- RPC: request lesson (player) with optional second player invite.
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

  -- Coach booked?
  if exists (
    select 1
    from public.lessons l
    where l.team_id = v_team_id
      and l.coach_user_id = p_coach_user_id
      and l.status = 'approved'
      and l.start_at < v_end_at
      and l.end_at > p_start_at
  ) then
    raise exception 'conflict';
  end if;

  -- Coach blocked?
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

  -- Requesting player is primary accepted participant.
  insert into public.lesson_participants (lesson_id, user_id, invite_status, is_primary, invited_by_user_id, invited_at, responded_at)
  values (v_lesson_id, auth.uid(), 'accepted', true, auth.uid(), now(), now());

  -- Optional second player invite (must be on team and a player).
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

revoke all on function public.request_lesson(uuid, public.lesson_mode, timestamptz, integer, text, text, uuid) from public;
grant execute on function public.request_lesson(uuid, public.lesson_mode, timestamptz, integer, text, text, uuid) to authenticated;

-- RPC: second player responds to invite.
create or replace function public.respond_to_lesson_invite(
  p_lesson_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_lp public.lesson_participants%rowtype;
begin
  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  select * into v_lp
  from public.lesson_participants lp
  join public.lessons l on l.id = lp.lesson_id
  where lp.lesson_id = p_lesson_id
    and lp.user_id = auth.uid()
    and l.team_id = v_team_id
    and lp.is_primary = false
  for update;

  if v_lp.lesson_id is null then
    raise exception 'not_found';
  end if;

  update public.lesson_participants
    set invite_status = case when p_accept then 'accepted' else 'declined' end,
        responded_at = now()
  where lesson_id = p_lesson_id
    and user_id = auth.uid();

  begin
    perform public.log_event(
      case when p_accept then 'lesson_invite_accepted' else 'lesson_invite_declined' end,
      'lesson',
      p_lesson_id,
      jsonb_build_object('user_id', auth.uid())
    );
  exception when undefined_function then
    null;
  end;
end;
$$;

revoke all on function public.respond_to_lesson_invite(uuid, boolean) from public;
grant execute on function public.respond_to_lesson_invite(uuid, boolean) to authenticated;

-- RPC: coach approves/declines (coach can approve even if second hasn't accepted).
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
  v_l public.lessons%rowtype;
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
  from public.lessons l
  where l.id = p_lesson_id
    and l.team_id = v_team_id
    and l.coach_user_id = auth.uid()
  for update;

  if v_l.id is null then
    raise exception 'not_found';
  end if;

  v_new_status := case when p_approve then 'approved' else 'declined' end;

  if p_approve then
    -- Approved overlaps
    if exists (
      select 1
      from public.lessons l2
      where l2.team_id = v_team_id
        and l2.coach_user_id = v_l.coach_user_id
        and l2.status = 'approved'
        and l2.id <> v_l.id
        and l2.start_at < v_l.end_at
        and l2.end_at > v_l.start_at
    ) then
      raise exception 'conflict';
    end if;
    -- Blocks
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

  update public.lessons
    set status = v_new_status,
        coach_response_note = nullif(trim(p_note), '')
  where id = v_l.id;

  begin
    perform public.log_event('lesson_' || v_new_status::text, 'lesson', v_l.id, jsonb_build_object('status', v_new_status));
  exception when undefined_function then
    null;
  end;
end;
$$;

revoke all on function public.respond_to_lesson_request(uuid, boolean, text) from public;
grant execute on function public.respond_to_lesson_request(uuid, boolean, text) to authenticated;

-- RPC: coach force add/remove a second player at any time (flexible).
create or replace function public.coach_set_lesson_participant(
  p_lesson_id uuid,
  p_player_user_id uuid,
  p_present boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_l public.lessons%rowtype;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;

  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  select * into v_l
  from public.lessons l
  where l.id = p_lesson_id
    and l.team_id = v_team_id
    and l.coach_user_id = auth.uid()
  for update;

  if v_l.id is null then
    raise exception 'not_found';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_player_user_id
      and p.team_id = v_team_id
      and p.role = 'player'
  ) then
    raise exception 'invalid_player';
  end if;

  if p_present then
    insert into public.lesson_participants (lesson_id, user_id, invite_status, is_primary, invited_by_user_id)
    values (p_lesson_id, p_player_user_id, 'invited', false, auth.uid())
    on conflict (lesson_id, user_id) do update
      set invite_status = 'invited',
          is_primary = false,
          invited_by_user_id = auth.uid(),
          invited_at = now(),
          responded_at = null;
  else
    delete from public.lesson_participants
    where lesson_id = p_lesson_id
      and user_id = p_player_user_id
      and is_primary = false;
  end if;
end;
$$;

revoke all on function public.coach_set_lesson_participant(uuid, uuid, boolean) from public;
grant execute on function public.coach_set_lesson_participant(uuid, uuid, boolean) to authenticated;

-- RPC: cancel lesson (coach or primary player only).
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
  v_l public.lessons%rowtype;
  v_is_primary boolean;
  v_allowed boolean;
begin
  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  select * into v_l
  from public.lessons l
  where l.id = p_lesson_id
    and l.team_id = v_team_id
  for update;

  if v_l.id is null then
    raise exception 'not_found';
  end if;

  select exists (
    select 1 from public.lesson_participants lp
    where lp.lesson_id = v_l.id
      and lp.user_id = auth.uid()
      and lp.is_primary = true
  ) into v_is_primary;

  v_allowed := (public.is_coach() and v_l.coach_user_id = auth.uid()) or ((not public.is_coach()) and v_is_primary);
  if not v_allowed then
    raise exception 'forbidden';
  end if;

  update public.lessons
    set status = 'cancelled',
        coach_response_note = coalesce(nullif(trim(p_note), ''), coach_response_note)
  where id = v_l.id;
end;
$$;

revoke all on function public.cancel_lesson(uuid, text) from public;
grant execute on function public.cancel_lesson(uuid, text) to authenticated;

-- RPC: reschedule lesson (both coach and players).
-- - Coach reschedule keeps status.
-- - Player reschedule sets status back to requested; non-primary participants become invited again.
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

  -- Blocks
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

  -- Approved overlaps
  if exists (
    select 1
    from public.lessons l2
    where l2.team_id = v_team_id
      and l2.coach_user_id = v_l.coach_user_id
      and l2.status = 'approved'
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
    -- Reset non-primary participants to invited (they can accept/decline again).
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


