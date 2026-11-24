-- =============================================================================
-- HEMS · Migration 26 · Ensure due-today SMS reminders read "today" instead of "0d" / "0 days"
-- =============================================================================

create or replace function public.queue_due_reminders(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  ro record;
  v_off int;
  v_today date;
  v_anchor date;
  v_diff int;
  v_run uuid;
  v_n int := 0;
  v_body text;
  v_text text;
  v_sms uuid;
  v_paybill text;
  cust public.customers%rowtype;
  v_when timestamptz;
  v_tpl_key text;
  v_days_overdue int;
  v_days_remaining int;
  v_formatted_due text;
  v_first_name text;
  v_mode text;
  v_dedupe text;
  v_sched_id uuid;
  v_used_due_today_tpl boolean := false;
begin
  if not public.is_service_call() then raise exception 'Not authorised' using errcode = '42501'; end if;

  -- =========================================================================
  -- A. CUSTOMER REMINDERS: Merged per customer with common due date
  -- =========================================================================
  for r in
    select o.business_id,
           o.customer_id,
           b.code as business_code,
           b.timezone,
           b.name as business_name,
           bs.sms_enabled,
           bs.reminder_send_hour,
           sum(o.balance_minor) as total_balance_minor,
           sum(o.original_minor) as total_original_minor,
           count(*) as debt_count,
           min(coalesce(o.due_date, o.issue_date)) filter (where coalesce(o.due_date, o.issue_date) < (p_now at time zone b.timezone)::date) as oldest_overdue_date,
           min(coalesce(o.due_date, o.issue_date)) filter (where coalesce(o.due_date, o.issue_date) >= (p_now at time zone b.timezone)::date) as nearest_upcoming_date,
           (array_agg(o.id order by coalesce(o.due_date, o.issue_date) asc))[1] as primary_obligation_id
      from public.obligations o
      join public.businesses b on b.id = o.business_id
      join public.business_settings bs on bs.business_id = o.business_id
     where o.status in ('open','partially_paid')
       and o.balance_minor > 0
       and o.kind in ('customer_debt','loan')
       and o.customer_id is not null
       and b.is_active
     group by o.business_id, o.customer_id, b.code, b.timezone, b.name, bs.sms_enabled, bs.reminder_send_hour
  loop
    v_today := (p_now at time zone r.timezone)::date;
    v_days_overdue := null;
    v_days_remaining := null;
    v_used_due_today_tpl := false;

    select * into cust from public.customers where id = r.customer_id;
    if not coalesce(r.sms_enabled, false) or cust.phone is null or cust.sms_opt_out then
      continue;
    end if;

    -- CASE 1: Customer has overdue debts -> Use oldest overdue date as common anchor
    if r.oldest_overdue_date is not null then
      v_mode := 'overdue';
      v_anchor := r.oldest_overdue_date;
      v_diff := v_today - v_anchor;
      v_days_overdue := v_diff;
      v_off := v_days_overdue;

    -- CASE 2: Customer has only upcoming debts -> Use nearest upcoming date as common anchor (if <= 3 days)
    elsif r.nearest_upcoming_date is not null then
      v_anchor := r.nearest_upcoming_date;
      v_diff := v_today - v_anchor;
      if (-v_diff) in (3, 2, 1, 0) then
        v_mode := 'due_soon';
        v_days_remaining := -v_diff;
        v_off := -v_days_remaining;
      else
        continue; -- Not yet within 3 days notice window
      end if;
    else
      continue;
    end if;

    -- Deduplication key ensures strictly 1 SMS per customer per day
    v_dedupe := 'reminder:merged:' || r.business_id || ':' || r.customer_id || ':' || to_char(v_today, 'YYYY-MM-DD') || ':' || v_mode;
    perform 1 from public.sms_outbox where dedupe_key = v_dedupe;
    if found then
      continue;
    end if;

    -- Ensure reminder_schedules row exists for the primary obligation
    select id into v_sched_id from public.reminder_schedules where obligation_id = r.primary_obligation_id;
    if v_sched_id is null then
      insert into public.reminder_schedules (business_id, obligation_id, recipient, anchor, offsets_days, template_key, status)
      values (r.business_id, r.primary_obligation_id, 'customer', 'due_date', array[1,2,3,7,14,30], 'customer_reminder', 'active')
      returning id into v_sched_id;
    end if;

    -- Insert into reminder_runs
    insert into public.reminder_runs (business_id, schedule_id, obligation_id, anchor_date, offset_days, note)
    values (r.business_id, v_sched_id, r.primary_obligation_id, v_anchor, v_off, 'Merged: ' || r.debt_count || ' debt(s)')
    on conflict (schedule_id, anchor_date, offset_days) do nothing returning id into v_run;

    -- Format due date
    if extract(year from v_anchor) = extract(year from v_today) then
      v_formatted_due := to_char(v_anchor, 'DD Mon');
    else
      v_formatted_due := to_char(v_anchor, 'DD Mon YYYY');
    end if;

    v_first_name := substring(initcap(split_part(trim(cust.full_name), ' ', 1)), 1, 12);

    select shortcode into v_paybill from public.payment_channels
     where business_id = r.business_id and provider = 'mpesa_paybill' and is_active order by created_at limit 1;

    v_body := null;
    if v_mode = 'due_soon' and v_days_remaining = 0 then
      select body into v_body from public.sms_templates where business_id = r.business_id and key = 'customer_reminder_due_today' and is_active;
      v_used_due_today_tpl := v_body is not null;
    end if;

    if v_body is null then
      v_tpl_key := case when v_mode = 'overdue' then 'customer_reminder_overdue' else 'customer_reminder_due_soon' end;
      select body into v_body from public.sms_templates where business_id = r.business_id and key = v_tpl_key and is_active;
    end if;
    if v_body is null then
      select body into v_body from public.sms_templates where business_id = r.business_id and key = 'customer_reminder' and is_active;
    end if;

    if v_body is null then
      if v_run is not null then
        update public.reminder_runs set status = 'skipped', note = 'No active template' where id = v_run;
      end if;
      continue;
    end if;

    if v_mode = 'due_soon' and v_days_remaining = 0 and not v_used_due_today_tpl then
      v_body := regexp_replace(v_body, '\mdue\s+in\s+\{\{days_remaining\}\}\s*(day\(s\)|days?|d)?(?=\s|\.|,|;|:|\(|$)', 'due today', 'gi');
      v_body := regexp_replace(v_body, '\min\s+\{\{days_remaining\}\}\s*(day\(s\)|days?|d)(?=\s|\.|,|;|:|\(|$)', 'today', 'gi');
      v_body := regexp_replace(v_body, '\{\{days_remaining\}\}\s*(day\(s\)|days?|d)\s*left\M', 'due today', 'gi');
      v_body := regexp_replace(v_body, '\{\{days_remaining\}\}\s*(day\(s\)|days?|d)(?=\s|\.|,|;|:|\(|$)', 'today', 'gi');
    end if;

    v_text := public.render_template(v_body, jsonb_build_object(
      'first_name', v_first_name,
      'customer_name', cust.full_name,
      'business_name', r.business_name,
      'balance', public.fmt_kes(r.total_balance_minor),
      'original', public.fmt_kes(r.total_original_minor),
      'reference', case when r.debt_count > 1 then r.debt_count || ' debts' else '' end,
      'due_date', v_formatted_due,
      'days_overdue', coalesce(v_days_overdue, 0),
      'days_remaining', case when v_mode = 'due_soon' and coalesce(v_days_remaining, 0) = 0 then 'today' else coalesce(v_days_remaining, 0)::text end,
      'paybill', coalesce(v_paybill, ''),
      'account', cust.customer_no
    ));

    -- Strict single-SMS limit (<= 160 characters)
    if length(v_text) > 160 then
      v_text := substring(v_text from 1 for 160);
    end if;

    -- Scheduled time: 8:00 AM local business time
    v_when := greatest(p_now, ((v_today + make_interval(hours => coalesce(r.reminder_send_hour, 8)))::timestamp at time zone r.timezone));

    insert into public.sms_outbox (business_id, customer_id, kind, to_phone, body, related_obligation_id, dedupe_key, scheduled_at)
    values (r.business_id, cust.id, 'reminder', cust.phone, v_text, r.primary_obligation_id, v_dedupe, v_when)
    returning id into v_sms;

    if v_run is not null then
      update public.reminder_runs set sms_id = v_sms where id = v_run;
    end if;
    v_n := v_n + 1;
  end loop;

  -- =========================================================================
  -- B. OWNER IN-APP NOTIFICATIONS (Supplier Payables & Obligations)
  -- =========================================================================
  for ro in
    select s.id as schedule_id, s.business_id, s.obligation_id, o.balance_minor, o.description, o.payee_name, o.reference_no,
           b.timezone, coalesce(o.due_date, o.issue_date) as anchor_date
      from public.reminder_schedules s
      join public.obligations o on o.id = s.obligation_id
      join public.businesses b on b.id = s.business_id
     where s.recipient = 'owner' and s.status = 'active' and o.status in ('open','partially_paid') and o.balance_minor > 0 and b.is_active
  loop
    v_today  := (p_now at time zone ro.timezone)::date;
    v_anchor := ro.anchor_date;
    continue when v_anchor is null;

    v_diff := v_today - v_anchor;
    if v_diff > 0 or (-v_diff in (3, 2, 1, 0)) then
      v_off := v_diff;
      insert into public.reminder_runs (business_id, schedule_id, obligation_id, anchor_date, offset_days)
      values (ro.business_id, ro.schedule_id, ro.obligation_id, v_anchor, v_off)
      on conflict (schedule_id, anchor_date, offset_days) do nothing returning id into v_run;
      continue when v_run is null;

      insert into public.notifications (business_id, kind, title, body, obligation_id, dedupe_key)
      values (ro.business_id, 'obligation_due',
              coalesce(ro.description, ro.payee_name, ro.reference_no) || ' - ' || public.fmt_kes(ro.balance_minor),
              case when v_off < 0 then 'Due in ' || (-v_off) || ' day(s)' when v_off = 0 then 'Due today'
                   else v_off || ' day(s) overdue' end,
              ro.obligation_id, 'obl:' || v_run)
      on conflict do nothing;
      update public.reminder_runs set status = 'sent', note = 'in-app' where id = v_run;
      v_n := v_n + 1;
    end if;
  end loop;

  return v_n;
end $$;

revoke execute on function public.queue_due_reminders(timestamptz) from authenticated;
grant execute on function public.queue_due_reminders(timestamptz) to service_role;
