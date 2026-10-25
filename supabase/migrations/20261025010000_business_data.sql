-- The business's own profile (its words, services, hours, yearly numbers, costs, license, forms) lives here rather
-- than in the website's page, so the page can be public and only signed-in members read the real numbers
-- (the existing "members read their business" policy). Filled from index.html's PRIVATE block by supabase/profile.mjs.
alter table public.businesses add column if not exists data jsonb;
