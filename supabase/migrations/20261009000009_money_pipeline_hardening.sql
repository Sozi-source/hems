-- Money pipeline hardening: prevent conflicted payment approval and require
-- an owner/admin reconciliation note before clearing ingest conflicts.

alter table public.payment_transactions
  add column conflict_resolution_note text,
  add column conflict_resolved_by uuid references auth.users(id),
  add column conflict_resolved_at timestamptz;

create index stk_requests_requester_created_idx on public.stk_requests (requested_by, created_at desc);
create index stk_requests_customer_created_idx on public.stk_requests (customer_id, created_at desc);

-- Callback retries must refresh a candidate, not multiply review suggestions.
with ranked as (
  select id, row_number() over (
    partition by payment_id, engine_version, rank
    order by confidence desc, created_at desc, id
  ) as position
  from public.match_candidates
)
delete from public.match_candidates c using ranked r where c.id = r.id and r.position > 1;

create unique index match_candidates_payment_engine_rank_uidx
  on public.match_candidates (payment_id, engine_version, rank);

create or replace function public.guard_stk_prompt_rate()
returns trigger language plpgsql set search_path = public as $$
declare v_user_count int; v_customer_count int;
begin
  if new.requested_by is null then raise exception 'STK prompt must have an authenticated requester' using errcode = '42501'; end if;

  -- Serialize concurrent attempts so parallel requests cannot bypass these limits.
  perform pg_advisory_xact_lock(hashtextextended('hems-stk-user:' || new.requested_by::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('hems-stk-customer:' || new.customer_id::text, 0));

  select count(*) into v_user_count from public.stk_requests
   where requested_by = new.requested_by and created_at > now() - interval '10 minutes';
  select count(*) into v_customer_count from public.stk_requests
   where customer_id = new.customer_id and created_at > now() - interval '10 minutes';

  if v_user_count >= 10 or v_customer_count >= 3 then
    raise exception 'STK prompt rate limit reached; wait before sending another prompt' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger trg_stk_prompt_rate_limit
  before insert on public.stk_requests
  for each row execute function public.guard_stk_prompt_rate();

revoke all on function public.guard_stk_prompt_rate() from public, anon, authenticated;
grant execute on function public.guard_stk_prompt_rate() to service_role;

-- Provider payloads can contain payer identifiers and extra account metadata.
-- Business users receive only fields needed for review; raw_payload stays server-only.
revoke select on public.payment_transactions from authenticated;
grant select (
  id, business_id, channel_id, provider, transaction_ref, direction, source, amount_minor,
  currency, payer_name, payer_msisdn, payer_msisdn_masked, counterparty_name,
  account_reference, receiving_account, description, occurred_at, suggested_kind,
  match_confidence, status, unallocated_minor, decided_by, decided_at, decision_note,
  conflict_flags, conflict_resolution_note, conflict_resolved_by, conflict_resolved_at,
  created_at, updated_at
) on public.payment_transactions to authenticated;

create or replace function public.block_conflicted_payment_approval()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'approved'
     and (coalesce(cardinality(old.conflict_flags), 0) > 0 or coalesce(cardinality(new.conflict_flags), 0) > 0) then
    raise exception 'Payment has unresolved ingest conflicts; an owner or admin must record reconciliation first'
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger trg_payment_conflict_approval
  before update of status on public.payment_transactions
  for each row execute function public.block_conflicted_payment_approval();

revoke all on function public.block_conflicted_payment_approval() from public, anon, authenticated;
grant execute on function public.block_conflicted_payment_approval() to service_role;

create or replace function public.resolve_payment_conflicts(p_payment_id uuid, p_resolution_note text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.payment_transactions%rowtype; v_note text := trim(coalesce(p_resolution_note, ''));
begin
  select * into t from public.payment_transactions where id = p_payment_id for update;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if t.status <> 'pending' then raise exception 'Only pending payments can be reconciled' using errcode = '55000'; end if;
  if coalesce(cardinality(t.conflict_flags), 0) = 0 then raise exception 'Payment has no unresolved ingest conflicts' using errcode = '22023'; end if;
  if length(v_note) < 20 or length(v_note) > 1000 then
    raise exception 'Record at least 20 characters describing the independent reconciliation performed' using errcode = '22023';
  end if;

  if t.business_id is null then
    if not public.is_platform_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  else
    perform public.require_role(t.business_id, array['owner','admin']::public.app_role[]);
  end if;

  update public.payment_transactions
     set conflict_flags = '{}', conflict_resolution_note = v_note,
         conflict_resolved_by = auth.uid(), conflict_resolved_at = now()
   where id = t.id;
end $$;

revoke all on function public.resolve_payment_conflicts(uuid, text) from public, anon;
grant execute on function public.resolve_payment_conflicts(uuid, text) to authenticated, service_role;
