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


