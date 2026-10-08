-- HEMS core workflow test. Runs inside one transaction and rolls back.
-- Usage (plain Postgres): psql -v ON_ERROR_STOP=1 -d hems_test -f tests/_stub_supabase.sql
--                         (then migrations in order, then seed.sql, then this file)
-- Usage (Supabase local): supabase db reset && psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/001_core_workflow.sql
\set ON_ERROR_STOP on
\set as_owner   'reset role; reset session authorization; set session authorization authenticator_stub; set role authenticated; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}'', false) \\gset'
\set as_cashier 'reset role; reset session authorization; set session authorization authenticator_stub; set role authenticated; select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}'', false) \\gset'
\set as_system  'reset role; reset session authorization; select set_config(''request.jwt.claims'', '''', false) \\gset'
begin;

-- ===== fixtures (as DB admin = trusted server) ===============================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'cashier@example.com');
insert into public.business_members (business_id, user_id, role)
  select id, '00000000-0000-0000-0000-0000000000a1', 'owner' from public.businesses;
insert into public.business_members (business_id, user_id, role)
  select id, '00000000-0000-0000-0000-0000000000a2', 'cashier' from public.businesses where code = 'HARON_FASHION';
insert into public.payment_channels (business_id, provider, shortcode, label)
  select id, 'mpesa_paybill', case code when 'HARON_FASHION' then '400100' else '400200' end, code from public.businesses;

do $$
declare h uuid; z uuid; john uuid; mary uuid; stf uuid;
begin
  select id into h from public.businesses where code = 'HARON_FASHION';
  select id into z from public.businesses where code = 'ZENITH_PLAST';
  insert into public.customers (business_id, full_name, phone) values (h, 'John Kamau', '0712345678') returning id into john;
  insert into public.customers (business_id, full_name, phone) values (z, 'Mary Wanjiru', '0722000111') returning id into mary;
  assert (select customer_no from public.customers where id = john) = 'C0001', 'customer_no auto-generated';
  assert (select phone from public.customers where id = john) = '254712345678', 'phone normalised';
  perform public.create_obligation(h, 'customer_debt', 3000000, p_customer => john, p_description => 'o1', p_due_date => (now() at time zone 'Africa/Nairobi')::date - 5);
  perform public.create_obligation(z, 'customer_debt', 700000,  p_customer => mary, p_description => 'z1', p_due_date => (now() at time zone 'Africa/Nairobi')::date + 30);
  assert (select balance_minor from public.obligations where description = 'o1') = 3000000;
  assert (select offsets_days from public.reminder_schedules s join public.obligations o on o.id = s.obligation_id where o.description = 'o1') = '{3,7,14,30}', 'default 3/7/14/30 schedule';
  -- cross-business reference is impossible at DB level
  begin
    perform public.create_obligation(h, 'customer_debt', 100, p_customer => mary);
    raise exception 'EXPECTED FK failure: Haron debt pointing at Zenith customer';
  exception when foreign_key_violation then null; end;
end $$;

-- ===== 1. ingest: Pending, business from Paybill, never duplicated ============
do $$
declare r jsonb;
begin
  r := public.ingest_payment(jsonb_build_object('provider','mpesa','transaction_ref','ABC123XYZ','source','daraja_c2b',
        'amount_minor',1000000,'payer_name','JOHN KAMAU','payer_msisdn','254712345678','shortcode','400100',
        'account_reference','C0001','raw_text','raw-1'));
  assert r->>'outcome' = 'created';
  assert (select status from public.payment_transactions where transaction_ref='ABC123XYZ') = 'pending', 'starts Pending';
  assert (select b.code from public.payment_transactions p join public.businesses b on b.id=p.business_id where transaction_ref='ABC123XYZ') = 'HARON_FASHION', 'Paybill 400100 -> Haron';
  -- same SMS/payload read again (and again)
  r := public.ingest_payment(jsonb_build_object('provider','mpesa','transaction_ref','ABC123XYZ','source','daraja_c2b',
        'amount_minor',1000000,'payer_name','JOHN KAMAU','payer_msisdn','254712345678','shortcode','400100',
        'account_reference','C0001','raw_text','raw-1'));
  assert r->>'outcome' = 'duplicate_content';
  perform public.ingest_payment(jsonb_build_object('provider','mpesa','transaction_ref','ABC123XYZ','source','daraja_c2b',
        'amount_minor',1000000,'shortcode','400100','raw_text','raw-1'));
  -- same transaction arriving via a different channel (SMS text) -> merged, not duplicated
  r := public.ingest_payment(jsonb_build_object('provider','mpesa','transaction_ref','ABC123XYZ','source','sms_paste',
        'amount_minor',1000000,'payer_name','JOHN KAMAU','raw_text','SMS: ABC123XYZ Confirmed...'));
  assert r->>'outcome' in ('duplicate_ref','enriched');
  -- conflicting amount for the same ref is flagged, never overwritten
  r := public.ingest_payment(jsonb_build_object('provider','mpesa','transaction_ref','ABC123XYZ','source','sms_paste',
        'amount_minor',999,'raw_text','tampered'));
  assert (select amount_minor from public.payment_transactions where transaction_ref='ABC123XYZ') = 1000000;
  assert (select 'amount_mismatch' = any(conflict_flags) from public.payment_transactions where transaction_ref='ABC123XYZ');
  assert (select count(*) from public.payment_transactions where transaction_ref='ABC123XYZ') = 1, 'exactly one record';
  assert (select seen_count from public.payment_ingest_log where content_sha256 = encode(sha256(convert_to('mpesa|raw-1','UTF8')),'hex')) >= 3;
  -- debt untouched while Pending
  assert (select balance_minor from public.obligations where description='o1') = 3000000, 'Pending must not change balances';
end $$;

-- ===== 2. permissions ========================================================
:as_cashier
do $$ begin
  perform public.approve_payment((select id from public.payment_transactions where transaction_ref='ABC123XYZ'),
     jsonb_build_array(jsonb_build_object('obligation_id',(select id from public.obligations where description='o1'),'amount_minor',1000000)));
  raise exception 'EXPECTED: cashier must not approve';
exception when sqlstate '42501' then null; end $$;
do $$ begin
  perform public.ingest_payment('{}'::jsonb);
  raise exception 'EXPECTED: browser users must not call ingest_payment';
exception when sqlstate '42501' then null; end $$;
do $$ begin
  assert (select count(*) from public.customers) = 1, 'cashier sees only Haron customers';
  assert (select count(*) from public.v_business_dashboard) = 1, 'cashier dashboard shows only Haron';
  assert (select count(*) from public.audit_log) = 0, 'cashier cannot read audit';
end $$;

-- ===== 3. approve (owner): balances, SMS, immutability ========================
:as_owner
do $$
declare r jsonb;
begin
  assert (select count(*) from public.customers) = 2, 'owner sees both businesses';
  -- over-allocating a payment, or exceeding a balance, is rejected
  begin
    perform public.approve_payment((select id from public.payment_transactions where transaction_ref='ABC123XYZ'),
      jsonb_build_array(jsonb_build_object('obligation_id',(select id from public.obligations where description='o1'),'amount_minor',1000001)));
    raise exception 'EXPECTED: allocation > payment';
  exception when sqlstate '23514' then null; end;
  -- allocating to the other business's debt is rejected
  begin
    perform public.approve_payment((select id from public.payment_transactions where transaction_ref='ABC123XYZ'),
      jsonb_build_array(jsonb_build_object('obligation_id',(select id from public.obligations where description='z1'),'amount_minor',100)));
    raise exception 'EXPECTED: cross-business allocation';
  exception when sqlstate '22023' then null; end;

  r := public.approve_payment((select id from public.payment_transactions where transaction_ref='ABC123XYZ'),
      jsonb_build_array(jsonb_build_object('obligation_id',(select id from public.obligations where description='o1'),'amount_minor',1000000)));
  assert r->>'status' = 'approved' and (r->>'confirmation_sms_queued')::int = 1;
  assert (select balance_minor from public.obligations where description='o1') = 2000000, 'debt reduced';
  assert (select status from public.obligations where description='o1') = 'partially_paid';
  assert (select s.body from public.sms_outbox s join public.payment_transactions p on p.id=s.related_payment_id where p.transaction_ref='ABC123XYZ')
       = 'Dear John, we have received your payment of KSh 10,000. Thank you. Your remaining balance is KSh 20,000.', 'confirmation SMS text';
  -- approving twice is impossible
  begin
    perform public.approve_payment((select id from public.payment_transactions where transaction_ref='ABC123XYZ'),
      jsonb_build_array(jsonb_build_object('obligation_id',(select id from public.obligations where description='o1'),'amount_minor',1000000)));
    raise exception 'EXPECTED: double approval';
  exception when sqlstate '55000' then null; end;
  assert (select balance_minor from public.obligations where description='o1') = 2000000, 'no double deduction';
end $$;
do $$ begin
  update public.obligations set balance_minor = 0 where description = 'o1';
  raise exception 'EXPECTED: direct balance edit blocked';
exception when sqlstate '55000' then null; end $$;
do $$ declare n int; begin
  update public.obligation_entries set memo = 'tamper'; get diagnostics n = row_count;
  assert n = 0, 'users cannot edit ledger rows (RLS)';
  delete from public.obligation_entries; get diagnostics n = row_count;
  assert n = 0, 'users cannot delete ledger rows (RLS)';
end $$;
do $$ begin
  insert into public.obligation_entries (business_id, obligation_id, entry_type, signed_minor)
    select business_id, id, 'payment', -1 from public.obligations where description='o1';
  raise exception 'EXPECTED: users cannot post entries directly';
exception when insufficient_privilege then null; end $$;
do $$ declare n int; begin
  update public.audit_log set action = 'x'; get diagnostics n = row_count;
  assert n = 0, 'users cannot edit audit rows (RLS)';
end $$;

-- ===== 4. pay in full -> PAID IN FULL, reminders stop; reversal restores =======
:as_system
do $$ begin
  update public.obligation_entries set memo = 'tamper';
  raise exception 'EXPECTED: ledger is append-only even for admins';
exception when sqlstate '55000' then null; end $$;
do $$ begin
  delete from public.audit_log;
  raise exception 'EXPECTED: audit log is immutable even for admins';
exception when sqlstate '55000' then null; end $$;
select public.ingest_payment(jsonb_build_object('provider','mpesa','transaction_ref','PAY2','source','daraja_c2b',
  'amount_minor',2000000,'payer_name','JOHN KAMAU','payer_msisdn','254712345678','shortcode','400100','raw_text','raw-pay2')) \gset
:as_owner
do $$
declare r jsonb;
begin
  r := public.approve_payment((select id from public.payment_transactions where transaction_ref='PAY2'),
      jsonb_build_array(jsonb_build_object('obligation_id',(select id from public.obligations where description='o1'),'amount_minor',2000000)));
  assert (select status from public.obligations where description='o1') = 'paid';
  assert (select s.body from public.sms_outbox s join public.payment_transactions p on p.id=s.related_payment_id where p.transaction_ref='PAY2') like '%PAID IN FULL%', 'paid-in-full SMS';
  assert (select s.status from public.reminder_schedules s join public.obligations o on o.id=s.obligation_id where o.description='o1') = 'completed', 'reminders stop when cleared';
  -- reverse it
  r := public.reverse_payment((select id from public.payment_transactions where transaction_ref='PAY2'), 'Bounced / entered in error');
  assert (select balance_minor from public.obligations where description='o1') = 2000000, 'reversal restores balance';
  assert (select status from public.obligations where description='o1') = 'partially_paid';
  assert (select s.status from public.reminder_schedules s join public.obligations o on o.id=s.obligation_id where o.description='o1') = 'active', 'reminders resume';
  begin
    perform public.reverse_payment((select id from public.payment_transactions where transaction_ref='PAY2'), 'again');
    raise exception 'EXPECTED: double reversal';
  exception when sqlstate '55000' then null; end;
end $$;

-- ===== 5. overpayment, direction rules, unassigned inbox =======================
:as_system
select public.ingest_payment(jsonb_build_object('provider','mpesa','transaction_ref','OVR1','source','daraja_c2b',
  'amount_minor',700000,'payer_name','JOHN KAMAU','shortcode','400100','raw_text','raw-ovr')) \gset
select public.ingest_payment(jsonb_build_object('provider','mpesa','transaction_ref','UNK1','source','sms_paste',
  'amount_minor',123400,'payer_name','SOMEONE ELSE','raw_text','raw-unk')) \gset
:as_owner
do $$
declare john uuid; h uuid; z uuid; r jsonb;
begin
  select id into john from public.customers where full_name='John Kamau';
  select id into h from public.businesses where code='HARON_FASHION';
  select id into z from public.businesses where code='ZENITH_PLAST';
  perform public.create_obligation(h, 'customer_debt', 500000, p_customer => john, p_description => 'o2');
  r := public.approve_payment((select id from public.payment_transactions where transaction_ref='OVR1'),
      jsonb_build_array(jsonb_build_object('obligation_id',(select id from public.obligations where description='o2'),'amount_minor',500000)));
  assert (r->>'unallocated_minor')::bigint = 200000, 'overpayment kept as unallocated credit';
  assert (select count(*) from public.v_unallocated_credits) = 1;

  -- unassigned payment: no business -> must be assigned first
  assert (select business_id from public.payment_transactions where transaction_ref='UNK1') is null;
  begin
    perform public.approve_payment((select id from public.payment_transactions where transaction_ref='UNK1'), '[]', null, 'note');
    raise exception 'EXPECTED: unassigned payment cannot be approved';
  exception when sqlstate '22023' then null; end;
  perform public.assign_payment_business((select id from public.payment_transactions where transaction_ref='UNK1'), z);
  begin
    perform public.approve_payment((select id from public.payment_transactions where transaction_ref='UNK1'), '[]');
    raise exception 'EXPECTED: approving with no allocation needs a note';
  exception when sqlstate '22023' then null; end;
  r := public.approve_payment((select id from public.payment_transactions where transaction_ref='UNK1'), '[]', null, 'Held as customer credit');
  assert (r->>'unallocated_minor')::bigint = 123400;
  -- an incoming payment cannot settle a payable
  perform public.create_obligation(h, 'bill', 100000, p_payee => 'KPLC', p_description => 'power');
end $$;
:as_system
select public.ingest_payment(jsonb_build_object('provider','mpesa','transaction_ref','IN-TO-BILL','source','daraja_c2b',
  'amount_minor',100000,'shortcode','400100','raw_text','raw-bill')) \gset
:as_owner
do $$ begin
  perform public.approve_payment((select id from public.payment_transactions where transaction_ref='IN-TO-BILL'),
     jsonb_build_array(jsonb_build_object('obligation_id',(select id from public.obligations where description='power'),'amount_minor',100000)));
  raise exception 'EXPECTED: money-in cannot pay a bill';
exception when sqlstate '22023' then null; end $$;
:as_cashier
do $$ begin assert (select count(*) from public.payment_transactions where business_id is null) = 0, 'unassigned inbox hidden from non-admins'; end $$;

-- ===== 6. reminders: due-date logic, no duplicates, current balance, auto-stop ==
:as_system
do $$
declare h uuid; john uuid; n int;
begin
  select id into h from public.businesses where code='HARON_FASHION';
  select id into john from public.customers where full_name='John Kamau';
  perform public.create_obligation(h, 'customer_debt', 400000, p_customer => john, p_description => 'rem', p_due_date => (now() at time zone 'Africa/Nairobi')::date - 7);
  n := public.queue_due_reminders();
  assert n = 1, format('exactly one reminder due today (got %s)', n);
  assert (select count(*) from public.v_reminders_due) = 0, 'once queued it is no longer "due"';
  assert public.queue_due_reminders() = 0, 'running the job again sends nothing';
  assert exists (select 1 from public.sms_outbox where kind='reminder' and body like '%KSh 4,000%'), 'reminder shows balance';
end $$;
select public.ingest_payment(jsonb_build_object('provider','mpesa','transaction_ref','PART1','source','daraja_c2b',
  'amount_minor',100000,'payer_name','JOHN KAMAU','shortcode','400100','raw_text','raw-part')) \gset
:as_owner
select public.approve_payment((select id from public.payment_transactions where transaction_ref='PART1'),
  jsonb_build_array(jsonb_build_object('obligation_id',(select id from public.obligations where description='rem'),'amount_minor',100000))) \gset
:as_system
do $$
declare n int;
begin
  -- 7 days later the 14-day reminder fires with the NEW balance
  n := public.queue_due_reminders(now() + interval '7 days');
  assert (select count(*) from public.sms_outbox where kind='reminder') = 2;
  assert exists (select 1 from public.sms_outbox where kind='reminder' and body like '%KSh 3,000%'), 'continues with new balance after partial payment';
end $$;
select public.ingest_payment(jsonb_build_object('provider','mpesa','transaction_ref','PART2','source','daraja_c2b',
  'amount_minor',300000,'payer_name','JOHN KAMAU','shortcode','400100','raw_text','raw-part2')) \gset
:as_owner
select public.approve_payment((select id from public.payment_transactions where transaction_ref='PART2'),
  jsonb_build_array(jsonb_build_object('obligation_id',(select id from public.obligations where description='rem'),'amount_minor',300000))) \gset
:as_system
do $$
declare before_runs int; n int;
begin
  select count(*) into before_runs from public.reminder_runs r join public.obligations o on o.id=r.obligation_id where o.description='rem';
  n := public.queue_due_reminders(now() + interval '23 days');
  assert (select count(*) from public.reminder_runs r join public.obligations o on o.id=r.obligation_id where o.description='rem') = before_runs, 'no reminders once cleared';
  assert (select count(*) from public.sms_outbox where kind='reminder' and status='queued') = 0, 'queued reminders cancelled on clear';
end $$;

-- ===== 7. recurring obligations, loans, outgoing payments ======================
do $$
declare h uuid; cat uuid; n int; l uuid;
begin
  select id into h from public.businesses where code='HARON_FASHION';
  select id into cat from public.expense_categories where business_id=h and name='Rent';
  insert into public.recurring_templates (business_id, kind, category_id, payee_name, description, amount_minor, frequency, next_due_date)
    values (h, 'bill', cat, 'Landlord', 'Rent', 5000000, 'monthly', (now() at time zone 'Africa/Nairobi')::date + 5);
  n := public.generate_recurring_obligations();
  assert n = 1, 'next obligation created ahead of time';
  assert public.generate_recurring_obligations() = 0, 'idempotent';
  assert (select count(*) from public.obligations where description like 'Rent - %') = 1;
  assert (select next_due_date from public.recurring_templates) > (now() at time zone 'Africa/Nairobi')::date + 20, 'template advanced to next month';
  assert (select recipient from public.reminder_schedules s join public.obligations o on o.id=s.obligation_id where o.description like 'Rent - %') = 'owner';

  l := public.create_loan(h, 'Equity Bank', 10000000, 10, 1100000, 'monthly', (now() at time zone 'Africa/Nairobi')::date + 10, (now() at time zone 'Africa/Nairobi')::date + 310);
  assert (select total_payable_minor from public.v_loan_overview where obligation_id = l) = 11000000, 'interest 10% flat';
  assert (select next_repayment_date from public.v_loan_overview where obligation_id = l) = (now() at time zone 'Africa/Nairobi')::date + 10;
end $$;
select public.ingest_payment(jsonb_build_object('provider','mpesa','transaction_ref','LOANPAY1','source','sms_paste','direction','out',
  'amount_minor',1100000,'counterparty_name','EQUITY BANK','business_id',(select id::text from public.businesses where code='HARON_FASHION'),
  'raw_text','raw-loan')) \gset
:as_owner
do $$ begin
  perform public.approve_payment((select id from public.payment_transactions where transaction_ref='LOANPAY1'),
     jsonb_build_array(jsonb_build_object('obligation_id',(select id from public.obligations where kind='loan'),'amount_minor',1100000)));
  assert (select amount_paid_minor from public.v_loan_overview) = 1100000;
  assert (select outstanding_minor from public.v_loan_overview) = 9900000;
  assert (select next_repayment_date from public.v_loan_overview) = (now() at time zone 'Africa/Nairobi')::date + 10 + interval '1 month', 'next repayment advances';
end $$;

-- ===== 8. dashboards, statements, audit ========================================
do $$
declare hz bigint; zz bigint;
begin
  select customers_owing_minor into zz from public.v_business_dashboard where code='ZENITH_PLAST';
  select customers_owing_minor into hz from public.v_business_dashboard where code='HARON_FASHION';
  assert zz = 700000, 'Zenith sees only its own debt';
  assert hz = 2000000 + 0, format('Haron owing = John o1 balance only (got %s)', hz);
  assert (select customers_owing_minor from public.v_master_dashboard) = hz + zz, 'master = sum of both';
  assert (select loans_outstanding_minor from public.v_business_dashboard where code='HARON_FASHION') = 9900000;
  assert (select pending_payments_count from public.v_business_dashboard where code='HARON_FASHION') = 1, 'IN-TO-BILL still pending';
  assert (select running_balance_minor from public.v_customer_statement where customer_id=(select id from public.customers where full_name='John Kamau')
          order by entry_date desc, created_at desc, running_balance_minor limit 1) is not null;
  assert (select outstanding_minor from public.v_customer_balances where full_name='John Kamau') = 2000000;
  assert (select count(*) from public.audit_log where table_name='obligations') > 0, 'audit trail written';
  assert (select count(*) from public.audit_log where table_name='payment_transactions' and actor_id is not null) > 0, 'audit records who';
end $$;

reset role; reset session authorization;
rollback;
\echo ALL TESTS PASSED
