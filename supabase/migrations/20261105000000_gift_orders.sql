-- Digital gift cards (Nov 5, 2026): bought online from a business's gift card page (app.solepro.app/?gift=<site
-- slug>) through Square's checkout, or sent by the owner for a card sold in person. Each row is one card's order:
-- who it's from and for, the message, the code, and the token for its public page (?card=<token>). The card itself
-- lives in the book's ledger (a `gift` entry) once paid, like a card sold in the app. Only the `gift` Edge Function
-- (service role) reads or writes this table.
create table public.gift_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null default 'online' check (kind in ('online', 'sent')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'sent')),
  code text not null check (length(code) between 1 and 40),
  amount numeric(10,2) not null check (amount > 0 and amount <= 2000),
  from_name text, from_email text,
  to_name text, to_email text,
  send_to text not null default 'them' check (send_to in ('them', 'me')),
  message text check (length(message) <= 500),
  view_token text not null unique,
  ledger_uid text,
  square_order_id text, square_link_id text, square_payment_id text,
  emailed_to text[] not null default '{}',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index gift_orders_square on public.gift_orders (square_order_id);
create index gift_orders_business on public.gift_orders (business_id, created_at);
create unique index gift_orders_code on public.gift_orders (business_id, code);
create unique index gift_orders_ledger on public.gift_orders (business_id, ledger_uid) where ledger_uid is not null;
alter table public.gift_orders enable row level security;   -- no policies: the service role only
revoke all on public.gift_orders from anon, authenticated;
grant all on public.gift_orders to service_role;
