-- Team Mode: AI-Powered Analytics
-- Migration for performance data, insights, and scouting reports

-- ============================================
-- ENUMS
-- ============================================

create type public.processing_status as enum ('pending', 'processing', 'completed', 'failed');
create type public.insight_type as enum ('strength', 'weakness', 'trend', 'recommendation', 'alert', 'tendency');
create type public.report_category as enum ('own_team', 'opponent');
create type public.report_type as enum ('player_assessment', 'season_review', 'opponent_team', 'opponent_player', 'matchup', 'progress_report', 'tendency_report');
create type public.report_status as enum ('draft', 'final', 'archived');
create type public.opponent_type as enum ('team', 'player');
create type public.parent_access_level as enum ('view_only', 'full');

-- ============================================
-- TABLE 1: performance_data_files
-- Tracks uploaded CSV/Excel files
-- ============================================

create table public.performance_data_files (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  uploader_user_id uuid not null references public.profiles(user_id) on delete cascade,
  player_user_id uuid references public.profiles(user_id) on delete set null,
  is_opponent_data boolean not null default false,
  opponent_name text,
  file_name text not null,
  storage_path text not null,
  file_type text not null check (file_type in ('csv', 'xlsx', 'xls')),
  row_count integer default 0,
  detected_columns jsonb default '{}',
  metadata jsonb default '{}',
  processing_status public.processing_status not null default 'pending',
  processed_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create index idx_performance_data_files_team_id on public.performance_data_files(team_id);
create index idx_performance_data_files_player_user_id on public.performance_data_files(player_user_id);
create index idx_performance_data_files_is_opponent on public.performance_data_files(is_opponent_data);
create index idx_performance_data_files_status on public.performance_data_files(processing_status);

-- ============================================
-- TABLE 2: performance_metrics
-- Individual performance records from CSV rows
-- ============================================

create table public.performance_metrics (
  id uuid primary key default gen_random_uuid(),
  data_file_id uuid not null references public.performance_data_files(id) on delete cascade,
  player_user_id uuid references public.profiles(user_id) on delete set null,
  is_opponent_data boolean not null default false,
  opponent_name text,
  metric_date date,
  raw_data jsonb not null default '{}',
  ai_interpreted_data jsonb default '{}',
  aggregated_metrics jsonb default '{}',
  created_at timestamp with time zone not null default now()
);

create index idx_performance_metrics_file_id on public.performance_metrics(data_file_id);
create index idx_performance_metrics_player_id on public.performance_metrics(player_user_id);
create index idx_performance_metrics_is_opponent on public.performance_metrics(is_opponent_data);
create index idx_performance_metrics_date on public.performance_metrics(metric_date);
create index idx_performance_metrics_raw_data on public.performance_metrics using gin(raw_data);
create index idx_performance_metrics_interpreted on public.performance_metrics using gin(ai_interpreted_data);

-- ============================================
-- TABLE 3: data_insights
-- AI-generated insights from analysis
-- ============================================

create table public.data_insights (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_user_id uuid references public.profiles(user_id) on delete set null,
  is_opponent_insight boolean not null default false,
  opponent_name text,
  data_file_id uuid references public.performance_data_files(id) on delete set null,
  insight_type public.insight_type not null,
  title text not null check (char_length(title) <= 100),
  description text not null check (char_length(description) <= 500),
  confidence_score decimal(3,2) check (confidence_score >= 0 and confidence_score <= 1),
  supporting_data jsonb default '{}',
  action_items jsonb default '[]',
  created_by_ai boolean not null default true,
  dismissed_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create index idx_data_insights_team_id on public.data_insights(team_id);
create index idx_data_insights_player_id on public.data_insights(player_user_id);
create index idx_data_insights_is_opponent on public.data_insights(is_opponent_insight);
create index idx_data_insights_type on public.data_insights(insight_type);
create index idx_data_insights_dismissed on public.data_insights(dismissed_at);

-- ============================================
-- TABLE 4: opponents
-- Database of scouted opponents
-- ============================================

create table public.opponents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  opponent_type public.opponent_type not null default 'player',
  name text not null,
  sport_context text,
  notes text,
  metadata jsonb default '{}',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique(team_id, name)
);

create index idx_opponents_team_id on public.opponents(team_id);
create index idx_opponents_type on public.opponents(opponent_type);

-- ============================================
-- TABLE 5: scouting_reports
-- Both own-team and opponent scouting reports
-- ============================================

create table public.scouting_reports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  creator_user_id uuid not null references public.profiles(user_id) on delete cascade,
  report_category public.report_category not null,
  player_user_id uuid references public.profiles(user_id) on delete set null,
  opponent_name text,
  opponent_id uuid references public.opponents(id) on delete set null,
  report_type public.report_type not null,
  game_date date,
  title text not null,
  summary text,
  content_sections jsonb default '{}',
  ai_generated_content jsonb default '{}',
  key_metrics jsonb default '{}',
  status public.report_status not null default 'draft',
  shared_with_player boolean not null default false,
  viewed_by_player_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index idx_scouting_reports_team_id on public.scouting_reports(team_id);
create index idx_scouting_reports_player_id on public.scouting_reports(player_user_id);
create index idx_scouting_reports_category on public.scouting_reports(report_category);
create index idx_scouting_reports_type on public.scouting_reports(report_type);
create index idx_scouting_reports_status on public.scouting_reports(status);
create index idx_scouting_reports_game_date on public.scouting_reports(game_date);
create index idx_scouting_reports_player_status on public.scouting_reports(player_user_id, status);
create index idx_scouting_reports_category_status on public.scouting_reports(report_category, status);

-- ============================================
-- TABLE 6: scouting_report_data_sources
-- Links reports to data files
-- ============================================

create table public.scouting_report_data_sources (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.scouting_reports(id) on delete cascade,
  data_file_id uuid not null references public.performance_data_files(id) on delete cascade,
  metric_ids uuid[] default '{}',
  created_at timestamp with time zone not null default now()
);

create index idx_report_sources_report_id on public.scouting_report_data_sources(report_id);
create index idx_report_sources_file_id on public.scouting_report_data_sources(data_file_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Updated_at trigger for opponents
create trigger set_opponents_updated_at
  before update on public.opponents
  for each row
  execute function public.set_updated_at();

-- Updated_at trigger for scouting_reports
create trigger set_scouting_reports_updated_at
  before update on public.scouting_reports
  for each row
  execute function public.set_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table public.performance_data_files enable row level security;
alter table public.performance_metrics enable row level security;
alter table public.data_insights enable row level security;
alter table public.opponents enable row level security;
alter table public.scouting_reports enable row level security;
alter table public.scouting_report_data_sources enable row level security;

-- ============================================
-- RLS POLICIES: performance_data_files
-- ============================================

-- Coaches: full access to their team's files
create policy "Coaches can manage team data files"
  on public.performance_data_files
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.user_id = auth.uid()
      and profiles.team_id = performance_data_files.team_id
      and profiles.role = 'coach'
    )
  );

-- Players: can view their own non-opponent data
create policy "Players can view own data files"
  on public.performance_data_files
  for select
  using (
    player_user_id = auth.uid()
    and is_opponent_data = false
  );

-- Parents: can view linked children's data
create policy "Parents can view children data files"
  on public.performance_data_files
  for select
  using (
    exists (
      select 1 from public.parent_player_links
      where parent_player_links.parent_user_id = auth.uid()
      and parent_player_links.player_user_id = performance_data_files.player_user_id
    )
    and is_opponent_data = false
  );

-- ============================================
-- RLS POLICIES: performance_metrics
-- ============================================

-- Coaches: full access
create policy "Coaches can manage team metrics"
  on public.performance_metrics
  for all
  using (
    exists (
      select 1 from public.performance_data_files pdf
      join public.profiles p on p.team_id = pdf.team_id
      where pdf.id = performance_metrics.data_file_id
      and p.user_id = auth.uid()
      and p.role = 'coach'
    )
  );

-- Players: can view own metrics
create policy "Players can view own metrics"
  on public.performance_metrics
  for select
  using (
    player_user_id = auth.uid()
    and is_opponent_data = false
  );

-- Parents: can view children's metrics
create policy "Parents can view children metrics"
  on public.performance_metrics
  for select
  using (
    exists (
      select 1 from public.parent_player_links
      where parent_player_links.parent_user_id = auth.uid()
      and parent_player_links.player_user_id = performance_metrics.player_user_id
    )
    and is_opponent_data = false
  );

-- ============================================
-- RLS POLICIES: data_insights
-- ============================================

-- Coaches: full access
create policy "Coaches can manage team insights"
  on public.data_insights
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.user_id = auth.uid()
      and profiles.team_id = data_insights.team_id
      and profiles.role = 'coach'
    )
  );

-- Players: can view own non-opponent insights
create policy "Players can view own insights"
  on public.data_insights
  for select
  using (
    player_user_id = auth.uid()
    and is_opponent_insight = false
    and dismissed_at is null
  );

-- Parents: can view children's insights
create policy "Parents can view children insights"
  on public.data_insights
  for select
  using (
    exists (
      select 1 from public.parent_player_links
      where parent_player_links.parent_user_id = auth.uid()
      and parent_player_links.player_user_id = data_insights.player_user_id
    )
    and is_opponent_insight = false
    and dismissed_at is null
  );

-- ============================================
-- RLS POLICIES: opponents
-- ============================================

-- Coaches: full access
create policy "Coaches can manage opponents"
  on public.opponents
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.user_id = auth.uid()
      and profiles.team_id = opponents.team_id
      and profiles.role = 'coach'
    )
  );

-- ============================================
-- RLS POLICIES: scouting_reports
-- ============================================

-- Coaches: full access
create policy "Coaches can manage team reports"
  on public.scouting_reports
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.user_id = auth.uid()
      and profiles.team_id = scouting_reports.team_id
      and profiles.role = 'coach'
    )
  );

-- Players: can view shared own-team reports about them
create policy "Players can view shared reports"
  on public.scouting_reports
  for select
  using (
    player_user_id = auth.uid()
    and shared_with_player = true
    and report_category = 'own_team'
  );

-- Parents: can view shared reports for linked children
create policy "Parents can view children reports"
  on public.scouting_reports
  for select
  using (
    exists (
      select 1 from public.parent_player_links
      where parent_player_links.parent_user_id = auth.uid()
      and parent_player_links.player_user_id = scouting_reports.player_user_id
    )
    and shared_with_player = true
    and report_category = 'own_team'
  );

-- ============================================
-- RLS POLICIES: scouting_report_data_sources
-- ============================================

-- Coaches: full access
create policy "Coaches can manage report sources"
  on public.scouting_report_data_sources
  for all
  using (
    exists (
      select 1 from public.scouting_reports sr
      join public.profiles p on p.team_id = sr.team_id
      where sr.id = scouting_report_data_sources.report_id
      and p.user_id = auth.uid()
      and p.role = 'coach'
    )
  );

-- Players/Parents: can view sources for reports they can see
create policy "Users can view accessible report sources"
  on public.scouting_report_data_sources
  for select
  using (
    exists (
      select 1 from public.scouting_reports sr
      where sr.id = scouting_report_data_sources.report_id
      and (
        -- Player's own shared report
        (sr.player_user_id = auth.uid() and sr.shared_with_player = true and sr.report_category = 'own_team')
        or
        -- Parent viewing child's shared report
        exists (
          select 1 from public.parent_player_links ppl
          where ppl.parent_user_id = auth.uid()
          and ppl.player_user_id = sr.player_user_id
          and sr.shared_with_player = true
          and sr.report_category = 'own_team'
        )
      )
    )
  );

-- ============================================
-- GRANTS
-- ============================================

grant all on public.performance_data_files to authenticated;
grant all on public.performance_metrics to authenticated;
grant all on public.data_insights to authenticated;
grant all on public.opponents to authenticated;
grant all on public.scouting_reports to authenticated;
grant all on public.scouting_report_data_sources to authenticated;

-- Grant usage on enums
grant usage on type public.processing_status to authenticated;
grant usage on type public.insight_type to authenticated;
grant usage on type public.report_category to authenticated;
grant usage on type public.report_type to authenticated;
grant usage on type public.report_status to authenticated;
grant usage on type public.opponent_type to authenticated;
