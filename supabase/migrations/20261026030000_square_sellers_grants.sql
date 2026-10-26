-- Moving square_sellers out of the private schema (20261026010000) kept its private-schema privileges, so the
-- Edge Function's service role could not read it: Square's notices were turned away and every catch-up failed
-- ("permission denied for table square_sellers"). Give the service role what the other public tables have.
-- Row level security stays on with no policies, so signed-in users still can't see it.
grant select, insert, update, delete on table public.square_sellers to service_role;
