-- FAST WINS (Coach features): coach-assigned uploads, pinned/library videos, last_seen tracking,
-- and a team preview RPC for access code UX.
-- Run in Supabase SQL Editor.

begin;

create extension if not exists pgcrypto with schema extensions;

-- 1) Videos: pinned + library flags
alter table public.videos
  add column if not exists pinned boolean not null default false,
  add column if not exists is_library boolean not null default false;

-- 2) Profiles: last_seen_feed_at for lightweight "new since last visit" indicators
alter table public.profiles
  add column if not exists last_seen_feed_at timestamptz not null default now();

-- 3) Helper: is user in my team?
create or replace function public.is_in_my_team(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and p.team_id = public.current_team_id()
  );
$$;

grant execute on function public.is_in_my_team(uuid) to authenticated;

-- 4) Videos RLS updates
-- Players can read their own videos AND team library videos.
drop policy if exists videos_select_visible on public.videos;
create policy videos_select_visible on public.videos
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or (is_library and team_id = public.current_team_id())
  or (public.is_coach() and team_id = public.current_team_id())
);

-- Allow coach-assigned uploads within team. Players still only upload for themselves.
drop policy if exists videos_insert_self on public.videos;
create policy videos_insert_self on public.videos
for insert
to authenticated
with check (
  team_id = public.current_team_id()
  and uploader_user_id = auth.uid()
  and (
    owner_user_id = auth.uid()
    or (public.is_coach() and public.is_in_my_team(owner_user_id))
  )
);

-- Allow coaches to update pinned/is_library/title on team videos.
drop policy if exists videos_update_team_by_coach on public.videos;
create policy videos_update_team_by_coach on public.videos
for update
to authenticated
using (public.is_coach() and team_id = public.current_team_id())
with check (public.is_coach() and team_id = public.current_team_id());

grant update on public.videos to authenticated;

-- 5) Profile last_seen update RPC
create or replace function public.touch_last_seen_feed()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set last_seen_feed_at = now()
  where user_id = auth.uid();
$$;

grant execute on function public.touch_last_seen_feed() to authenticated;

-- 6) Access code preview (improves join UX)
-- Returns team + coach name if code is valid.
create or replace function public.preview_team_from_access_code(p_access_code text)
returns table (team_id uuid, team_name text, coach_name text)
language sql
security definer
set search_path = public, extensions
as $$
  select
    t.id as team_id,
    t.name as team_name,
    p.display_name as coach_name
  from public.teams t
  join public.profiles p on p.team_id = t.id and p.role = 'coach'
  where t.access_code_hash = extensions.crypt(upper(trim(p_access_code)), t.access_code_hash)
  limit 1;
$$;

revoke all on function public.preview_team_from_access_code(text) from public;
grant execute on function public.preview_team_from_access_code(text) to service_role;

commit;
