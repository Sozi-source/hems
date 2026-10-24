-- HEMS · Migration 15 · Instant SMS on Goods Picked on Credit / Customer Debt Created

-- 1. Allow 'credit_sale' in sms_outbox kind check
alter table public.sms_outbox drop constraint if exists sms_outbox_kind_check;
alter table public.sms_outbox add constraint sms_outbox_kind_check
  check (kind in ('reminder','payment_confirmation','credit_sale','other'));

-- 2. Add default credit_sale_invoice SMS template for all existing businesses
insert into public.sms_templates (business_id, key, name, body)
select id, 'credit_sale_invoice', 'Goods received on credit',
  'Dear {{first_name}}, you have received goods worth {{amount}} on credit from {{business_name}}. Total balance: {{balance}}. Due date: {{due_date}}. Pay via Paybill {{paybill}}, account {{account}}. Thank you.'
from public.businesses
on conflict (business_id, key) do nothing;

-- 3. Update on_business_created to include credit_sale_invoice template on future businesses
create or replace function public.on_business_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.business_settings (business_id) values (new.id) on conflict do nothing;

  insert into public.expense_categories (business_id, name, is_default)
  select new.id, c, true from unnest(array['Rent','Electricity','Water','Internet','Security','Fuel',
        'Transport','Repairs','Insurance','Licences','Airtime','Other']) as c
  on conflict do nothing;

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

-- 4. Update create_obligation to queue an instant SMS when a customer_debt obligation is created
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
          v_tpl_body := 'Dear {{first_name}}, you have received goods worth {{amount}} on credit from {{business_name}}. Total balance: {{balance}}. Due date: {{due_date}}. Pay via Paybill {{paybill}}, account {{account}}. Thank you.';
        end if;

        v_sms_text := public.render_template(v_tpl_body, jsonb_build_object(
          'first_name', initcap(split_part(trim(v_cust.full_name), ' ', 1)),
          'customer_name', v_cust.full_name,
          'business_name', v_biz.name,
          'amount', public.fmt_kes(p_amount_minor),
          'balance', public.fmt_kes(v_total_bal),
          'due_date', coalesce(to_char(v_due, 'DD Mon YYYY'), 'Not set'),
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
