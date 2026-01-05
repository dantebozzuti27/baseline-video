-- Analytics and Monitoring Tables
-- Track usage, errors, and business metrics

begin;

-- Analytics events table - tracks all user actions
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  user_id uuid null references auth.users(id) on delete set null,
  team_id uuid null references public.teams(id) on delete set null,
  metadata jsonb null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_type_created_idx 
  on public.analytics_events (event_type, created_at desc);
create index if not exists analytics_events_user_idx 
  on public.analytics_events (user_id, created_at desc);
create index if not exists analytics_events_team_idx 
  on public.analytics_events (team_id, created_at desc);
create index if not exists analytics_events_created_idx 
  on public.analytics_events (created_at desc);

-- Error logs table - tracks all errors
create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  error_type text not null, -- 'frontend', 'api', 'database'
  message text not null,
  stack text null,
  user_id uuid null references auth.users(id) on delete set null,
  endpoint text null,
  metadata jsonb null default '{}',
  resolved_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists error_logs_type_created_idx 
  on public.error_logs (error_type, created_at desc);
create index if not exists error_logs_created_idx 
  on public.error_logs (created_at desc);
create index if not exists error_logs_unresolved_idx 
  on public.error_logs (created_at desc) where resolved_at is null;

-- Daily metrics table - aggregated stats per day
create table if not exists public.daily_metrics (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  team_id uuid null references public.teams(id) on delete cascade,
  metric_type text not null,
  value integer not null default 0,
  created_at timestamptz not null default now(),
  unique (date, team_id, metric_type)
);

create index if not exists daily_metrics_date_idx 
  on public.daily_metrics (date desc);
create index if not exists daily_metrics_team_date_idx 
  on public.daily_metrics (team_id, date desc);
create index if not exists daily_metrics_type_date_idx 
  on public.daily_metrics (metric_type, date desc);

-- Add is_admin column to profiles for admin access control
alter table public.profiles 
  add column if not exists is_admin boolean not null default false;

-- RLS policies
alter table public.analytics_events enable row level security;
alter table public.error_logs enable row level security;
alter table public.daily_metrics enable row level security;

-- Analytics events: admin-only read, anyone can insert (via API)
drop policy if exists analytics_events_insert_all on public.analytics_events;
create policy analytics_events_insert_all on public.analytics_events
  for insert to authenticated
  with check (true);

drop policy if exists analytics_events_select_admin on public.analytics_events;
create policy analytics_events_select_admin on public.analytics_events
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.is_admin = true
    )
  );

-- Error logs: admin-only access
drop policy if exists error_logs_insert_all on public.error_logs;
create policy error_logs_insert_all on public.error_logs
  for insert to authenticated
  with check (true);

drop policy if exists error_logs_select_admin on public.error_logs;
create policy error_logs_select_admin on public.error_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists error_logs_update_admin on public.error_logs;
create policy error_logs_update_admin on public.error_logs
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.is_admin = true
    )
  );

-- Daily metrics: admin-only read
drop policy if exists daily_metrics_select_admin on public.daily_metrics;
create policy daily_metrics_select_admin on public.daily_metrics
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.is_admin = true
    )
  );

-- Function to increment daily metric
create or replace function public.increment_daily_metric(
  p_metric_type text,
  p_team_id uuid default null,
  p_increment integer default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.daily_metrics (date, team_id, metric_type, value)
  values (current_date, p_team_id, p_metric_type, p_increment)
  on conflict (date, team_id, metric_type)
  do update set value = daily_metrics.value + p_increment;
end;
$$;

grant execute on function public.increment_daily_metric(text, uuid, integer) to authenticated;

commit;
