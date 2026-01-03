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


