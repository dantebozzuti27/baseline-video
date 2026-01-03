-- Remote programs (fixed-length templates + rolling enrollments + per-player week overrides)
-- Run in Supabase SQL Editor (safe to run once).

begin;

create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type public.program_enrollment_status as enum ('active', 'paused', 'completed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.program_templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  weeks_count integer not null check (weeks_count between 1 and 52),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists program_templates_team_coach_idx
  on public.program_templates (team_id, coach_user_id, created_at desc);

drop trigger if exists trg_program_templates_updated_at on public.program_templates;
create trigger trg_program_templates_updated_at
before update on public.program_templates
for each row execute function public.set_updated_at();

create table if not exists public.program_template_weeks (
  template_id uuid not null references public.program_templates(id) on delete cascade,
  week_index integer not null check (week_index >= 1),
  goals_json jsonb not null default '[]'::jsonb,
  assignments_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (template_id, week_index)
);

create index if not exists program_template_weeks_template_idx
  on public.program_template_weeks (template_id, week_index);

drop trigger if exists trg_program_template_weeks_updated_at on public.program_template_weeks;
create trigger trg_program_template_weeks_updated_at
before update on public.program_template_weeks
for each row execute function public.set_updated_at();

create table if not exists public.program_enrollments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  template_id uuid not null references public.program_templates(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  player_user_id uuid not null references auth.users(id) on delete cascade,
  start_at timestamptz not null default now(),
  status public.program_enrollment_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists program_enrollments_team_coach_idx
  on public.program_enrollments (team_id, coach_user_id, start_at desc);
create index if not exists program_enrollments_team_player_idx
  on public.program_enrollments (team_id, player_user_id, start_at desc);

-- Only one active enrollment per template per player.
create unique index if not exists program_enrollments_active_unique
  on public.program_enrollments (template_id, player_user_id)
  where status = 'active';

drop trigger if exists trg_program_enrollments_updated_at on public.program_enrollments;
create trigger trg_program_enrollments_updated_at
before update on public.program_enrollments
for each row execute function public.set_updated_at();

create table if not exists public.program_week_overrides (
  enrollment_id uuid not null references public.program_enrollments(id) on delete cascade,
  week_index integer not null check (week_index >= 1),
  goals_json jsonb not null default '[]'::jsonb,
  assignments_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (enrollment_id, week_index)
);

create index if not exists program_week_overrides_enrollment_idx
  on public.program_week_overrides (enrollment_id, week_index);

drop trigger if exists trg_program_week_overrides_updated_at on public.program_week_overrides;
create trigger trg_program_week_overrides_updated_at
before update on public.program_week_overrides
for each row execute function public.set_updated_at();

create table if not exists public.program_submissions (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.program_enrollments(id) on delete cascade,
  week_index integer not null check (week_index >= 1),
  video_id uuid not null references public.videos(id) on delete cascade,
  note text null check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists program_submissions_enrollment_week_idx
  on public.program_submissions (enrollment_id, week_index, created_at desc);
create index if not exists program_submissions_video_idx
  on public.program_submissions (video_id);
create unique index if not exists program_submissions_enrollment_video_unique
  on public.program_submissions (enrollment_id, video_id);

create table if not exists public.program_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.program_submissions(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  review_note text null check (review_note is null or char_length(review_note) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists program_reviews_coach_idx
  on public.program_reviews (coach_user_id, reviewed_at desc);

drop trigger if exists trg_program_reviews_updated_at on public.program_reviews;
create trigger trg_program_reviews_updated_at
before update on public.program_reviews
for each row execute function public.set_updated_at();

alter table public.program_templates enable row level security;
alter table public.program_template_weeks enable row level security;
alter table public.program_enrollments enable row level security;
alter table public.program_week_overrides enable row level security;
alter table public.program_submissions enable row level security;
alter table public.program_reviews enable row level security;

-- READ POLICIES
drop policy if exists program_templates_select_visible on public.program_templates;
create policy program_templates_select_visible on public.program_templates
for select
to authenticated
using (
  team_id = public.current_team_id()
  and (
    (public.is_coach() and coach_user_id = auth.uid())
    or exists (
      select 1 from public.program_enrollments e
      where e.template_id = program_templates.id
        and e.team_id = public.current_team_id()
        and e.player_user_id = auth.uid()
    )
  )
);

drop policy if exists program_template_weeks_select_visible on public.program_template_weeks;
create policy program_template_weeks_select_visible on public.program_template_weeks
for select
to authenticated
using (
  exists (
    select 1
    from public.program_templates t
    where t.id = program_template_weeks.template_id
      and t.team_id = public.current_team_id()
      and (
        (public.is_coach() and t.coach_user_id = auth.uid())
        or exists (
          select 1 from public.program_enrollments e
          where e.template_id = t.id
            and e.team_id = public.current_team_id()
            and e.player_user_id = auth.uid()
        )
      )
  )
);

drop policy if exists program_enrollments_select_visible on public.program_enrollments;
create policy program_enrollments_select_visible on public.program_enrollments
for select
to authenticated
using (
  team_id = public.current_team_id()
  and (coach_user_id = auth.uid() or player_user_id = auth.uid())
);

drop policy if exists program_week_overrides_select_visible on public.program_week_overrides;
create policy program_week_overrides_select_visible on public.program_week_overrides
for select
to authenticated
using (
  exists (
    select 1
    from public.program_enrollments e
    where e.id = program_week_overrides.enrollment_id
      and e.team_id = public.current_team_id()
      and (e.coach_user_id = auth.uid() or e.player_user_id = auth.uid())
  )
);

drop policy if exists program_submissions_select_visible on public.program_submissions;
create policy program_submissions_select_visible on public.program_submissions
for select
to authenticated
using (
  exists (
    select 1
    from public.program_enrollments e
    where e.id = program_submissions.enrollment_id
      and e.team_id = public.current_team_id()
      and (e.coach_user_id = auth.uid() or e.player_user_id = auth.uid())
  )
);

drop policy if exists program_reviews_select_visible on public.program_reviews;
create policy program_reviews_select_visible on public.program_reviews
for select
to authenticated
using (
  exists (
    select 1
    from public.program_submissions s
    join public.program_enrollments e on e.id = s.enrollment_id
    where s.id = program_reviews.submission_id
      and e.team_id = public.current_team_id()
      and (e.coach_user_id = auth.uid() or e.player_user_id = auth.uid())
  )
);

-- No direct writes from clients; use RPCs.
revoke insert, update, delete on public.program_templates from authenticated;
revoke insert, update, delete on public.program_template_weeks from authenticated;
revoke insert, update, delete on public.program_enrollments from authenticated;
revoke insert, update, delete on public.program_week_overrides from authenticated;
revoke insert, update, delete on public.program_submissions from authenticated;
revoke insert, update, delete on public.program_reviews from authenticated;

grant select on public.program_templates to authenticated;
grant select on public.program_template_weeks to authenticated;
grant select on public.program_enrollments to authenticated;
grant select on public.program_week_overrides to authenticated;
grant select on public.program_submissions to authenticated;
grant select on public.program_reviews to authenticated;

-- RPCs
create or replace function public.create_program_template(p_title text, p_weeks_count integer)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_id uuid;
  i integer;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;

  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  if p_weeks_count is null or p_weeks_count < 1 or p_weeks_count > 52 then
    raise exception 'invalid_weeks_count';
  end if;

  insert into public.program_templates (team_id, coach_user_id, title, weeks_count)
  values (v_team_id, auth.uid(), coalesce(nullif(trim(p_title), ''), 'Program'), p_weeks_count)
  returning id into v_id;

  -- Create default week rows.
  i := 1;
  while i <= p_weeks_count loop
    insert into public.program_template_weeks (template_id, week_index, goals_json, assignments_json)
    values (v_id, i, '[]'::jsonb, '[]'::jsonb)
    on conflict do nothing;
    i := i + 1;
  end loop;

  begin
    perform public.log_event('program_template_created', 'program_template', v_id, jsonb_build_object('weeks', p_weeks_count));
  exception when undefined_function then
    null;
  end;

  return v_id;
end;
$$;

revoke all on function public.create_program_template(text, integer) from public;
grant execute on function public.create_program_template(text, integer) to authenticated;

create or replace function public.update_program_template_week(
  p_template_id uuid,
  p_week_index integer,
  p_goals_json jsonb,
  p_assignments_json jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_weeks_count integer;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;

  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  select t.weeks_count into v_weeks_count
  from public.program_templates t
  where t.id = p_template_id
    and t.team_id = v_team_id
    and t.coach_user_id = auth.uid();

  if v_weeks_count is null then
    raise exception 'not_found';
  end if;

  if p_week_index is null or p_week_index < 1 or p_week_index > v_weeks_count then
    raise exception 'invalid_week_index';
  end if;

  insert into public.program_template_weeks (template_id, week_index, goals_json, assignments_json)
  values (
    p_template_id,
    p_week_index,
    coalesce(p_goals_json, '[]'::jsonb),
    coalesce(p_assignments_json, '[]'::jsonb)
  )
  on conflict (template_id, week_index) do update
    set goals_json = excluded.goals_json,
        assignments_json = excluded.assignments_json,
        updated_at = now();
end;
$$;

revoke all on function public.update_program_template_week(uuid, integer, jsonb, jsonb) from public;
grant execute on function public.update_program_template_week(uuid, integer, jsonb, jsonb) to authenticated;

create or replace function public.enroll_player_in_program(
  p_template_id uuid,
  p_player_user_id uuid,
  p_start_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_enrollment_id uuid;
  v_exists integer;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;

  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  if not exists (
    select 1 from public.program_templates t
    where t.id = p_template_id
      and t.team_id = v_team_id
      and t.coach_user_id = auth.uid()
  ) then
    raise exception 'invalid_template';
  end if;

  if p_player_user_id is null then
    raise exception 'invalid_player';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_player_user_id
      and p.team_id = v_team_id
      and p.role = 'player'
      and (p.is_active is null or p.is_active = true)
  ) then
    raise exception 'invalid_player';
  end if;

  insert into public.program_enrollments (team_id, template_id, coach_user_id, player_user_id, start_at, status)
  values (v_team_id, p_template_id, auth.uid(), p_player_user_id, coalesce(p_start_at, now()), 'active')
  returning id into v_enrollment_id;

  begin
    perform public.log_event('program_enrolled', 'program_enrollment', v_enrollment_id, jsonb_build_object('template_id', p_template_id, 'player_user_id', p_player_user_id));
  exception when undefined_function then
    null;
  end;

  return v_enrollment_id;
exception
  when unique_violation then
    raise exception 'already_enrolled';
end;
$$;

revoke all on function public.enroll_player_in_program(uuid, uuid, timestamptz) from public;
grant execute on function public.enroll_player_in_program(uuid, uuid, timestamptz) to authenticated;

create or replace function public.set_enrollment_status(p_enrollment_id uuid, p_status public.program_enrollment_status)
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

  update public.program_enrollments e
    set status = p_status,
        updated_at = now()
  where e.id = p_enrollment_id
    and e.team_id = v_team_id
    and e.coach_user_id = auth.uid();

  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

revoke all on function public.set_enrollment_status(uuid, public.program_enrollment_status) from public;
grant execute on function public.set_enrollment_status(uuid, public.program_enrollment_status) to authenticated;

create or replace function public.set_program_week_override(
  p_enrollment_id uuid,
  p_week_index integer,
  p_goals_json jsonb,
  p_assignments_json jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_template_id uuid;
  v_weeks_count integer;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;

  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  select e.template_id into v_template_id
  from public.program_enrollments e
  where e.id = p_enrollment_id
    and e.team_id = v_team_id
    and e.coach_user_id = auth.uid();

  if v_template_id is null then
    raise exception 'not_found';
  end if;

  select t.weeks_count into v_weeks_count
  from public.program_templates t
  where t.id = v_template_id
    and t.team_id = v_team_id;

  if v_weeks_count is null then
    raise exception 'not_found';
  end if;

  if p_week_index is null or p_week_index < 1 or p_week_index > v_weeks_count then
    raise exception 'invalid_week_index';
  end if;

  insert into public.program_week_overrides (enrollment_id, week_index, goals_json, assignments_json)
  values (
    p_enrollment_id,
    p_week_index,
    coalesce(p_goals_json, '[]'::jsonb),
    coalesce(p_assignments_json, '[]'::jsonb)
  )
  on conflict (enrollment_id, week_index) do update
    set goals_json = excluded.goals_json,
        assignments_json = excluded.assignments_json,
        updated_at = now();
end;
$$;

revoke all on function public.set_program_week_override(uuid, integer, jsonb, jsonb) from public;
grant execute on function public.set_program_week_override(uuid, integer, jsonb, jsonb) to authenticated;

create or replace function public.submit_program_video(
  p_enrollment_id uuid,
  p_week_index integer,
  p_video_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_template_id uuid;
  v_weeks_count integer;
  v_submission_id uuid;
begin
  if public.is_coach() then
    raise exception 'forbidden';
  end if;

  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  select e.template_id into v_template_id
  from public.program_enrollments e
  where e.id = p_enrollment_id
    and e.team_id = v_team_id
    and e.player_user_id = auth.uid()
    and e.status = 'active';

  if v_template_id is null then
    raise exception 'not_found';
  end if;

  select t.weeks_count into v_weeks_count
  from public.program_templates t
  where t.id = v_template_id
    and t.team_id = v_team_id;

  if v_weeks_count is null then
    raise exception 'not_found';
  end if;

  if p_week_index is null or p_week_index < 1 or p_week_index > v_weeks_count then
    raise exception 'invalid_week_index';
  end if;

  if p_video_id is null or not public.can_read_video(p_video_id) then
    raise exception 'invalid_video';
  end if;

  insert into public.program_submissions (enrollment_id, week_index, video_id, note)
  values (p_enrollment_id, p_week_index, p_video_id, nullif(trim(p_note), ''))
  on conflict (enrollment_id, video_id) do update
    set week_index = excluded.week_index,
        note = excluded.note
  returning id into v_submission_id;

  begin
    perform public.log_event('program_submission_created', 'program_submission', v_submission_id, jsonb_build_object('week', p_week_index, 'video_id', p_video_id));
  exception when undefined_function then
    null;
  end;

  return v_submission_id;
end;
$$;

revoke all on function public.submit_program_video(uuid, integer, uuid, text) from public;
grant execute on function public.submit_program_video(uuid, integer, uuid, text) to authenticated;

create or replace function public.mark_program_submission_reviewed(
  p_submission_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_enrollment_id uuid;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;

  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  select s.enrollment_id into v_enrollment_id
  from public.program_submissions s
  join public.program_enrollments e on e.id = s.enrollment_id
  where s.id = p_submission_id
    and e.team_id = v_team_id
    and e.coach_user_id = auth.uid();

  if v_enrollment_id is null then
    raise exception 'not_found';
  end if;

  insert into public.program_reviews (submission_id, coach_user_id, reviewed_at, review_note)
  values (p_submission_id, auth.uid(), now(), nullif(trim(p_note), ''))
  on conflict (submission_id) do update
    set review_note = excluded.review_note,
        reviewed_at = excluded.reviewed_at,
        coach_user_id = excluded.coach_user_id,
        updated_at = now();
end;
$$;

revoke all on function public.mark_program_submission_reviewed(uuid, text) from public;
grant execute on function public.mark_program_submission_reviewed(uuid, text) to authenticated;

commit;


