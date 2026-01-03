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


