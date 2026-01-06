-- Parent access model
-- Allows parents to view their children's videos, lessons, and progress
-- Run in Supabase SQL Editor

begin;

-- 1. Extend user_role enum to include 'parent'
-- We need to add the value to the existing enum
alter type public.user_role add value if not exists 'parent';

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

