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
