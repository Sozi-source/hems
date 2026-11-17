-- =============================================================================
-- HEMS · Migration 24 · Encrypted Backups & Restore
-- =============================================================================

create table if not exists public.system_backups (
  id                uuid primary key default gen_random_uuid(),
  created_by        uuid references auth.users(id),
  trigger_type      text not null default 'manual' check (trigger_type in ('manual','scheduled')),
  size_bytes        bigint not null check (size_bytes >= 0),
  sha256_checksum   text not null,
  encrypted_payload text not null,
  iv                text not null,
  auth_tag          text not null,
  record_counts     jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists idx_system_backups_created
  on public.system_backups (created_at desc);

alter table public.system_backups enable row level security;

drop policy if exists system_backups_admin on public.system_backups;
create policy system_backups_admin on public.system_backups
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());
