-- Track recipients the SMS provider refuses to deliver to (e.g. Africa's Talking "UserInBlacklist").
-- Kept separate from customers.sms_opt_out, which records the customer's own consent choice.
alter table public.customers
  add column if not exists sms_blocked_at timestamptz,
  add column if not exists sms_block_reason text;

-- Called by the SMS worker (service role only) when the provider reports a permanent block.
create or replace function public.mark_sms_recipient_blocked(p_sms_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_cust uuid; v_biz uuid;
begin
  if not public.is_service_call() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select customer_id, business_id into v_cust, v_biz from public.sms_outbox where id = p_sms_id;
  if v_cust is null then return; end if;

  update public.customers
     set sms_blocked_at = coalesce(sms_blocked_at, now()),
         sms_block_reason = left(coalesce(p_reason, 'Blocked by provider'), 200)
   where id = v_cust and business_id = v_biz;

  -- Do not leave further messages waiting to fail the same way.
  update public.sms_outbox
     set status = 'cancelled', error = 'Recipient blocked by SMS provider'
   where customer_id = v_cust and business_id = v_biz and status = 'queued';
end $$;

revoke all on function public.mark_sms_recipient_blocked(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_sms_recipient_blocked(uuid, text) to service_role;

-- Stop new messages being queued for blocked customers without touching the
-- approve_payment / reminder functions.
create or replace function public.sms_outbox_skip_blocked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.customer_id is not null and exists (
    select 1 from public.customers c
     where c.id = new.customer_id and c.business_id = new.business_id and c.sms_blocked_at is not null
  ) then
    new.status := 'cancelled';
    new.error := 'Recipient blocked by SMS provider';
  end if;
  return new;
end $$;

drop trigger if exists trg_sms_outbox_skip_blocked on public.sms_outbox;
create trigger trg_sms_outbox_skip_blocked before insert on public.sms_outbox
  for each row execute function public.sms_outbox_skip_blocked();

-- To re-enable a customer after they opt back in:
--   update public.customers set sms_blocked_at = null, sms_block_reason = null where id = '<customer id>';
