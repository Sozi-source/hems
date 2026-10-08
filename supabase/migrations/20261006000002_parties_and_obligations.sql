-- =============================================================================
-- HEMS · Migration 02 · Parties and the unified obligations ledger
--
-- One engine for EVERY thing owed:  customer debts, supplier debts, loans,
-- bills, expenses, salaries, staff advances.  Same approval + allocation path.
-- Balances are never edited by hand: they are maintained by a trigger from the
-- append-only obligation_entries table.
--
-- Cross-business integrity is enforced by the database itself: every reference
-- is a COMPOSITE foreign key (id, business_id), so a Haron Fashion debt can
-- never point at a Zenith Plast customer, even by mistake in application code.
-- =============================================================================

create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses(id),
  customer_no        text not null,                 -- doubles as Paybill account number
  full_name          text not null check (length(trim(full_name)) > 0),
  phone              text,                          -- normalised 2547XXXXXXXX
  alt_phone          text,
  email              text,
  credit_limit_minor bigint check (credit_limit_minor >= 0),
  reminder_offsets   int[],                         -- per-customer override; NULL = business default
  sms_opt_out        boolean not null default false,
  notes              text,
  is_active          boolean not null default true,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, customer_no)
);
create index on public.customers (business_id, phone);
create index on public.customers using gin (full_name extensions.gin_trgm_ops);

create or replace function public.customers_before() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.customer_no is null then
    new.customer_no := public.next_number(new.business_id, 'customer', 'C');
  end if;
  if new.phone is not null then
    if public.normalize_msisdn(new.phone) is null then
      raise exception 'Invalid Kenyan phone number: %', new.phone using errcode = '22023';
    end if;
    new.phone := public.normalize_msisdn(new.phone);
  end if;
  if new.alt_phone is not null then new.alt_phone := coalesce(public.normalize_msisdn(new.alt_phone), new.alt_phone); end if;
  new.updated_at := now();
  return new;
end $$;
-- customer_no is NOT NULL, so give BEFORE INSERT a chance to fill it:
alter table public.customers alter column customer_no drop not null;
create trigger trg_customers_before before insert or update on public.customers
  for each row execute function public.customers_before();
alter table public.customers add constraint customers_no_present check (customer_no is not null) not valid;
alter table public.customers validate constraint customers_no_present;

-- Verified payer identities captured from M-Pesa (STK result, C2B or SMS).
-- Only data actually returned by the provider is stored. Names are never guessed.
create table public.customer_payment_identities (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null,
  customer_id    uuid not null,
  msisdn         text,
  msisdn_sha256  text,                 -- Daraja C2B v2 returns a hashed MSISDN
  verified_name  text,
  source         public.payment_source not null,
  receipt_ref    text,
  verified_at    timestamptz not null default now(),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  foreign key (customer_id, business_id) references public.customers (id, business_id),
  check (msisdn is not null or msisdn_sha256 is not null or verified_name is not null)
);
create unique index customer_identity_unique on public.customer_payment_identities
  (customer_id, coalesce(msisdn, ''), coalesce(msisdn_sha256, ''), coalesce(upper(verified_name), ''))
  where is_active;
create index on public.customer_payment_identities (business_id, msisdn);
create index on public.customer_payment_identities (business_id, msisdn_sha256);

create table public.suppliers (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses(id),
  supplier_no        text,
  name               text not null check (length(trim(name)) > 0),
  phone              text,
  email              text,
  payment_terms_days int not null default 0 check (payment_terms_days >= 0),
  payment_terms_note text,
  notes              text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, supplier_no)
);
create or replace function public.suppliers_before() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.supplier_no is null then
    new.supplier_no := public.next_number(new.business_id, 'supplier', 'S');
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_suppliers_before before insert or update on public.suppliers
  for each row execute function public.suppliers_before();

create table public.staff_members (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses(id),
  staff_no            text,
  full_name           text not null,
  phone               text,
  job_title           text,
  monthly_salary_minor bigint check (monthly_salary_minor >= 0),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, staff_no)
);
create or replace function public.staff_before() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.staff_no is null then
    new.staff_no := public.next_number(new.business_id, 'staff', 'ST');
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_staff_before before insert or update on public.staff_members
  for each row execute function public.staff_before();

create table public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  name        text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, name)
);

-- Recurring obligations (Rent KSh 50,000 monthly -> next month is created automatically).
create table public.recurring_templates (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses(id),
  kind                public.obligation_kind not null check (kind in ('bill','expense','salary')),
  category_id         uuid,
  supplier_id         uuid,
  staff_id            uuid,
  payee_name          text,
  description         text,
  amount_minor        bigint not null check (amount_minor > 0),
  frequency           public.frequency not null default 'monthly',
  anchor_day          smallint check (anchor_day between 1 and 31),
  next_due_date       date not null,
  generate_days_ahead int not null default 14 check (generate_days_ahead >= 0),
  is_active           boolean not null default true,
  last_generated_due  date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, business_id),
  foreign key (category_id, business_id) references public.expense_categories (id, business_id),
  foreign key (supplier_id, business_id) references public.suppliers (id, business_id),
  foreign key (staff_id,    business_id) references public.staff_members (id, business_id),
  check (kind <> 'salary' or staff_id is not null)
);
create or replace function public.recurring_before() returns trigger language plpgsql as $$
begin
  if new.anchor_day is null then new.anchor_day := extract(day from new.next_due_date)::int; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_recurring_before before insert or update on public.recurring_templates
  for each row execute function public.recurring_before();

create table public.obligations (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references public.businesses(id),
  kind                 public.obligation_kind not null,
  direction            public.obligation_direction not null,
  reference_no         text,
  customer_id          uuid,
  supplier_id          uuid,
  staff_id             uuid,
  category_id          uuid,
  payee_name           text,
  description          text,
  original_minor       bigint not null check (original_minor > 0),
  total_charged_minor  bigint not null default 0,      -- maintained by trigger
  balance_minor        bigint not null default 0 check (balance_minor >= 0),  -- maintained by trigger
  status               public.obligation_status not null default 'open',      -- maintained by trigger
  issue_date           date not null,
  due_date             date,
  payment_terms        text,
  recurring_template_id uuid,
  closed_at            timestamptz,
  created_by           uuid default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, business_id),
  foreign key (customer_id, business_id) references public.customers (id, business_id),
  foreign key (supplier_id, business_id) references public.suppliers (id, business_id),
  foreign key (staff_id,    business_id) references public.staff_members (id, business_id),
  foreign key (category_id, business_id) references public.expense_categories (id, business_id),
  foreign key (recurring_template_id, business_id) references public.recurring_templates (id, business_id),
  check ((direction = 'receivable') = (kind in ('customer_debt','staff_advance'))),
  check (kind <> 'customer_debt' or customer_id is not null),
  check (kind <> 'supplier_debt' or supplier_id is not null),
  check (kind not in ('salary','staff_advance') or staff_id is not null)
);
create unique index obligations_ref_unique on public.obligations (business_id, kind, reference_no) where reference_no is not null;
create unique index obligations_recurring_once on public.obligations (recurring_template_id, due_date) where recurring_template_id is not null;
create index on public.obligations (business_id, kind, status);
create index on public.obligations (business_id, due_date) where balance_minor > 0;
create index on public.obligations (customer_id) where customer_id is not null;
create index on public.obligations (supplier_id) where supplier_id is not null;

-- Append-only journal. signed_minor > 0 increases what is owed, < 0 reduces it.
create table public.obligation_entries (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null,
  obligation_id         uuid not null,
  entry_type            public.entry_type not null,
  signed_minor          bigint not null check (signed_minor <> 0),
  entry_date            date not null default current_date,
  payment_allocation_id uuid,
  reverses_entry_id     uuid references public.obligation_entries (id),
  memo                  text,
  created_by            uuid default auth.uid(),
  created_at            timestamptz not null default now(),
  foreign key (obligation_id, business_id) references public.obligations (id, business_id),
  check ((entry_type in ('charge','interest','adjustment_up')   and signed_minor > 0)
      or (entry_type in ('payment','adjustment_down','write_off') and signed_minor < 0)
      or (entry_type = 'reversal' and reverses_entry_id is not null))
);
create unique index entries_reverse_once on public.obligation_entries (reverses_entry_id) where reverses_entry_id is not null;
create index on public.obligation_entries (obligation_id, created_at);
create index on public.obligation_entries (payment_allocation_id) where payment_allocation_id is not null;

create or replace function public.entries_immutable() returns trigger language plpgsql as $$
begin raise exception 'obligation_entries is append-only; post a reversal instead' using errcode = '55000'; end $$;
create trigger trg_entries_immutable before update or delete on public.obligation_entries
  for each row execute function public.entries_immutable();

-- The ONLY writer of balance/status. Locks the obligation row so concurrent postings serialise.
create or replace function public.apply_obligation_entry() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o public.obligations%rowtype; v_balance bigint; v_total bigint; v_status public.obligation_status;
  v_side_type public.entry_type;
begin
  select * into o from public.obligations where id = new.obligation_id for update;
  v_balance := o.balance_minor + new.signed_minor;
  if v_balance < 0 then
    raise exception 'Posting would make the balance negative (balance %, entry %)', o.balance_minor, new.signed_minor
      using errcode = '23514';
  end if;

  -- "charge side" entries move total_charged; "payment side" entries (payment, write_off) do not.
  v_side_type := new.entry_type;
  if new.entry_type = 'reversal' then
    select entry_type into v_side_type from public.obligation_entries where id = new.reverses_entry_id;
  end if;
  v_total := o.total_charged_minor
           + case when v_side_type in ('charge','interest','adjustment_up','adjustment_down') then new.signed_minor else 0 end;

  v_status := case
    when v_balance = 0 then (case when new.entry_type = 'write_off' then 'written_off' else 'paid' end)::public.obligation_status
    when v_balance < v_total then 'partially_paid'::public.obligation_status
    else 'open'::public.obligation_status end;

  perform set_config('hems.internal', 'on', true);
  update public.obligations
     set balance_minor = v_balance, total_charged_minor = v_total, status = v_status,
         closed_at = case when v_balance = 0 then now() else null end, updated_at = now()
   where id = o.id;
  perform set_config('hems.internal', 'off', true);
  return new;
end $$;
create trigger trg_entries_apply after insert on public.obligation_entries
  for each row execute function public.apply_obligation_entry();

-- Nobody (not even a buggy client) may edit money fields directly.
create or replace function public.guard_obligation_update() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('hems.internal', true), 'off') <> 'on'
     and (new.balance_minor, new.total_charged_minor, new.original_minor, new.status, new.kind, new.direction)
         is distinct from
         (old.balance_minor, old.total_charged_minor, old.original_minor, old.status, old.kind, old.direction) then
    raise exception 'Money fields are system-managed; post an entry instead' using errcode = '55000';
  end if;
  return new;
end $$;
create trigger trg_obligations_guard before update on public.obligations
  for each row execute function public.guard_obligation_update();

create table public.loan_terms (
  obligation_id       uuid primary key,
  business_id         uuid not null,
  lender_name         text not null,
  principal_minor     bigint not null check (principal_minor > 0),
  interest_rate_pct   numeric(7,3) not null default 0 check (interest_rate_pct >= 0),
  interest_minor      bigint not null default 0 check (interest_minor >= 0),
  total_payable_minor bigint generated always as (principal_minor + interest_minor) stored,
  installment_minor   bigint not null check (installment_minor > 0),
  frequency           public.frequency not null default 'monthly',
  first_due_date      date not null,
  maturity_date       date not null,
  created_at          timestamptz not null default now(),
  foreign key (obligation_id, business_id) references public.obligations (id, business_id) on delete cascade,
  check (maturity_date >= first_due_date)
);
