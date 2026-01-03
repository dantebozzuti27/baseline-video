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
