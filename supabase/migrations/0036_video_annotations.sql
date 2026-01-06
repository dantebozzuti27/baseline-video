-- Video annotations system
-- Canvas drawings synced to video timestamps
-- Run in Supabase SQL Editor

begin;

-- Annotation types
do $$ begin
  create type public.annotation_tool as enum ('pen', 'arrow', 'circle', 'rectangle', 'text');
exception
  when duplicate_object then null;
end $$;

-- Video annotations table
create table if not exists public.video_annotations (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  author_user_id uuid not null references auth.users (id) on delete cascade,
  timestamp_seconds numeric(10, 3) not null check (timestamp_seconds >= 0),
  duration_seconds numeric(10, 3) not null default 3 check (duration_seconds > 0),
  tool public.annotation_tool not null,
  color text not null default '#ff0000',
  stroke_width integer not null default 3 check (stroke_width between 1 and 20),
  -- Path data for pen/arrow (JSON array of points)
  -- For shapes: [[x1, y1], [x2, y2]] for bounding box
  -- Coordinates are normalized 0-1 relative to video dimensions
  path_data jsonb not null,
  -- Text content for text annotations
  text_content text,
  created_at timestamptz not null default now(),
  
  constraint valid_text check (
    (tool = 'text' and text_content is not null and char_length(text_content) > 0)
    or (tool != 'text')
  )
);

create index if not exists video_annotations_video_time_idx 
  on public.video_annotations (video_id, timestamp_seconds);

create index if not exists video_annotations_author_idx 
  on public.video_annotations (author_user_id);

-- RLS
alter table public.video_annotations enable row level security;

-- Anyone who can read the video can see annotations
drop policy if exists annotations_select_visible on public.video_annotations;
create policy annotations_select_visible on public.video_annotations
for select
to authenticated
using (public.can_read_video(video_id));

-- Author can insert annotations on videos they can read
drop policy if exists annotations_insert_own on public.video_annotations;
create policy annotations_insert_own on public.video_annotations
for insert
to authenticated
with check (
  author_user_id = auth.uid() 
  and public.can_read_video(video_id)
);

-- Author or coach can delete annotations
drop policy if exists annotations_delete_own on public.video_annotations;
create policy annotations_delete_own on public.video_annotations
for delete
to authenticated
using (
  author_user_id = auth.uid() 
  or public.is_coach()
);

grant select, insert, delete on public.video_annotations to authenticated;

-- RPC to add annotation
create or replace function public.add_video_annotation(
  p_video_id uuid,
  p_timestamp_seconds numeric,
  p_duration_seconds numeric,
  p_tool public.annotation_tool,
  p_color text,
  p_stroke_width integer,
  p_path_data jsonb,
  p_text_content text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_annotation_id uuid;
begin
  -- Verify user can read video
  if not public.can_read_video(p_video_id) then
    raise exception 'forbidden';
  end if;
  
  insert into public.video_annotations (
    video_id, author_user_id, timestamp_seconds, duration_seconds,
    tool, color, stroke_width, path_data, text_content
  )
  values (
    p_video_id, auth.uid(), p_timestamp_seconds, p_duration_seconds,
    p_tool, p_color, p_stroke_width, p_path_data, p_text_content
  )
  returning id into v_annotation_id;
  
  return v_annotation_id;
end;
$$;

grant execute on function public.add_video_annotation(uuid, numeric, numeric, public.annotation_tool, text, integer, jsonb, text) to authenticated;

-- RPC to delete annotation
create or replace function public.delete_video_annotation(p_annotation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.video_annotations
  where id = p_annotation_id
    and (author_user_id = auth.uid() or public.is_coach());
  
  return found;
end;
$$;

grant execute on function public.delete_video_annotation(uuid) to authenticated;

-- RPC to get annotations for video at time range
create or replace function public.get_video_annotations(
  p_video_id uuid,
  p_time_start numeric default 0,
  p_time_end numeric default null
)
returns setof public.video_annotations
language sql
stable
security definer
set search_path = public
as $$
  select * from public.video_annotations
  where video_id = p_video_id
    and public.can_read_video(p_video_id)
    and (
      p_time_end is null 
      or (timestamp_seconds <= p_time_end and timestamp_seconds + duration_seconds >= p_time_start)
    )
  order by timestamp_seconds;
$$;

grant execute on function public.get_video_annotations(uuid, numeric, numeric) to authenticated;

commit;

