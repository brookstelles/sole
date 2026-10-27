-- The private link to a business's appointments as a calendar feed (the calendar Edge Function), one per business:
-- the token is the key, and a new one turns the old link off. Row level security on with no policies: only the
-- Edge Function (service role) uses it, so grant the service role explicitly (see
-- 20261026030000_square_sellers_grants.sql for why).
create table if not exists public.cal_feeds (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
alter table public.cal_feeds enable row level security;
revoke all on table public.cal_feeds from anon, authenticated;
grant select, insert, update, delete on table public.cal_feeds to service_role;
