-- Decommission the development-only ledgers. Keep their historical rows intact,
-- but revoke memberships and hide the businesses from all active workflows.
update public.business_members
set is_active = false
where business_id in (
  select id from public.businesses where left(code, 4) = 'DEV_'
);

update public.businesses
set is_active = false
where left(code, 4) = 'DEV_';
