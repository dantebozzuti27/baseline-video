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


