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


