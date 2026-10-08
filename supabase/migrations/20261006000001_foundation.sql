-- =============================================================================
-- HEMS · Migration 01 · Foundation
-- Types, helpers, tenancy (businesses, members, settings), counters.
-- Rules: every business-owned table carries business_id.
--        Money is bigint MINOR UNITS (cents): KSh 10,000 = 1000000.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------- enums -----------------------------------------------------------
create type public.app_role            as enum ('owner','admin','accountant','cashier','viewer');
create type public.obligation_kind     as enum ('customer_debt','supplier_debt','loan','bill','expense','salary','staff_advance');
create type public.obligation_direction as enum ('receivable','payable');
create type public.obligation_status   as enum ('open','partially_paid','paid','written_off','cancelled');
create type public.entry_type          as enum ('charge','interest','payment','adjustment_up','adjustment_down','write_off','reversal');
create type public.payment_status      as enum ('pending','approved','rejected','reversed');
create type public.payment_direction   as enum ('in','out');
create type public.payment_source      as enum ('daraja_c2b','daraja_stk','sms_paste','sms_forwarder','bank_email','bank_api','manual');
create type public.frequency           as enum ('daily','weekly','biweekly','monthly','quarterly','yearly');
create type public.sms_status          as enum ('queued','sending','sent','delivered','failed','undelivered','cancelled');
create type public.schedule_status     as enum ('active','paused','disabled','completed');
create type public.run_status          as enum ('queued','sent','skipped','cancelled','failed');

-- ---------- generic helpers -------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create or replace function public.frequency_interval(f public.frequency) returns interval
language sql immutable as $$
  select case f when 'daily' then interval '1 day' when 'weekly' then interval '7 days'
                when 'biweekly' then interval '14 days' when 'monthly' then interval '1 month'
                when 'quarterly' then interval '3 months' when 'yearly' then interval '1 year' end $$;

-- Next occurrence that never drifts (Jan 31 -> Feb 28 -> Mar 31, not Mar 28).
create or replace function public.next_occurrence(p_from date, p_freq public.frequency, p_anchor_day int)
returns date language plpgsql immutable as $$
declare v_first date; v_last int; v_months int;
begin
  if p_freq = 'daily'    then return p_from + 1;  end if;
  if p_freq = 'weekly'   then return p_from + 7;  end if;
  if p_freq = 'biweekly' then return p_from + 14; end if;
  v_months := case p_freq when 'monthly' then 1 when 'quarterly' then 3 else 12 end;
  v_first  := (date_trunc('month', p_from::timestamp) + make_interval(months => v_months))::date;
  v_last   := extract(day from (v_first + interval '1 month' - interval '1 day'))::int;
  return v_first + (least(coalesce(p_anchor_day, extract(day from p_from)::int), v_last) - 1);
end $$;

-- Kenyan MSISDN -> 2547XXXXXXXX. Anything that is not a clean number returns NULL (never guessed).
create or replace function public.normalize_msisdn(p text) returns text
language plpgsql immutable as $$
declare d text;
begin
  if p is null or p like '%*%' then return null; end if;
  d := regexp_replace(p, '[^0-9]', '', 'g');
  if    d ~ '^0[17][0-9]{8}$'     then return '254' || substr(d, 2);
  elsif d ~ '^254[17][0-9]{8}$'   then return d;
  elsif d ~ '^[17][0-9]{8}$'      then return '254' || d;
  end if;
  return null;
end $$;

create or replace function public.fmt_kes(p_minor bigint) returns text
language sql immutable as $$
  select 'KSh ' || case when p_minor % 100 = 0
                        then to_char(p_minor / 100, 'FM999,999,999,990')
                        else to_char(p_minor / 100.0, 'FM999,999,999,990.00') end $$;

create or replace function public.render_template(p_body text, p_vars jsonb) returns text
language plpgsql immutable as $$
declare r record; v_out text := p_body;
begin
  for r in select key, value from jsonb_each_text(p_vars) loop
    v_out := replace(v_out, '{{' || r.key || '}}', coalesce(r.value, ''));
  end loop;
  return v_out;
end $$;

-- True for trusted server-side callers (service key, or a direct DB admin session).
create or replace function public.is_service_call() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
                  nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role'
      or session_user in ('postgres', 'supabase_admin', 'service_role') $$;

-- ---------- tenancy ---------------------------------------------------------
create table public.businesses (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9_]+$'),
  name        text not null,
  legal_name  text,
  kra_pin     text,
  currency    char(3) not null default 'KES',
  timezone    text not null default 'Africa/Nairobi',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_businesses_updated before update on public.businesses
  for each row execute function public.set_updated_at();

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  phone      text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.app_role not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index on public.business_members (user_id);

create or replace function public.is_member(p_business uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_members m
                 where m.business_id = p_business and m.user_id = auth.uid() and m.is_active) $$;

create or replace function public.has_role(p_business uuid, p_roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_members m
                 where m.business_id = p_business and m.user_id = auth.uid()
                   and m.is_active and m.role = any (p_roles)) $$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_members m
                 where m.user_id = auth.uid() and m.is_active and m.role in ('owner','admin')) $$;

create or replace function public.can_manage(p_business uuid) returns boolean
language sql stable as $$
  select public.has_role(p_business, array['owner','admin','accountant']::public.app_role[]) $$;

create or replace function public.can_operate(p_business uuid) returns boolean
language sql stable as $$
  select public.has_role(p_business, array['owner','admin','accountant','cashier']::public.app_role[]) $$;

-- Used inside SECURITY DEFINER workflow functions. Trusted server callers pass; users need the role.
create or replace function public.require_role(p_business uuid, p_roles public.app_role[]) returns void
language plpgsql stable as $$
begin
  if public.is_service_call() then return; end if;
  if not public.has_role(p_business, p_roles) then
    raise exception 'Not authorised for this business' using errcode = '42501';
  end if;
end $$;

create table public.business_settings (
  business_id               uuid primary key references public.businesses(id) on delete cascade,
  sms_enabled               boolean  not null default true,
  sms_sender_id             text,
  default_reminder_offsets  int[]    not null default '{3,7,14,30}',  -- customer debts: days AFTER due date
  payable_reminder_offsets  int[]    not null default '{-3,-1,0}',    -- bills/suppliers/loans: days relative to due
  reminder_send_hour        smallint not null default 9 check (reminder_send_hour between 0 and 23),
  updated_at                timestamptz not null default now()
);
create trigger trg_business_settings_updated before update on public.business_settings
  for each row execute function public.set_updated_at();

-- Gap-free-per-business counters for human-readable numbers (customer no. doubles as Paybill account no.).
create table public.business_counters (
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  value       bigint not null default 0,
  primary key (business_id, name)
);

create or replace function public.next_number(p_business uuid, p_name text, p_prefix text, p_pad int default 4)
returns text language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into public.business_counters (business_id, name, value) values (p_business, p_name, 1)
  on conflict (business_id, name) do update set value = public.business_counters.value + 1
  returning value into v;
  return p_prefix || lpad(v::text, p_pad, '0');
end $$;
