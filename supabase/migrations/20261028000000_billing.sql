-- SolePro's plan (asked for Oct 28, 2026): $29 a month or $290 a year (two months free), after a 14-day free trial,
-- a card up front, through Stripe (Sellet Solutions LLC's account; the billing Edge Function). Anyone with a card can
-- start a business.
-- A business's plan is kept here as Stripe last told the billing function. A book whose plan has ended stays readable
-- and printable but takes no changes (private.book_open, in the book's policies). Heart and Soul is the house account
-- (plan 'house'); a business made with a hand-made invite code has no plan (null) and is free.
alter table public.businesses
  add column if not exists plan text check (plan in ('house', 'monthly', 'yearly')),
  add column if not exists plan_status text,           -- Stripe's: trialing, active, past_due, canceled, unpaid, ...
  add column if not exists plan_until timestamptz,     -- the trial's end, or the end of the month paid for
  add column if not exists plan_cancel_at timestamptz, -- set when the owner has canceled and it runs to the end
  add column if not exists stripe_customer text,
  add column if not exists stripe_sub text;
create unique index if not exists businesses_stripe_sub on public.businesses (stripe_sub) where stripe_sub is not null;
update public.businesses set plan = 'house' where data -> 'site' ->> 'slug' = 'heart-and-soul' and plan is null;

-- a finished checkout earns a one-time code for the email that paid, so the business is made by the same setup
-- screens and the same create_business as an invite
alter table public.invite_codes
  add column if not exists email text check (email = lower(email)),
  add column if not exists plan text check (plan in ('monthly', 'yearly')),
  add column if not exists stripe_customer text,
  add column if not exists stripe_sub text unique,
  add column if not exists plan_status text,
  add column if not exists plan_until timestamptz,
  add column if not exists plan_cancel_at timestamptz;

-- may this business's book take changes? Yes, unless it's on a paid plan that has ended
create or replace function private.book_open(b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select not (x.plan in ('monthly', 'yearly') and coalesce(x.plan_status, '') in ('canceled', 'unpaid', 'incomplete_expired', 'paused'))
    from public.businesses x where x.id = b), true)
$$;
grant execute on function private.book_open(uuid) to authenticated;

drop policy if exists "members add to the book" on public.items;
drop policy if exists "members change the book" on public.items;
drop policy if exists "members remove from the book" on public.items;
create policy "members add to the book" on public.items for insert to authenticated
  with check (business_id in (select private.my_businesses()) and private.book_open(business_id));
create policy "members change the book" on public.items for update to authenticated
  using (business_id in (select private.my_businesses())) with check (business_id in (select private.my_businesses()) and private.book_open(business_id));
create policy "members remove from the book" on public.items for delete to authenticated
  using (business_id in (select private.my_businesses()) and private.book_open(business_id));
drop policy if exists "members add receipts" on storage.objects;
create policy "members add receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1]::uuid in (select private.my_businesses()) and private.book_open((storage.foldername(name))[1]::uuid));

-- the business, its owner and the code's use, together or not at all (as before), now also: a code bought with a
-- card works only for the email that paid, not once its plan has ended, and carries the plan onto the business
create or replace function public.create_business(p_email text, p_name text, p_profile text, p_data jsonb, p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare b uuid; c public.invite_codes;
begin
  if exists (select 1 from public.members where email = lower(p_email)) then raise exception 'already on a business'; end if;
  update public.invite_codes set uses = uses + 1
    where code = upper(trim(p_code)) and uses < max_uses and (expires_at is null or expires_at > now())
      and (email is null or email = lower(p_email))
      and coalesce(plan_status, '') not in ('canceled', 'unpaid', 'incomplete_expired', 'paused')
    returning * into c;
  if not found then raise exception 'bad code'; end if;
  insert into public.businesses (name, profile, data, invite, plan, plan_status, plan_until, plan_cancel_at, stripe_customer, stripe_sub)
    values (p_name, p_profile, p_data, c.code, case when c.stripe_sub is not null then coalesce(c.plan, 'monthly') end, c.plan_status, c.plan_until, c.plan_cancel_at, c.stripe_customer, c.stripe_sub)
    returning id into b;
  insert into public.members (business_id, email, role) values (b, lower(p_email), 'owner');
  return b;
end $$;
revoke all on function public.create_business(text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_business(text, text, text, jsonb, text) to service_role;
