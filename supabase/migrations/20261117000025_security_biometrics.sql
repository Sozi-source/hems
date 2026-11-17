-- =============================================================================
-- HEMS · Migration 25 · Biometric Security (WebAuthn) & Hashed PIN Fallback
-- =============================================================================

create table if not exists public.user_security_settings (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  biometrics_enabled   boolean not null default false,
  pin_hash             text,
  pin_salt             text,
  failed_attempts      int not null default 0,
  locked_until         timestamptz,
  lock_timeout_seconds int not null default 60 check (lock_timeout_seconds between 5 and 3600),
  updated_at           timestamptz not null default now()
);

drop trigger if exists trg_user_security_updated on public.user_security_settings;
create trigger trg_user_security_updated before update on public.user_security_settings
  for each row execute function public.set_updated_at();

alter table public.user_security_settings enable row level security;

drop policy if exists user_security_own on public.user_security_settings;
create policy user_security_own on public.user_security_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.user_webauthn_credentials (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,
  public_key    text not null,
  counter       bigint not null default 0,
  device_name   text,
  created_at    timestamptz not null default now()
);

alter table public.user_webauthn_credentials enable row level security;

drop policy if exists user_webauthn_own on public.user_webauthn_credentials;
create policy user_webauthn_own on public.user_webauthn_credentials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
