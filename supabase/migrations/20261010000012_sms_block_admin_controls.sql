-- Admin controls for provider-blocked SMS recipients.
-- Browser clients can update customers directly (RLS allows any operating role), so the block
-- columns are guarded by a trigger: only the service role (SMS worker) or an owner/admin may change them.

create or replace function public.guard_customer_sms_block() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_changed boolean;
begin
  if tg_op = 'INSERT' then
    v_changed := new.sms_blocked_at is not null or new.sms_block_reason is not null;
  else
    v_changed := new.sms_blocked_at is distinct from old.sms_blocked_at
              or new.sms_block_reason is distinct from old.sms_block_reason;
  end if;

  if v_changed
     and not public.is_service_call()
     and not public.has_role(new.business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Only an owner or admin can change a customer''s SMS block status'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_customers_sms_block_guard on public.customers;
create trigger trg_customers_sms_block_guard
  before insert or update on public.customers
  for each row execute function public.guard_customer_sms_block();

-- Clears the block so SMS to the customer is attempted again.
-- If the provider still refuses the number, the worker flags the customer again on the next failure.
create or replace function public.clear_customer_sms_block(p_customer_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_biz uuid;
begin
  select business_id into v_biz from public.customers where id = p_customer_id;
  if v_biz is null then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  perform public.require_role(v_biz, array['owner','admin']::public.app_role[]);

  update public.customers
     set sms_blocked_at = null, sms_block_reason = null
   where id = p_customer_id and business_id = v_biz;
end $$;

revoke all on function public.clear_customer_sms_block(uuid) from public, anon;
grant execute on function public.clear_customer_sms_block(uuid) to authenticated, service_role;
