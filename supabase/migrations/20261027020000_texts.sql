-- Texts to clients from Sole's own number (the text Edge Function, Twilio). texts: every one sent or received, by
-- business (a reply goes to the business that last texted that number). text_optouts: numbers that answered STOP;
-- Sole's number never texts them again until they answer START. Row level security on with no policies: only the
-- Edge Functions (service role) use these tables, so grant the service role explicitly (see
-- 20261026030000_square_sellers_grants.sql for why).
create table if not exists public.texts (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  dir text not null check (dir in ('out', 'in')),
  phone text not null,
  name text,
  kind text,
  ref text,
  body text not null,
  sid text,
  status text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists texts_phone on public.texts (phone, created_at desc);
create index if not exists texts_business on public.texts (business_id, created_at desc);
create table if not exists public.text_optouts (
  phone text primary key,
  at timestamptz not null default now()
);
alter table public.texts enable row level security;
alter table public.text_optouts enable row level security;
revoke all on table public.texts, public.text_optouts from anon, authenticated;
grant select, insert, update, delete on table public.texts, public.text_optouts to service_role;
