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

-- Drop old coach-only policies
drop policy if exists program_focuses_select_team on public.program_focuses;
drop policy if exists program_drills_select_team on public.program_drills;
drop policy if exists program_drill_media_select_team on public.program_drill_media;

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

