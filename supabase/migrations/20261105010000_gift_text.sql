-- Gift cards sent by text (Nov 5, 2026): the buyer can send a card to someone's phone instead of their email.
-- send_by says how it goes to them (send_to 'them'); to_phone is their mobile (+1 and ten digits); texted_at is when
-- SolePro's own number texted it (the text Edge Function's Twilio secrets; until they're set, the buyer texts the
-- link from their own phone from the thank-you page).
alter table public.gift_orders add column if not exists send_by text not null default 'email' check (send_by in ('email', 'text'));
alter table public.gift_orders add column if not exists to_phone text check (to_phone is null or to_phone ~ '^\+1[0-9]{10}$');
alter table public.gift_orders add column if not exists texted_at timestamptz;
