-- Baseline Video (single-file setup)
--
-- What this does (in order):
-- 1) Wipes ALL objects in the `public` schema (tables/views/functions/types/sequences).
-- 2) Wipes Supabase Storage metadata for the `videos` bucket (storage.objects + storage.buckets rows).
-- 3) Recreates Baseline Video schema + RLS + Storage bucket/policies + onboarding RPCs.
--
-- WARNING: Take a backup before running.
-- NOTE: This does NOT touch Supabase system schemas like `auth`, `extensions`.
-- NOTE: Storage metadata deletion does not necessarily delete underlying files in your storage provider.

begin;

-- 1) RESET: wipe `public` schema objects
do $$
declare
  r record;
begin
  -- Drop views (then materialized views)
  for r in
    select table_name
    from information_schema.views
    where table_schema = 'public'
  loop
    execute format('drop view if exists public.%I cascade;', r.table_name);
  end loop;

  for r in
    select matviewname
    from pg_matviews
    where schemaname = 'public'
  loop
    execute format('drop materialized view if exists public.%I cascade;', r.matviewname);
  end loop;

  -- Drop tables
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('drop table if exists public.%I cascade;', r.tablename);
  end loop;

  -- Drop sequences
  for r in
    select sequencename
    from pg_sequences
    where schemaname = 'public'
  loop
    execute format('drop sequence if exists public.%I cascade;', r.sequencename);
  end loop;

  -- Drop enum types (and other custom types)
  for r in
    select t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typtype in ('e', 'c', 'd') -- enum, composite, domain
  loop
    execute format('drop type if exists public.%I cascade;', r.typname);
  end loop;

  -- Drop functions in public
  for r in
    select p.proname as name, oidvectortypes(p.proargtypes) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('drop function if exists public.%I(%s) cascade;', r.name, r.args);
  end loop;
end $$;

-- 2) RESET: wipe storage metadata for `videos` bucket
do $$
begin
  begin
    delete from storage.objects where bucket_id = 'videos';
    delete from storage.buckets where id = 'videos';
  exception
    when undefined_table then
      raise notice 'Skipping storage wipe: storage schema/tables not found.';
    when insufficient_privilege then
      raise notice 'Skipping storage wipe: insufficient privileges.';
  end;
end $$;

-- 3) Baseline schema + RLS
create extension if not exists pgcrypto with schema extensions;

-- Helper function for updated_at triggers (used throughout)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Lesson enums (needed before lesson tables)
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

do $$ begin
  create type public.user_role as enum ('coach', 'player', 'parent');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.video_category as enum ('game', 'training');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.video_source as enum ('upload', 'link');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  access_code_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  role public.user_role not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  uploader_user_id uuid not null references auth.users (id) on delete restrict,
  owner_user_id uuid not null references auth.users (id) on delete restrict,
  category public.video_category not null,
  source public.video_source not null default 'upload',
  title text not null,
  storage_path text null,
  external_url text null,
  created_at timestamptz not null default now(),
  constraint videos_storage_path_unique unique (storage_path),
  constraint videos_source_fields_chk check (
    (source = 'upload' and storage_path is not null and external_url is null)
    or
    (source = 'link' and external_url is not null and char_length(trim(external_url)) > 0)
  ),
  constraint videos_owner_same_team_chk check (team_id is not null)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  author_user_id uuid not null references auth.users (id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  timestamp_seconds integer null check (timestamp_seconds is null or timestamp_seconds >= 0),
  created_at timestamptz not null default now()
);

create index if not exists profiles_team_role_idx on public.profiles (team_id, role);
create index if not exists videos_team_created_idx on public.videos (team_id, created_at desc);
create index if not exists videos_owner_created_idx on public.videos (owner_user_id, created_at desc);
create index if not exists comments_video_created_idx on public.comments (video_id, created_at asc);

-- lesson_requests table (needed early for block/reschedule migrations)
create table if not exists public.lesson_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  player_user_id uuid not null references auth.users(id) on delete cascade,
  mode public.lesson_mode not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null default 'UTC',
  status public.lesson_status not null default 'requested',
  notes text null check (notes is null or char_length(notes) <= 2000),
  coach_response_note text null check (coach_response_note is null or char_length(coach_response_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_requests_end_after_start_chk check (end_at > start_at)
);

create index if not exists lesson_requests_team_status_start_idx
  on public.lesson_requests (team_id, status, start_at desc);
create index if not exists lesson_requests_coach_start_idx
  on public.lesson_requests (coach_user_id, start_at desc);
create index if not exists lesson_requests_player_start_idx
  on public.lesson_requests (player_user_id, start_at desc);

drop trigger if exists trg_lesson_requests_updated_at on public.lesson_requests;
create trigger trg_lesson_requests_updated_at
before update on public.lesson_requests
for each row execute function public.set_updated_at();

alter table public.lesson_requests enable row level security;

create or replace function public.current_team_id()
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select team_id from public.profiles where user_id = auth.uid();
$$;

create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and role = 'coach'
  );
$$;

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
      and (
        v.owner_user_id = auth.uid()
        or (public.is_coach() and v.team_id = public.current_team_id())
      )
  );
$$;

grant execute on function public.current_team_id() to authenticated;
grant execute on function public.is_coach() to authenticated;
grant execute on function public.can_read_video(uuid) to authenticated;

create or replace function public.rotate_team_access_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_code text;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;

  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception 'missing_profile';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  update public.teams
    set access_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf'))
  where id = v_team_id;

  return v_code;
end;
$$;

grant execute on function public.rotate_team_access_code() to authenticated;

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.comments enable row level security;

drop policy if exists teams_select_member on public.teams;
create policy teams_select_member on public.teams
for select
to authenticated
using (id = public.current_team_id());

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists profiles_select_team_for_coach on public.profiles;
create policy profiles_select_team_for_coach on public.profiles
for select
to authenticated
using (public.is_coach() and team_id = public.current_team_id());

drop policy if exists profiles_select_coach_on_team on public.profiles;
create policy profiles_select_coach_on_team on public.profiles
for select
to authenticated
using (
  role = 'coach'
  and team_id = public.current_team_id()
);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists videos_select_visible on public.videos;
create policy videos_select_visible on public.videos
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or (public.is_coach() and team_id = public.current_team_id())
);

drop policy if exists videos_insert_self on public.videos;
create policy videos_insert_self on public.videos
for insert
to authenticated
with check (
  team_id = public.current_team_id()
  and uploader_user_id = auth.uid()
  and owner_user_id = auth.uid()
);

drop policy if exists comments_select_visible on public.comments;
create policy comments_select_visible on public.comments
for select
to authenticated
using (public.can_read_video(video_id));

drop policy if exists comments_insert_visible on public.comments;
create policy comments_insert_visible on public.comments
for insert
to authenticated
with check (author_user_id = auth.uid() and public.can_read_video(video_id));

grant select on public.teams to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert on public.videos to authenticated;
grant select, insert on public.comments to authenticated;

-- 4) Storage bucket + policies
do $$
begin
  begin
    insert into storage.buckets (id, name, public)
    values ('videos', 'videos', false)
    on conflict (id) do nothing;

    -- NOTE: Some environments/users are not the owner of storage.objects, which is required for RLS/policy changes.
    -- If these fail, configure Storage bucket + policies via the Supabase dashboard, or run as the DB owner role.
    alter table storage.objects enable row level security;

    drop policy if exists videos_objects_insert_prefix on storage.objects;
    create policy videos_objects_insert_prefix
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'videos'
      and split_part(name, '/', 1) = public.current_team_id()::text
      and split_part(name, '/', 2) = auth.uid()::text
    );

    drop policy if exists videos_objects_delete_own on storage.objects;
    create policy videos_objects_delete_own
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'videos'
      and split_part(name, '/', 2) = auth.uid()::text
    );
  exception
    when undefined_table then
      raise notice 'Skipping storage bucket/policies: storage schema/tables not found.';
    when insufficient_privilege then
      raise notice 'Skipping storage bucket/policies: insufficient privileges (must be owner of storage.objects).';
  end;
end $$;

-- 5) Onboarding RPCs
create or replace function public.create_team_for_coach(
  p_team_name text,
  p_coach_user_id uuid,
  p_coach_display_name text
)
returns table (team_id uuid, access_code text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_code text;
begin
  v_team_id := gen_random_uuid();
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)); -- hex chars, readable

  insert into public.teams (id, name, access_code_hash)
  values (v_team_id, p_team_name, extensions.crypt(v_code, extensions.gen_salt('bf')));

  insert into public.profiles (user_id, team_id, role, display_name)
  values (p_coach_user_id, v_team_id, 'coach', p_coach_display_name);

  team_id := v_team_id;
  access_code := v_code;
  return next;
end;
$$;

create or replace function public.join_team_with_access_code(
  p_access_code text,
  p_user_id uuid,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
begin
  select t.id
    into v_team_id
  from public.teams t
  where t.access_code_hash = extensions.crypt(p_access_code, t.access_code_hash)
  limit 1;

  if v_team_id is null then
    raise exception 'invalid_access_code';
  end if;

  insert into public.profiles (user_id, team_id, role, display_name)
  values (p_user_id, v_team_id, 'player', p_display_name);

  return v_team_id;
end;
$$;

revoke all on function public.create_team_for_coach(text, uuid, text) from public;
revoke all on function public.join_team_with_access_code(text, uuid, text) from public;
grant execute on function public.create_team_for_coach(text, uuid, text) to service_role;
grant execute on function public.join_team_with_access_code(text, uuid, text) to service_role;

commit;


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
-- Sprint 2: Invite links, audit events, real activity sorting, roster deactivation
-- Run in Supabase SQL Editor.

begin;

create extension if not exists pgcrypto with schema extensions;

-- Helper: check if a given user is in the current user's team.
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


-- Video links (external URL videos)
-- Run in Supabase SQL Editor (safe to run once).

begin;

-- 1) Enum for video source
do $$ begin
  create type public.video_source as enum ('upload', 'link');
exception
  when duplicate_object then null;
end $$;

-- 2) Videos: allow link-based items
alter table public.videos
  add column if not exists source public.video_source not null default 'upload',
  add column if not exists external_url text null;

-- storage_path must be nullable for link videos
alter table public.videos
  alter column storage_path drop not null;

-- 3) Constraints: require exactly the right fields per source
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


-- Stable team invite link (no rotation)
-- Run in Supabase SQL Editor (safe to run once).

begin;

create extension if not exists pgcrypto with schema extensions;

-- Returns a non-expiring invite token for the current coach's team.
-- Creates one if missing.
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


-- Team-visible coach uploads + library visibility
-- Players can read: their own videos, any library video on their team, and any coach-uploaded video on their team.
-- Run in Supabase SQL Editor (safe to run once).

begin;

-- Add is_library column to videos table
alter table public.videos
  add column if not exists is_library boolean not null default false;

create index if not exists videos_team_library_idx on public.videos (team_id, is_library) where is_library = true;

-- 1) Update can_read_video to include coach-upload + library visibility (and still hide deleted).
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
        -- owning player can always read their own (non-deleted) video
        v.owner_user_id = auth.uid()

        -- coaches can read all team videos
        or (public.is_coach() and v.team_id = public.current_team_id())

        -- team visibility for players: library videos OR coach-uploaded videos
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

-- 2) Update videos_select_visible to match the expanded read rule (deleted handled by separate policy).
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


-- Allow deleting auth.users rows without being blocked by "restrict" FKs.
-- Goal: make deleting users from Supabase dashboard (or via admin API) work reliably.
--
-- Strategy:
-- - videos/comments: cascade (if a user is deleted, their videos/comments go too)
-- - invites/events: set null (preserve team history + invite records even if actor is deleted)
--
-- Run in Supabase SQL Editor (safe to run once).

begin;

-- videos.uploader_user_id: restrict -> cascade
alter table public.videos
  drop constraint if exists videos_uploader_user_id_fkey;
alter table public.videos
  add constraint videos_uploader_user_id_fkey
  foreign key (uploader_user_id) references auth.users(id) on delete cascade;

-- videos.owner_user_id: restrict -> cascade
alter table public.videos
  drop constraint if exists videos_owner_user_id_fkey;
alter table public.videos
  add constraint videos_owner_user_id_fkey
  foreign key (owner_user_id) references auth.users(id) on delete cascade;

-- comments.author_user_id: restrict -> cascade
alter table public.comments
  drop constraint if exists comments_author_user_id_fkey;
alter table public.comments
  add constraint comments_author_user_id_fkey
  foreign key (author_user_id) references auth.users(id) on delete cascade;

-- invites.created_by_user_id: restrict -> set null (requires nullable)
alter table public.invites
  alter column created_by_user_id drop not null;
alter table public.invites
  drop constraint if exists invites_created_by_user_id_fkey;
alter table public.invites
  add constraint invites_created_by_user_id_fkey
  foreign key (created_by_user_id) references auth.users(id) on delete set null;

-- events.actor_user_id: restrict -> set null (requires nullable)
alter table public.events
  alter column actor_user_id drop not null;
alter table public.events
  drop constraint if exists events_actor_user_id_fkey;
alter table public.events
  add constraint events_actor_user_id_fkey
  foreign key (actor_user_id) references auth.users(id) on delete set null;

commit;


-- Player modes (in-person / hybrid / remote)
-- Coach-managed categorization for players (UX + workflow only; no permission differences).
-- Run in Supabase SQL Editor (safe to run once).

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


-- Player modes: coach-only update via RPC (avoid direct profile updates)
-- Run in Supabase SQL Editor (safe to run once).

begin;

-- Helper used by roster RPCs; define defensively if missing.
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


-- Coach time blocks + rescheduling + stronger conflict checks
-- Run in Supabase SQL Editor (safe to run once).

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

-- Team members can view blocks for scheduling; only coach can create/delete their own.
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

  -- Don't allow creating a block that overlaps an approved lesson (keeps schedule sane).
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

-- Strengthen request_lesson: reject if coach is already booked or blocked.
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

  -- Block if coach has an approved lesson overlapping.
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

  -- Block if coach has a time block overlapping.
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

-- Strengthen approval conflict check: include blocks too.
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

-- Reschedule: both coach and player can move time. Coach keeps approval; player requires re-approval.
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

  -- Cannot reschedule into coach blocks or approved overlaps (excluding itself).
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


-- Coach schedule settings + availability (busy intervals) + stronger holds
-- Run in Supabase SQL Editor (safe to run once).

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.coach_schedule_settings (
  coach_user_id uuid primary key references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  work_start_min integer not null default 480, -- 08:00
  work_end_min integer not null default 1080, -- 18:00
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

-- Create defaults on demand (coach-only).
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

-- Availability: return busy intervals without leaking player info.
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

-- Stronger holds: treat requested lessons as busy for conflicts/blocks too.
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
      and l.status in ('approved', 'requested')
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

grant execute on function public.request_lesson(uuid, public.lesson_mode, timestamptz, integer, text, text, uuid) to authenticated;

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
      and l2.status in ('approved', 'requested')
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


-- Coach can schedule lessons directly (approved) like Outlook
-- Adds RPC: public.create_lesson_as_coach(...)

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

  -- Conflicts: blocks and any approved/requested lessons for this coach.
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

  -- Primary player is accepted by default (no extra confirmation).
  insert into public.lesson_participants (lesson_id, user_id, invite_status, is_primary, invited_by_user_id, invited_at, responded_at)
  values (v_lesson_id, p_primary_player_user_id, 'accepted', true, auth.uid(), now(), now());

  -- Second player must accept/decline.
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

-- Player claim tokens: allows coaches to create player accounts that players can claim
-- ===================================================================================

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
-- Returns the claim token for sharing
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
  -- Get coach profile
  SELECT * INTO v_coach_profile FROM public.profiles WHERE user_id = auth.uid();
  IF v_coach_profile IS NULL OR v_coach_profile.role != 'coach' THEN
    RAISE EXCEPTION 'Only coaches can create unclaimed players';
  END IF;

  -- Generate unique claim token
  v_claim_token := public.generate_claim_token();
  
  -- Ensure uniqueness (regenerate if collision)
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE profiles.claim_token = v_claim_token) LOOP
    v_claim_token := public.generate_claim_token();
  END LOOP;

  -- Generate a placeholder user_id (will be replaced when claimed)
  v_player_id := gen_random_uuid();

  -- Insert the unclaimed profile
  INSERT INTO public.profiles (
    user_id,
    team_id,
    role,
    first_name,
    last_name,
    display_name,
    player_mode,
    is_active,
    claim_token,
    claim_token_expires_at,
    created_by_user_id
  ) VALUES (
    v_player_id,
    v_coach_profile.team_id,
    'player',
    p_first_name,
    p_last_name,
    CONCAT(p_first_name, ' ', p_last_name),
    p_player_mode,
    true,
    v_claim_token,
    NOW() + INTERVAL '30 days',
    auth.uid()
  );

  RETURN QUERY SELECT v_player_id, v_claim_token, CONCAT('/claim/', v_claim_token);
END;
$$;

REVOKE ALL ON FUNCTION public.create_unclaimed_player FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_unclaimed_player TO authenticated;

-- RPC: Get claim info (public, no auth required)
CREATE OR REPLACE FUNCTION public.get_claim_info(p_claim_token TEXT)
RETURNS TABLE(
  player_id UUID,
  first_name TEXT,
  last_name TEXT,
  team_name TEXT,
  coach_name TEXT,
  is_valid BOOLEAN,
  is_expired BOOLEAN,
  is_claimed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile public.profiles;
  v_team public.teams;
  v_coach public.profiles;
BEGIN
  -- Find the profile with this claim token
  SELECT * INTO v_profile FROM public.profiles WHERE profiles.claim_token = p_claim_token;
  
  IF v_profile IS NULL THEN
    RETURN QUERY SELECT 
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      false, false, false;
    RETURN;
  END IF;

  -- Get team and coach info
  SELECT * INTO v_team FROM public.teams WHERE id = v_profile.team_id;
  SELECT * INTO v_coach FROM public.profiles WHERE team_id = v_profile.team_id AND role = 'coach' LIMIT 1;

  RETURN QUERY SELECT
    v_profile.user_id,
    v_profile.first_name,
    v_profile.last_name,
    v_team.name,
    v_coach.display_name,
    true,
    v_profile.claim_token_expires_at < NOW(),
    v_profile.claimed_at IS NOT NULL;
END;
$$;

-- Allow anonymous access for claim preview
REVOKE ALL ON FUNCTION public.get_claim_info FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_claim_info TO anon, authenticated;

-- RPC: Claim the account (called after auth.signUp)
-- Links the new auth user to the existing profile
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
  v_old_user_id UUID;
BEGIN
  -- Find the profile
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

  -- Store old placeholder ID
  v_old_user_id := v_profile.user_id;

  -- Update the profile to use the new auth user
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

-- RPC: Coach regenerates claim token for unclaimed player
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
  -- Verify coach
  SELECT * INTO v_coach_profile FROM public.profiles WHERE user_id = auth.uid();
  IF v_coach_profile IS NULL OR v_coach_profile.role != 'coach' THEN
    RAISE EXCEPTION 'Only coaches can regenerate claim tokens';
  END IF;

  -- Get player profile
  SELECT * INTO v_player_profile FROM public.profiles WHERE user_id = p_player_id;
  IF v_player_profile IS NULL OR v_player_profile.team_id != v_coach_profile.team_id THEN
    RAISE EXCEPTION 'Player not found on your team';
  END IF;
  
  IF v_player_profile.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot regenerate token for claimed account';
  END IF;

  -- Generate new token
  v_new_token := public.generate_claim_token();
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE claim_token = v_new_token) LOOP
    v_new_token := public.generate_claim_token();
  END LOOP;

  -- Update profile
  UPDATE public.profiles SET
    claim_token = v_new_token,
    claim_token_expires_at = NOW() + INTERVAL '30 days'
  WHERE user_id = p_player_id;

  RETURN v_new_token;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_claim_token FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerate_claim_token TO authenticated;

-- RPC: Coach deletes unclaimed player
CREATE OR REPLACE FUNCTION public.delete_unclaimed_player(p_player_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_coach_profile public.profiles;
  v_player_profile public.profiles;
BEGIN
  -- Verify coach
  SELECT * INTO v_coach_profile FROM public.profiles WHERE user_id = auth.uid();
  IF v_coach_profile IS NULL OR v_coach_profile.role != 'coach' THEN
    RAISE EXCEPTION 'Only coaches can delete unclaimed players';
  END IF;

  -- Get player profile
  SELECT * INTO v_player_profile FROM public.profiles WHERE user_id = p_player_id;
  IF v_player_profile IS NULL OR v_player_profile.team_id != v_coach_profile.team_id THEN
    RAISE EXCEPTION 'Player not found on your team';
  END IF;
  
  IF v_player_profile.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete claimed account - deactivate instead';
  END IF;

  -- Delete the unclaimed profile
  DELETE FROM public.profiles WHERE user_id = p_player_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_unclaimed_player FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_unclaimed_player TO authenticated;

-- Pending player invites - separate from profiles to avoid PK issues
-- These get converted to real profiles when claimed

CREATE TABLE IF NOT EXISTS public.pending_player_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  player_mode public.player_mode DEFAULT 'in_person',
  claim_token TEXT UNIQUE NOT NULL,
  claim_token_expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  claimed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast claim token lookup
CREATE INDEX IF NOT EXISTS idx_pending_invites_claim_token 
  ON public.pending_player_invites(claim_token) 
  WHERE claimed_at IS NULL;

-- Index for team lookup
CREATE INDEX IF NOT EXISTS idx_pending_invites_team 
  ON public.pending_player_invites(team_id);

-- RLS
ALTER TABLE public.pending_player_invites ENABLE ROW LEVEL SECURITY;

-- Coaches can read their team's pending invites
CREATE POLICY pending_invites_select_coach ON public.pending_player_invites
  FOR SELECT TO authenticated
  USING (
    team_id = public.current_team_id() AND public.is_coach()
  );

-- Coaches can insert pending invites
CREATE POLICY pending_invites_insert_coach ON public.pending_player_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    team_id = public.current_team_id() AND public.is_coach()
  );

-- Coaches can delete unclaimed invites
CREATE POLICY pending_invites_delete_coach ON public.pending_player_invites
  FOR DELETE TO authenticated
  USING (
    team_id = public.current_team_id() AND public.is_coach() AND claimed_at IS NULL
  );

-- Anyone can read by claim token (for claim page)
CREATE POLICY pending_invites_select_by_token ON public.pending_player_invites
  FOR SELECT TO anon, authenticated
  USING (claim_token IS NOT NULL);

-- Analytics and Monitoring Tables
-- Track usage, errors, and business metrics

begin;

-- Analytics events table - tracks all user actions
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  user_id uuid null references auth.users(id) on delete set null,
  team_id uuid null references public.teams(id) on delete set null,
  metadata jsonb null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_type_created_idx 
  on public.analytics_events (event_type, created_at desc);
create index if not exists analytics_events_user_idx 
  on public.analytics_events (user_id, created_at desc);
create index if not exists analytics_events_team_idx 
  on public.analytics_events (team_id, created_at desc);
create index if not exists analytics_events_created_idx 
  on public.analytics_events (created_at desc);

-- Error logs table - tracks all errors
create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  error_type text not null, -- 'frontend', 'api', 'database'
  message text not null,
  stack text null,
  user_id uuid null references auth.users(id) on delete set null,
  endpoint text null,
  metadata jsonb null default '{}',
  resolved_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists error_logs_type_created_idx 
  on public.error_logs (error_type, created_at desc);
create index if not exists error_logs_created_idx 
  on public.error_logs (created_at desc);
create index if not exists error_logs_unresolved_idx 
  on public.error_logs (created_at desc) where resolved_at is null;

-- Daily metrics table - aggregated stats per day
create table if not exists public.daily_metrics (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  team_id uuid null references public.teams(id) on delete cascade,
  metric_type text not null,
  value integer not null default 0,
  created_at timestamptz not null default now(),
  unique (date, team_id, metric_type)
);

create index if not exists daily_metrics_date_idx 
  on public.daily_metrics (date desc);
create index if not exists daily_metrics_team_date_idx 
  on public.daily_metrics (team_id, date desc);
create index if not exists daily_metrics_type_date_idx 
  on public.daily_metrics (metric_type, date desc);

-- Add is_admin column to profiles for admin access control
alter table public.profiles 
  add column if not exists is_admin boolean not null default false;

-- RLS policies
alter table public.analytics_events enable row level security;
alter table public.error_logs enable row level security;
alter table public.daily_metrics enable row level security;

-- Analytics events: admin-only read, anyone can insert (via API)
drop policy if exists analytics_events_insert_all on public.analytics_events;
create policy analytics_events_insert_all on public.analytics_events
  for insert to authenticated
  with check (true);

drop policy if exists analytics_events_select_admin on public.analytics_events;
create policy analytics_events_select_admin on public.analytics_events
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.is_admin = true
    )
  );

-- Error logs: admin-only access
drop policy if exists error_logs_insert_all on public.error_logs;
create policy error_logs_insert_all on public.error_logs
  for insert to authenticated
  with check (true);

drop policy if exists error_logs_select_admin on public.error_logs;
create policy error_logs_select_admin on public.error_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists error_logs_update_admin on public.error_logs;
create policy error_logs_update_admin on public.error_logs
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.is_admin = true
    )
  );

-- Daily metrics: admin-only read
drop policy if exists daily_metrics_select_admin on public.daily_metrics;
create policy daily_metrics_select_admin on public.daily_metrics
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.is_admin = true
    )
  );

-- Function to increment daily metric
create or replace function public.increment_daily_metric(
  p_metric_type text,
  p_team_id uuid default null,
  p_increment integer default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.daily_metrics (date, team_id, metric_type, value)
  values (current_date, p_team_id, p_metric_type, p_increment)
  on conflict (date, team_id, metric_type)
  do update set value = daily_metrics.value + p_increment;
end;
$$;

grant execute on function public.increment_daily_metric(text, uuid, integer) to authenticated;

commit;
-- Parent access model
-- Allows parents to view their children's videos, lessons, and progress
-- Run in Supabase SQL Editor

begin;

-- 2. Create parent-player links table
create table if not exists public.parent_player_links (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users (id) on delete cascade,
  player_user_id uuid not null references auth.users (id) on delete cascade,
  access_level text not null default 'view_only' check (access_level in ('view_only', 'full')),
  created_at timestamptz not null default now(),
  
  -- A parent can only be linked to a player once
  constraint parent_player_links_unique unique (parent_user_id, player_user_id),
  
  -- Parent and player must be different users
  constraint parent_player_links_different_users check (parent_user_id != player_user_id)
);

-- Indexes for fast lookups
create index if not exists parent_player_links_parent_idx on public.parent_player_links (parent_user_id);
create index if not exists parent_player_links_player_idx on public.parent_player_links (player_user_id);

-- 3. Helper function to check if user is a parent
create or replace function public.is_parent()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and role = 'parent'
  );
$$;

grant execute on function public.is_parent() to authenticated;

-- 4. Helper function to get linked player IDs for a parent
create or replace function public.get_linked_player_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select player_user_id 
  from public.parent_player_links 
  where parent_user_id = auth.uid();
$$;

grant execute on function public.get_linked_player_ids() to authenticated;

-- 5. RLS for parent_player_links
alter table public.parent_player_links enable row level security;

-- Parents can see their own links
drop policy if exists parent_links_select_own on public.parent_player_links;
create policy parent_links_select_own on public.parent_player_links
for select
to authenticated
using (parent_user_id = auth.uid());

-- Coaches can see links for players on their team
drop policy if exists parent_links_select_coach on public.parent_player_links;
create policy parent_links_select_coach on public.parent_player_links
for select
to authenticated
using (
  public.is_coach() 
  and player_user_id in (
    select user_id from public.profiles 
    where team_id = public.current_team_id() and role = 'player'
  )
);

-- Coaches can create links for players on their team
drop policy if exists parent_links_insert_coach on public.parent_player_links;
create policy parent_links_insert_coach on public.parent_player_links
for insert
to authenticated
with check (
  public.is_coach() 
  and player_user_id in (
    select user_id from public.profiles 
    where team_id = public.current_team_id() and role = 'player'
  )
);

-- Coaches can delete links for players on their team
drop policy if exists parent_links_delete_coach on public.parent_player_links;
create policy parent_links_delete_coach on public.parent_player_links
for delete
to authenticated
using (
  public.is_coach() 
  and player_user_id in (
    select user_id from public.profiles 
    where team_id = public.current_team_id() and role = 'player'
  )
);

grant select, insert, delete on public.parent_player_links to authenticated;

-- 6. Update videos RLS to allow parents to see their children's videos
drop policy if exists videos_select_visible on public.videos;
create policy videos_select_visible on public.videos
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or (public.is_coach() and team_id = public.current_team_id())
  or (public.is_parent() and owner_user_id in (select public.get_linked_player_ids()))
);

-- 7. Update can_read_video function to include parents
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
      and (
        v.owner_user_id = auth.uid()
        or (public.is_coach() and v.team_id = public.current_team_id())
        or (public.is_parent() and v.owner_user_id in (select public.get_linked_player_ids()))
      )
  );
$$;

-- 8. Allow parents to see profiles of their linked players and coaches
drop policy if exists profiles_select_parent_linked on public.profiles;
create policy profiles_select_parent_linked on public.profiles
for select
to authenticated
using (
  public.is_parent() 
  and (
    user_id in (select public.get_linked_player_ids())
    or (role = 'coach' and team_id in (
      select p.team_id from public.profiles p 
      where p.user_id in (select public.get_linked_player_ids())
    ))
  )
);

-- 9. RPC to invite a parent for a player (coach action)
create or replace function public.invite_parent_for_player(
  p_player_user_id uuid,
  p_parent_email text,
  p_access_level text default 'view_only'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_invite_id uuid;
  v_team_id uuid;
begin
  -- Verify caller is a coach
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;
  
  -- Verify player is on coach's team
  select team_id into v_team_id
  from public.profiles
  where user_id = p_player_user_id
    and team_id = public.current_team_id()
    and role = 'player';
    
  if v_team_id is null then
    raise exception 'invalid_player';
  end if;
  
  -- Validate access level
  if p_access_level not in ('view_only', 'full') then
    raise exception 'invalid_access_level';
  end if;
  
  -- Create pending invite (stored in separate table or use existing invite flow)
  -- For now, we'll create the link directly if parent already exists
  -- In production, this would send an email invite
  
  v_invite_id := gen_random_uuid();
  
  -- Store invite for later claiming (using existing pending_player_invites pattern)
  -- This will need a new table for parent invites
  
  return v_invite_id;
end;
$$;

grant execute on function public.invite_parent_for_player(uuid, text, text) to authenticated;

-- 10. RPC to join team as parent with access code
create or replace function public.join_team_as_parent(
  p_access_code text,
  p_user_id uuid,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
begin
  -- Find team by access code
  select t.id
    into v_team_id
  from public.teams t
  where t.access_code_hash = extensions.crypt(p_access_code, t.access_code_hash)
  limit 1;

  if v_team_id is null then
    raise exception 'invalid_access_code';
  end if;

  -- Create parent profile
  insert into public.profiles (user_id, team_id, role, display_name)
  values (p_user_id, v_team_id, 'parent', p_display_name);

  return v_team_id;
end;
$$;

revoke all on function public.join_team_as_parent(text, uuid, text) from public;
grant execute on function public.join_team_as_parent(text, uuid, text) to service_role;

-- 11. RPC to link parent to player (after parent joins)
create or replace function public.link_parent_to_player(
  p_parent_user_id uuid,
  p_player_user_id uuid,
  p_access_level text default 'view_only'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link_id uuid;
  v_parent_team_id uuid;
  v_player_team_id uuid;
begin
  -- Verify caller is a coach
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;
  
  -- Get parent's team
  select team_id into v_parent_team_id
  from public.profiles
  where user_id = p_parent_user_id and role = 'parent';
  
  if v_parent_team_id is null then
    raise exception 'parent_not_found';
  end if;
  
  -- Get player's team
  select team_id into v_player_team_id
  from public.profiles
  where user_id = p_player_user_id 
    and role = 'player'
    and team_id = public.current_team_id();
  
  if v_player_team_id is null then
    raise exception 'player_not_found';
  end if;
  
  -- Ensure parent and player are on same team
  if v_parent_team_id != v_player_team_id then
    raise exception 'team_mismatch';
  end if;
  
  -- Create link
  insert into public.parent_player_links (parent_user_id, player_user_id, access_level)
  values (p_parent_user_id, p_player_user_id, p_access_level)
  on conflict (parent_user_id, player_user_id) do update
    set access_level = excluded.access_level
  returning id into v_link_id;
  
  return v_link_id;
end;
$$;

grant execute on function public.link_parent_to_player(uuid, uuid, text) to authenticated;

-- 12. RPC to unlink parent from player
create or replace function public.unlink_parent_from_player(
  p_parent_user_id uuid,
  p_player_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Verify caller is a coach
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;
  
  delete from public.parent_player_links
  where parent_user_id = p_parent_user_id
    and player_user_id = p_player_user_id
    and player_user_id in (
      select user_id from public.profiles
      where team_id = public.current_team_id() and role = 'player'
    );
  
  return found;
end;
$$;

grant execute on function public.unlink_parent_from_player(uuid, uuid) to authenticated;

commit;

-- Notifications system
-- Push notifications and in-app notification center
-- Run in Supabase SQL Editor

begin;

-- 1. Notification types enum
do $$ begin
  create type public.notification_type as enum (
    'comment',           -- New comment on video
    'lesson_request',    -- Player requested a lesson (coach)
    'lesson_approved',   -- Lesson was approved (player)
    'lesson_declined',   -- Lesson was declined (player)
    'lesson_cancelled',  -- Lesson was cancelled
    'lesson_reminder',   -- Upcoming lesson reminder
    'program_assignment',-- New program assignment
    'program_feedback',  -- Coach reviewed program submission
    'player_joined',     -- New player joined team (coach)
    'parent_linked'      -- Parent linked to player
  );
exception
  when duplicate_object then null;
end $$;

-- 2. Notifications table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text,
  data jsonb default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx 
  on public.notifications (user_id, read_at) 
  where read_at is null;
  
create index if not exists notifications_user_created_idx 
  on public.notifications (user_id, created_at desc);

-- 3. Push subscriptions table
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists push_subscriptions_user_idx 
  on public.push_subscriptions (user_id);

-- 4. RLS for notifications
alter table public.notifications enable row level security;

-- Users can only see their own notifications
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select
to authenticated
using (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update
to authenticated
using (user_id = auth.uid());

-- System can insert notifications (via service role)
grant select, update on public.notifications to authenticated;

-- 5. RLS for push_subscriptions
alter table public.push_subscriptions enable row level security;

-- Users can manage their own subscriptions
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
for delete
to authenticated
using (user_id = auth.uid());

grant select, insert, delete on public.push_subscriptions to authenticated;

-- 6. Function to create a notification
create or replace function public.create_notification(
  p_user_id uuid,
  p_type public.notification_type,
  p_title text,
  p_body text default null,
  p_data jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  insert into public.notifications (user_id, type, title, body, data)
  values (p_user_id, p_type, p_title, p_body, p_data)
  returning id into v_notification_id;
  
  return v_notification_id;
end;
$$;

grant execute on function public.create_notification(uuid, public.notification_type, text, text, jsonb) to service_role;

-- 7. Function to mark notification as read
create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set read_at = now()
  where id = p_notification_id
    and user_id = auth.uid()
    and read_at is null;
  
  return found;
end;
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;

-- 8. Function to mark all notifications as read
create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null;
  
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;

-- 9. Function to get unread notification count
create or replace function public.get_unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.notifications
  where user_id = auth.uid()
    and read_at is null;
$$;

grant execute on function public.get_unread_notification_count() to authenticated;

commit;

-- Increase lesson participant limit from 2 to 6
-- This allows clinics and group lessons beyond just 2-on-1
-- Run in Supabase SQL Editor

begin;

-- Add max_participants setting to coach_schedule_settings
alter table public.coach_schedule_settings
  add column if not exists max_participants_per_lesson integer not null default 2
  check (max_participants_per_lesson between 1 and 6);

-- Update create_lesson_as_coach to support multiple additional players
-- Drop and recreate the function with new signature
drop function if exists public.create_lesson_as_coach(uuid, public.lesson_mode, timestamptz, integer, text, text, uuid);
drop function if exists public.create_lesson_as_coach(uuid, uuid[], text, text, integer, text, text);

create or replace function public.create_lesson_as_coach(
  p_primary_player_user_id uuid,
  p_additional_player_ids uuid[] default array[]::uuid[],
  p_mode text default 'in_person',
  p_start_at text default null,
  p_minutes integer default 60,
  p_timezone text default 'UTC',
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_coach_user_id uuid;
  v_team_id uuid;
  v_lesson_id uuid;
  v_player_user_id uuid;
  v_max_participants integer;
begin
  -- Coach check
  select p.user_id, p.team_id into v_coach_user_id, v_team_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.role = 'coach'
    and (p.is_active is null or p.is_active = true);
  
  if v_coach_user_id is null then
    raise exception 'forbidden';
  end if;
  
  -- Get max participants setting
  select coalesce(max_participants_per_lesson, 2) into v_max_participants
  from public.coach_schedule_settings
  where coach_user_id = v_coach_user_id;
  
  if v_max_participants is null then
    v_max_participants := 2;
  end if;
  
  -- Check total participants (1 primary + additional)
  if 1 + array_length(p_additional_player_ids, 1) > v_max_participants then
    raise exception 'too_many_participants: max is %', v_max_participants;
  end if;
  
  -- Validate primary player
  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_primary_player_user_id
      and p.team_id = v_team_id
      and p.role = 'player'
      and (p.is_active is null or p.is_active = true)
  ) then
    raise exception 'invalid_primary_player';
  end if;
  
  -- Validate additional players
  if array_length(p_additional_player_ids, 1) > 0 then
    foreach v_player_user_id in array p_additional_player_ids
    loop
      if v_player_user_id = p_primary_player_user_id then
        raise exception 'duplicate_player';
      end if;
      
      if not exists (
        select 1 from public.profiles p
        where p.user_id = v_player_user_id
          and p.team_id = v_team_id
          and p.role = 'player'
          and (p.is_active is null or p.is_active = true)
      ) then
        raise exception 'invalid_additional_player: %', v_player_user_id;
      end if;
    end loop;
  end if;
  
  -- Mode validation
  if p_mode not in ('in_person', 'remote') then
    raise exception 'invalid_mode';
  end if;
  
  -- Duration validation
  if p_minutes < 15 or p_minutes > 180 then
    raise exception 'invalid_duration';
  end if;
  
  -- Check for time conflicts and blocked time
  -- (Simplified - full implementation would check blocks and existing lessons)
  
  -- Create lesson
  insert into public.lessons (
    coach_user_id, team_id, mode, status, start_at, duration_minutes, timezone, coach_notes
  )
  values (
    v_coach_user_id, v_team_id, p_mode::public.lesson_mode, 'approved',
    p_start_at::timestamptz, p_minutes, p_timezone, p_notes
  )
  returning id into v_lesson_id;
  
  -- Add primary participant (auto-accepted)
  insert into public.lesson_participants (lesson_id, user_id, invite_status, is_primary, invited_by_user_id, invited_at, responded_at)
  values (v_lesson_id, p_primary_player_user_id, 'accepted', true, v_coach_user_id, now(), now());
  
  -- Add additional participants (invited)
  if array_length(p_additional_player_ids, 1) > 0 then
    foreach v_player_user_id in array p_additional_player_ids
    loop
      insert into public.lesson_participants (lesson_id, user_id, invite_status, is_primary, invited_by_user_id)
      values (v_lesson_id, v_player_user_id, 'invited', false, v_coach_user_id);
    end loop;
  end if;
  
  return v_lesson_id;
end;
$$;

grant execute on function public.create_lesson_as_coach(uuid, uuid[], text, text, integer, text, text) to authenticated;

-- Update coach_set_lesson_participant to check max participants
-- Drop existing function to allow return type change
drop function if exists public.coach_set_lesson_participant(uuid, uuid, boolean);

create or replace function public.coach_set_lesson_participant(
  p_lesson_id uuid,
  p_player_user_id uuid,
  p_add boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_lesson public.lessons%rowtype;
  v_max_participants integer;
  v_current_count integer;
begin
  -- Get lesson
  select * into v_lesson from public.lessons where id = p_lesson_id;
  
  if v_lesson.id is null then
    raise exception 'lesson_not_found';
  end if;
  
  -- Must be the coach
  if v_lesson.coach_user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;
  
  -- Validate player is on same team
  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_player_user_id
      and p.team_id = v_lesson.team_id
      and p.role = 'player'
      and (p.is_active is null or p.is_active = true)
  ) then
    raise exception 'invalid_player';
  end if;
  
  if p_add then
    -- Get max participants
    select coalesce(max_participants_per_lesson, 2) into v_max_participants
    from public.coach_schedule_settings
    where coach_user_id = v_lesson.coach_user_id;
    
    if v_max_participants is null then
      v_max_participants := 6; -- Default to 6 if no setting
    end if;
    
    -- Check current count
    select count(*) into v_current_count
    from public.lesson_participants
    where lesson_id = p_lesson_id;
    
    if v_current_count >= v_max_participants then
      raise exception 'max_participants_reached';
    end if;
    
    -- Add participant
    insert into public.lesson_participants (lesson_id, user_id, invite_status, is_primary, invited_by_user_id)
    values (p_lesson_id, p_player_user_id, 'invited', false, auth.uid())
    on conflict (lesson_id, user_id) do update
      set invite_status = 'invited', invited_by_user_id = auth.uid(), invited_at = now();
  else
    -- Remove non-primary participant
    delete from public.lesson_participants
    where lesson_id = p_lesson_id
      and user_id = p_player_user_id
      and is_primary = false;
  end if;
  
  return true;
end;
$$;

commit;

-- Auto-approve lessons and better availability settings
-- Calendly-style booking improvements
-- Run in Supabase SQL Editor

begin;

-- Add auto_approve option to coach_schedule_settings
alter table public.coach_schedule_settings
  add column if not exists auto_approve_lessons boolean not null default false;

-- Add booking buffer (minimum hours before lesson can be booked)
alter table public.coach_schedule_settings
  add column if not exists booking_buffer_hours integer not null default 2
  check (booking_buffer_hours between 0 and 48);

-- Add max advance booking days
alter table public.coach_schedule_settings
  add column if not exists max_advance_days integer not null default 30
  check (max_advance_days between 1 and 180);

-- Create recurring availability slots table
create table if not exists public.coach_availability_slots (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users (id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time_minutes integer not null check (start_time_minutes between 0 and 1439),
  end_time_minutes integer not null check (end_time_minutes between 0 and 1440),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  
  constraint valid_time_range check (end_time_minutes > start_time_minutes)
);

create index if not exists coach_availability_slots_coach_idx 
  on public.coach_availability_slots (coach_user_id, day_of_week);

-- RLS for availability slots
alter table public.coach_availability_slots enable row level security;

-- Coaches can manage their own slots
drop policy if exists availability_slots_select_own on public.coach_availability_slots;
create policy availability_slots_select_own on public.coach_availability_slots
for select
to authenticated
using (coach_user_id = auth.uid());

drop policy if exists availability_slots_insert_own on public.coach_availability_slots;
create policy availability_slots_insert_own on public.coach_availability_slots
for insert
to authenticated
with check (coach_user_id = auth.uid() and public.is_coach());

drop policy if exists availability_slots_update_own on public.coach_availability_slots;
create policy availability_slots_update_own on public.coach_availability_slots
for update
to authenticated
using (coach_user_id = auth.uid())
with check (coach_user_id = auth.uid());

drop policy if exists availability_slots_delete_own on public.coach_availability_slots;
create policy availability_slots_delete_own on public.coach_availability_slots
for delete
to authenticated
using (coach_user_id = auth.uid());

-- Players/parents can see their coach's availability
drop policy if exists availability_slots_select_team on public.coach_availability_slots;
create policy availability_slots_select_team on public.coach_availability_slots
for select
to authenticated
using (
  coach_user_id in (
    select p.user_id from public.profiles p
    where p.team_id = public.current_team_id()
      and p.role = 'coach'
  )
);

grant select, insert, update, delete on public.coach_availability_slots to authenticated;

-- Drop all existing request_lesson overloads before redefining
drop function if exists public.request_lesson(uuid, public.lesson_mode, timestamptz, integer, text, text);
drop function if exists public.request_lesson(uuid, public.lesson_mode, timestamptz, integer, text, text, uuid);
drop function if exists public.request_lesson(uuid, text, text, integer, text, uuid);

-- Update request_lesson to support auto-approve
create or replace function public.request_lesson(
  p_coach_user_id uuid,
  p_mode text,
  p_start_at text,
  p_minutes integer,
  p_timezone text,
  p_second_player_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team_id uuid;
  v_lesson_id uuid;
  v_auto_approve boolean;
  v_status public.lesson_status;
begin
  -- Validate caller is a player on coach's team
  select team_id into v_team_id
  from public.profiles
  where user_id = auth.uid()
    and role = 'player'
    and (is_active is null or is_active = true);

  if v_team_id is null then
    raise exception 'forbidden';
  end if;

  -- Validate coach is on same team
  if not exists (
    select 1 from public.profiles
    where user_id = p_coach_user_id
      and team_id = v_team_id
      and role = 'coach'
  ) then
    raise exception 'invalid_coach';
  end if;

  -- Check auto-approve setting
  select coalesce(auto_approve_lessons, false) into v_auto_approve
  from public.coach_schedule_settings
  where coach_user_id = p_coach_user_id;

  if v_auto_approve then
    v_status := 'approved';
  else
    v_status := 'requested';
  end if;

  -- Mode validation
  if p_mode not in ('in_person', 'remote') then
    raise exception 'invalid_mode';
  end if;

  -- Duration validation
  if p_minutes < 15 or p_minutes > 180 then
    raise exception 'invalid_duration';
  end if;

  -- Create lesson
  insert into public.lessons (
    coach_user_id, team_id, mode, status, start_at, duration_minutes, timezone
  )
  values (
    p_coach_user_id, v_team_id, p_mode::public.lesson_mode, v_status,
    p_start_at::timestamptz, p_minutes, p_timezone
  )
  returning id into v_lesson_id;

  -- Add requesting player as primary participant (auto-accepted)
  insert into public.lesson_participants (
    lesson_id, user_id, invite_status, is_primary, invited_by_user_id, invited_at, responded_at
  )
  values (v_lesson_id, auth.uid(), 'accepted', true, auth.uid(), now(), now());

  -- Optional second player
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
    values (v_lesson_id, p_second_player_user_id, 'invited', false, auth.uid());
  end if;

  return v_lesson_id;
end;
$$;

revoke all on function public.request_lesson(uuid, text, text, integer, text, uuid) from public;
grant execute on function public.request_lesson(uuid, text, text, integer, text, uuid) to authenticated;

-- RPC to get coach availability slots
create or replace function public.get_coach_availability_slots(p_coach_user_id uuid)
returns setof public.coach_availability_slots
language sql
stable
security definer
set search_path = public
as $$
  select * from public.coach_availability_slots
  where coach_user_id = p_coach_user_id
    and is_active = true
  order by day_of_week, start_time_minutes;
$$;

grant execute on function public.get_coach_availability_slots(uuid) to authenticated;

-- RPC to set coach availability slot
create or replace function public.set_coach_availability_slot(
  p_day_of_week integer,
  p_start_time_minutes integer,
  p_end_time_minutes integer,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot_id uuid;
begin
  if not public.is_coach() then
    raise exception 'forbidden';
  end if;

  -- Validate day
  if p_day_of_week < 0 or p_day_of_week > 6 then
    raise exception 'invalid_day';
  end if;

  -- Validate times
  if p_start_time_minutes < 0 or p_start_time_minutes >= 1440 then
    raise exception 'invalid_start_time';
  end if;

  if p_end_time_minutes <= p_start_time_minutes or p_end_time_minutes > 1440 then
    raise exception 'invalid_end_time';
  end if;

  -- Upsert slot
  insert into public.coach_availability_slots (
    coach_user_id, day_of_week, start_time_minutes, end_time_minutes, is_active
  )
  values (auth.uid(), p_day_of_week, p_start_time_minutes, p_end_time_minutes, p_is_active)
  on conflict (coach_user_id, day_of_week, start_time_minutes) do update
    set end_time_minutes = excluded.end_time_minutes,
        is_active = excluded.is_active
  returning id into v_slot_id;

  return v_slot_id;
end;
$$;

grant execute on function public.set_coach_availability_slot(integer, integer, integer, boolean) to authenticated;

-- RPC to delete coach availability slot
create or replace function public.delete_coach_availability_slot(p_slot_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.coach_availability_slots
  where id = p_slot_id
    and coach_user_id = auth.uid();
  
  return found;
end;
$$;

grant execute on function public.delete_coach_availability_slot(uuid) to authenticated;

-- Add unique constraint for availability slots
alter table public.coach_availability_slots
  drop constraint if exists coach_availability_slots_unique;
alter table public.coach_availability_slots
  add constraint coach_availability_slots_unique 
  unique (coach_user_id, day_of_week, start_time_minutes);

commit;

-- Video annotations system
-- Canvas drawings synced to video timestamps
-- Run in Supabase SQL Editor

begin;

-- Annotation types
do $$ begin
  create type public.annotation_tool as enum ('pen', 'arrow', 'circle', 'rectangle', 'text');
exception
  when duplicate_object then null;
end $$;

-- Video annotations table
create table if not exists public.video_annotations (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  author_user_id uuid not null references auth.users (id) on delete cascade,
  timestamp_seconds numeric(10, 3) not null check (timestamp_seconds >= 0),
  duration_seconds numeric(10, 3) not null default 3 check (duration_seconds > 0),
  tool public.annotation_tool not null,
  color text not null default '#ff0000',
  stroke_width integer not null default 3 check (stroke_width between 1 and 20),
  -- Path data for pen/arrow (JSON array of points)
  -- For shapes: [[x1, y1], [x2, y2]] for bounding box
  -- Coordinates are normalized 0-1 relative to video dimensions
  path_data jsonb not null,
  -- Text content for text annotations
  text_content text,
  created_at timestamptz not null default now(),
  
  constraint valid_text check (
    (tool = 'text' and text_content is not null and char_length(text_content) > 0)
    or (tool != 'text')
  )
);

create index if not exists video_annotations_video_time_idx 
  on public.video_annotations (video_id, timestamp_seconds);

create index if not exists video_annotations_author_idx 
  on public.video_annotations (author_user_id);

-- RLS
alter table public.video_annotations enable row level security;

-- Anyone who can read the video can see annotations
drop policy if exists annotations_select_visible on public.video_annotations;
create policy annotations_select_visible on public.video_annotations
for select
to authenticated
using (public.can_read_video(video_id));

-- Author can insert annotations on videos they can read
drop policy if exists annotations_insert_own on public.video_annotations;
create policy annotations_insert_own on public.video_annotations
for insert
to authenticated
with check (
  author_user_id = auth.uid() 
  and public.can_read_video(video_id)
);

-- Author or coach can delete annotations
drop policy if exists annotations_delete_own on public.video_annotations;
create policy annotations_delete_own on public.video_annotations
for delete
to authenticated
using (
  author_user_id = auth.uid() 
  or public.is_coach()
);

grant select, insert, delete on public.video_annotations to authenticated;

-- RPC to add annotation
create or replace function public.add_video_annotation(
  p_video_id uuid,
  p_timestamp_seconds numeric,
  p_duration_seconds numeric,
  p_tool public.annotation_tool,
  p_color text,
  p_stroke_width integer,
  p_path_data jsonb,
  p_text_content text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_annotation_id uuid;
begin
  -- Verify user can read video
  if not public.can_read_video(p_video_id) then
    raise exception 'forbidden';
  end if;
  
  insert into public.video_annotations (
    video_id, author_user_id, timestamp_seconds, duration_seconds,
    tool, color, stroke_width, path_data, text_content
  )
  values (
    p_video_id, auth.uid(), p_timestamp_seconds, p_duration_seconds,
    p_tool, p_color, p_stroke_width, p_path_data, p_text_content
  )
  returning id into v_annotation_id;
  
  return v_annotation_id;
end;
$$;

grant execute on function public.add_video_annotation(uuid, numeric, numeric, public.annotation_tool, text, integer, jsonb, text) to authenticated;

-- RPC to delete annotation
create or replace function public.delete_video_annotation(p_annotation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.video_annotations
  where id = p_annotation_id
    and (author_user_id = auth.uid() or public.is_coach());
  
  return found;
end;
$$;

grant execute on function public.delete_video_annotation(uuid) to authenticated;

-- RPC to get annotations for video at time range
create or replace function public.get_video_annotations(
  p_video_id uuid,
  p_time_start numeric default 0,
  p_time_end numeric default null
)
returns setof public.video_annotations
language sql
stable
security definer
set search_path = public
as $$
  select * from public.video_annotations
  where video_id = p_video_id
    and public.can_read_video(p_video_id)
    and (
      p_time_end is null 
      or (timestamp_seconds <= p_time_end and timestamp_seconds + duration_seconds >= p_time_start)
    )
  order by timestamp_seconds;
$$;

grant execute on function public.get_video_annotations(uuid, numeric, numeric) to authenticated;

commit;

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

-- Drop existing function to allow return type change
drop function if exists public.coach_set_lesson_participant(uuid, uuid, boolean);

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

  begin
    perform public.log_event('lesson_requested', 'lesson', v_lesson_id, jsonb_build_object('mode', p_mode, 'start_at', p_start_at, 'minutes', p_minutes));
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
  from public.lessons
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
      from public.lessons lr
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
  from public.lessons
  where id = p_lesson_id
    and team_id = v_team_id
  for update;

  if v_l.id is null then
    raise exception 'not_found';
  end if;

  v_is_coach := public.is_coach();
  v_is_participant := exists (
    select 1 from public.lesson_participants lp
    where lp.lesson_id = p_lesson_id and lp.user_id = auth.uid()
  );

  if not (
    (v_is_coach and v_l.coach_user_id = auth.uid())
    or v_is_participant
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
    select 1 from public.lessons lr
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

  update public.lessons
    set start_at = p_start_at,
        end_at = v_end_at,
        timezone = coalesce(nullif(trim(p_timezone), ''), timezone),
        status = v_new_status,
        coach_response_note = coalesce(nullif(trim(p_note), ''), coach_response_note)
  where id = v_l.id;

  begin
    perform public.log_event('lesson_rescheduled', 'lesson', v_l.id, jsonb_build_object('by', auth.uid(), 'start_at', p_start_at, 'minutes', p_minutes, 'status', v_new_status));
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

  begin
    perform public.log_event('lesson_requested', 'lesson', v_lesson_id, jsonb_build_object('mode', p_mode, 'start_at', p_start_at, 'minutes', p_minutes));
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
  from public.lessons
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
      from public.lessons lr
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
  from public.lessons
  where id = p_lesson_id
    and team_id = v_team_id
  for update;

  if v_l.id is null then
    raise exception 'not_found';
  end if;

  -- Check if user is the coach or a participant
  select exists (
    select 1 from public.lesson_participants lp
    where lp.lesson_id = v_l.id
      and lp.user_id = auth.uid()
      and lp.is_primary = true
  ) into v_is_primary;

  v_allowed :=
    (public.is_coach() and v_l.coach_user_id = auth.uid())
    or v_is_primary;

  if not v_allowed then
    raise exception 'forbidden';
  end if;

  update public.lessons
    set status = 'cancelled',
        coach_response_note = coalesce(nullif(trim(p_note), ''), coach_response_note)
  where id = v_l.id;

  begin
    perform public.log_event('lesson_cancelled', 'lesson', v_l.id, jsonb_build_object('by', auth.uid()));
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


-- ============================================================
-- 0030_pending_player_invites.sql
-- ============================================================
-- Pending player invites - separate from profiles to avoid PK issues

begin;

CREATE TABLE IF NOT EXISTS public.pending_player_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  player_mode public.player_mode DEFAULT 'in_person',
  claim_token TEXT UNIQUE NOT NULL,
  claim_token_expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  claimed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_invites_claim_token 
  ON public.pending_player_invites(claim_token) 
  WHERE claimed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pending_invites_team 
  ON public.pending_player_invites(team_id);

ALTER TABLE public.pending_player_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_invites_select_coach ON public.pending_player_invites;
CREATE POLICY pending_invites_select_coach ON public.pending_player_invites
  FOR SELECT TO authenticated
  USING (team_id = public.current_team_id() AND public.is_coach());

DROP POLICY IF EXISTS pending_invites_insert_coach ON public.pending_player_invites;
CREATE POLICY pending_invites_insert_coach ON public.pending_player_invites
  FOR INSERT TO authenticated
  WITH CHECK (team_id = public.current_team_id() AND public.is_coach());

DROP POLICY IF EXISTS pending_invites_delete_coach ON public.pending_player_invites;
CREATE POLICY pending_invites_delete_coach ON public.pending_player_invites
  FOR DELETE TO authenticated
  USING (team_id = public.current_team_id() AND public.is_coach() AND claimed_at IS NULL);

DROP POLICY IF EXISTS pending_invites_select_by_token ON public.pending_player_invites;
CREATE POLICY pending_invites_select_by_token ON public.pending_player_invites
  FOR SELECT TO anon, authenticated
  USING (claim_token IS NOT NULL);

commit;


-- ============================================================
-- 0031_analytics_tables.sql
-- ============================================================
-- Analytics tables for monitoring dashboard

begin;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  user_id uuid null references auth.users(id) on delete set null,
  team_id uuid null references public.teams(id) on delete set null,
  metadata jsonb null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_type_idx on public.analytics_events (event_type);
create index if not exists analytics_events_user_idx on public.analytics_events (user_id);
create index if not exists analytics_events_team_idx on public.analytics_events (team_id);
create index if not exists analytics_events_created_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_type_created_idx on public.analytics_events (event_type, created_at desc);

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  error_type text not null check (error_type in ('frontend', 'api', 'database')),
  message text not null,
  stack text null,
  user_id uuid null references auth.users(id) on delete set null,
  endpoint text null,
  metadata jsonb null default '{}',
  resolved_at timestamptz null,
  resolved_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists error_logs_type_idx on public.error_logs (error_type);
create index if not exists error_logs_created_idx on public.error_logs (created_at desc);
create index if not exists error_logs_unresolved_idx on public.error_logs (created_at desc) where resolved_at is null;

create table if not exists public.daily_metrics (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  team_id uuid null references public.teams(id) on delete cascade,
  metric_type text not null,
  value integer not null default 0,
  created_at timestamptz not null default now(),
  constraint daily_metrics_unique unique (date, team_id, metric_type)
);

create index if not exists daily_metrics_date_idx on public.daily_metrics (date desc);
create index if not exists daily_metrics_team_idx on public.daily_metrics (team_id);
create index if not exists daily_metrics_type_idx on public.daily_metrics (metric_type);
create index if not exists daily_metrics_date_type_idx on public.daily_metrics (date desc, metric_type);

alter table public.profiles add column if not exists is_admin boolean not null default false;

alter table public.analytics_events enable row level security;
alter table public.error_logs enable row level security;
alter table public.daily_metrics enable row level security;

drop policy if exists analytics_events_insert_auth on public.analytics_events;
create policy analytics_events_insert_auth on public.analytics_events
  for insert to authenticated with check (true);

drop policy if exists analytics_events_select_admin on public.analytics_events;
create policy analytics_events_select_admin on public.analytics_events
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true));

drop policy if exists error_logs_insert_auth on public.error_logs;
create policy error_logs_insert_auth on public.error_logs
  for insert to authenticated with check (true);

drop policy if exists error_logs_select_admin on public.error_logs;
create policy error_logs_select_admin on public.error_logs
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true));

drop policy if exists error_logs_update_admin on public.error_logs;
create policy error_logs_update_admin on public.error_logs
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true));

drop policy if exists daily_metrics_select_admin on public.daily_metrics;
create policy daily_metrics_select_admin on public.daily_metrics
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true));

create or replace function public.increment_daily_metric(
  p_metric_type text,
  p_team_id uuid default null,
  p_increment integer default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.daily_metrics (date, team_id, metric_type, value)
  values (current_date, p_team_id, p_metric_type, p_increment)
  on conflict (date, team_id, metric_type)
  do update set value = daily_metrics.value + p_increment;
end;
$$;

grant execute on function public.increment_daily_metric(text, uuid, integer) to authenticated;

commit;


