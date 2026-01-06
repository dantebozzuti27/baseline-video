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

