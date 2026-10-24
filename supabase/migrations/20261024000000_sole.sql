-- Sole on its own: businesses, who can use them, the book, and Square payments.
-- The book is stored the way the app already keeps it: one row per item, by collection (appts, blocks, clients,
-- ledger, visits, weeks, forms, people), with the item as JSON. Square payments and customers are written only by
-- the square Edge Function (service role); the app reads them.

create schema if not exists private;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  profile text not null default 'massage',          -- which built-in profile the app starts from
  created_at timestamptz not null default now()
);

-- an owner and at most one employee; matched by email so a person can be added before they first log in
create table public.members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null default 'owner' check (role in ('owner', 'staff')),
  primary key (business_id, email)
);

create table public.items (
  business_id uuid not null references public.businesses(id) on delete cascade,
  col text not null check (col in ('appts', 'blocks', 'clients', 'ledger', 'visits', 'weeks', 'forms', 'people')),
  id text not null check (length(id) between 1 and 200),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (business_id, col, id)
);

create table public.square_payments (
  business_id uuid not null references public.businesses(id) on delete cascade,
  id text not null,
  created_at timestamptz not null,
  status text not null,
  customer_id text,
  data jsonb not null,                               -- the payment as Square returns it (amounts, tip, fees, refunds)
  primary key (business_id, id)
);
create index square_payments_when on public.square_payments (business_id, created_at);

create table public.square_customers (
  business_id uuid not null references public.businesses(id) on delete cascade,
  id text not null,
  name text,                                         -- name only: no emails, phones or addresses
  primary key (business_id, id)
);

-- which Square seller each business is (the Edge Function's token belongs to it)
create table private.square_sellers (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  merchant_id text not null unique,
  synced_at timestamptz
);

-- the businesses the signed-in person belongs to
create or replace function private.my_businesses() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.business_id from public.members m where m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;
grant usage on schema private to authenticated;
grant execute on function private.my_businesses() to authenticated;

alter table public.businesses enable row level security;
alter table public.members enable row level security;
alter table public.items enable row level security;
alter table public.square_payments enable row level security;
alter table public.square_customers enable row level security;
alter table private.square_sellers enable row level security;

create policy "members read their business" on public.businesses for select to authenticated using (id in (select private.my_businesses()));
create policy "members see who's on their business" on public.members for select to authenticated using (business_id in (select private.my_businesses()));
create policy "members read the book" on public.items for select to authenticated using (business_id in (select private.my_businesses()));
create policy "members add to the book" on public.items for insert to authenticated with check (business_id in (select private.my_businesses()));
create policy "members change the book" on public.items for update to authenticated using (business_id in (select private.my_businesses())) with check (business_id in (select private.my_businesses()));
create policy "members remove from the book" on public.items for delete to authenticated using (business_id in (select private.my_businesses()));
create policy "members read payments" on public.square_payments for select to authenticated using (business_id in (select private.my_businesses()));
create policy "members read card customers" on public.square_customers for select to authenticated using (business_id in (select private.my_businesses()));

-- live updates on the phone
alter publication supabase_realtime add table public.items, public.square_payments;

-- receipt photos: one folder per business, private
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict (id) do nothing;
create policy "members read receipts" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1]::uuid in (select private.my_businesses()));
create policy "members add receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1]::uuid in (select private.my_businesses()));
