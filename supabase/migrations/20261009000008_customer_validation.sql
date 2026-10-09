-- Normalize and validate customer identities at the database boundary.
-- A person may share a phone with another person, but the same normalized
-- name + phone pair may not be registered twice within one business.
create or replace function public.validate_customer_identity() returns trigger
language plpgsql set search_path = public as $$
begin
  new.full_name := regexp_replace(btrim(coalesce(new.full_name, '')), '\s+', ' ', 'g');
  if char_length(new.full_name) < 2 or char_length(new.full_name) > 120 then
    raise exception 'Customer name must be between 2 and 120 characters' using errcode = '22023';
  end if;

  if new.phone is not null then
    if tg_op = 'UPDATE'
       and old.phone is not distinct from new.phone
       and lower(regexp_replace(btrim(old.full_name), '\s+', ' ', 'g')) = lower(new.full_name) then
      return new;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
      new.business_id::text || '|' || lower(new.full_name) || '|' || new.phone, 0
    ));

    if exists (
      select 1 from public.customers c
       where c.business_id = new.business_id
         and c.id <> new.id
         and lower(regexp_replace(btrim(c.full_name), '\s+', ' ', 'g')) = lower(new.full_name)
         and c.phone = new.phone
    ) then
      raise exception 'A customer with this name and phone already exists in this business'
        using errcode = '23505', constraint = 'customers_name_phone_unique';
    end if;
  end if;

  return new;
end;
$$;

-- Fires after customers_before so the phone has already been normalized.
create trigger trg_customers_z_identity_validation
before insert or update on public.customers
for each row execute function public.validate_customer_identity();
