-- =============================================================================
-- HEMS · Migration 21 · Business Loans Tracking Module
-- Extends loan_terms non-destructively, adds loan_instalments schedule table,
-- RLS policies, audit triggers, and SQL workflow functions (create_loan, update_loan_terms).
-- =============================================================================

-- 1. Extend loan_terms non-destructively
alter table public.loan_terms
  add column if not exists loan_type text not null default 'bank_loan'
    check (loan_type in ('bank_loan','asset_financing','mobile_loan','other')),
  add column if not exists interest_method text not null default 'reducing_balance'
    check (interest_method in ('reducing_balance','flat')),
  add column if not exists date_taken date,
  add column if not exists term_months int not null default 12 check (term_months > 0),
  add column if not exists repayment_day smallint not null default 1 check (repayment_day between 1 and 31),
  add column if not exists monthly_instalment_minor bigint check (monthly_instalment_minor is null or monthly_instalment_minor > 0),
  add column if not exists instalment_overridden boolean not null default false,
  add column if not exists payment_details jsonb not null default '{}'::jsonb,
  add column if not exists loan_status text not null default 'active'
    check (loan_status in ('active','fully_paid','defaulted')),
  add column if not exists archived_at timestamptz,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_loan_terms_updated on public.loan_terms;
create trigger trg_loan_terms_updated before update on public.loan_terms
  for each row execute function public.set_updated_at();

-- 2. Amortization schedule table (per-instalment breakdown)
create table if not exists public.loan_instalments (
  id                     uuid primary key default gen_random_uuid(),
  obligation_id          uuid not null,
  business_id            uuid not null,
  instalment_no          int not null check (instalment_no > 0),
  due_date               date not null,
  opening_balance_minor  bigint not null check (opening_balance_minor >= 0),
  instalment_minor       bigint not null check (instalment_minor > 0),
  interest_minor         bigint not null check (interest_minor >= 0),
  principal_minor        bigint not null check (principal_minor >= 0),
  closing_balance_minor  bigint not null check (closing_balance_minor >= 0),
  paid_interest_minor    bigint not null default 0 check (paid_interest_minor >= 0),
  paid_principal_minor   bigint not null default 0 check (paid_principal_minor >= 0),
  paid_minor             bigint generated always as (paid_interest_minor + paid_principal_minor) stored,
  status                 text not null default 'upcoming'
    check (status in ('upcoming','due','partial','paid','overdue')),
  verified_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (obligation_id, instalment_no),
  unique (id, business_id),
  foreign key (obligation_id, business_id) references public.obligations (id, business_id) on delete cascade
);

create index if not exists idx_loan_instalments_due
  on public.loan_instalments (business_id, due_date)
  where verified_at is null;

create index if not exists idx_loan_instalments_loan
  on public.loan_instalments (obligation_id, instalment_no);

drop trigger if exists trg_loan_instalments_updated on public.loan_instalments;
create trigger trg_loan_instalments_updated before update on public.loan_instalments
  for each row execute function public.set_updated_at();

drop trigger if exists trg_loan_instalments_nobizchange on public.loan_instalments;
create trigger trg_loan_instalments_nobizchange before update on public.loan_instalments
  for each row execute function public.prevent_business_change();

drop trigger if exists trg_loan_instalments_audit on public.loan_instalments;
create trigger trg_loan_instalments_audit after insert or update or delete on public.loan_instalments
  for each row execute function public.audit_row_change();

-- 3. RLS for loan_instalments (and ensure loan_terms has full manage policies)
alter table public.loan_instalments enable row level security;

drop policy if exists loan_instalments_select on public.loan_instalments;
create policy loan_instalments_select on public.loan_instalments
  for select using (public.is_member(business_id));

drop policy if exists loan_instalments_insert on public.loan_instalments;
create policy loan_instalments_insert on public.loan_instalments
  for insert with check (public.can_manage(business_id));

drop policy if exists loan_instalments_update on public.loan_instalments;
create policy loan_instalments_update on public.loan_instalments
  for update using (public.can_manage(business_id)) with check (public.can_manage(business_id));

drop policy if exists loan_instalments_delete on public.loan_instalments;
create policy loan_instalments_delete on public.loan_instalments
  for delete using (public.can_manage(business_id));

-- 4. SQL Workflow Function: create_loan
create or replace function public.create_loan(
  p_business_id               uuid,
  p_loan_type                 text,
  p_lender_name               text,
  p_principal_minor           bigint,
  p_date_taken                date,
  p_interest_rate_pct         numeric,
  p_interest_method           text,
  p_term_months               int,
  p_monthly_instalment_minor  bigint,
  p_instalment_overridden     boolean,
  p_repayment_day             smallint,
  p_first_due_date            date,
  p_maturity_date             date,
  p_total_interest_minor      bigint,
  p_payment_details           jsonb default '{}'::jsonb,
  p_notes                     text default null,
  p_instalments               jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_obligation_id uuid;
  v_ref           text;
  v_row           jsonb;
begin
  perform public.require_role(p_business_id, array['owner','admin','accountant']::public.app_role[]);

  if p_principal_minor is null or p_principal_minor <= 0 then
    raise exception 'Loan principal must be positive' using errcode = '22023';
  end if;
  if p_term_months is null or p_term_months <= 0 then
    raise exception 'Repayment period must be positive' using errcode = '22023';
  end if;
  if p_interest_rate_pct is null or p_interest_rate_pct < 0 then
    raise exception 'Interest rate cannot be negative' using errcode = '22023';
  end if;

  v_ref := public.next_number(p_business_id, 'loan', 'LN');

  insert into public.obligations (
    business_id, kind, direction, reference_no, payee_name, description,
    original_minor, issue_date, due_date, created_by
  ) values (
    p_business_id, 'loan', 'payable', v_ref, trim(p_lender_name), coalesce(p_notes, p_loan_type),
    p_principal_minor, p_date_taken, p_first_due_date, auth.uid()
  ) returning id into v_obligation_id;

  -- Post initial principal charge (balance_minor becomes p_principal_minor via trigger)
  insert into public.obligation_entries (
    business_id, obligation_id, entry_type, signed_minor, entry_date, memo, created_by
  ) values (
    p_business_id, v_obligation_id, 'charge', p_principal_minor, p_date_taken,
    'Loan principal disbursement (' || trim(p_lender_name) || ')', auth.uid()
  );

  insert into public.loan_terms (
    obligation_id, business_id, lender_name, principal_minor, interest_rate_pct,
    interest_minor, installment_minor, monthly_instalment_minor, instalment_overridden,
    frequency, first_due_date, maturity_date, loan_type, interest_method, date_taken,
    term_months, repayment_day, payment_details, loan_status, notes
  ) values (
    v_obligation_id, p_business_id, trim(p_lender_name), p_principal_minor, p_interest_rate_pct,
    greatest(0, coalesce(p_total_interest_minor, 0)), p_monthly_instalment_minor, p_monthly_instalment_minor,
    coalesce(p_instalment_overridden, false), 'monthly', p_first_due_date, p_maturity_date,
    coalesce(p_loan_type, 'bank_loan'), coalesce(p_interest_method, 'reducing_balance'),
    p_date_taken, p_term_months, p_repayment_day, coalesce(p_payment_details, '{}'::jsonb),
    'active', p_notes
  );

  for v_row in select * from jsonb_array_elements(coalesce(p_instalments, '[]'::jsonb)) loop
    insert into public.loan_instalments (
      obligation_id, business_id, instalment_no, due_date,
      opening_balance_minor, instalment_minor, interest_minor,
      principal_minor, closing_balance_minor, status
    ) values (
      v_obligation_id,
      p_business_id,
      (v_row ->> 'instalment_no')::int,
      (v_row ->> 'due_date')::date,
      (v_row ->> 'opening_balance_minor')::bigint,
      (v_row ->> 'instalment_minor')::bigint,
      (v_row ->> 'interest_minor')::bigint,
      (v_row ->> 'principal_minor')::bigint,
      (v_row ->> 'closing_balance_minor')::bigint,
      'upcoming'
    );
  end loop;

  return v_obligation_id;
end $$;

-- 5. SQL Workflow Function: update_loan_terms (recalculates ONLY future unpaid instalments)
create or replace function public.update_loan_terms(
  p_obligation_id             uuid,
  p_lender_name               text,
  p_loan_type                 text,
  p_interest_rate_pct         numeric,
  p_term_months               int,
  p_monthly_instalment_minor  bigint,
  p_instalment_overridden     boolean,
  p_repayment_day             smallint,
  p_maturity_date             date,
  p_total_interest_minor      bigint,
  p_payment_details           jsonb,
  p_loan_status               text,
  p_notes                     text,
  p_future_instalments        jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_next_due    date;
  v_row         jsonb;
begin
  select business_id into v_business_id from public.loan_terms where obligation_id = p_obligation_id;
  if not found then
    raise exception 'Loan not found' using errcode = 'P0002';
  end if;

  perform public.require_role(v_business_id, array['owner','admin','accountant']::public.app_role[]);

  update public.loan_terms
     set lender_name = trim(p_lender_name),
         loan_type = p_loan_type,
         interest_rate_pct = p_interest_rate_pct,
         term_months = p_term_months,
         installment_minor = p_monthly_instalment_minor,
         monthly_instalment_minor = p_monthly_instalment_minor,
         instalment_overridden = p_instalment_overridden,
         repayment_day = p_repayment_day,
         maturity_date = p_maturity_date,
         interest_minor = greatest(0, coalesce(p_total_interest_minor, interest_minor)),
         payment_details = coalesce(p_payment_details, payment_details),
         loan_status = coalesce(p_loan_status, loan_status),
         notes = p_notes
   where obligation_id = p_obligation_id;

  -- Remove ONLY future completely unpaid instalments; never touch instalments with recorded payments
  delete from public.loan_instalments
   where obligation_id = p_obligation_id
     and paid_interest_minor = 0
     and paid_principal_minor = 0
     and verified_at is null;

  for v_row in select * from jsonb_array_elements(coalesce(p_future_instalments, '[]'::jsonb)) loop
    insert into public.loan_instalments (
      obligation_id, business_id, instalment_no, due_date,
      opening_balance_minor, instalment_minor, interest_minor,
      principal_minor, closing_balance_minor, status
    ) values (
      p_obligation_id,
      v_business_id,
      (v_row ->> 'instalment_no')::int,
      (v_row ->> 'due_date')::date,
      (v_row ->> 'opening_balance_minor')::bigint,
      (v_row ->> 'instalment_minor')::bigint,
      (v_row ->> 'interest_minor')::bigint,
      (v_row ->> 'principal_minor')::bigint,
      (v_row ->> 'closing_balance_minor')::bigint,
      'upcoming'
    );
  end loop;

  select min(due_date) into v_next_due
    from public.loan_instalments
   where obligation_id = p_obligation_id and verified_at is null;

  update public.obligations
     set payee_name = trim(p_lender_name),
         description = coalesce(p_notes, p_loan_type),
         due_date = coalesce(v_next_due, due_date)
   where id = p_obligation_id;
end $$;

grant execute on function public.create_loan(uuid,text,text,bigint,date,numeric,text,int,bigint,boolean,smallint,date,date,bigint,jsonb,text,jsonb) to authenticated;
grant execute on function public.update_loan_terms(uuid,text,text,numeric,int,bigint,boolean,smallint,date,bigint,jsonb,text,text,jsonb) to authenticated;
