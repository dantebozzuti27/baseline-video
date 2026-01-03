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

