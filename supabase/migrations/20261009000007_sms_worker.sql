-- Claim due SMS rows atomically so concurrent workers never send the same row.
create or replace function public.claim_sms_outbox(p_limit integer default 20)
returns setof public.sms_outbox
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_service_call() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be between 1 and 100' using errcode = '22023';
  end if;

  return query
  with picked as (
    select id from public.sms_outbox
     where status = 'queued' and scheduled_at <= now()
     order by scheduled_at, created_at
     limit p_limit
     for update skip locked
  )
  update public.sms_outbox s
     set status = 'sending', provider = 'africas_talking', attempts = attempts + 1, error = null
    from picked
   where s.id = picked.id
  returning s.*;
end;
$$;

revoke all on function public.claim_sms_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_sms_outbox(integer) to service_role;
