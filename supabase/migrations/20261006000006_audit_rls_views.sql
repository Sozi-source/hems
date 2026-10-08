-- =============================================================================
-- HEMS · Migration 06 · Audit trail, Row Level Security, reporting views, grants
-- =============================================================================

-- ---------- tenancy guard: a row can never be moved to another business -----
create or replace function public.prevent_business_change() returns trigger language plpgsql as $$
begin
  if new.business_id is distinct from old.business_id then
    raise exception 'business_id cannot be changed on %', tg_table_name using errcode = '55000';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['customers','customer_payment_identities','suppliers','staff_members','expense_categories',
    'recurring_templates','obligations','loan_terms','payment_channels','stk_requests','match_candidates',
    'payment_allocations','sms_templates','sms_outbox','reminder_schedules','reminder_runs','notifications']
  loop
    execute format('create trigger trg_%s_nobizchange before update on public.%I
                    for each row execute function public.prevent_business_change()', t, t);
  end loop;
end $$;

-- ---------- audit log (immutable) -------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  business_id uuid,
  actor_id    uuid,
  actor_label text,
  action      text not null,
  table_name  text not null,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb,
  client_ip   text
);
create index on public.audit_log (business_id, occurred_at desc);
create index on public.audit_log (table_name, record_id);

create or replace function public.audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_log is immutable' using errcode = '55000'; end $$;
create trigger trg_audit_immutable before update or delete on public.audit_log
  for each row execute function public.audit_immutable();
create trigger trg_audit_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_immutable();

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; v_biz uuid; v_id text; v_ip text;
begin
  v_old := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) - 'raw_payload' end;
  v_new := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) - 'raw_payload' end;
  if tg_op = 'UPDATE' and v_old = v_new then return new; end if;
  v_biz := case when tg_table_name = 'businesses'
                then coalesce(v_new ->> 'id', v_old ->> 'id')
                else coalesce(v_new ->> 'business_id', v_old ->> 'business_id') end::uuid;
  v_id  := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'obligation_id', v_old ->> 'obligation_id',
                    v_new ->> 'business_id' || ':' || coalesce(v_new ->> 'user_id', ''),
                    v_old ->> 'business_id' || ':' || coalesce(v_old ->> 'user_id', ''));
  begin v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  exception when others then v_ip := null; end;
  insert into public.audit_log (business_id, actor_id, actor_label, action, table_name, record_id, old_data, new_data, client_ip)
  values (v_biz, auth.uid(), case when auth.uid() is null then 'system' end, tg_op, tg_table_name, v_id, v_old, v_new, v_ip);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['businesses','business_settings','business_members','customers','customer_payment_identities',
    'suppliers','staff_members','expense_categories','recurring_templates','obligations','loan_terms','payment_channels',
    'payment_transactions','payment_allocations','reminder_schedules','sms_templates']
  loop
    execute format('create trigger trg_%s_audit after insert or update or delete on public.%I
                    for each row execute function public.audit_row_change()', t, t);
  end loop;
end $$;

-- ---------- reporting views (security_invoker => RLS applies to the caller) -
create or replace view public.v_obligation_overview with (security_invoker = true) as
select o.*,
       b.timezone,
       (now() at time zone b.timezone)::date as today,
       (o.status in ('open','partially_paid') and o.balance_minor > 0 and o.due_date is not null
          and o.due_date < (now() at time zone b.timezone)::date) as is_overdue,
       case when o.status in ('open','partially_paid') and o.due_date is not null
            then greatest(0, (now() at time zone b.timezone)::date - o.due_date) else 0 end as days_overdue,
       coalesce((select -sum(e.signed_minor)
                   from public.obligation_entries e
                   left join public.obligation_entries r on r.id = e.reverses_entry_id
                  where e.obligation_id = o.id
                    and (e.entry_type = 'payment' or (e.entry_type = 'reversal' and r.entry_type = 'payment'))), 0) as paid_minor,
       coalesce(c.full_name, s.name, st.full_name, o.payee_name) as counterparty_name
  from public.obligations o
  join public.businesses b on b.id = o.business_id
  left join public.customers c on c.id = o.customer_id
  left join public.suppliers s on s.id = o.supplier_id
  left join public.staff_members st on st.id = o.staff_id;

create or replace view public.v_loan_overview with (security_invoker = true) as
with base as (
  select o.id as obligation_id, o.business_id, o.reference_no as loan_number, l.lender_name,
         l.principal_minor as original_minor, l.interest_rate_pct, l.interest_minor, l.total_payable_minor,
         o.paid_minor as amount_paid_minor, o.balance_minor as outstanding_minor,
         l.installment_minor, l.frequency, l.first_due_date, l.maturity_date, o.status, o.today,
         floor(o.paid_minor::numeric / l.installment_minor)::int as installments_covered
    from public.v_obligation_overview o join public.loan_terms l on l.obligation_id = o.id)
select base.*,
       case when outstanding_minor = 0 then null
            else least(maturity_date,
                       (first_due_date + public.frequency_interval(frequency) * least(installments_covered, 100000))::date)
       end as next_repayment_date,
       (outstanding_minor > 0 and
        least(maturity_date,
              (first_due_date + public.frequency_interval(frequency) * least(installments_covered, 100000))::date) < today) as is_overdue
  from base;

-- security invoker: users can only resolve dates for obligations they can already see.
create or replace function public.reminder_anchor_date(p_obligation uuid, p_anchor text) returns date
language sql stable as $$
  select case when o.kind = 'loan' then coalesce((select v.next_repayment_date from public.v_loan_overview v
                                                  where v.obligation_id = o.id), o.due_date)
              when p_anchor = 'issue_date' then o.issue_date
              when o.kind = 'customer_debt' then coalesce(o.due_date, o.issue_date)   -- credit sale with no due date
              else o.due_date end                                                      -- payables need a real due date
    from public.obligations o where o.id = p_obligation $$;

create or replace view public.v_customer_balances with (security_invoker = true) as
select c.business_id, c.id as customer_id, c.customer_no, c.full_name, c.phone,
       coalesce(sum(o.balance_minor) filter (where o.status in ('open','partially_paid')), 0) as outstanding_minor,
       coalesce(sum(o.balance_minor) filter (where o.is_overdue), 0) as overdue_minor,
       count(*) filter (where o.status in ('open','partially_paid')) as open_debts,
       (select max(e.created_at) from public.obligation_entries e join public.obligations o2 on o2.id = e.obligation_id
         where o2.customer_id = c.id and e.entry_type = 'payment') as last_payment_at
  from public.customers c
  left join public.v_obligation_overview o on o.customer_id = c.id and o.kind = 'customer_debt'
 group by c.business_id, c.id;

create or replace view public.v_customer_statement with (security_invoker = true) as
select o.business_id, o.customer_id, e.entry_date, e.created_at, o.reference_no, e.entry_type,
       coalesce(e.memo, o.description) as description,
       greatest(e.signed_minor, 0)  as debit_minor,
       greatest(-e.signed_minor, 0) as credit_minor,
       sum(e.signed_minor) over (partition by o.customer_id order by e.entry_date, e.created_at, e.id) as running_balance_minor
  from public.obligation_entries e
  join public.obligations o on o.id = e.obligation_id
 where o.kind = 'customer_debt';

create or replace view public.v_reminders_due with (security_invoker = true) as
select s.id as schedule_id, s.business_id, s.obligation_id, s.recipient, o.kind, o.counterparty_name,
       o.balance_minor, x.offset_days, x.anchor_date, (x.anchor_date + x.offset_days) as due_on
  from public.reminder_schedules s
  join public.v_obligation_overview o on o.id = s.obligation_id
 cross join lateral (select off as offset_days, public.reminder_anchor_date(s.obligation_id, s.anchor) as anchor_date
                       from unnest(s.offsets_days) off) x
 where s.status = 'active' and o.status in ('open','partially_paid') and o.balance_minor > 0
   and x.anchor_date is not null
   and (x.anchor_date + x.offset_days) between o.today - 1 and o.today
   and not exists (select 1 from public.reminder_runs r
                    where r.schedule_id = s.id and r.anchor_date = x.anchor_date and r.offset_days = x.offset_days);

create or replace view public.v_unallocated_credits with (security_invoker = true) as
select business_id, id as payment_id, transaction_ref, payer_name, payer_msisdn, unallocated_minor, occurred_at
  from public.payment_transactions where status = 'approved' and unallocated_minor > 0;

create or replace view public.v_business_dashboard with (security_invoker = true) as
select b.id as business_id, b.code, b.name,
  coalesce(sum(o.balance_minor) filter (where o.kind = 'customer_debt'), 0)                          as customers_owing_minor,
  count(distinct o.customer_id) filter (where o.kind = 'customer_debt')                              as customers_owing_count,
  coalesce(sum(o.balance_minor) filter (where o.kind = 'supplier_debt'), 0)                          as supplier_debts_minor,
  coalesce(sum(o.balance_minor) filter (where o.kind = 'loan'), 0)                                   as loans_outstanding_minor,
  coalesce(sum(o.balance_minor) filter (where o.kind in ('bill','expense')), 0)                      as bills_outstanding_minor,
  coalesce(sum(o.balance_minor) filter (where o.kind in ('bill','expense') and o.due_date <= o.today + 7), 0) as bills_due_7d_minor,
  coalesce(sum(o.balance_minor) filter (where o.kind = 'salary'), 0)                                 as salaries_due_minor,
  coalesce(sum(o.balance_minor) filter (where o.kind = 'staff_advance'), 0)                          as staff_advances_minor,
  coalesce(sum(o.balance_minor) filter (where o.is_overdue and o.direction = 'receivable'), 0)       as overdue_receivables_minor,
  coalesce(sum(o.balance_minor) filter (where o.is_overdue and o.direction = 'payable'), 0)          as overdue_payables_minor,
  coalesce(sum(o.balance_minor) filter (where o.direction = 'payable'), 0)                           as total_obligations_minor,
  coalesce(sum(o.balance_minor) filter (where o.direction = 'payable' and o.due_date between o.today and o.today + 7), 0)  as upcoming_7d_minor,
  coalesce(sum(o.balance_minor) filter (where o.direction = 'payable' and o.due_date between o.today and o.today + 30), 0) as upcoming_30d_minor,
  (select count(*) from public.payment_transactions p where p.business_id = b.id and p.status = 'pending') as pending_payments_count,
  (select count(*) from public.v_reminders_due d where d.business_id = b.id)                         as reminders_due_count
  from public.businesses b
  left join public.v_obligation_overview o on o.business_id = b.id and o.status in ('open','partially_paid')
 group by b.id;

-- HEMS Master view: combined figures across every business the caller belongs to.
create or replace view public.v_master_dashboard with (security_invoker = true) as
select count(*) as businesses,
       sum(customers_owing_minor) as customers_owing_minor, sum(supplier_debts_minor) as supplier_debts_minor,
       sum(loans_outstanding_minor) as loans_outstanding_minor, sum(bills_outstanding_minor) as bills_outstanding_minor,
       sum(salaries_due_minor) as salaries_due_minor, sum(overdue_receivables_minor) as overdue_receivables_minor,
       sum(overdue_payables_minor) as overdue_payables_minor, sum(total_obligations_minor) as total_obligations_minor,
       sum(upcoming_7d_minor) as upcoming_7d_minor, sum(upcoming_30d_minor) as upcoming_30d_minor,
       sum(pending_payments_count) as pending_payments_count, sum(reminders_due_count) as reminders_due_count
  from public.v_business_dashboard;

-- ---------- Row Level Security ----------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['businesses','profiles','business_members','business_settings','business_counters','customers',
    'customer_payment_identities','suppliers','staff_members','expense_categories','recurring_templates','obligations',
    'obligation_entries','loan_terms','payment_channels','payment_transactions','payment_ingest_log','stk_requests',
    'match_candidates','payment_allocations','sms_templates','sms_outbox','reminder_schedules','reminder_runs',
    'notifications','audit_log']
  loop execute format('alter table public.%I enable row level security', t); end loop;

  -- Read access: any active member of the owning business.
  foreach t in array array['business_settings','customers','customer_payment_identities','suppliers','staff_members',
    'expense_categories','recurring_templates','obligations','obligation_entries','loan_terms','payment_channels',
    'stk_requests','match_candidates','payment_allocations','sms_templates','sms_outbox','reminder_schedules',
    'reminder_runs','notifications']
  loop execute format('create policy %I on public.%I for select to authenticated using (public.is_member(business_id))', t || '_select', t); end loop;
end $$;

create policy businesses_select on public.businesses for select to authenticated using (public.is_member(id));
create policy businesses_update on public.businesses for update to authenticated
  using (public.has_role(id, array['owner']::public.app_role[])) with check (public.has_role(id, array['owner']::public.app_role[]));

create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (select 1 from public.business_members a join public.business_members b on b.business_id = a.business_id
                              where a.user_id = auth.uid() and a.is_active and b.user_id = profiles.id));
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy members_select on public.business_members for select to authenticated using (public.is_member(business_id));
create policy members_write  on public.business_members for all to authenticated
  using (public.has_role(business_id, array['owner']::public.app_role[]))
  with check (public.has_role(business_id, array['owner']::public.app_role[]));

create policy settings_update on public.business_settings for update to authenticated
  using (public.has_role(business_id, array['owner','admin']::public.app_role[]))
  with check (public.has_role(business_id, array['owner','admin']::public.app_role[]));

create policy customers_insert on public.customers for insert to authenticated with check (public.can_operate(business_id));
create policy customers_update on public.customers for update to authenticated using (public.can_operate(business_id)) with check (public.can_operate(business_id));
create policy suppliers_write  on public.suppliers for all to authenticated using (public.can_manage(business_id)) with check (public.can_manage(business_id));
create policy staff_write      on public.staff_members for all to authenticated using (public.can_manage(business_id)) with check (public.can_manage(business_id));
create policy categories_write on public.expense_categories for all to authenticated using (public.can_manage(business_id)) with check (public.can_manage(business_id));
create policy identities_write on public.customer_payment_identities for all to authenticated using (public.can_manage(business_id)) with check (public.can_manage(business_id));
create policy recurring_write  on public.recurring_templates for all to authenticated using (public.can_manage(business_id)) with check (public.can_manage(business_id));
create policy obligations_update on public.obligations for update to authenticated using (public.can_manage(business_id)) with check (public.can_manage(business_id));
create policy loan_terms_update  on public.loan_terms for update to authenticated using (public.can_manage(business_id)) with check (public.can_manage(business_id));
create policy channels_write   on public.payment_channels for all to authenticated
  using (public.has_role(business_id, array['owner']::public.app_role[])) with check (public.has_role(business_id, array['owner']::public.app_role[]));
create policy templates_write  on public.sms_templates for all to authenticated using (public.can_manage(business_id)) with check (public.can_manage(business_id));
create policy schedules_update on public.reminder_schedules for update to authenticated using (public.can_manage(business_id)) with check (public.can_manage(business_id));
create policy notifications_update on public.notifications for update to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));

-- Payments: assigned -> any member; unassigned inbox -> owners/admins only (strict, avoids cross-business exposure).
create policy payments_select on public.payment_transactions for select to authenticated using (
  (business_id is not null and public.is_member(business_id)) or (business_id is null and public.is_platform_admin()));
create policy ingest_log_select on public.payment_ingest_log for select to authenticated using (public.is_platform_admin());
create policy audit_select on public.audit_log for select to authenticated using (
  (business_id is not null and public.has_role(business_id, array['owner','admin']::public.app_role[]))
  or (business_id is null and public.is_platform_admin()));
-- No policies = no access: business_counters; and no INSERT/UPDATE/DELETE policies exist for
-- obligation_entries, payment_transactions, payment_allocations, match_candidates, sms_outbox,
-- reminder_runs, audit_log. Those change only through the SECURITY DEFINER functions above.

-- ---------- grants -----------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from public, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated, service_role;
grant all on all tables in schema public to service_role;
-- Server-only functions: never callable by a signed-in browser user.
revoke execute on function public.ingest_payment(jsonb) from authenticated;
revoke execute on function public.log_parse_failure(public.payment_source, text, text) from authenticated;
revoke execute on function public.generate_recurring_obligations(date) from authenticated;
revoke execute on function public.queue_due_reminders(timestamptz) from authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
