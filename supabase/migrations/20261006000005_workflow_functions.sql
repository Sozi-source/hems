-- =============================================================================
-- HEMS · Migration 05 · Workflow functions (the only way money moves)
--
--   create_obligation / create_loan / write_off_obligation
--   ingest_payment            (server only)  -> Pending, idempotent
--   assign_payment_business   Pending, unassigned -> a business
--   approve_payment           Pending -> Approved, atomic: allocations + balances
--                             + confirmation SMS + reminder stop, all in ONE transaction
--   reject_payment / reverse_payment
--   generate_recurring_obligations / queue_due_reminders   (server / cron)
-- =============================================================================


-- A business's "today" in ITS timezone (Nairobi is UTC+3; the database runs in UTC).
create or replace function public.business_today(p_business uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone timezone)::date from public.businesses where id = p_business $$;

-- ---------- obligations -----------------------------------------------------
create or replace function public.create_obligation(
  p_business uuid, p_kind public.obligation_kind, p_amount_minor bigint,
  p_customer uuid default null, p_supplier uuid default null, p_staff uuid default null,
  p_category uuid default null, p_payee text default null, p_description text default null,
  p_reference text default null, p_issue_date date default null, p_due_date date default null,
  p_payment_terms text default null, p_recurring uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_issue date; v_tz text; v_due date := p_due_date; v_ref text := p_reference; v_terms int;
begin
  if p_kind = 'customer_debt' then
    perform public.require_role(p_business, array['owner','admin','accountant','cashier']::public.app_role[]);
  else
    perform public.require_role(p_business, array['owner','admin','accountant']::public.app_role[]);
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Amount must be positive' using errcode = '22023';
  end if;

  if p_recurring is not null and p_due_date is not null then      -- idempotent for the recurring job
    select id into v_id from public.obligations where recurring_template_id = p_recurring and due_date = p_due_date;
    if found then return v_id; end if;
  end if;

  select timezone into v_tz from public.businesses where id = p_business;
  v_issue := coalesce(p_issue_date, (now() at time zone v_tz)::date);

  if v_due is null and p_kind = 'supplier_debt' then
    select payment_terms_days into v_terms from public.suppliers where id = p_supplier and business_id = p_business;
    if coalesce(v_terms, 0) > 0 then v_due := v_issue + v_terms; end if;
  end if;

  if v_ref is null then
    v_ref := public.next_number(p_business, p_kind::text,
      case p_kind when 'customer_debt' then 'CD' when 'supplier_debt' then 'SD' when 'loan' then 'LN'
                  when 'bill' then 'BL' when 'expense' then 'EX' when 'salary' then 'SL' else 'SA' end);
  end if;

  insert into public.obligations (business_id, kind, direction, reference_no, customer_id, supplier_id, staff_id,
         category_id, payee_name, description, original_minor, issue_date, due_date, payment_terms, recurring_template_id)
  values (p_business, p_kind,
          case when p_kind in ('customer_debt','staff_advance') then 'receivable' else 'payable' end::public.obligation_direction,
          v_ref, p_customer, p_supplier, p_staff, p_category, p_payee, p_description, p_amount_minor,
          v_issue, v_due, p_payment_terms, p_recurring)
  returning id into v_id;

  insert into public.obligation_entries (business_id, obligation_id, entry_type, signed_minor, entry_date, memo)
  values (p_business, v_id, 'charge', p_amount_minor, v_issue, 'Initial charge');
  return v_id;
end $$;

create or replace function public.create_loan(
  p_business uuid, p_lender text, p_principal_minor bigint, p_interest_rate_pct numeric,
  p_installment_minor bigint, p_frequency public.frequency, p_first_due_date date, p_maturity_date date,
  p_interest_minor bigint default null, p_reference text default null,
  p_issue_date date default null, p_description text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_interest bigint; v_id uuid; v_issue date;
begin
  perform public.require_role(p_business, array['owner','admin','accountant']::public.app_role[]);
  -- Phase 1 supports flat interest. Reducing-balance schedules arrive with the loans UI phase.
  v_interest := coalesce(p_interest_minor, round(p_principal_minor * p_interest_rate_pct / 100.0)::bigint);
  v_id := public.create_obligation(p_business, 'loan', p_principal_minor, null, null, null, null,
            p_lender, p_description, p_reference, p_issue_date, p_maturity_date);
  select issue_date into v_issue from public.obligations where id = v_id;
  if v_interest > 0 then
    insert into public.obligation_entries (business_id, obligation_id, entry_type, signed_minor, entry_date, memo)
    values (p_business, v_id, 'interest', v_interest, v_issue, 'Loan interest');
  end if;
  insert into public.loan_terms (obligation_id, business_id, lender_name, principal_minor, interest_rate_pct,
         interest_minor, installment_minor, frequency, first_due_date, maturity_date)
  values (v_id, p_business, p_lender, p_principal_minor, p_interest_rate_pct, v_interest,
          p_installment_minor, p_frequency, p_first_due_date, p_maturity_date);
  return v_id;
end $$;

create or replace function public.write_off_obligation(p_obligation uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.obligations%rowtype;
begin
  select * into o from public.obligations where id = p_obligation for update;
  if not found then raise exception 'Obligation not found' using errcode = 'P0002'; end if;
  perform public.require_role(o.business_id, array['owner','admin']::public.app_role[]);
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to write off a balance'; end if;
  if o.balance_minor = 0 then raise exception 'Nothing to write off'; end if;
  insert into public.obligation_entries (business_id, obligation_id, entry_type, signed_minor, entry_date, memo)
  values (o.business_id, o.id, 'write_off', -o.balance_minor, public.business_today(o.business_id), p_reason);
end $$;

-- ---------- payment ingest (server only) -----------------------------------
create or replace function public.log_parse_failure(p_source public.payment_source, p_raw text, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_service_call() then raise exception 'Not authorised' using errcode = '42501'; end if;
  insert into public.payment_ingest_log (source, content_sha256, raw, outcome, error)
  values (p_source, encode(sha256(convert_to('failed|' || p_raw, 'UTF8')), 'hex'), p_raw, 'parse_failed', p_error)
  on conflict (content_sha256) do update set seen_count = payment_ingest_log.seen_count + 1, last_seen_at = now();
end $$;

create or replace function public.ingest_payment(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_provider text := nullif(trim(p ->> 'provider'), '');
  v_ref      text := nullif(trim(p ->> 'transaction_ref'), '');
  v_source   public.payment_source := (p ->> 'source')::public.payment_source;
  v_dir      public.payment_direction := coalesce((p ->> 'direction')::public.payment_direction, 'in');
  v_amount   bigint := (p ->> 'amount_minor')::bigint;
  v_raw      text := coalesce(p ->> 'raw_text', p::text);
  v_hash     text;
  v_log_id   bigint; v_log_payment uuid; v_inserted boolean;
  v_channel  public.payment_channels%rowtype;
  v_biz      uuid; v_id uuid; v_ex public.payment_transactions%rowtype;
  v_msisdn   text := public.normalize_msisdn(p ->> 'payer_msisdn');
  v_masked   text := case when (p ->> 'payer_msisdn') like '%*%' then p ->> 'payer_msisdn' end;
  v_flags    text[] := '{}'; v_enriched boolean := false;
begin
  if not public.is_service_call() then raise exception 'Not authorised' using errcode = '42501'; end if;
  if v_provider is null or v_ref is null or v_amount is null or v_amount <= 0 or v_source is null then
    raise exception 'ingest_payment needs provider, transaction_ref, source and a positive amount_minor' using errcode = '22023';
  end if;
  v_hash := encode(sha256(convert_to(v_provider || '|' || v_raw, 'UTF8')), 'hex');

  -- Layer 1: identical message/payload seen before?
  insert into public.payment_ingest_log (source, content_sha256, raw)
  values (v_source, v_hash, v_raw)
  on conflict (content_sha256) do update set seen_count = payment_ingest_log.seen_count + 1, last_seen_at = now()
  returning id, payment_id, (xmax = 0) into v_log_id, v_log_payment, v_inserted;
  if not v_inserted and v_log_payment is not null then
    return jsonb_build_object('outcome', 'duplicate_content', 'payment_id', v_log_payment);
  end if;

  -- Business attribution: a Paybill/Till shortcode belongs to exactly one business.
  if nullif(p ->> 'shortcode', '') is not null then
    select * into v_channel from public.payment_channels where shortcode = p ->> 'shortcode' and is_active limit 1;
    if found then v_biz := v_channel.business_id; else v_flags := array['unknown_shortcode']; end if;
  elsif nullif(p ->> 'business_id', '') is not null then
    select id into v_biz from public.businesses where id = (p ->> 'business_id')::uuid;
  end if;

  -- Layer 2: same transaction reference already recorded (e.g. arrived by C2B and again by SMS).
  insert into public.payment_transactions (business_id, channel_id, provider, transaction_ref, direction, source,
         amount_minor, payer_name, payer_msisdn, payer_msisdn_masked, payer_msisdn_sha256, counterparty_name,
         account_reference, receiving_account, description, occurred_at, suggested_kind, conflict_flags, raw_payload)
  values (v_biz, v_channel.id, v_provider, v_ref, v_dir, v_source, v_amount,
          nullif(trim(p ->> 'payer_name'), ''), v_msisdn, v_masked, nullif(p ->> 'payer_msisdn_sha256', ''),
          nullif(trim(p ->> 'counterparty_name'), ''), nullif(trim(p ->> 'account_reference'), ''),
          nullif(trim(p ->> 'receiving_account'), ''), nullif(p ->> 'description', ''),
          coalesce((p ->> 'occurred_at')::timestamptz, now()),
          nullif(p ->> 'suggested_kind', '')::public.obligation_kind, v_flags,
          coalesce(p -> 'raw', p))
  on conflict (provider, transaction_ref) do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_ex from public.payment_transactions where provider = v_provider and transaction_ref = v_ref for update;
    if v_ex.amount_minor <> v_amount then v_flags := array_append(v_flags, 'amount_mismatch'::text); end if;
    if v_ex.business_id is not null and v_biz is not null and v_ex.business_id <> v_biz then
      v_flags := array_append(v_flags, 'business_mismatch'::text);
    end if;
    v_enriched := (v_ex.payer_name is null and nullif(trim(p ->> 'payer_name'), '') is not null)
               or (v_ex.payer_msisdn is null and v_msisdn is not null)
               or (v_ex.account_reference is null and nullif(trim(p ->> 'account_reference'), '') is not null);
    update public.payment_transactions t set
      payer_name          = coalesce(t.payer_name, nullif(trim(p ->> 'payer_name'), '')),
      payer_msisdn        = coalesce(t.payer_msisdn, v_msisdn),
      payer_msisdn_masked = coalesce(t.payer_msisdn_masked, v_masked),
      payer_msisdn_sha256 = coalesce(t.payer_msisdn_sha256, nullif(p ->> 'payer_msisdn_sha256', '')),
      counterparty_name   = coalesce(t.counterparty_name, nullif(trim(p ->> 'counterparty_name'), '')),
      account_reference   = coalesce(t.account_reference, nullif(trim(p ->> 'account_reference'), '')),
      receiving_account   = coalesce(t.receiving_account, nullif(trim(p ->> 'receiving_account'), '')),
      business_id         = case when t.business_id is null and t.status = 'pending' then v_biz else t.business_id end,
      channel_id          = case when t.business_id is null and t.status = 'pending' and v_biz is not null
                                 then v_channel.id else t.channel_id end,
      conflict_flags      = array(select distinct f from unnest(t.conflict_flags || v_flags) f)
    where t.id = v_ex.id;
    update public.payment_ingest_log set payment_id = v_ex.id,
           outcome = case when v_enriched then 'enriched' else 'duplicate_ref' end where id = v_log_id;
    return jsonb_build_object('outcome', case when v_enriched then 'enriched' else 'duplicate_ref' end,
                              'payment_id', v_ex.id, 'flags', to_jsonb(v_flags));
  end if;

  update public.payment_ingest_log set payment_id = v_id, outcome = 'created' where id = v_log_id;
  return jsonb_build_object('outcome', 'created', 'payment_id', v_id, 'business_id', v_biz, 'status', 'pending');
end $$;

-- ---------- assign / approve / reject / reverse ----------------------------
create or replace function public.assign_payment_business(p_payment_id uuid, p_business uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.payment_transactions%rowtype;
begin
  select * into t from public.payment_transactions where id = p_payment_id for update;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if t.status <> 'pending' then raise exception 'Only pending payments can be assigned (status: %)', t.status using errcode = '55000'; end if;
  perform public.require_role(p_business, array['owner','admin']::public.app_role[]);
  if t.business_id is not null then perform public.require_role(t.business_id, array['owner','admin']::public.app_role[]); end if;
  perform set_config('hems.internal', 'on', true);
  update public.payment_transactions set business_id = p_business, channel_id = null where id = t.id;
  perform set_config('hems.internal', 'off', true);
  delete from public.match_candidates where payment_id = t.id;
end $$;

create or replace function public.approve_payment(
  p_payment_id uuid, p_allocations jsonb default '[]'::jsonb, p_business uuid default null, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t public.payment_transactions%rowtype; v_biz uuid; a record; o public.obligations%rowtype;
  v_sum bigint := 0; v_alloc uuid; v_sms int := 0; c record; cust public.customers%rowtype;
  bs public.business_settings%rowtype; biz public.businesses%rowtype;
  v_new_total bigint; v_prev bigint; v_body text; v_text text; v_phone_paybill text;
begin
  select * into t from public.payment_transactions where id = p_payment_id for update;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if t.status <> 'pending' then
    raise exception 'Payment is already % and cannot be approved again', t.status using errcode = '55000';
  end if;

  v_biz := coalesce(t.business_id, p_business);
  if v_biz is null then raise exception 'Assign a business before approving this payment' using errcode = '22023'; end if;
  if t.business_id is not null and p_business is not null and p_business <> t.business_id then
    raise exception 'Business mismatch: payment belongs to a different business' using errcode = '22023';
  end if;
  perform public.require_role(v_biz, array['owner','admin','accountant']::public.app_role[]);
  if t.business_id is null then perform public.assign_payment_business(t.id, v_biz); end if;

  if jsonb_typeof(p_allocations) <> 'array' then raise exception 'allocations must be a JSON array' using errcode = '22023'; end if;
  if jsonb_array_length(p_allocations) = 0 and coalesce(trim(p_note), '') = '' then
    raise exception 'Add a note when approving without allocating to any debt/bill' using errcode = '22023';
  end if;

  select coalesce(sum((e ->> 'amount_minor')::bigint), 0) into v_sum from jsonb_array_elements(p_allocations) e;
  if v_sum > t.amount_minor then
    raise exception 'Allocations (%) exceed the payment amount (%)', v_sum, t.amount_minor using errcode = '23514';
  end if;

  for a in select (e ->> 'obligation_id')::uuid as obligation_id, (e ->> 'amount_minor')::bigint as amt
             from jsonb_array_elements(p_allocations) e order by 1 loop      -- stable lock order
    if a.amt is null or a.amt <= 0 then raise exception 'Each allocation needs a positive amount_minor' using errcode = '22023'; end if;
    select * into o from public.obligations where id = a.obligation_id for update;
    if not found or o.business_id <> v_biz then
      raise exception 'Obligation does not belong to this payment''s business' using errcode = '22023';
    end if;
    if (t.direction = 'in') <> (o.direction = 'receivable') then
      raise exception 'Payment direction does not match the obligation type (%)', o.kind using errcode = '22023';
    end if;
    if a.amt > o.balance_minor then
      raise exception 'Allocation % exceeds outstanding balance % on %', a.amt, o.balance_minor, o.reference_no using errcode = '23514';
    end if;
    insert into public.payment_allocations (business_id, payment_id, obligation_id, amount_minor)
    values (v_biz, t.id, o.id, a.amt) returning id into v_alloc;
    insert into public.obligation_entries (business_id, obligation_id, entry_type, signed_minor, entry_date, payment_allocation_id, memo)
    values (v_biz, o.id, 'payment', -a.amt, public.business_today(v_biz), v_alloc, 'Payment ' || t.transaction_ref);
  end loop;

  perform set_config('hems.internal', 'on', true);
  update public.payment_transactions
     set status = 'approved', unallocated_minor = t.amount_minor - v_sum, decided_by = auth.uid(),
         decided_at = now(), decision_note = p_note
   where id = t.id;
  perform set_config('hems.internal', 'off', true);

  -- Confirmation SMS: only after approval, one per customer, editable template, idempotent.
  select * into bs  from public.business_settings where business_id = v_biz;
  select * into biz from public.businesses where id = v_biz;
  select shortcode into v_phone_paybill from public.payment_channels
   where business_id = v_biz and provider = 'mpesa_paybill' and is_active order by created_at limit 1;

  if t.direction = 'in' then
    for c in select o2.customer_id, sum(pa.amount_minor)::bigint as alloc_minor
               from public.payment_allocations pa join public.obligations o2 on o2.id = pa.obligation_id
              where pa.payment_id = t.id and o2.kind = 'customer_debt' group by o2.customer_id loop
      select * into cust from public.customers where id = c.customer_id;
      select coalesce(sum(balance_minor), 0) into v_new_total from public.obligations
       where business_id = v_biz and customer_id = c.customer_id and kind = 'customer_debt'
         and status in ('open','partially_paid');
      v_prev := v_new_total + c.alloc_minor;
      continue when cust.phone is null or cust.sms_opt_out or not coalesce(bs.sms_enabled, false);
      select body into v_body from public.sms_templates
       where business_id = v_biz and is_active
         and key = case when v_new_total = 0 then 'payment_confirmation_paid_in_full' else 'payment_confirmation' end;
      continue when v_body is null;
      v_text := public.render_template(v_body, jsonb_build_object(
        'first_name', initcap(split_part(trim(cust.full_name), ' ', 1)), 'customer_name', cust.full_name,
        'business_name', biz.name, 'amount', public.fmt_kes(c.alloc_minor),
        'previous_balance', public.fmt_kes(v_prev), 'balance', public.fmt_kes(v_new_total),
        'receipt_ref', t.transaction_ref, 'paybill', coalesce(v_phone_paybill, ''), 'account', cust.customer_no));
      insert into public.sms_outbox (business_id, customer_id, kind, to_phone, body, related_payment_id, dedupe_key)
      values (v_biz, cust.id, 'payment_confirmation', cust.phone, v_text, t.id, 'confirm:' || t.id || ':' || cust.id)
      on conflict (dedupe_key) do nothing;
      if found then v_sms := v_sms + 1; end if;
    end loop;
  end if;

  return jsonb_build_object('payment_id', t.id, 'status', 'approved', 'allocated_minor', v_sum,
                            'unallocated_minor', t.amount_minor - v_sum, 'confirmation_sms_queued', v_sms);
end $$;

create or replace function public.reject_payment(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.payment_transactions%rowtype;
begin
  select * into t from public.payment_transactions where id = p_payment_id for update;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if t.status <> 'pending' then raise exception 'Payment is already %', t.status using errcode = '55000'; end if;
  if t.business_id is null then
    if not (public.is_service_call() or public.is_platform_admin()) then
      raise exception 'Not authorised' using errcode = '42501';
    end if;
  else
    perform public.require_role(t.business_id, array['owner','admin','accountant']::public.app_role[]);
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to reject a payment' using errcode = '22023'; end if;
  perform set_config('hems.internal', 'on', true);
  update public.payment_transactions set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
         decision_note = p_reason where id = t.id;
  perform set_config('hems.internal', 'off', true);
end $$;

create or replace function public.reverse_payment(p_payment_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.payment_transactions%rowtype; al record; e public.obligation_entries%rowtype; v_n int := 0;
begin
  select * into t from public.payment_transactions where id = p_payment_id for update;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if t.status <> 'approved' then raise exception 'Only approved payments can be reversed (status: %)', t.status using errcode = '55000'; end if;
  perform public.require_role(t.business_id, array['owner','admin']::public.app_role[]);
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to reverse a payment' using errcode = '22023'; end if;

  for al in select * from public.payment_allocations where payment_id = t.id and reversed_at is null order by obligation_id loop
    perform 1 from public.obligations where id = al.obligation_id for update;
    select * into e from public.obligation_entries where payment_allocation_id = al.id and entry_type = 'payment';
    insert into public.obligation_entries (business_id, obligation_id, entry_type, signed_minor, entry_date, reverses_entry_id, memo)
    values (t.business_id, al.obligation_id, 'reversal', al.amount_minor, public.business_today(t.business_id), e.id,
            'Reversal of ' || t.transaction_ref || ': ' || p_reason);
    update public.payment_allocations set reversed_at = now(), reversed_by = auth.uid() where id = al.id;
    v_n := v_n + 1;
  end loop;
  perform set_config('hems.internal', 'on', true);
  update public.payment_transactions set status = 'reversed', decision_note = coalesce(decision_note || ' | ', '') || 'Reversed: ' || p_reason
   where id = t.id;
  perform set_config('hems.internal', 'off', true);
  return jsonb_build_object('payment_id', t.id, 'status', 'reversed', 'allocations_reversed', v_n);
end $$;

-- ---------- recurring obligations (server / cron) --------------------------
create or replace function public.generate_recurring_obligations(p_today date default null) returns integer
language plpgsql security definer set search_path = public as $$
declare t public.recurring_templates%rowtype; v_today date; v_n int := 0; v_next date; v_desc text; v_tz text; v_before int;
begin
  if not public.is_service_call() then raise exception 'Not authorised' using errcode = '42501'; end if;
  for t in select * from public.recurring_templates where is_active order by id for update skip locked loop
    select timezone into v_tz from public.businesses where id = t.business_id;
    v_today := coalesce(p_today, (now() at time zone v_tz)::date);
    v_next := t.next_due_date;
    while v_next - t.generate_days_ahead <= v_today loop
      v_desc := coalesce(t.description, t.payee_name, 'Recurring') || ' - ' || to_char(v_next, 'Mon YYYY');
      select count(*) into v_before from public.obligations where recurring_template_id = t.id and due_date = v_next;
      perform public.create_obligation(t.business_id, t.kind, t.amount_minor, null, t.supplier_id, t.staff_id,
              t.category_id, t.payee_name, v_desc, null, v_today, v_next, 'Recurring ' || t.frequency::text, t.id);
      if v_before = 0 then v_n := v_n + 1; end if;
      update public.recurring_templates set last_generated_due = v_next where id = t.id;
      v_next := public.next_occurrence(v_next, t.frequency, t.anchor_day);
    end loop;
    update public.recurring_templates set next_due_date = v_next where id = t.id;
  end loop;
  return v_n;
end $$;

-- ---------- reminders (server / cron) --------------------------------------
-- Messages are rendered NOW from the CURRENT balance, so a partial payment automatically
-- changes the amount in the next reminder, and a cleared debt is never picked up at all.
create or replace function public.queue_due_reminders(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record; v_off int; v_today date; v_anchor date; v_target date; v_run uuid; v_n int := 0;
  v_body text; v_text text; v_sms uuid; v_paybill text; cust public.customers%rowtype; v_when timestamptz;
begin
  if not public.is_service_call() then raise exception 'Not authorised' using errcode = '42501'; end if;
  for r in
    select s.id as schedule_id, s.created_at as sched_created, s.business_id, s.obligation_id, s.recipient, s.anchor, s.offsets_days,
           s.template_key, s.custom_message, o.kind, o.balance_minor, o.original_minor, o.due_date, o.issue_date,
           o.reference_no, o.customer_id, o.payee_name, o.description,
           b.timezone, b.name as business_name, bs.sms_enabled, bs.reminder_send_hour
      from public.reminder_schedules s
      join public.obligations o on o.id = s.obligation_id
      join public.businesses b on b.id = s.business_id
      join public.business_settings bs on bs.business_id = s.business_id
     where s.status = 'active' and o.status in ('open','partially_paid') and o.balance_minor > 0 and b.is_active
  loop
    v_today  := (p_now at time zone r.timezone)::date;
    v_anchor := public.reminder_anchor_date(r.obligation_id, r.anchor);
    continue when v_anchor is null;
    foreach v_off in array r.offsets_days loop
      v_target := v_anchor + v_off;
      continue when v_target < v_today - 1 or v_target > v_today;      -- today, or yesterday if the job was down
      continue when v_target < (r.sched_created at time zone r.timezone)::date;  -- never backdate reminders for a new schedule
      insert into public.reminder_runs (business_id, schedule_id, obligation_id, anchor_date, offset_days)
      values (r.business_id, r.schedule_id, r.obligation_id, v_anchor, v_off)
      on conflict (schedule_id, anchor_date, offset_days) do nothing returning id into v_run;
      continue when v_run is null;                                      -- already fired for this cycle

      if r.recipient = 'owner' then
        insert into public.notifications (business_id, kind, title, body, obligation_id, dedupe_key)
        values (r.business_id, 'obligation_due',
                coalesce(r.description, r.payee_name, r.reference_no) || ' - ' || public.fmt_kes(r.balance_minor),
                case when v_off < 0 then 'Due in ' || (-v_off) || ' day(s)' when v_off = 0 then 'Due today'
                     else v_off || ' day(s) overdue' end,
                r.obligation_id, 'obl:' || v_run)
        on conflict do nothing;
        update public.reminder_runs set status = 'sent', note = 'in-app' where id = v_run;
        v_n := v_n + 1;
        continue;
      end if;

      select * into cust from public.customers where id = r.customer_id;
      if not coalesce(r.sms_enabled, false) or cust.phone is null or cust.sms_opt_out then
        update public.reminder_runs set status = 'skipped',
               note = case when cust.sms_opt_out then 'Customer opted out' when cust.phone is null then 'No phone number'
                           else 'SMS disabled for business' end where id = v_run;
        continue;
      end if;
      v_body := coalesce(r.custom_message,
                  (select body from public.sms_templates where business_id = r.business_id
                      and key = coalesce(r.template_key, 'customer_reminder') and is_active));
      if v_body is null then
        update public.reminder_runs set status = 'skipped', note = 'No active template' where id = v_run; continue;
      end if;
      select shortcode into v_paybill from public.payment_channels
       where business_id = r.business_id and provider = 'mpesa_paybill' and is_active order by created_at limit 1;
      v_text := public.render_template(v_body, jsonb_build_object(
        'first_name', initcap(split_part(trim(cust.full_name), ' ', 1)), 'customer_name', cust.full_name,
        'business_name', r.business_name, 'balance', public.fmt_kes(r.balance_minor),
        'original', public.fmt_kes(r.original_minor), 'reference', coalesce(r.reference_no, ''),
        'due_date', coalesce(to_char(r.due_date, 'DD Mon YYYY'), ''),
        'days_overdue', greatest(0, v_today - coalesce(r.due_date, r.issue_date)),
        'paybill', coalesce(v_paybill, ''), 'account', cust.customer_no));
      v_when := greatest(p_now, ((v_today + make_interval(hours => r.reminder_send_hour))::timestamp at time zone r.timezone));
      insert into public.sms_outbox (business_id, customer_id, kind, to_phone, body, related_obligation_id,
                                     dedupe_key, scheduled_at)
      values (r.business_id, cust.id, 'reminder', cust.phone, v_text, r.obligation_id, 'reminder:' || v_run, v_when)
      returning id into v_sms;
      update public.reminder_runs set sms_id = v_sms where id = v_run;
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end $$;
