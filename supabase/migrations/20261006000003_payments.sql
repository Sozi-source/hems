-- =============================================================================
-- HEMS · Migration 03 · Payments pipeline tables
-- Paybill channels (one per business -> deterministic business attribution),
-- raw ingest log, payment transactions, STK requests, match candidates,
-- allocations. Nothing here changes a balance: only approve_payment() does.
-- =============================================================================

create table public.payment_channels (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  provider    text not null check (provider in ('mpesa_paybill','mpesa_till','bank','cash')),
  shortcode   text not null,
  label       text,
  secret_ref  text,          -- NAME of the secret (Vault/env). Never the secret itself.
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (id, business_id),
  unique (provider, shortcode)           -- a shortcode belongs to exactly one business
);

create table public.payment_transactions (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid references public.businesses(id),   -- NULL only while unassigned & pending
  channel_id          uuid,
  provider            text not null,                           -- 'mpesa', 'bank:equity', ...
  transaction_ref     text not null,                           -- M-Pesa receipt / bank reference
  direction           public.payment_direction not null default 'in',
  source              public.payment_source not null,
  amount_minor        bigint not null check (amount_minor > 0),
  currency            char(3) not null default 'KES',
  payer_name          text,
  payer_msisdn        text,
  payer_msisdn_masked text,
  payer_msisdn_sha256 text,
  counterparty_name   text,
  account_reference   text,                                    -- Paybill BillRefNumber / account no.
  receiving_account   text,
  description         text,
  occurred_at         timestamptz not null,
  suggested_kind      public.obligation_kind,
  match_confidence    numeric(5,2) check (match_confidence between 0 and 100),
  status              public.payment_status not null default 'pending',
  unallocated_minor   bigint not null default 0 check (unallocated_minor >= 0),
  decided_by          uuid,
  decided_at          timestamptz,
  decision_note       text,
  conflict_flags      text[] not null default '{}',
  raw_payload         jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider, transaction_ref),           -- THE duplicate-payment guard
  unique (id, business_id),
  foreign key (channel_id, business_id) references public.payment_channels (id, business_id),
  check (business_id is not null or status = 'pending')
);
create index on public.payment_transactions (business_id, status, occurred_at desc);
create index on public.payment_transactions (payer_msisdn);
create index on public.payment_transactions (account_reference);

create or replace function public.guard_payment_update() returns trigger language plpgsql as $$
declare v_internal boolean := coalesce(current_setting('hems.internal', true), 'off') = 'on';
begin
  if (new.provider, new.transaction_ref, new.amount_minor, new.direction, new.source, new.occurred_at, new.currency)
     is distinct from
     (old.provider, old.transaction_ref, old.amount_minor, old.direction, old.source, old.occurred_at, old.currency) then
    raise exception 'Payment core fields are immutable' using errcode = '55000';
  end if;
  if new.status is distinct from old.status and not v_internal then
    raise exception 'Payment status changes only through approve/reject/reverse functions' using errcode = '55000';
  end if;
  if new.business_id is distinct from old.business_id and old.business_id is not null and not v_internal then
    raise exception 'Payment business can only be changed through assign_payment_business()' using errcode = '55000';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_payment_guard before update on public.payment_transactions
  for each row execute function public.guard_payment_update();

-- Every raw message/payload ever received. The same SMS read 100 times = 1 row, seen_count = 100.
create table public.payment_ingest_log (
  id             bigint generated always as identity primary key,
  source         public.payment_source not null,
  content_sha256 text not null unique,
  raw            text,
  outcome        text not null default 'created'
                 check (outcome in ('created','duplicate_ref','enriched','parse_failed','conflict')),
  payment_id     uuid references public.payment_transactions(id) on delete set null,
  error          text,
  seen_count     int not null default 1,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);

create table public.stk_requests (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null,
  customer_id         uuid not null,
  channel_id          uuid not null,
  purpose             text not null check (purpose in ('identity_verification','debt_payment')),
  msisdn              text not null,
  amount_minor        bigint not null check (amount_minor >= 100),     -- Daraja minimum is KSh 1
  account_reference   text,
  merchant_request_id text,
  checkout_request_id text unique,
  status              text not null default 'initiated'
                      check (status in ('initiated','sent','success','failed','cancelled','timeout')),
  result_code         int,
  result_desc         text,
  mpesa_receipt       text,
  payment_id          uuid references public.payment_transactions(id),
  requested_by        uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  completed_at        timestamptz,
  foreign key (customer_id, business_id) references public.customers (id, business_id),
  foreign key (channel_id,  business_id) references public.payment_channels (id, business_id)
);

-- Why the engine thinks a payment belongs somewhere (every scoring factor is stored).
create table public.match_candidates (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null,
  payment_id            uuid not null,
  target_kind           public.obligation_kind not null,
  customer_id           uuid,
  supplier_id           uuid,
  obligation_id         uuid,
  confidence            numeric(5,2) not null check (confidence between 0 and 100),
  score_breakdown       jsonb not null default '{}',
  suggested_amount_minor bigint,
  rank                  smallint not null default 1,
  engine_version        text not null,
  created_at            timestamptz not null default now(),
  foreign key (payment_id,  business_id) references public.payment_transactions (id, business_id) on delete cascade,
  foreign key (customer_id, business_id) references public.customers (id, business_id),
  foreign key (supplier_id, business_id) references public.suppliers (id, business_id),
  foreign key (obligation_id, business_id) references public.obligations (id, business_id)
);
create index on public.match_candidates (payment_id, rank);

create table public.payment_allocations (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null,
  payment_id    uuid not null,
  obligation_id uuid not null,
  amount_minor  bigint not null check (amount_minor > 0),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  reversed_at   timestamptz,
  reversed_by   uuid,
  unique (id, business_id),
  unique (payment_id, obligation_id),
  foreign key (payment_id,    business_id) references public.payment_transactions (id, business_id),
  foreign key (obligation_id, business_id) references public.obligations (id, business_id)
);
create index on public.payment_allocations (obligation_id);

alter table public.obligation_entries
  add constraint entries_allocation_fk foreign key (payment_allocation_id, business_id)
  references public.payment_allocations (id, business_id);
