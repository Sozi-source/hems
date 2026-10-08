-- HEMS seed: the two businesses. Settings, expense categories and SMS templates are
-- created automatically by the on_business_created trigger.
insert into public.businesses (code, name, legal_name) values
  ('HARON_FASHION', 'Haron Fashion',                 null),
  ('ZENITH_PLAST',  'Zenith Plast Distributors Ltd', 'Zenith Plast Distributors Ltd')
on conflict (code) do nothing;

-- After you sign up for the first time, make yourself owner of every business (run once, in the SQL editor):
--   insert into public.business_members (business_id, user_id, role)
--   select id, '<YOUR-AUTH-USER-UUID>', 'owner' from public.businesses
--   on conflict do nothing;
--
-- Then register each business's Paybill (one row per business):
--   insert into public.payment_channels (business_id, provider, shortcode, label, secret_ref)
--   select id, 'mpesa_paybill', '<HARON_PAYBILL>', 'Haron Fashion Paybill', 'DARAJA_HARON' from public.businesses where code = 'HARON_FASHION';
