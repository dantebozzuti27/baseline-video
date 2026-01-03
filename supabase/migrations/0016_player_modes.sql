-- Player modes (in-person / hybrid / remote)
-- Coach-managed categorization for players (UX + workflow only; no permission differences).
-- Run in Supabase SQL Editor (safe to run once).

begin;

do $$ begin
  create type public.player_mode as enum ('in_person', 'hybrid', 'remote');
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists player_mode public.player_mode null;

create index if not exists profiles_team_role_mode_idx
  on public.profiles (team_id, role, player_mode);

commit;


