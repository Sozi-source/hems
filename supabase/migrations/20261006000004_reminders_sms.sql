-- =============================================================================
-- HEMS · Migration 04 · SMS templates, reminders, SMS outbox, notifications,
-- and per-business bootstrap (settings + categories + templates).
-- =============================================================================

create table public.sms_templates (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  key         text not null,
  name        text not null,
  body        text not null check (length(body) between 1 and 640),
  is_active   boolean not null default true,
  updated_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, key)
);

create table public.sms_outbox (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses(id),
  customer_id         uuid,
  kind                text not null check (kind in ('reminder','payment_confirmation','other')),
  to_phone            text not null,
  body                text not null,
  related_obligation_id uuid,
  related_payment_id  uuid references public.payment_transactions(id),
  dedupe_key          text unique,                    -- prevents double reminders / double confirmations
  status              public.sms_status not null default 'queued',
  provider            text,
  provider_message_id text,
  cost_minor          bigint,
  error               text,
  attempts            int not null default 0,
  scheduled_at        timestamptz not null default now(),
  sent_at             timestamptz,
  delivered_at        timestamptz,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  foreign key (customer_id, business_id) references public.customers (id, business_id)
);
create index on public.sms_outbox (status, scheduled_at) where status = 'queued';
create index on public.sms_outbox (business_id, customer_id, created_at desc);
create index on public.sms_outbox (provider_message_id) where provider_message_id is not null;

create table public.reminder_schedules (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null,
  obligation_id  uuid not null,
  recipient      text not null check (recipient in ('customer','owner')),
  anchor         text not null default 'due_date' check (anchor in ('due_date','issue_date')),
  offsets_days   int[] not null check (cardinality(offsets_days) > 0),
  template_key   text,
  custom_message text,                               -- per-customer editable message (overrides template)
  status         public.schedule_status not null default 'active',
  paused_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (obligation_id),
  unique (id, business_id),
  foreign key (obligation_id, business_id) references public.obligations (id, business_id) on delete cascade
);
create trigger trg_schedules_updated before update on public.reminder_schedules
  for each row execute function public.set_updated_at();

create table public.reminder_runs (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null,
  schedule_id   uuid not null references public.reminder_schedules(id) on delete cascade,
  obligation_id uuid not null,
  anchor_date   date not null,                       -- per installment / per cycle
  offset_days   int not null,
  status        public.run_status not null default 'queued',
  sms_id        uuid references public.sms_outbox(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now(),
  unique (schedule_id, anchor_date, offset_days)     -- each reminder fires exactly once per cycle
);
create index on public.reminder_runs (business_id, created_at desc);

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id),
  kind          text not null,
  title         text not null,
  body          text,
  obligation_id uuid,
  dedupe_key    text unique,
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);
create index on public.notifications (business_id, created_at desc);

-- A schedule appears automatically with every new obligation.
create or replace function public.create_default_reminder_schedule() returns trigger
language plpgsql security definer set search_path = public as $$
declare bs public.business_settings%rowtype; v_offsets int[]; v_recipient text; v_tpl text;
begin
  select * into bs from public.business_settings where business_id = new.business_id;
  if not found then return new; end if;
  if new.kind = 'customer_debt' then
    select coalesce(c.reminder_offsets, bs.default_reminder_offsets) into v_offsets
      from public.customers c where c.id = new.customer_id;
    v_recipient := 'customer'; v_tpl := 'customer_reminder';
  elsif new.kind in ('supplier_debt','loan','bill','expense','salary') then
    v_offsets := bs.payable_reminder_offsets; v_recipient := 'owner';
  else
    return new;
  end if;
  insert into public.reminder_schedules (business_id, obligation_id, recipient, offsets_days, template_key)
  values (new.business_id, new.id, v_recipient, v_offsets, v_tpl)
  on conflict (obligation_id) do nothing;
  return new;
end $$;
create trigger trg_obligations_schedule after insert on public.obligations
  for each row execute function public.create_default_reminder_schedule();

-- Debt cleared -> reminders stop. Payment reversed -> they resume (unless the user paused them).
create or replace function public.obligation_status_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('paid','written_off','cancelled') and old.status not in ('paid','written_off','cancelled') then
    update public.reminder_schedules set status = 'completed' where obligation_id = new.id and status = 'active';
    update public.sms_outbox s set status = 'cancelled'
     where s.kind = 'reminder' and s.status = 'queued'
       and s.id in (select sms_id from public.reminder_runs where obligation_id = new.id and sms_id is not null);
    update public.reminder_runs set status = 'cancelled', note = 'Debt cleared'
     where obligation_id = new.id and status = 'queued';
  elsif new.status in ('open','partially_paid') and old.status in ('paid','written_off') then
    update public.reminder_schedules set status = 'active' where obligation_id = new.id and status = 'completed';
  end if;
  return new;
end $$;
create trigger trg_obligations_status after update of status on public.obligations
  for each row execute function public.obligation_status_changed();

-- New business -> settings, default expense categories, default SMS templates.
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
    'Dear {{first_name}}, we have received your payment of {{amount}}. Thank you. Your account is PAID IN FULL. - {{business_name}}')
  on conflict do nothing;
  return new;
end $$;
create trigger trg_business_created after insert on public.businesses
  for each row execute function public.on_business_created();
