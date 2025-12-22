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


