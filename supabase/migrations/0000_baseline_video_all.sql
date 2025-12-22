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

do $$ begin
  create type public.user_role as enum ('coach', 'player');
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
    raise exception "forbidden";
  end if;

  v_team_id := public.current_team_id();
  if v_team_id is null then
    raise exception "missing_profile";
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, "-", ""), 1, 8));

  update public.teams
    set access_code_hash = extensions.crypt(v_code, extensions.gen_salt("bf"))
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


