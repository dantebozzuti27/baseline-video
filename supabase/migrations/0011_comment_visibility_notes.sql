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


