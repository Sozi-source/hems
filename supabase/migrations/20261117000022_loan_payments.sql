-- =============================================================================
-- HEMS · Migration 22 · Loan Payments, Verification & Reversal
-- =============================================================================

create table if not exists public.loan_payments (
  id                  uuid primary key default gen_random_uuid(),
  obligation_id       uuid not null,
  business_id         uuid not null,
  instalment_id       uuid references public.loan_instalments(id) on delete set null,
  payment_date        date not null,
  amount_minor        bigint not null check (amount_minor > 0),
  interest_minor      bigint not null default 0 check (interest_minor >= 0),
  principal_minor     bigint not null default 0 check (principal_minor >= 0),
  method              text not null default 'bank_transfer'
    check (method in ('mpesa','bank_transfer','cash','cheque','other')),
  reference_no        text,
  attachment_url      text,
  notes               text,
  is_verified         boolean not null default false,
  verified_by         uuid,
  verified_at         timestamptz,
  reversed_at         timestamptz,
  reversed_by         uuid,
  reversal_reason     text,
  obligation_entry_id uuid references public.obligation_entries(id),
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (obligation_id, business_id) references public.obligations (id, business_id) on delete cascade
);

create index if not exists idx_loan_payments_loan
  on public.loan_payments (obligation_id, payment_date desc);

drop trigger if exists trg_loan_payments_updated on public.loan_payments;
create trigger trg_loan_payments_updated before update on public.loan_payments
  for each row execute function public.set_updated_at();

drop trigger if exists trg_loan_payments_nobizchange on public.loan_payments;
create trigger trg_loan_payments_nobizchange before update on public.loan_payments
  for each row execute function public.prevent_business_change();

drop trigger if exists trg_loan_payments_audit on public.loan_payments;
create trigger trg_loan_payments_audit after insert or update or delete on public.loan_payments
  for each row execute function public.audit_row_change();

alter table public.loan_payments enable row level security;

drop policy if exists loan_payments_select on public.loan_payments;
create policy loan_payments_select on public.loan_payments
  for select using (public.is_member(business_id));

drop policy if exists loan_payments_insert on public.loan_payments;
create policy loan_payments_insert on public.loan_payments
  for insert with check (public.can_manage(business_id));

drop policy if exists loan_payments_update on public.loan_payments;
create policy loan_payments_update on public.loan_payments
  for update using (public.can_manage(business_id)) with check (public.can_manage(business_id));

-- Track per-instalment allocations for clean reversal
create table if not exists public.loan_payment_allocations (
  id              uuid primary key default gen_random_uuid(),
  loan_payment_id uuid not null references public.loan_payments(id) on delete cascade,
  instalment_id   uuid not null references public.loan_instalments(id) on delete cascade,
  interest_minor  bigint not null default 0 check (interest_minor >= 0),
  principal_minor bigint not null default 0 check (principal_minor >= 0),
  created_at      timestamptz not null default now()
);

-- RPC: record_loan_payment
create or replace function public.record_loan_payment(
  p_obligation_id   uuid,
  p_payment_date    date,
  p_amount_minor    bigint,
  p_method          text,
  p_reference_no    text default null,
  p_attachment_url  text default null,
  p_notes           text default null,
  p_verify_now      boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_business_id       uuid;
  v_remaining         bigint;
  v_total_interest    bigint := 0;
  v_total_principal   bigint := 0;
  v_first_inst_id     uuid := null;
  v_payment_id        uuid;
  v_entry_id          uuid := null;
  v_inst              record;
  v_rem_int           bigint;
  v_rem_prin          bigint;
  v_pay_int           bigint;
  v_pay_prin          bigint;
  v_new_paid_int      bigint;
  v_new_paid_prin     bigint;
  v_new_status        text;
  v_unpaid_count      int;
  v_ob_balance        bigint;
begin
  select business_id into v_business_id from public.loan_terms where obligation_id = p_obligation_id;
  if not found then
    raise exception 'Loan not found' using errcode = 'P0002';
  end if;

  perform public.require_role(v_business_id, array['owner','admin','accountant']::public.app_role[]);

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '22023';
  end if;

  v_remaining := p_amount_minor;

  insert into public.loan_payments (
    obligation_id, business_id, payment_date, amount_minor,
    method, reference_no, attachment_url, notes,
    is_verified, verified_by, verified_at, created_by
  ) values (
    p_obligation_id, v_business_id, p_payment_date, p_amount_minor,
    coalesce(p_method, 'bank_transfer'), p_reference_no, p_attachment_url, p_notes,
    coalesce(p_verify_now, false),
    case when p_verify_now then auth.uid() else null end,
    case when p_verify_now then now() else null end,
    auth.uid()
  ) returning id into v_payment_id;

  -- Allocate chronologically across unpaid instalments (interest first, then principal)
  for v_inst in
    select * from public.loan_instalments
     where obligation_id = p_obligation_id
       and (paid_interest_minor < interest_minor or paid_principal_minor < principal_minor)
     order by instalment_no asc
     for update
  loop
    exit when v_remaining <= 0;

    if v_first_inst_id is null then
      v_first_inst_id := v_inst.id;
    end if;

    v_rem_int := greatest(0, v_inst.interest_minor - v_inst.paid_interest_minor);
    v_pay_int := least(v_remaining, v_rem_int);
    v_remaining := v_remaining - v_pay_int;

    v_rem_prin := greatest(0, v_inst.principal_minor - v_inst.paid_principal_minor);
    v_pay_prin := least(v_remaining, v_rem_prin);
    v_remaining := v_remaining - v_pay_prin;

    v_total_interest := v_total_interest + v_pay_int;
    v_total_principal := v_total_principal + v_pay_prin;

    v_new_paid_int := v_inst.paid_interest_minor + v_pay_int;
    v_new_paid_prin := v_inst.paid_principal_minor + v_pay_prin;

    if v_new_paid_int >= v_inst.interest_minor and v_new_paid_prin >= v_inst.principal_minor then
      v_new_status := 'paid';
    else
      v_new_status := 'partial';
    end if;

    update public.loan_instalments
       set paid_interest_minor = v_new_paid_int,
           paid_principal_minor = v_new_paid_prin,
           status = v_new_status,
           verified_at = case
             when p_verify_now and v_new_status = 'paid' then now()
             else verified_at
           end
     where id = v_inst.id;

    insert into public.loan_payment_allocations (
      loan_payment_id, instalment_id, interest_minor, principal_minor
    ) values (
      v_payment_id, v_inst.id, v_pay_int, v_pay_prin
    );
  end loop;

  -- Any overpayment beyond scheduled instalments reduces principal directly
  if v_remaining > 0 then
    v_total_principal := v_total_principal + v_remaining;
  end if;

  -- Post principal reduction to obligation_entries (capped at current obligation balance)
  select balance_minor into v_ob_balance from public.obligations where id = p_obligation_id;
  if v_total_principal > 0 and v_ob_balance > 0 then
    insert into public.obligation_entries (
      business_id, obligation_id, entry_type, signed_minor, entry_date, memo, created_by
    ) values (
      v_business_id, p_obligation_id, 'payment',
      -least(v_total_principal, v_ob_balance),
      p_payment_date,
      'Loan payment ' || coalesce(p_reference_no, v_payment_id::text),
      auth.uid()
    ) returning id into v_entry_id;
  end if;

  update public.loan_payments
     set instalment_id = v_first_inst_id,
         interest_minor = v_total_interest,
         principal_minor = v_total_principal,
         obligation_entry_id = v_entry_id
   where id = v_payment_id;

  select count(*) into v_unpaid_count
    from public.loan_instalments
   where obligation_id = p_obligation_id and status <> 'paid';

  if v_unpaid_count = 0 and p_verify_now then
    update public.loan_terms set loan_status = 'fully_paid' where obligation_id = p_obligation_id;
  end if;

  return v_payment_id;
end $$;

-- RPC: verify_loan_payment
create or replace function public.verify_loan_payment(p_payment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pay           public.loan_payments%rowtype;
  v_unverified    int;
begin
  select * into v_pay from public.loan_payments where id = p_payment_id for update;
  if not found then
    raise exception 'Loan payment not found' using errcode = 'P0002';
  end if;
  if v_pay.reversed_at is not null then
    raise exception 'Cannot verify a reversed payment' using errcode = '22023';
  end if;

  perform public.require_role(v_pay.business_id, array['owner','admin','accountant']::public.app_role[]);

  update public.loan_payments
     set is_verified = true,
         verified_by = auth.uid(),
         verified_at = now()
   where id = p_payment_id;

  -- Mark any covered & paid instalments as verified so reminders stop
  update public.loan_instalments li
     set verified_at = now()
    from public.loan_payment_allocations lpa
   where lpa.loan_payment_id = p_payment_id
     and lpa.instalment_id = li.id
     and li.status = 'paid'
     and li.verified_at is null;

  select count(*) into v_unverified
    from public.loan_instalments
   where obligation_id = v_pay.obligation_id and verified_at is null;

  if v_unverified = 0 then
    update public.loan_terms set loan_status = 'fully_paid' where obligation_id = v_pay.obligation_id;
  end if;
end $$;

-- RPC: reverse_loan_payment
create or replace function public.reverse_loan_payment(
  p_payment_id uuid,
  p_reason     text default 'Reversed by user'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pay   public.loan_payments%rowtype;
  v_alloc record;
  v_entry public.obligation_entries%rowtype;
begin
  select * into v_pay from public.loan_payments where id = p_payment_id for update;
  if not found then
    raise exception 'Loan payment not found' using errcode = 'P0002';
  end if;
  if v_pay.reversed_at is not null then
    raise exception 'Payment is already reversed' using errcode = '22023';
  end if;

  perform public.require_role(v_pay.business_id, array['owner','admin','accountant']::public.app_role[]);

  for v_alloc in
    select * from public.loan_payment_allocations where loan_payment_id = p_payment_id
  loop
    update public.loan_instalments
       set paid_interest_minor = greatest(0, paid_interest_minor - v_alloc.interest_minor),
           paid_principal_minor = greatest(0, paid_principal_minor - v_alloc.principal_minor),
           verified_at = null,
           status = case
             when greatest(0, paid_interest_minor - v_alloc.interest_minor) = 0
              and greatest(0, paid_principal_minor - v_alloc.principal_minor) = 0
             then 'upcoming'
             else 'partial'
           end
     where id = v_alloc.instalment_id;
  end loop;

  if v_pay.obligation_entry_id is not null then
    select * into v_entry from public.obligation_entries where id = v_pay.obligation_entry_id;
    if found then
      insert into public.obligation_entries (
        business_id, obligation_id, entry_type, signed_minor, entry_date,
        reverses_entry_id, memo, created_by
      ) values (
        v_pay.business_id, v_pay.obligation_id, 'reversal', -v_entry.signed_minor,
        current_date, v_entry.id, coalesce(p_reason, 'Loan payment reversed'), auth.uid()
      );
    end if;
  end if;

  update public.loan_payments
     set reversed_at = now(),
         reversed_by = auth.uid(),
         reversal_reason = coalesce(p_reason, 'Reversed by user'),
         is_verified = false
   where id = p_payment_id;

  update public.loan_terms
     set loan_status = 'active'
   where obligation_id = v_pay.obligation_id and loan_status = 'fully_paid';
end $$;

grant execute on function public.record_loan_payment(uuid,date,bigint,text,text,text,text,boolean) to authenticated;
grant execute on function public.verify_loan_payment(uuid) to authenticated;
grant execute on function public.reverse_loan_payment(uuid,text) to authenticated;
