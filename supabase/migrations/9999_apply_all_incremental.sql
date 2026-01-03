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

