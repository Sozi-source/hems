-- HEMS · Migration 16 · Bank Payment Channels & Dynamic Remittance SMS Templates
-- Configures bank account and paybill details:
--   Haron Fashion: Equity Paybill 247247 (Acc 650166), NCBA Paybill 880100 (Acc 650166)
--   Zenith Plast Distributors Ltd: Absa Paybill 303030 (Acc 1398#)
-- Optimized for single-SMS segment (<= 160 characters) to cut SMS costs by 50%.

-- 1. Upsert payment channels for Haron Fashion (do not modify immutable business_id on conflict)
insert into public.payment_channels (business_id, provider, shortcode, label, is_active)
select id, 'mpesa_paybill', '247247', 'Equity Bank (Paybill 247247, Acc 650166)', true
from public.businesses
where code in ('HARON_FASHION', 'DEV_HARON_FASHION')
order by case when code = 'HARON_FASHION' then 1 else 2 end
limit 1
on conflict (provider, shortcode) do update
set label = excluded.label,
    is_active = excluded.is_active;

insert into public.payment_channels (business_id, provider, shortcode, label, is_active)
select id, 'mpesa_paybill', '880100', 'NCBA Bank (Paybill 880100, Acc 650166)', true
from public.businesses
where code in ('HARON_FASHION', 'DEV_HARON_FASHION')
order by case when code = 'HARON_FASHION' then 1 else 2 end
limit 1
on conflict (provider, shortcode) do update
set label = excluded.label,
    is_active = excluded.is_active;

-- 2. Upsert payment channels for Zenith Plast
insert into public.payment_channels (business_id, provider, shortcode, label, is_active)
select id, 'mpesa_paybill', '303030', 'Absa Bank (Paybill 303030, Acc 1398#)', true
from public.businesses
where code in ('ZENITH_PLAST', 'DEV_ZENITH_PLAST')
order by case when code = 'ZENITH_PLAST' then 1 else 2 end
limit 1
on conflict (provider, shortcode) do update
set label = excluded.label,
    is_active = excluded.is_active;

-- 3. Upsert SMS Templates for Haron Fashion (Single SMS <= 160 chars)
insert into public.sms_templates (business_id, key, name, body, is_active)
select id, 'credit_sale_invoice', 'Goods received on credit',
       'Dear {{first_name}}, goods {{amount}} received on credit. Bal: {{balance}} due {{due_date}}. Pay Equity 247247/NCBA 880100 Acc 650166 (Ref: {{account}}). - Haron Fashion', true
from public.businesses
where code in ('HARON_FASHION', 'DEV_HARON_FASHION')
on conflict (business_id, key) do update
set body = excluded.body,
    is_active = excluded.is_active;

insert into public.sms_templates (business_id, key, name, body, is_active)
select id, 'customer_reminder', 'Customer debt reminder',
       'Dear {{first_name}}, reminder from Haron Fashion: your balance is {{balance}}. Pay via Equity 247247 or NCBA 880100 Acc 650166 (Ref: {{account}}). Thank you.', true
from public.businesses
where code in ('HARON_FASHION', 'DEV_HARON_FASHION')
on conflict (business_id, key) do update
set body = excluded.body,
    is_active = excluded.is_active;

-- 4. Upsert SMS Templates for Zenith Plast (Single SMS <= 160 chars)
insert into public.sms_templates (business_id, key, name, body, is_active)
select id, 'credit_sale_invoice', 'Goods received on credit',
       'Dear {{first_name}}, goods {{amount}} received on credit. Bal: {{balance}} due {{due_date}}. Pay Absa Paybill 303030 Acc 1398# (Ref: {{account}}). - Zenith Plast', true
from public.businesses
where code in ('ZENITH_PLAST', 'DEV_ZENITH_PLAST')
on conflict (business_id, key) do update
set body = excluded.body,
    is_active = excluded.is_active;

insert into public.sms_templates (business_id, key, name, body, is_active)
select id, 'customer_reminder', 'Customer debt reminder',
       'Dear {{first_name}}, reminder from Zenith Plast: your balance is {{balance}}. Pay via Absa Paybill 303030 Acc 1398# (Ref: {{account}}). Thank you.', true
from public.businesses
where code in ('ZENITH_PLAST', 'DEV_ZENITH_PLAST')
on conflict (business_id, key) do update
set body = excluded.body,
    is_active = excluded.is_active;

-- 5. Update create_obligation to format due_date concisely as DD Mon
create or replace function public.create_obligation(
  p_business uuid, p_kind public.obligation_kind, p_amount_minor bigint,
  p_customer uuid default null, p_supplier uuid default null, p_staff uuid default null,
  p_category uuid default null, p_payee text default null, p_description text default null,
  p_reference text default null, p_issue_date date default null, p_due_date date default null,
  p_payment_terms text default null, p_recurring uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_issue date; v_tz text; v_due date := p_due_date; v_ref text := p_reference; v_terms int;
  v_bs public.business_settings%rowtype;
  v_biz public.businesses%rowtype;
  v_cust public.customers%rowtype;
  v_tpl_body text;
  v_total_bal bigint;
  v_paybill text;
  v_sms_text text;
  v_formatted_due text;
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

  -- Instant SMS notification when a customer picks goods on credit
  if p_kind = 'customer_debt' and p_customer is not null then
    select * into v_bs from public.business_settings where business_id = p_business;
    if coalesce(v_bs.sms_enabled, false) then
      select * into v_cust from public.customers where id = p_customer and business_id = p_business;
      if v_cust.phone is not null and not coalesce(v_cust.sms_opt_out, false) then
        select * into v_biz from public.businesses where id = p_business;
        select coalesce(sum(balance_minor), 0) into v_total_bal from public.obligations
         where business_id = p_business and customer_id = p_customer and kind = 'customer_debt'
           and status in ('open','partially_paid');

        select shortcode into v_paybill from public.payment_channels
         where business_id = p_business and provider = 'mpesa_paybill' and is_active
         order by created_at limit 1;

        select body into v_tpl_body from public.sms_templates
         where business_id = p_business and is_active and key = 'credit_sale_invoice';

        if v_tpl_body is null then
          v_tpl_body := 'Dear {{first_name}}, goods {{amount}} received on credit. Bal: {{balance}} due {{due_date}}. Pay via Paybill {{paybill}}, account {{account}}. Thank you.';
        end if;

        if v_due is not null then
          if extract(year from v_due) = extract(year from now()) then
            v_formatted_due := to_char(v_due, 'DD Mon');
          else
            v_formatted_due := to_char(v_due, 'DD Mon YYYY');
          end if;
        else
          v_formatted_due := 'Not set';
        end if;

        v_sms_text := public.render_template(v_tpl_body, jsonb_build_object(
          'first_name', initcap(split_part(trim(v_cust.full_name), ' ', 1)),
          'customer_name', v_cust.full_name,
          'business_name', v_biz.name,
          'amount', public.fmt_kes(p_amount_minor),
          'balance', public.fmt_kes(v_total_bal),
          'due_date', v_formatted_due,
          'paybill', coalesce(v_paybill, ''),
          'account', v_cust.customer_no,
          'reference', v_ref,
          'description', coalesce(p_description, 'Goods on credit')
        ));

        insert into public.sms_outbox (
          business_id, customer_id, kind, to_phone, body, related_obligation_id, dedupe_key
        ) values (
          p_business, v_cust.id, 'credit_sale', v_cust.phone, v_sms_text, v_id, 'debt_created:' || v_id
        ) on conflict (dedupe_key) do nothing;
      end if;
    end if;
  end if;

  return v_id;
end $$;
