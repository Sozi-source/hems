-- =============================================================================
-- HEMS · Migration 17 · Pay Debt / Record Cash Payment Functionality
--
-- Enables counter / cash desk debt payments when customers pay with paper money.
-- Idempotent, audited, maintains gap-free CSH- counter, updates balances via
-- append-only obligation_entries, queues instant payment confirmation SMS,
-- and handles FIFO allocation across open debts or specific invoice settlement.
-- =============================================================================

-- 1. Ensure cash payment channel exists for all businesses
insert into public.payment_channels (business_id, provider, shortcode, label, is_active)
select id, 'cash', 'CASH-' || code, 'Cash Desk (' || name || ')', true
from public.businesses
on conflict (provider, shortcode) do nothing;

-- 2. Update on_business_created to automatically create a cash channel for future businesses
create or replace function public.on_business_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.business_settings (business_id) values (new.id) on conflict do nothing;

  insert into public.expense_categories (business_id, name, is_default)
  select new.id, c, true from unnest(array['Rent','Electricity','Water','Internet','Security','Fuel',
        'Transport','Repairs','Insurance','Licences','Airtime','Other']) as c
  on conflict do nothing;

  insert into public.payment_channels (business_id, provider, shortcode, label, is_active)
  values (new.id, 'cash', 'CASH-' || new.code, 'Cash Desk (' || new.name || ')', true)
  on conflict (provider, shortcode) do nothing;

  insert into public.sms_templates (business_id, key, name, body) values
   (new.id, 'customer_reminder', 'Customer debt reminder',
    'Dear {{first_name}}, this is a friendly reminder from {{business_name}}. Your outstanding balance is {{balance}}. Please pay via Paybill {{paybill}}, account {{account}}. Thank you.'),
   (new.id, 'payment_confirmation', 'Payment received',
    'Dear {{first_name}}, we have received your payment of {{amount}}. Thank you. Your remaining balance is {{balance}}.'),
   (new.id, 'payment_confirmation_paid_in_full', 'Payment received - paid in full',
    'Dear {{first_name}}, we have received your payment of {{amount}}. Thank you. Your account is PAID IN FULL. - {{business_name}}'),
   (new.id, 'credit_sale_invoice', 'Goods received on credit',
    'Dear {{first_name}}, you have received goods worth {{amount}} on credit from {{business_name}}. Total balance: {{balance}}. Due date: {{due_date}}. Pay via Paybill {{paybill}}, account {{account}}. Thank you.')
  on conflict do nothing;
  return new;
end $$;

-- 3. The record_cash_payment function
create or replace function public.record_cash_payment(
  p_business uuid,
  p_customer uuid,
  p_amount_minor bigint,
  p_obligation_id uuid default null,
  p_receipt_ref text default null,
  p_paid_at timestamptz default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_biz public.businesses%rowtype;
  v_cust public.customers%rowtype;
  v_bs public.business_settings%rowtype;
  v_channel public.payment_channels%rowtype;
  v_ref text;
  v_payment_id uuid;
  v_alloc_id uuid;
  v_rem_minor bigint := p_amount_minor;
  v_allocated_minor bigint := 0;
  v_sms_queued int := 0;
  v_target_ob public.obligations%rowtype;
  v_ob record;
  v_alloc_amt bigint;
  v_today date;
  v_prev_total bigint;
  v_new_total bigint;
  v_body text;
  v_text text;
  v_paybill text;
  v_prefix text;
begin
  -- 1. Authorization: cashier, accountant, admin, owner can record cash payments
  perform public.require_role(p_business, array['owner','admin','accountant','cashier']::public.app_role[]);

  -- 2. Validate business and customer
  select * into v_biz from public.businesses where id = p_business;
  if not found then raise exception 'Business not found' using errcode = 'P0002'; end if;

  select * into v_cust from public.customers where id = p_customer and business_id = p_business;
  if not found then raise exception 'Customer not found in this business' using errcode = 'P0002'; end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '22023';
  end if;

  v_today := public.business_today(p_business);

  -- 3. Calculate previous total debt balance for customer
  select coalesce(sum(balance_minor), 0) into v_prev_total
  from public.obligations
  where business_id = p_business and customer_id = p_customer and kind = 'customer_debt'
    and status in ('open', 'partially_paid');

  -- 4. Find active cash payment channel for business
  select * into v_channel from public.payment_channels
  where business_id = p_business and provider = 'cash' and is_active
  order by created_at limit 1;

  -- 5. Generate transaction reference if not provided
  if nullif(trim(p_receipt_ref), '') is not null then
    v_ref := trim(p_receipt_ref);
  else
    v_prefix := 'CSH-' || coalesce(v_biz.code, 'BIZ') || '-';
    v_ref := public.next_number(p_business, 'cash_payment', v_prefix);
  end if;

  -- 6. Insert approved payment transaction
  insert into public.payment_transactions (
    business_id, channel_id, provider, transaction_ref, direction, source,
    amount_minor, payer_name, payer_msisdn, account_reference,
    occurred_at, status, unallocated_minor, decided_by, decided_at, decision_note,
    description
  ) values (
    p_business, v_channel.id, 'cash', v_ref, 'in', 'manual',
    p_amount_minor, v_cust.full_name, v_cust.phone, v_cust.customer_no,
    coalesce(p_paid_at, now()), 'approved', p_amount_minor, auth.uid(), now(),
    coalesce(nullif(trim(p_note), ''), 'Cash payment received at counter'),
    'Cash payment (' || v_ref || ') from ' || v_cust.full_name
  ) returning id into v_payment_id;

  -- 7. Allocations
  -- Step A: If a specific obligation was selected, pay against it first
  if p_obligation_id is not null then
    select * into v_target_ob from public.obligations
    where id = p_obligation_id and business_id = p_business for update;

    if found and v_target_ob.balance_minor > 0 and v_target_ob.direction = 'receivable' then
      v_alloc_amt := least(v_rem_minor, v_target_ob.balance_minor);
      if v_alloc_amt > 0 then
        insert into public.payment_allocations (business_id, payment_id, obligation_id, amount_minor, created_by)
        values (p_business, v_payment_id, v_target_ob.id, v_alloc_amt, auth.uid())
        returning id into v_alloc_id;

        insert into public.obligation_entries (business_id, obligation_id, entry_type, signed_minor, entry_date, payment_allocation_id, memo)
        values (p_business, v_target_ob.id, 'payment', -v_alloc_amt, v_today, v_alloc_id, 'Cash payment ' || v_ref);

        v_rem_minor := v_rem_minor - v_alloc_amt;
        v_allocated_minor := v_allocated_minor + v_alloc_amt;
      end if;
    end if;
  end if;

  -- Step B: If there is remaining cash and open customer debts, allocate FIFO (oldest first)
  if v_rem_minor > 0 then
    for v_ob in
      select id, balance_minor, reference_no from public.obligations
      where business_id = p_business and customer_id = p_customer and kind = 'customer_debt'
        and status in ('open', 'partially_paid') and balance_minor > 0
        and (p_obligation_id is null or id <> p_obligation_id)
      order by coalesce(issue_date, created_at::date) asc, created_at asc
      for update
    loop
      exit when v_rem_minor <= 0;
      v_alloc_amt := least(v_rem_minor, v_ob.balance_minor);
      if v_alloc_amt > 0 then
        insert into public.payment_allocations (business_id, payment_id, obligation_id, amount_minor, created_by)
        values (p_business, v_payment_id, v_ob.id, v_alloc_amt, auth.uid())
        returning id into v_alloc_id;

        insert into public.obligation_entries (business_id, obligation_id, entry_type, signed_minor, entry_date, payment_allocation_id, memo)
        values (p_business, v_ob.id, 'payment', -v_alloc_amt, v_today, v_alloc_id, 'Cash payment ' || v_ref);

        v_rem_minor := v_rem_minor - v_alloc_amt;
        v_allocated_minor := v_allocated_minor + v_alloc_amt;
      end if;
    end loop;
  end if;

  -- Update unallocated_minor on payment transaction
  perform set_config('hems.internal', 'on', true);
  update public.payment_transactions
  set unallocated_minor = v_rem_minor
  where id = v_payment_id;
  perform set_config('hems.internal', 'off', true);

  -- 8. Customer remaining balance after this cash payment
  select coalesce(sum(balance_minor), 0) into v_new_total
  from public.obligations
  where business_id = p_business and customer_id = p_customer and kind = 'customer_debt'
    and status in ('open', 'partially_paid');

  -- 9. Confirmation SMS
  select * into v_bs from public.business_settings where business_id = p_business;
  select shortcode into v_paybill from public.payment_channels
  where business_id = p_business and provider = 'mpesa_paybill' and is_active order by created_at limit 1;

  if coalesce(v_bs.sms_enabled, false) and v_cust.phone is not null and not coalesce(v_cust.sms_opt_out, false) then
    select body into v_body from public.sms_templates
    where business_id = p_business and is_active
      and key = case when v_new_total = 0 then 'payment_confirmation_paid_in_full' else 'payment_confirmation' end;

    if v_body is not null then
      v_text := public.render_template(v_body, jsonb_build_object(
        'first_name', initcap(split_part(trim(v_cust.full_name), ' ', 1)),
        'customer_name', v_cust.full_name,
        'business_name', v_biz.name,
        'amount', public.fmt_kes(p_amount_minor),
        'previous_balance', public.fmt_kes(v_prev_total),
        'balance', public.fmt_kes(v_new_total),
        'receipt_ref', v_ref,
        'paybill', coalesce(v_paybill, ''),
        'account', v_cust.customer_no
      ));

      insert into public.sms_outbox (business_id, customer_id, kind, to_phone, body, related_payment_id, dedupe_key)
      values (p_business, v_cust.id, 'payment_confirmation', v_cust.phone, v_text, v_payment_id, 'confirm:' || v_payment_id || ':' || v_cust.id)
      on conflict (dedupe_key) do nothing;
      if found then v_sms_queued := 1; end if;
    end if;
  end if;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'transaction_ref', v_ref,
    'amount_minor', p_amount_minor,
    'allocated_minor', v_allocated_minor,
    'unallocated_minor', v_rem_minor,
    'previous_balance_minor', v_prev_total,
    'new_balance_minor', v_new_total,
    'confirmation_sms_queued', v_sms_queued
  );
end $$;
