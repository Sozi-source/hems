-- =============================================================================
-- HEMS · Migration 23 · Loan Reminder Settings, Idempotency Logs, Cron Runs, Push
-- =============================================================================

create table if not exists public.loan_reminder_settings (
  business_id      uuid primary key references public.businesses(id) on delete cascade,
  reminder_time    text not null default '08:00' check (reminder_time ~ '^\d{2}:\d{2}$'),
  recipient_phones text[] not null default '{}',
  in_app_enabled   boolean not null default true,
  push_enabled     boolean not null default true,
  sms_enabled      boolean not null default true,
  updated_at       timestamptz not null default now()
);

drop trigger if exists trg_loan_reminder_settings_updated on public.loan_reminder_settings;
create trigger trg_loan_reminder_settings_updated before update on public.loan_reminder_settings
  for each row execute function public.set_updated_at();

alter table public.loan_reminder_settings enable row level security;

drop policy if exists loan_rem_settings_select on public.loan_reminder_settings;
create policy loan_rem_settings_select on public.loan_reminder_settings
  for select using (public.is_member(business_id));

drop policy if exists loan_rem_settings_manage on public.loan_reminder_settings;
create policy loan_rem_settings_manage on public.loan_reminder_settings
  for all using (public.has_role(business_id, array['owner','admin']::public.app_role[]))
  with check (public.has_role(business_id, array['owner','admin']::public.app_role[]));

create table if not exists public.loan_reminder_logs (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  loan_id        uuid not null references public.obligations(id) on delete cascade,
  instalment_id  uuid not null references public.loan_instalments(id) on delete cascade,
  reminder_date  date not null,
  days_offset    int not null,
  channel        text not null check (channel in ('in_app','push','sms')),
  recipient      text not null default '',
  message        text not null,
  status         text not null check (status in ('sent','skipped','failed')),
  error          text,
  created_at     timestamptz not null default now(),
  unique (loan_id, instalment_id, reminder_date, channel, recipient)
);

create index if not exists idx_loan_reminder_logs_date
  on public.loan_reminder_logs (business_id, reminder_date desc, created_at desc);

alter table public.loan_reminder_logs enable row level security;

drop policy if exists loan_rem_logs_select on public.loan_reminder_logs;
create policy loan_rem_logs_select on public.loan_reminder_logs
  for select using (public.is_member(business_id));

create table if not exists public.cron_job_runs (
  id             uuid primary key default gen_random_uuid(),
  job_name       text not null,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running' check (status in ('running','success','partial','failed')),
  reminders_sent int not null default 0,
  failures       int not null default 0,
  details        jsonb not null default '{}'::jsonb
);

create index if not exists idx_cron_job_runs_name
  on public.cron_job_runs (job_name, started_at desc);

alter table public.cron_job_runs enable row level security;

drop policy if exists cron_job_runs_select on public.cron_job_runs;
create policy cron_job_runs_select on public.cron_job_runs
  for select using (public.is_platform_admin());

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subs_own on public.push_subscriptions;
create policy push_subs_own on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
