-- Notifications on the owner's phone (web push) for messages from the business's website.
-- push_subs: each phone or computer where someone turned notifications on, by business and person.
-- push_keys: the server's own signing keys (VAPID), made by the push Edge Function the first time it needs them;
-- they never leave the database. Row level security on with no policies: only the Edge Functions (service role) use
-- these tables, so grant the service role explicitly (see 20261026030000_square_sellers_grants.sql for why).
create table if not exists public.push_subs (
  endpoint text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  sub jsonb not null,
  created_at timestamptz not null default now(),
  last_sent timestamptz
);
create table if not exists public.push_keys (
  id text primary key,
  keys jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
alter table public.push_keys enable row level security;
revoke all on table public.push_subs, public.push_keys from anon, authenticated;
grant select, insert, update, delete on table public.push_subs, public.push_keys to service_role;
