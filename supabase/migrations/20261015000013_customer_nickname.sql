-- Migration: 20261015000013_customer_nickname.sql
-- Adds nickname column to customers for phonebook import and smart SMS matcher reconciliation

alter table public.customers add column if not exists nickname text;

create index if not exists customers_business_nickname_idx on public.customers (business_id, nickname) where nickname is not null;

-- Enable trigram search on nickname if pg_trgm extension is available
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'create index if not exists customers_nickname_trgm_idx on public.customers using gin (nickname extensions.gin_trgm_ops) where nickname is not null';
  end if;
end $$;
