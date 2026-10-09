-- Keep a receiving Till number separate from the Store/Business Short Code
-- used to authenticate the STK request and generate its password.
alter table public.payment_channels
  add column if not exists business_shortcode text;

alter table public.payment_channels
  add constraint payment_channels_business_shortcode_format
  check (business_shortcode is null or business_shortcode ~ '^[0-9]{5,7}$');

create unique index if not exists payment_channels_provider_business_shortcode_key
  on public.payment_channels (provider, business_shortcode)
  where business_shortcode is not null;
