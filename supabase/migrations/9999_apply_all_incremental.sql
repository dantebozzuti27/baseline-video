-- Baseline Video — Apply All Incremental Migrations (non-destructive)
--
-- This file concatenates the incremental migrations in this repo into ONE script.
-- It intentionally EXCLUDES:
--   - 0000_baseline_video_all.sql (DESTRUCTIVE: wipes schema/storage metadata)
--
-- Safe to run once in Supabase SQL Editor. Most statements are idempotent (IF NOT EXISTS / CREATE OR REPLACE).
--
-- Included (in order):
--   - 0006_hotfix_names_and_deletes.sql
--   - 0007_fast_wins_coach_features.sql (EMPTY in repo)
--   - 0008_sprint2_invites_events_activity_roster.sql
--   - 0009_soft_deletes_trash.sql
--   - 0010_true_unread_video_views.sql
--   - 0011_comment_visibility_notes.sql
--   - 0012_video_links.sql
--   - 0013_stable_team_invite.sql
--   - 0014_team_visible_coach_uploads.sql
--   - 0015_relax_auth_user_fks_for_deletes.sql
--   - 0016_player_modes.sql
--   - 0017_set_player_mode.sql
--   - 0018_lessons.sql
--   - 0020_lesson_blocks_and_reschedule.sql
--   - 0021_group_lessons.sql
--   - 0022_coach_schedule_settings_and_availability.sql
--   - 0023_coach_create_lessons.sql

--   - 0024_remote_programs.sql
--   - 0025_program_cadence.sql
--   - 0026_program_drills_days_assignments.sql
--   - 0027_enrollment_day_overrides.sql
--   - 0028_program_crud_fixes.sql
-- ============================================================
-- 0006_hotfix_names_and_deletes.sql
-- ============================================================
-- HOTFIX: Names (first/last), delete policies, and onboarding RPC updates
-- Run in Supabase SQL Editor (safe to run once).

begin;

-- Ensure pgcrypto functions are available via extensions schema
create extension if not exists pgcrypto with schema extensions;

-- 1) Profiles: add first_name/last_name (enforced for new writes via NOT VALID constraint)
alter table public.profiles
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '';

-- Best-effort backfill from existing display_name
update public.profiles
set
  first_name = case when first_name = '' then split_part(display_name, ' ', 1) else first_name end,
  last_name = case
    when last_name <> '' then last_name
    when position(' ' in display_name) > 0 then ltrim(substr(display_name, position(' ' in display_name) + 1))
    else last_name
  end
where (first_name = '' or last_name = '');

-- Ensure non-empty first/last for any legacy single-name rows (prevents later table rewrites from failing)
update public.profiles
set
  first_name = case when char_length(trim(first_name)) = 0 then 'User' else first_name end,
  last_name = case when char_length(trim(last_name)) = 0 then '—' else last_name end
where char_length(trim(first_name)) = 0 or char_length(trim(last_name)) = 0;

-- Require non-empty first/last for new/updated rows (does not validate old rows)
alter table public.profiles
  drop constraint if exists profiles_first_last_nonempty,
  add constraint profiles_first_last_nonempty
    check (char_length(trim(first_name)) > 0 and char_length(trim(last_name)) > 0)
    not valid;

-- 2) RLS: allow deletes
-- Videos delete: uploader can delete own; coach can delete team
alter table public.videos enable row level security;

drop policy if exists videos_delete_visible on public.videos;
create policy videos_delete_visible on public.videos
for delete
to authenticated
using (
  uploader_user_id = auth.uid()
  or (public.is_coach() and team_id = public.current_team_id())
);

grant delete on public.videos to authenticated;

-- Comments delete: author can delete own; coach can delete comments on accessible videos
alter table public.comments enable row level security;

drop policy if exists comments_delete_visible on public.comments;
create policy comments_delete_visible on public.comments
for delete
to authenticated
using (
  author_user_id = auth.uid()
  or (public.is_coach() and public.can_read_video(video_id))
);

grant delete on public.comments to authenticated;

-- 3) Onboarding RPCs: write first/last + display_name
create or replace function public.create_team_for_coach(
  p_team_name text,
  p_coach_user_id uuid,
  p_first_name text,
  p_last_name text
)
returns table (team_id uuid, access_code text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_code text;
  v_display text;
begin
  v_team_id := gen_random_uuid();
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_display := trim(p_first_name) || ' ' || trim(p_last_name);

  insert into public.teams (id, name, access_code_hash)
  values (v_team_id, p_team_name, extensions.crypt(v_code, extensions.gen_salt('bf')));

  insert into public.profiles (user_id, team_id, role, display_name, first_name, last_name)
  values (p_coach_user_id, v_team_id, 'coach', v_display, trim(p_first_name), trim(p_last_name));

  team_id := v_team_id;
  access_code := v_code;
  return next;
end;
$$;

create or replace function public.join_team_with_access_code(
  p_access_code text,
  p_user_id uuid,
  p_first_name text,
  p_last_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_display text;
begin
  v_display := trim(p_first_name) || ' ' || trim(p_last_name);

  select t.id
    into v_team_id
  from public.teams t
  where t.access_code_hash = extensions.crypt(p_access_code, t.access_code_hash)
  limit 1;

  if v_team_id is null then
    raise exception 'invalid_access_code';
  end if;

  insert into public.profiles (user_id, team_id, role, display_name, first_name, last_name)
  values (p_user_id, v_team_id, 'player', v_display, trim(p_first_name), trim(p_last_name));

  return v_team_id;
end;
$$;

revoke all on function public.create_team_for_coach(text, uuid, text, text) from public;
revoke all on function public.join_team_with_access_code(text, uuid, text, text) from public;
grant execute on function public.create_team_for_coach(text, uuid, text, text) to service_role;
grant execute on function public.join_team_with_access_code(text, uuid, text, text) to service_role;

-- 4) Profile: safe name update RPC (avoid letting users update role/team)
revoke update on public.profiles from authenticated;

drop policy if exists profiles_update_self on public.profiles;

create or replace function public.update_my_profile_name(
  p_first_name text,
  p_last_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
    set
      first_name = trim(p_first_name),
      last_name = trim(p_last_name),
      display_name = trim(p_first_name) || ' ' || trim(p_last_name)
  where user_id = auth.uid();
end;
$$;

revoke all on function public.update_my_profile_name(text, text) from public;
grant execute on function public.update_my_profile_name(text, text) to authenticated;

commit;

-- ============================================================
-- 0024_remote_programs.sql
-- ============================================================
-- Remote programs (fixed-length templates + rolling enrollments + per-player week overrides)

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

-- ============================================================
-- 0025_program_cadence.sql
-- ============================================================
-- Remote programs: allow coach to customize cadence (days per "week")

-- Remote programs: allow coach to customize cadence (days per "week")
-- Run in Supabase SQL Editor after 0024 (safe to run once).

begin;

alter table public.program_templates
  add column if not exists cycle_days integer not null default 7
  check (cycle_days between 1 and 21);

create or replace function public.create_program_template(p_title text, p_weeks_count integer, p_cycle_days integer default 7)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_id uuid;
  i integer;
  v_cycle integer;
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

  v_cycle := coalesce(p_cycle_days, 7);
  if v_cycle < 1 or v_cycle > 21 then
    raise exception 'invalid_cycle_days';
  end if;

  insert into public.program_templates (team_id, coach_user_id, title, weeks_count, cycle_days)
  values (v_team_id, auth.uid(), coalesce(nullif(trim(p_title), ''), 'Program'), p_weeks_count, v_cycle)
  returning id into v_id;

  i := 1;
  while i <= p_weeks_count loop
    insert into public.program_template_weeks (template_id, week_index, goals_json, assignments_json)
    values (v_id, i, '[]'::jsonb, '[]'::jsonb)
    on conflict do nothing;
    i := i + 1;
  end loop;

  begin
    perform public.log_event('program_template_created', 'program_template', v_id, jsonb_build_object('weeks', p_weeks_count, 'cycle_days', v_cycle));
  exception when undefined_function then
    null;
  end;

  return v_id;
end;
$$;

revoke all on function public.create_program_template(text, integer, integer) from public;
grant execute on function public.create_program_template(text, integer, integer) to authenticated;

commit;

-- ============================================================
-- 0026_program_drills_days_assignments.sql
-- ============================================================
-- Programs: drills + focuses + day plans + structured assignments + assignment submissions/completions

-- Programs: drills + focuses + day plans + structured assignments + assignment submissions/completions
-- Run after 0024 + 0025. Safe to run once (mostly idempotent).

begin;

create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type public.program_drill_category as enum ('hitting', 'throwing', 'fielding', 'other');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.program_media_kind as enum ('internal_video', 'external_link');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.program_focuses (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text null check (description is null or char_length(description) <= 2000),
  cues_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists program_focuses_team_idx on public.program_focuses (team_id, created_at desc);

drop trigger if exists trg_program_focuses_updated_at on public.program_focuses;
create trigger trg_program_focuses_updated_at
before update on public.program_focuses
for each row execute function public.set_updated_at();

create table if not exists public.program_drills (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 140),
  category public.program_drill_category not null default 'other',
  goal text null check (goal is null or char_length(goal) <= 2000),
  equipment_json jsonb not null default '[]'::jsonb,
  cues_json jsonb not null default '[]'::jsonb,
  common_mistakes_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists program_drills_team_idx on public.program_drills (team_id, created_at desc);

drop trigger if exists trg_program_drills_updated_at on public.program_drills;
create trigger trg_program_drills_updated_at
before update on public.program_drills
for each row execute function public.set_updated_at();

create table if not exists public.program_drill_media (
  id uuid primary key default gen_random_uuid(),
  drill_id uuid not null references public.program_drills(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  kind public.program_media_kind not null,
  video_id uuid null references public.videos(id) on delete set null,
  external_url text null,
  title text null check (title is null or char_length(title) <= 140),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint program_drill_media_kind_chk check (
    (kind = 'internal_video' and video_id is not null)
    or
    (kind = 'external_link' and external_url is not null and char_length(trim(external_url)) > 0)
  )
);

create index if not exists program_drill_media_drill_idx on public.program_drill_media (drill_id, sort_order, created_at);

create table if not exists public.program_template_days (
  template_id uuid not null references public.program_templates(id) on delete cascade,
  week_index integer not null check (week_index >= 1),
  day_index integer not null check (day_index >= 1),
  focus_id uuid null references public.program_focuses(id) on delete set null,
  note text null check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (template_id, week_index, day_index)
);

drop trigger if exists trg_program_template_days_updated_at on public.program_template_days;
create trigger trg_program_template_days_updated_at
before update on public.program_template_days
for each row execute function public.set_updated_at();

create table if not exists public.program_template_day_assignments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.program_templates(id) on delete cascade,
  week_index integer not null check (week_index >= 1),
  day_index integer not null check (day_index >= 1),
  drill_id uuid not null references public.program_drills(id) on delete restrict,
  sets integer null check (sets is null or (sets >= 1 and sets <= 50)),
  reps integer null check (reps is null or (reps >= 1 and reps <= 500)),
  duration_min integer null check (duration_min is null or (duration_min >= 1 and duration_min <= 240)),
  requires_upload boolean not null default false,
  upload_prompt text null check (upload_prompt is null or char_length(upload_prompt) <= 400),
  notes_to_player text null check (notes_to_player is null or char_length(notes_to_player) <= 2000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists program_template_day_assignments_idx
  on public.program_template_day_assignments (template_id, week_index, day_index, sort_order, created_at);

drop trigger if exists trg_program_template_day_assignments_updated_at on public.program_template_day_assignments;
create trigger trg_program_template_day_assignments_updated_at
before update on public.program_template_day_assignments
for each row execute function public.set_updated_at();

-- Allow multiple videos per assignment: add assignment_id on submissions and relax uniqueness.
alter table public.program_submissions
  add column if not exists day_index integer null,
  add column if not exists assignment_id uuid null references public.program_template_day_assignments(id) on delete set null;

-- Drop old uniqueness (enrollment_id, video_id) so same video can be attached multiple times if needed.
drop index if exists program_submissions_enrollment_video_unique;

create unique index if not exists program_submissions_enrollment_assignment_video_unique
  on public.program_submissions (enrollment_id, assignment_id, video_id)
  where assignment_id is not null;

create table if not exists public.program_assignment_completions (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.program_enrollments(id) on delete cascade,
  assignment_id uuid not null references public.program_template_day_assignments(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (enrollment_id, assignment_id)
);

alter table public.program_focuses enable row level security;
alter table public.program_drills enable row level security;
alter table public.program_drill_media enable row level security;
alter table public.program_template_days enable row level security;
alter table public.program_template_day_assignments enable row level security;
alter table public.program_assignment_completions enable row level security;

-- READ POLICIES (reuse team + enrollment visibility rules)
drop policy if exists program_focuses_select_team on public.program_focuses;
create policy program_focuses_select_team on public.program_focuses
for select to authenticated
using (team_id = public.current_team_id() and public.is_coach());

drop policy if exists program_drills_select_team on public.program_drills;
create policy program_drills_select_team on public.program_drills
for select to authenticated
using (team_id = public.current_team_id() and public.is_coach());

drop policy if exists program_drill_media_select_team on public.program_drill_media;
create policy program_drill_media_select_team on public.program_drill_media
for select to authenticated
using (team_id = public.current_team_id() and public.is_coach());

drop policy if exists program_template_days_select_visible on public.program_template_days;
create policy program_template_days_select_visible on public.program_template_days
for select to authenticated
using (
  exists (
    select 1 from public.program_templates t
    where t.id = program_template_days.template_id
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

drop policy if exists program_template_day_assignments_select_visible on public.program_template_day_assignments;
create policy program_template_day_assignments_select_visible on public.program_template_day_assignments
for select to authenticated
using (
  exists (
    select 1 from public.program_templates t
    where t.id = program_template_day_assignments.template_id
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

drop policy if exists program_assignment_completions_select_visible on public.program_assignment_completions;
create policy program_assignment_completions_select_visible on public.program_assignment_completions
for select to authenticated
using (
  exists (
    select 1
    from public.program_enrollments e
    where e.id = program_assignment_completions.enrollment_id
      and e.team_id = public.current_team_id()
      and (e.coach_user_id = auth.uid() or e.player_user_id = auth.uid())
  )
);

revoke insert, update, delete on public.program_focuses from authenticated;
revoke insert, update, delete on public.program_drills from authenticated;
revoke insert, update, delete on public.program_drill_media from authenticated;
revoke insert, update, delete on public.program_template_days from authenticated;
revoke insert, update, delete on public.program_template_day_assignments from authenticated;
revoke insert, update, delete on public.program_assignment_completions from authenticated;

grant select on public.program_focuses to authenticated;
grant select on public.program_drills to authenticated;
grant select on public.program_drill_media to authenticated;
grant select on public.program_template_days to authenticated;
grant select on public.program_template_day_assignments to authenticated;
grant select on public.program_assignment_completions to authenticated;

-- RPCs (coach): create/update focuses/drills/media and day plans/assignments
create or replace function public.create_program_focus(p_name text, p_description text default null, p_cues_json jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_id uuid;
begin
  if not public.is_coach() then raise exception 'forbidden'; end if;
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'missing_profile'; end if;

  insert into public.program_focuses (team_id, coach_user_id, name, description, cues_json)
  values (v_team_id, auth.uid(), coalesce(nullif(trim(p_name), ''), 'Focus'), nullif(trim(p_description), ''), coalesce(p_cues_json, '[]'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_program_focus(text, text, jsonb) from public;
grant execute on function public.create_program_focus(text, text, jsonb) to authenticated;

create or replace function public.create_program_drill(
  p_title text,
  p_category public.program_drill_category default 'other',
  p_goal text default null,
  p_equipment_json jsonb default '[]'::jsonb,
  p_cues_json jsonb default '[]'::jsonb,
  p_common_mistakes_json jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_id uuid;
begin
  if not public.is_coach() then raise exception 'forbidden'; end if;
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'missing_profile'; end if;

  insert into public.program_drills (team_id, coach_user_id, title, category, goal, equipment_json, cues_json, common_mistakes_json)
  values (
    v_team_id,
    auth.uid(),
    coalesce(nullif(trim(p_title), ''), 'Drill'),
    coalesce(p_category, 'other'),
    nullif(trim(p_goal), ''),
    coalesce(p_equipment_json, '[]'::jsonb),
    coalesce(p_cues_json, '[]'::jsonb),
    coalesce(p_common_mistakes_json, '[]'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_program_drill(text, public.program_drill_category, text, jsonb, jsonb, jsonb) from public;
grant execute on function public.create_program_drill(text, public.program_drill_category, text, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.add_program_drill_media(
  p_drill_id uuid,
  p_kind public.program_media_kind,
  p_video_id uuid default null,
  p_external_url text default null,
  p_title text default null,
  p_sort_order integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_id uuid;
begin
  if not public.is_coach() then raise exception 'forbidden'; end if;
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'missing_profile'; end if;

  if not exists (select 1 from public.program_drills d where d.id = p_drill_id and d.team_id = v_team_id and d.coach_user_id = auth.uid()) then
    raise exception 'invalid_drill';
  end if;

  if p_kind = 'internal_video' then
    if p_video_id is null or not public.can_read_video(p_video_id) then
      raise exception 'invalid_video';
    end if;
  end if;

  insert into public.program_drill_media (drill_id, team_id, kind, video_id, external_url, title, sort_order)
  values (p_drill_id, v_team_id, p_kind, p_video_id, nullif(trim(p_external_url), ''), nullif(trim(p_title), ''), coalesce(p_sort_order, 0))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_program_drill_media(uuid, public.program_media_kind, uuid, text, text, integer) from public;
grant execute on function public.add_program_drill_media(uuid, public.program_media_kind, uuid, text, text, integer) to authenticated;

create or replace function public.set_program_template_day(
  p_template_id uuid,
  p_week_index integer,
  p_day_index integer,
  p_focus_id uuid default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_weeks integer;
  v_days integer;
begin
  if not public.is_coach() then raise exception 'forbidden'; end if;
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'missing_profile'; end if;

  select t.weeks_count, t.cycle_days into v_weeks, v_days
  from public.program_templates t
  where t.id = p_template_id and t.team_id = v_team_id and t.coach_user_id = auth.uid();
  if v_weeks is null then raise exception 'not_found'; end if;
  if p_week_index < 1 or p_week_index > v_weeks then raise exception 'invalid_week_index'; end if;
  if p_day_index < 1 or p_day_index > v_days then raise exception 'invalid_day_index'; end if;

  if p_focus_id is not null then
    if not exists (select 1 from public.program_focuses f where f.id = p_focus_id and f.team_id = v_team_id and f.coach_user_id = auth.uid()) then
      raise exception 'invalid_focus';
    end if;
  end if;

  insert into public.program_template_days (template_id, week_index, day_index, focus_id, note)
  values (p_template_id, p_week_index, p_day_index, p_focus_id, nullif(trim(p_note), ''))
  on conflict (template_id, week_index, day_index) do update
    set focus_id = excluded.focus_id,
        note = excluded.note,
        updated_at = now();
end;
$$;
revoke all on function public.set_program_template_day(uuid, integer, integer, uuid, text) from public;
grant execute on function public.set_program_template_day(uuid, integer, integer, uuid, text) to authenticated;

create or replace function public.upsert_program_template_day_assignment(
  p_template_id uuid,
  p_week_index integer,
  p_day_index integer,
  p_drill_id uuid,
  p_assignment_id uuid default null,
  p_sets integer default null,
  p_reps integer default null,
  p_duration_min integer default null,
  p_requires_upload boolean default false,
  p_upload_prompt text default null,
  p_notes_to_player text default null,
  p_sort_order integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_weeks integer;
  v_days integer;
  v_id uuid;
begin
  if not public.is_coach() then raise exception 'forbidden'; end if;
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'missing_profile'; end if;

  select t.weeks_count, t.cycle_days into v_weeks, v_days
  from public.program_templates t
  where t.id = p_template_id and t.team_id = v_team_id and t.coach_user_id = auth.uid();
  if v_weeks is null then raise exception 'not_found'; end if;
  if p_week_index < 1 or p_week_index > v_weeks then raise exception 'invalid_week_index'; end if;
  if p_day_index < 1 or p_day_index > v_days then raise exception 'invalid_day_index'; end if;

  if not exists (select 1 from public.program_drills d where d.id = p_drill_id and d.team_id = v_team_id and d.coach_user_id = auth.uid()) then
    raise exception 'invalid_drill';
  end if;

  if p_assignment_id is null then
    insert into public.program_template_day_assignments (
      template_id, week_index, day_index, drill_id, sets, reps, duration_min, requires_upload, upload_prompt, notes_to_player, sort_order
    )
    values (
      p_template_id, p_week_index, p_day_index, p_drill_id, p_sets, p_reps, p_duration_min, coalesce(p_requires_upload, false),
      nullif(trim(p_upload_prompt), ''), nullif(trim(p_notes_to_player), ''), coalesce(p_sort_order, 0)
    )
    returning id into v_id;
    return v_id;
  end if;

  update public.program_template_day_assignments a
    set drill_id = p_drill_id,
        sets = p_sets,
        reps = p_reps,
        duration_min = p_duration_min,
        requires_upload = coalesce(p_requires_upload, false),
        upload_prompt = nullif(trim(p_upload_prompt), ''),
        notes_to_player = nullif(trim(p_notes_to_player), ''),
        sort_order = coalesce(p_sort_order, 0),
        updated_at = now()
  where a.id = p_assignment_id
    and a.template_id = p_template_id
    and a.week_index = p_week_index
    and a.day_index = p_day_index;

  if not found then
    raise exception 'not_found';
  end if;

  return p_assignment_id;
end;
$$;
revoke all on function public.upsert_program_template_day_assignment(uuid, integer, integer, uuid, uuid, integer, integer, integer, boolean, text, text, integer) from public;
grant execute on function public.upsert_program_template_day_assignment(uuid, integer, integer, uuid, uuid, integer, integer, integer, boolean, text, text, integer) to authenticated;

create or replace function public.delete_program_template_day_assignment(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
begin
  if not public.is_coach() then raise exception 'forbidden'; end if;
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'missing_profile'; end if;

  delete from public.program_template_day_assignments a
  using public.program_templates t
  where a.id = p_assignment_id
    and t.id = a.template_id
    and t.team_id = v_team_id
    and t.coach_user_id = auth.uid();
end;
$$;
revoke all on function public.delete_program_template_day_assignment(uuid) from public;
grant execute on function public.delete_program_template_day_assignment(uuid) to authenticated;

-- RPCs (player): submit video to assignment (multiple allowed) and mark assignment complete
create or replace function public.submit_program_video_to_assignment(
  p_assignment_id uuid,
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
  v_week integer;
  v_day integer;
  v_requires boolean;
  v_enrollment_id uuid;
  v_submission_id uuid;
begin
  if public.is_coach() then raise exception 'forbidden'; end if;
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'missing_profile'; end if;

  select a.template_id, a.week_index, a.day_index, a.requires_upload
    into v_template_id, v_week, v_day, v_requires
  from public.program_template_day_assignments a
  join public.program_templates t on t.id = a.template_id
  where a.id = p_assignment_id
    and t.team_id = v_team_id;

  if v_template_id is null then raise exception 'not_found'; end if;

  select e.id into v_enrollment_id
  from public.program_enrollments e
  where e.team_id = v_team_id
    and e.template_id = v_template_id
    and e.player_user_id = auth.uid()
    and e.status = 'active'
  order by e.start_at desc
  limit 1;

  if v_enrollment_id is null then raise exception 'not_enrolled'; end if;

  if p_video_id is null or not public.can_read_video(p_video_id) then
    raise exception 'invalid_video';
  end if;

  insert into public.program_submissions (enrollment_id, week_index, day_index, assignment_id, video_id, note)
  values (v_enrollment_id, v_week, v_day, p_assignment_id, p_video_id, nullif(trim(p_note), ''))
  returning id into v_submission_id;

  if coalesce(v_requires, false) then
    insert into public.program_assignment_completions (enrollment_id, assignment_id)
    values (v_enrollment_id, p_assignment_id)
    on conflict do nothing;
  end if;

  return v_submission_id;
end;
$$;
revoke all on function public.submit_program_video_to_assignment(uuid, uuid, text) from public;
grant execute on function public.submit_program_video_to_assignment(uuid, uuid, text) to authenticated;

create or replace function public.complete_program_assignment(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_template_id uuid;
  v_requires boolean;
  v_enrollment_id uuid;
begin
  if public.is_coach() then raise exception 'forbidden'; end if;
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'missing_profile'; end if;

  select a.template_id, a.requires_upload into v_template_id, v_requires
  from public.program_template_day_assignments a
  join public.program_templates t on t.id = a.template_id
  where a.id = p_assignment_id and t.team_id = v_team_id;

  if v_template_id is null then raise exception 'not_found'; end if;

  select e.id into v_enrollment_id
  from public.program_enrollments e
  where e.team_id = v_team_id
    and e.template_id = v_template_id
    and e.player_user_id = auth.uid()
    and e.status = 'active'
  order by e.start_at desc
  limit 1;

  if v_enrollment_id is null then raise exception 'not_enrolled'; end if;
  if coalesce(v_requires, false) then raise exception 'requires_upload'; end if;

  insert into public.program_assignment_completions (enrollment_id, assignment_id)
  values (v_enrollment_id, p_assignment_id)
  on conflict do nothing;
end;
$$;
revoke all on function public.complete_program_assignment(uuid) from public;
grant execute on function public.complete_program_assignment(uuid) to authenticated;

commit;

-- ============================================================
-- 0027_enrollment_day_overrides.sql
-- ============================================================
-- Per-player day overrides

-- 0027_enrollment_day_overrides.sql
-- Per-player day overrides: coaches can tweak a single player's day assignments without changing the template

begin;

-- Table for per-player day overrides
create table if not exists public.program_enrollment_day_overrides (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.program_enrollments(id) on delete cascade,
  week_index int not null check (week_index >= 1),
  day_index int not null check (day_index >= 1),
  focus_id uuid references public.program_focuses(id) on delete set null,
  day_note text,
  assignments_json jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, week_index, day_index)
);

create index if not exists idx_enrollment_day_overrides_enrollment on public.program_enrollment_day_overrides(enrollment_id);

-- RLS
alter table public.program_enrollment_day_overrides enable row level security;

drop policy if exists enrollment_day_overrides_select on public.program_enrollment_day_overrides;
create policy enrollment_day_overrides_select on public.program_enrollment_day_overrides
  for select using (
    exists (
      select 1 from public.program_enrollments e
      where e.id = enrollment_id
        and (e.player_user_id = auth.uid() or e.coach_user_id = auth.uid())
    )
  );

drop policy if exists enrollment_day_overrides_insert on public.program_enrollment_day_overrides;
create policy enrollment_day_overrides_insert on public.program_enrollment_day_overrides
  for insert with check (
    exists (
      select 1 from public.program_enrollments e
      where e.id = enrollment_id
        and e.coach_user_id = auth.uid()
    )
  );

drop policy if exists enrollment_day_overrides_update on public.program_enrollment_day_overrides;
create policy enrollment_day_overrides_update on public.program_enrollment_day_overrides
  for update using (
    exists (
      select 1 from public.program_enrollments e
      where e.id = enrollment_id
        and e.coach_user_id = auth.uid()
    )
  );

drop policy if exists enrollment_day_overrides_delete on public.program_enrollment_day_overrides;
create policy enrollment_day_overrides_delete on public.program_enrollment_day_overrides
  for delete using (
    exists (
      select 1 from public.program_enrollments e
      where e.id = enrollment_id
        and e.coach_user_id = auth.uid()
    )
  );

-- RPC to upsert per-player day override
create or replace function public.set_enrollment_day_override(
  p_enrollment_id uuid,
  p_week_index int,
  p_day_index int,
  p_focus_id uuid default null,
  p_day_note text default null,
  p_assignments_json jsonb default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_enrollment record;
  v_override_id uuid;
begin
  select id, coach_user_id into v_enrollment
  from public.program_enrollments
  where id = p_enrollment_id;

  if v_enrollment is null then
    raise exception 'enrollment_not_found';
  end if;

  if v_enrollment.coach_user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;

  insert into public.program_enrollment_day_overrides (
    enrollment_id, week_index, day_index, focus_id, day_note, assignments_json, updated_at
  ) values (
    p_enrollment_id, p_week_index, p_day_index, p_focus_id, p_day_note,
    coalesce(p_assignments_json, '[]'::jsonb), now()
  )
  on conflict (enrollment_id, week_index, day_index) do update set
    focus_id = excluded.focus_id,
    day_note = excluded.day_note,
    assignments_json = excluded.assignments_json,
    updated_at = now()
  returning id into v_override_id;

  return v_override_id;
end;
$$;

revoke all on function public.set_enrollment_day_override(uuid, int, int, uuid, text, jsonb) from public;
grant execute on function public.set_enrollment_day_override(uuid, int, int, uuid, text, jsonb) to authenticated;

commit;

-- ============================================================
-- 0028_program_crud_fixes.sql
-- ============================================================
-- Programs: delete/edit templates, delete/edit drills/focuses, player RLS

-- 0028_program_crud_fixes.sql
-- Programs: delete program, delete/edit drills/focuses/media, player RLS for drills/focuses

begin;

-- ============================================================
-- 1. DELETE PROGRAM TEMPLATE RPC
-- ============================================================
create or replace function public.delete_program_template(p_template_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
begin
  if not public.is_coach() then raise exception 'forbidden'; end if;
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'missing_profile'; end if;

  delete from public.program_templates
  where id = p_template_id
    and team_id = v_team_id
    and coach_user_id = auth.uid();

  return found;
end;
$$;
revoke all on function public.delete_program_template(uuid) from public;
grant execute on function public.delete_program_template(uuid) to authenticated;

-- ============================================================
-- 2. EDIT PROGRAM TEMPLATE RPC
-- ============================================================
create or replace function public.update_program_template(
  p_template_id uuid,
  p_title text default null,
  p_weeks_count integer default null,
  p_cycle_days integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
begin
  if not public.is_coach() then raise exception 'forbidden'; end if;
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'missing_profile'; end if;

  update public.program_templates
  set
    title = coalesce(nullif(trim(p_title), ''), title),
    weeks_count = coalesce(p_weeks_count, weeks_count),
    cycle_days = coalesce(p_cycle_days, cycle_days),
    updated_at = now()
  where id = p_template_id
    and team_id = v_team_id
    and coach_user_id = auth.uid();

  return found;
end;
$$;
revoke all on function public.update_program_template(uuid, text, integer, integer) from public;
grant execute on function public.update_program_template(uuid, text, integer, integer) to authenticated;

-- ============================================================
-- 3. DELETE FOCUS RPC
-- ============================================================
create or replace function public.delete_program_focus(p_focus_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
begin
  if not public.is_coach() then raise exception 'forbidden'; end if;
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'missing_profile'; end if;

  delete from public.program_focuses
  where id = p_focus_id
    and team_id = v_team_id
    and coach_user_id = auth.uid();

  return found;
end;
$$;
revoke all on function public.delete_program_focus(uuid) from public;
grant execute on function public.delete_program_focus(uuid) to authenticated;

-- ============================================================
-- 4. EDIT FOCUS RPC
-- ============================================================
create or replace function public.update_program_focus(
  p_focus_id uuid,
  p_name text default null,
  p_description text default null,
  p_cues_json jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
begin
  if not public.is_coach() then raise exception 'forbidden'; end if;
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'missing_profile'; end if;

  update public.program_focuses
  set
    name = coalesce(nullif(trim(p_name), ''), name),
    description = case when p_description is not null then nullif(trim(p_description), '') else description end,
    cues_json = coalesce(p_cues_json, cues_json),
    updated_at = now()
  where id = p_focus_id
    and team_id = v_team_id
    and coach_user_id = auth.uid();

  return found;
end;
$$;
revoke all on function public.update_program_focus(uuid, text, text, jsonb) from public;
grant execute on function public.update_program_focus(uuid, text, text, jsonb) to authenticated;

-- ============================================================
-- 5. DELETE DRILL RPC
-- ============================================================
create or replace function public.delete_program_drill(p_drill_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
begin
  if not public.is_coach() then raise exception 'forbidden'; end if;
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'missing_profile'; end if;

  -- Note: assignments referencing this drill will fail (on delete restrict)
  -- Coach must remove assignments first
  delete from public.program_drills
  where id = p_drill_id
    and team_id = v_team_id
    and coach_user_id = auth.uid();

  return found;
end;
$$;
revoke all on function public.delete_program_drill(uuid) from public;
grant execute on function public.delete_program_drill(uuid) to authenticated;

-- ============================================================
-- 6. EDIT DRILL RPC
-- ============================================================
create or replace function public.update_program_drill(
  p_drill_id uuid,
  p_title text default null,
  p_category public.program_drill_category default null,
  p_goal text default null,
  p_equipment_json jsonb default null,
  p_cues_json jsonb default null,
  p_common_mistakes_json jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
begin
  if not public.is_coach() then raise exception 'forbidden'; end if;
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'missing_profile'; end if;

  update public.program_drills
  set
    title = coalesce(nullif(trim(p_title), ''), title),
    category = coalesce(p_category, category),
    goal = case when p_goal is not null then nullif(trim(p_goal), '') else goal end,
    equipment_json = coalesce(p_equipment_json, equipment_json),
    cues_json = coalesce(p_cues_json, cues_json),
    common_mistakes_json = coalesce(p_common_mistakes_json, common_mistakes_json),
    updated_at = now()
  where id = p_drill_id
    and team_id = v_team_id
    and coach_user_id = auth.uid();

  return found;
end;
$$;
revoke all on function public.update_program_drill(uuid, text, public.program_drill_category, text, jsonb, jsonb, jsonb) from public;
grant execute on function public.update_program_drill(uuid, text, public.program_drill_category, text, jsonb, jsonb, jsonb) to authenticated;

-- ============================================================
-- 7. DELETE DRILL MEDIA RPC
-- ============================================================
create or replace function public.delete_program_drill_media(p_media_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
begin
  if not public.is_coach() then raise exception 'forbidden'; end if;
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'missing_profile'; end if;

  delete from public.program_drill_media
  where id = p_media_id
    and team_id = v_team_id;

  return found;
end;
$$;
revoke all on function public.delete_program_drill_media(uuid) from public;
grant execute on function public.delete_program_drill_media(uuid) to authenticated;

-- ============================================================
-- 8. PLAYER RLS: Allow enrolled players to read drills/focuses/media
-- ============================================================

-- Drop old coach-only policies AND any existing visible policies (for re-run safety)
drop policy if exists program_focuses_select_team on public.program_focuses;
drop policy if exists program_drills_select_team on public.program_drills;
drop policy if exists program_drill_media_select_team on public.program_drill_media;
drop policy if exists program_focuses_select_visible on public.program_focuses;
drop policy if exists program_drills_select_visible on public.program_drills;
drop policy if exists program_drill_media_select_visible on public.program_drill_media;

-- New policies: coach OR enrolled player on same team
create policy program_focuses_select_visible on public.program_focuses
for select to authenticated
using (
  team_id = public.current_team_id()
  and (
    public.is_coach()
    or exists (
      select 1 from public.program_enrollments e
      where e.team_id = program_focuses.team_id
        and e.player_user_id = auth.uid()
        and e.status = 'active'
    )
  )
);

create policy program_drills_select_visible on public.program_drills
for select to authenticated
using (
  team_id = public.current_team_id()
  and (
    public.is_coach()
    or exists (
      select 1 from public.program_enrollments e
      where e.team_id = program_drills.team_id
        and e.player_user_id = auth.uid()
        and e.status = 'active'
    )
  )
);

create policy program_drill_media_select_visible on public.program_drill_media
for select to authenticated
using (
  team_id = public.current_team_id()
  and (
    public.is_coach()
    or exists (
      select 1 from public.program_enrollments e
      where e.team_id = program_drill_media.team_id
        and e.player_user_id = auth.uid()
        and e.status = 'active'
    )
  )
);

commit;





-- ============================================================
-- 0023_coach_create_lessons.sql
-- ============================================================
-- Coach can schedule lessons directly (approved) like Outlook

begin;

create or replace function public.create_lesson_as_coach(
  p_primary_player_user_id uuid,
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

  insert into public.lesson_participants (lesson_id, user_id, invite_status, is_primary, invited_by_user_id, invited_at, responded_at)
  values (v_lesson_id, p_primary_player_user_id, 'accepted', true, auth.uid(), now(), now());

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

revoke all on function public.create_lesson_as_coach(uuid, public.lesson_mode, timestamptz, integer, text, text, uuid) from public;
grant execute on function public.create_lesson_as_coach(uuid, public.lesson_mode, timestamptz, integer, text, text, uuid) to authenticated;

commit;


-- ============================================================
-- 0022_coach_schedule_settings_and_availability.sql
-- ============================================================
-- Coach schedule settings + availability (busy intervals) + stronger holds

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.coach_schedule_settings (
  coach_user_id uuid primary key references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  work_start_min integer not null default 480,
  work_end_min integer not null default 1080,
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

commit;


-- ============================================================
-- 0021_group_lessons.sql
-- ============================================================
-- Group lessons (2 players + 1 coach) with participant confirmation and coach flexibility

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

revoke insert, update, delete on public.lessons from authenticated;
revoke insert, update, delete on public.lesson_participants from authenticated;
grant select on public.lessons to authenticated;
grant select on public.lesson_participants to authenticated;

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

    if r.player_user_id is not null then
      insert into public.lesson_participants (lesson_id, user_id, invite_status, is_primary, invited_by_user_id, invited_at, responded_at)
      values (v_new_id, r.player_user_id, 'accepted', true, r.player_user_id, r.created_at, r.created_at)
      on conflict do nothing;
    end if;
  end loop;
end $$;

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
      and l.status = 'approved'
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

revoke all on function public.request_lesson(uuid, public.lesson_mode, timestamptz, integer, text, text, uuid) from public;
grant execute on function public.request_lesson(uuid, public.lesson_mode, timestamptz, integer, text, text, uuid) to authenticated;

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

  select lp.* into v_lp
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
end;
$$;

revoke all on function public.respond_to_lesson_invite(uuid, boolean) from public;
grant execute on function public.respond_to_lesson_invite(uuid, boolean) to authenticated;

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
end;
$$;

revoke all on function public.respond_to_lesson_request(uuid, boolean, text) from public;
grant execute on function public.respond_to_lesson_request(uuid, boolean, text) to authenticated;

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
    update public.lesson_participants
      set invite_status = 'invited',
          responded_at = null,
          invited_at = now(),
          invited_by_user_id = auth.uid()
    where lesson_id = v_l.id
      and is_primary = false;
  end if;
end;
$$;

revoke all on function public.reschedule_lesson(uuid, timestamptz, integer, text, text) from public;
grant execute on function public.reschedule_lesson(uuid, timestamptz, integer, text, text) to authenticated;

commit;


-- ============================================================
-- 0020_lesson_blocks_and_reschedule.sql
-- ============================================================
-- Coach time blocks + rescheduling + stronger conflict checks

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


-- ============================================================
-- 0018_lessons.sql
-- ============================================================
-- Lessons v1 (player requests -> coach approves)

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

revoke insert, update, delete on public.lesson_requests from authenticated;
grant select on public.lesson_requests to authenticated;

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

revoke all on function public.request_lesson(uuid, public.lesson_mode, timestamptz, integer, text, text) from public;
grant execute on function public.request_lesson(uuid, public.lesson_mode, timestamptz, integer, text, text) to authenticated;

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


-- ============================================================
-- 0016_player_modes.sql
-- ============================================================
-- Player modes (in-person / hybrid / remote)

begin;

do $$ begin
  create type public.player_mode as enum ('in_person', 'hybrid', 'remote');
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists player_mode public.player_mode null;

create index if not exists profiles_team_role_mode_idx
  on public.profiles (team_id, role, player_mode);

commit;


-- ============================================================
-- 0017_set_player_mode.sql
-- ============================================================
-- Player modes: coach-only update via RPC (avoid direct profile updates)

begin;

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


-- ============================================================
-- 0007_fast_wins_coach_features.sql
-- ============================================================
-- NOTE: This file is empty in the repo (no-op).

-- ============================================================
-- 0008_sprint2_invites_events_activity_roster.sql
-- ============================================================
-- Sprint 2: Invite links, audit events, real activity sorting, roster deactivation
-- Run in Supabase SQL Editor.

begin;

create extension if not exists pgcrypto with schema extensions;

-- 1) Roster: allow deactivation via RPC (avoid direct profile updates)
alter table public.profiles
  add column if not exists is_active boolean not null default true;

create or replace function public.set_player_active(p_user_id uuid, p_active boolean)
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
    set is_active = p_active
  where user_id = p_user_id;
end;
$$;

revoke all on function public.set_player_active(uuid, boolean) from public;
grant execute on function public.set_player_active(uuid, boolean) to authenticated;

-- 2) Activity sorting: last_activity_at on videos
alter table public.videos
  add column if not exists last_activity_at timestamptz not null default now();

-- backfill reasonable values
update public.videos
set last_activity_at = created_at
where last_activity_at is null;

create or replace function public.bump_video_activity(p_video_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.videos
  set last_activity_at = now()
  where id = p_video_id;
$$;

revoke all on function public.bump_video_activity(uuid) from public;
grant execute on function public.bump_video_activity(uuid) to authenticated;

create or replace function public.comments_activity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bump_video_activity(new.video_id);
  return new;
end;
$$;

drop trigger if exists trg_comments_activity on public.comments;
create trigger trg_comments_activity
after insert on public.comments
for each row
execute function public.comments_activity_trigger();

-- 3) Invite links
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  token text not null unique,
  expires_at timestamptz null,
  max_uses integer not null default 50,
  uses_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.invites enable row level security;

drop policy if exists invites_select_coach on public.invites;
create policy invites_select_coach on public.invites
for select
to authenticated
using (public.is_coach() and team_id = public.current_team_id());

-- Create invite via RPC (coach-only)
create or replace function public.create_invite_link(p_expires_minutes integer default 10080)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_token text;
  v_expires timestamptz;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;

  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_expires := case when p_expires_minutes is null then null else now() + make_interval(mins => p_expires_minutes) end;

  insert into public.invites (team_id, created_by_user_id, token, expires_at)
  values (v_team_id, auth.uid(), v_token, v_expires);

  return v_token;
end;
$$;

revoke all on function public.create_invite_link(integer) from public;
grant execute on function public.create_invite_link(integer) to authenticated;

grant select, insert, update on public.invites to authenticated;

-- Join via token (service_role only)
create or replace function public.join_team_with_invite_token(
  p_token text,
  p_user_id uuid,
  p_first_name text,
  p_last_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_inv public.invites%rowtype;
  v_display text;
begin
  select * into v_inv
  from public.invites
  where token = trim(p_token)
  limit 1;

  if v_inv.id is null then
    raise exception 'invalid_invite';
  end if;

  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    raise exception 'invite_expired';
  end if;

  if v_inv.uses_count >= v_inv.max_uses then
    raise exception 'invite_exhausted';
  end if;

  v_display := trim(p_first_name) || ' ' || trim(p_last_name);

  insert into public.profiles (user_id, team_id, role, display_name, first_name, last_name)
  values (p_user_id, v_inv.team_id, 'player', v_display, trim(p_first_name), trim(p_last_name));

  update public.invites
    set uses_count = uses_count + 1
  where id = v_inv.id;

  return v_inv.team_id;
end;
$$;

revoke all on function public.join_team_with_invite_token(text, uuid, text, text) from public;
grant execute on function public.join_team_with_invite_token(text, uuid, text, text) to service_role;

-- 4) Audit events (minimal)
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

drop policy if exists events_select_coach on public.events;
create policy events_select_coach on public.events
for select
to authenticated
using (public.is_coach() and team_id = public.current_team_id());

grant select, insert on public.events to authenticated;

create or replace function public.log_event(p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.events (team_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (public.current_team_id(), auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

revoke all on function public.log_event(text, text, uuid, jsonb) from public;
grant execute on function public.log_event(text, text, uuid, jsonb) to authenticated;

commit;

-- ============================================================
-- 0009_soft_deletes_trash.sql
-- ============================================================
-- Soft deletes + Trash/Restore
-- Run in Supabase SQL Editor (safe to run once).

begin;

-- 1) Schema: add deleted markers
alter table public.videos
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by_user_id uuid null references auth.users (id) on delete set null;

alter table public.comments
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by_user_id uuid null references auth.users (id) on delete set null;

create index if not exists videos_team_deleted_idx on public.videos (team_id, deleted_at desc);
create index if not exists videos_owner_deleted_idx on public.videos (owner_user_id, deleted_at desc);
create index if not exists comments_video_deleted_idx on public.comments (video_id, deleted_at desc);

-- 2) Ensure "read" helpers hide deleted by default
create or replace function public.can_read_video(p_video_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.videos v
    where v.id = p_video_id
      and v.deleted_at is null
      and (
        v.owner_user_id = auth.uid()
        or (public.is_coach() and v.team_id = public.current_team_id())
      )
  );
$$;

grant execute on function public.can_read_video(uuid) to authenticated;

-- 3) RLS: hide deleted rows in normal selects, but allow selecting deleted rows too (Trash views)
alter table public.videos enable row level security;
alter table public.comments enable row level security;

drop policy if exists videos_select_visible on public.videos;
create policy videos_select_visible on public.videos
for select
to authenticated
using (
  deleted_at is null
  and (
    owner_user_id = auth.uid()
    or (public.is_coach() and team_id = public.current_team_id())
  )
);

drop policy if exists videos_select_deleted on public.videos;
create policy videos_select_deleted on public.videos
for select
to authenticated
using (
  deleted_at is not null
  and (
    owner_user_id = auth.uid()
    or (public.is_coach() and team_id = public.current_team_id())
  )
);

drop policy if exists comments_select_visible on public.comments;
create policy comments_select_visible on public.comments
for select
to authenticated
using (
  deleted_at is null
  and public.can_read_video(video_id)
);

drop policy if exists comments_select_deleted on public.comments;
create policy comments_select_deleted on public.comments
for select
to authenticated
using (
  deleted_at is not null
  and public.can_read_video(video_id)
);

-- 4) RLS: allow soft-delete/restore via UPDATE (uploader/author or coach on team)
-- Note: column-level restriction is enforced in application code; RLS protects rows.
drop policy if exists videos_update_visible on public.videos;
create policy videos_update_visible on public.videos
for update
to authenticated
using (
  uploader_user_id = auth.uid()
  or (public.is_coach() and team_id = public.current_team_id())
)
with check (
  uploader_user_id = auth.uid()
  or (public.is_coach() and team_id = public.current_team_id())
);

drop policy if exists comments_update_visible on public.comments;
create policy comments_update_visible on public.comments
for update
to authenticated
using (
  author_user_id = auth.uid()
  or (public.is_coach() and public.can_read_video(video_id))
)
with check (
  author_user_id = auth.uid()
  or (public.is_coach() and public.can_read_video(video_id))
);

grant update on public.videos to authenticated;
grant update on public.comments to authenticated;

commit;

-- ============================================================
-- 0010_true_unread_video_views.sql
-- ============================================================
-- True unread v1: per-video last_seen_at per user
-- Run in Supabase SQL Editor (safe to run once).

begin;

-- 1) Video activity: ensure videos have last_activity_at
alter table public.videos
  add column if not exists last_activity_at timestamptz not null default now();

create index if not exists videos_team_last_activity_idx on public.videos (team_id, last_activity_at desc);
create index if not exists videos_owner_last_activity_idx on public.videos (owner_user_id, last_activity_at desc);

-- Backfill best-effort
update public.videos
set last_activity_at = greatest(coalesce(last_activity_at, created_at), created_at)
where last_activity_at is null;

-- 2) Per-user per-video view state
create table if not exists public.video_views (
  user_id uuid not null references auth.users (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index if not exists video_views_user_seen_idx on public.video_views (user_id, last_seen_at desc);
create index if not exists video_views_video_idx on public.video_views (video_id);

create or replace function public.touch_video_seen(p_video_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.video_views (user_id, video_id, last_seen_at, created_at, updated_at)
  values (auth.uid(), p_video_id, now(), now(), now())
  on conflict (user_id, video_id) do update
    set last_seen_at = excluded.last_seen_at,
        updated_at = now();
end;
$$;

revoke all on function public.touch_video_seen(uuid) from public;
grant execute on function public.touch_video_seen(uuid) to authenticated;

-- 3) RLS for video_views
alter table public.video_views enable row level security;

drop policy if exists video_views_select_self on public.video_views;
create policy video_views_select_self on public.video_views
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists video_views_insert_self on public.video_views;
create policy video_views_insert_self on public.video_views
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists video_views_update_self on public.video_views;
create policy video_views_update_self on public.video_views
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update on public.video_views to authenticated;

commit;

-- ============================================================
-- 0011_comment_visibility_notes.sql
-- ============================================================
-- Comment visibility: team-visible, player-private notes, coach-only notes
-- Run in Supabase SQL Editor (safe to run once).

begin;

do $$ begin
  create type public.comment_visibility as enum ('team', 'player_private', 'coach_only');
exception
  when duplicate_object then null;
end $$;

alter table public.comments
  add column if not exists visibility public.comment_visibility not null default 'team';

-- Backfill existing comments explicitly (idempotent)
update public.comments set visibility = 'team' where visibility is null;

create index if not exists comments_visibility_idx on public.comments (visibility);

-- RLS: comments selects must respect visibility AND video access
alter table public.comments enable row level security;

-- Replace select policies created earlier (0000/0009)
drop policy if exists comments_select_visible on public.comments;
create policy comments_select_visible on public.comments
for select
to authenticated
using (
  deleted_at is null
  and (
    -- Shared thread: both player + coach can read if they can read the video
    (visibility = 'team' and public.can_read_video(video_id))

    -- Player private notes: only the owning player (and author) can read
    or (
      visibility = 'player_private'
      and author_user_id = auth.uid()
      and exists (
        select 1 from public.videos v
        where v.id = comments.video_id
          and v.deleted_at is null
          and v.owner_user_id = auth.uid()
      )
    )

    -- Coach internal notes: only coaches on the team can read
    or (
      visibility = 'coach_only'
      and public.is_coach()
      and exists (
        select 1 from public.videos v
        where v.id = comments.video_id
          and v.deleted_at is null
          and v.team_id = public.current_team_id()
      )
    )
  )
);

drop policy if exists comments_select_deleted on public.comments;
create policy comments_select_deleted on public.comments
for select
to authenticated
using (
  deleted_at is not null
  and (
    (visibility = 'team' and public.can_read_video(video_id))
    or (
      visibility = 'player_private'
      and author_user_id = auth.uid()
      and exists (
        select 1 from public.videos v
        where v.id = comments.video_id
          and v.deleted_at is null
          and v.owner_user_id = auth.uid()
      )
    )
    or (
      visibility = 'coach_only'
      and public.is_coach()
      and exists (
        select 1 from public.videos v
        where v.id = comments.video_id
          and v.deleted_at is null
          and v.team_id = public.current_team_id()
      )
    )
  )
);

-- Insert policy: allow team-visible comments for anyone who can read the video
drop policy if exists comments_insert_visible on public.comments;
create policy comments_insert_visible on public.comments
for insert
to authenticated
with check (
  author_user_id = auth.uid()
  and deleted_at is null
  and (
    (visibility = 'team' and public.can_read_video(video_id))

    -- Player private notes: only the owning player (not coach)
    or (
      visibility = 'player_private'
      and not public.is_coach()
      and exists (
        select 1 from public.videos v
        where v.id = comments.video_id
          and v.deleted_at is null
          and v.owner_user_id = auth.uid()
      )
    )

    -- Coach internal notes: only coaches on the team
    or (
      visibility = 'coach_only'
      and public.is_coach()
      and exists (
        select 1 from public.videos v
        where v.id = comments.video_id
          and v.deleted_at is null
          and v.team_id = public.current_team_id()
      )
    )
  )
);

-- Update policy: allow soft-delete (and nothing else) for allowed viewers
-- (App only updates deleted_at/deleted_by_user_id; we rely on application code for column discipline.)
drop policy if exists comments_update_visible on public.comments;
create policy comments_update_visible on public.comments
for update
to authenticated
using (
  -- Author can always soft-delete their own comments.
  author_user_id = auth.uid()
  or (
    -- Coach can soft-delete team-visible or coach-only comments on team videos.
    public.is_coach()
    and visibility <> 'player_private'
    and exists (
      select 1 from public.videos v
      where v.id = comments.video_id
        and v.deleted_at is null
        and v.team_id = public.current_team_id()
    )
  )
)
with check (
  author_user_id = auth.uid()
  or (
    public.is_coach()
    and visibility <> 'player_private'
    and exists (
      select 1 from public.videos v
      where v.id = comments.video_id
        and v.deleted_at is null
        and v.team_id = public.current_team_id()
    )
  )
);

grant select, insert, update on public.comments to authenticated;

commit;

-- ============================================================
-- 0012_video_links.sql
-- ============================================================
-- Video links (external URL videos)
-- Run in Supabase SQL Editor (safe to run once).

begin;

do $$ begin
  create type public.video_source as enum ('upload', 'link');
exception
  when duplicate_object then null;
end $$;

alter table public.videos
  add column if not exists source public.video_source not null default 'upload',
  add column if not exists external_url text null;

alter table public.videos
  alter column storage_path drop not null;

alter table public.videos
  drop constraint if exists videos_source_fields_chk,
  add constraint videos_source_fields_chk
    check (
      (source = 'upload' and storage_path is not null and external_url is null)
      or
      (source = 'link' and external_url is not null and char_length(trim(external_url)) > 0)
    )
    not valid;

commit;

-- ============================================================
-- 0013_stable_team_invite.sql
-- ============================================================
-- Stable team invite link (no rotation)
-- Run in Supabase SQL Editor (safe to run once).

begin;

create extension if not exists pgcrypto with schema extensions;

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


-- ============================================================
-- 0014_team_visible_coach_uploads.sql
-- ============================================================
-- Players can read coach uploads + library videos on their team.

begin;

create or replace function public.can_read_video(p_video_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.videos v
    where v.id = p_video_id
      and v.deleted_at is null
      and (
        v.owner_user_id = auth.uid()
        or (public.is_coach() and v.team_id = public.current_team_id())
        or (
          v.team_id = public.current_team_id()
          and (
            v.is_library = true
            or exists (
              select 1
              from public.profiles p
              where p.user_id = v.uploader_user_id
                and p.team_id = v.team_id
                and p.role = 'coach'
            )
          )
        )
      )
  );
$$;

grant execute on function public.can_read_video(uuid) to authenticated;

drop policy if exists videos_select_visible on public.videos;
create policy videos_select_visible on public.videos
for select
to authenticated
using (
  deleted_at is null
  and (
    owner_user_id = auth.uid()
    or (public.is_coach() and team_id = public.current_team_id())
    or (
      team_id = public.current_team_id()
      and (
        is_library = true
        or exists (
          select 1
          from public.profiles p
          where p.user_id = videos.uploader_user_id
            and p.team_id = videos.team_id
            and p.role = 'coach'
        )
      )
    )
  )
);

commit;


-- ============================================================
-- 0015_relax_auth_user_fks_for_deletes.sql
-- ============================================================
-- Allow deleting auth.users without being blocked by "restrict" FKs.

begin;

alter table public.videos
  drop constraint if exists videos_uploader_user_id_fkey;
alter table public.videos
  add constraint videos_uploader_user_id_fkey
  foreign key (uploader_user_id) references auth.users(id) on delete cascade;

alter table public.videos
  drop constraint if exists videos_owner_user_id_fkey;
alter table public.videos
  add constraint videos_owner_user_id_fkey
  foreign key (owner_user_id) references auth.users(id) on delete cascade;

alter table public.comments
  drop constraint if exists comments_author_user_id_fkey;
alter table public.comments
  add constraint comments_author_user_id_fkey
  foreign key (author_user_id) references auth.users(id) on delete cascade;

alter table public.invites
  alter column created_by_user_id drop not null;
alter table public.invites
  drop constraint if exists invites_created_by_user_id_fkey;
alter table public.invites
  add constraint invites_created_by_user_id_fkey
  foreign key (created_by_user_id) references auth.users(id) on delete set null;

alter table public.events
  alter column actor_user_id drop not null;
alter table public.events
  drop constraint if exists events_actor_user_id_fkey;
alter table public.events
  add constraint events_actor_user_id_fkey
  foreign key (actor_user_id) references auth.users(id) on delete set null;

commit;


-- ============================================================
-- 0029_player_claim_tokens.sql
-- ============================================================
-- Player claim tokens: allows coaches to create player accounts that players can claim

begin;

-- Add claim columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS claim_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS claim_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for fast claim token lookup
CREATE INDEX IF NOT EXISTS idx_profiles_claim_token ON public.profiles(claim_token) WHERE claim_token IS NOT NULL;

-- Function to generate a secure random token
CREATE OR REPLACE FUNCTION public.generate_claim_token()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN encode(gen_random_bytes(24), 'base64url');
END;
$$;

-- RPC: Coach creates an unclaimed player profile
CREATE OR REPLACE FUNCTION public.create_unclaimed_player(
  p_first_name TEXT,
  p_last_name TEXT,
  p_player_mode public.player_mode DEFAULT 'in_person'
)
RETURNS TABLE(player_id UUID, claim_token TEXT, claim_url TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_coach_profile public.profiles;
  v_player_id UUID;
  v_claim_token TEXT;
BEGIN
  SELECT * INTO v_coach_profile FROM public.profiles WHERE user_id = auth.uid();
  IF v_coach_profile IS NULL OR v_coach_profile.role != 'coach' THEN
    RAISE EXCEPTION 'Only coaches can create unclaimed players';
  END IF;

  v_claim_token := public.generate_claim_token();
  
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE profiles.claim_token = v_claim_token) LOOP
    v_claim_token := public.generate_claim_token();
  END LOOP;

  v_player_id := gen_random_uuid();

  INSERT INTO public.profiles (
    user_id, team_id, role, first_name, last_name, display_name,
    player_mode, is_active, claim_token, claim_token_expires_at, created_by_user_id
  ) VALUES (
    v_player_id, v_coach_profile.team_id, 'player', p_first_name, p_last_name,
    CONCAT(p_first_name, ' ', p_last_name), p_player_mode, true,
    v_claim_token, NOW() + INTERVAL '30 days', auth.uid()
  );

  RETURN QUERY SELECT v_player_id, v_claim_token, CONCAT('/claim/', v_claim_token);
END;
$$;

REVOKE ALL ON FUNCTION public.create_unclaimed_player FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_unclaimed_player TO authenticated;

-- RPC: Get claim info (public)
CREATE OR REPLACE FUNCTION public.get_claim_info(p_claim_token TEXT)
RETURNS TABLE(
  player_id UUID, first_name TEXT, last_name TEXT, team_name TEXT, coach_name TEXT,
  is_valid BOOLEAN, is_expired BOOLEAN, is_claimed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile public.profiles;
  v_team public.teams;
  v_coach public.profiles;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE profiles.claim_token = p_claim_token;
  
  IF v_profile IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, false, false, false;
    RETURN;
  END IF;

  SELECT * INTO v_team FROM public.teams WHERE id = v_profile.team_id;
  SELECT * INTO v_coach FROM public.profiles WHERE team_id = v_profile.team_id AND role = 'coach' LIMIT 1;

  RETURN QUERY SELECT
    v_profile.user_id, v_profile.first_name, v_profile.last_name, v_team.name, v_coach.display_name,
    true, v_profile.claim_token_expires_at < NOW(), v_profile.claimed_at IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_claim_info FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_claim_info TO anon, authenticated;

-- RPC: Claim the account
CREATE OR REPLACE FUNCTION public.claim_player_account(
  p_claim_token TEXT,
  p_new_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile public.profiles;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE claim_token = p_claim_token;
  
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Invalid claim token';
  END IF;
  IF v_profile.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Account already claimed';
  END IF;
  IF v_profile.claim_token_expires_at < NOW() THEN
    RAISE EXCEPTION 'Claim token expired';
  END IF;

  UPDATE public.profiles SET
    user_id = p_new_user_id,
    claimed_at = NOW(),
    claim_token = NULL,
    claim_token_expires_at = NULL
  WHERE claim_token = p_claim_token;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_player_account FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_player_account TO authenticated;

-- RPC: Regenerate claim token
CREATE OR REPLACE FUNCTION public.regenerate_claim_token(p_player_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_coach_profile public.profiles;
  v_player_profile public.profiles;
  v_new_token TEXT;
BEGIN
  SELECT * INTO v_coach_profile FROM public.profiles WHERE user_id = auth.uid();
  IF v_coach_profile IS NULL OR v_coach_profile.role != 'coach' THEN
    RAISE EXCEPTION 'Only coaches can regenerate claim tokens';
  END IF;

  SELECT * INTO v_player_profile FROM public.profiles WHERE user_id = p_player_id;
  IF v_player_profile IS NULL OR v_player_profile.team_id != v_coach_profile.team_id THEN
    RAISE EXCEPTION 'Player not found on your team';
  END IF;
  IF v_player_profile.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot regenerate token for claimed account';
  END IF;

  v_new_token := public.generate_claim_token();
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE claim_token = v_new_token) LOOP
    v_new_token := public.generate_claim_token();
  END LOOP;

  UPDATE public.profiles SET
    claim_token = v_new_token,
    claim_token_expires_at = NOW() + INTERVAL '30 days'
  WHERE user_id = p_player_id;

  RETURN v_new_token;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_claim_token FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerate_claim_token TO authenticated;

-- RPC: Delete unclaimed player
CREATE OR REPLACE FUNCTION public.delete_unclaimed_player(p_player_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_coach_profile public.profiles;
  v_player_profile public.profiles;
BEGIN
  SELECT * INTO v_coach_profile FROM public.profiles WHERE user_id = auth.uid();
  IF v_coach_profile IS NULL OR v_coach_profile.role != 'coach' THEN
    RAISE EXCEPTION 'Only coaches can delete unclaimed players';
  END IF;

  SELECT * INTO v_player_profile FROM public.profiles WHERE user_id = p_player_id;
  IF v_player_profile IS NULL OR v_player_profile.team_id != v_coach_profile.team_id THEN
    RAISE EXCEPTION 'Player not found on your team';
  END IF;
  IF v_player_profile.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete claimed account - deactivate instead';
  END IF;

  DELETE FROM public.profiles WHERE user_id = p_player_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_unclaimed_player FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_unclaimed_player TO authenticated;

commit;

