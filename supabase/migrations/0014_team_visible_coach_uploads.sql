-- Team-visible coach uploads + library visibility
-- Players can read: their own videos, any library video on their team, and any coach-uploaded video on their team.
-- Run in Supabase SQL Editor (safe to run once).

begin;

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


