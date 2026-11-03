-- Deleting your own account (asked for Nov 3, 2026: Apple and Google require it inside the app). Called only by the
-- account Edge Function (service role), after it has stopped any plan at Stripe and removed the business's files.
-- For an owner: the business goes, and with it (on delete cascade) its book (items), card payments and customers, the
-- Square link, form links, texts, the calendar feed, phones with notifications on and the nightly snapshots. For
-- someone working for a business: only their place on it. Either way: their phones and any paid code for their email.
-- The house account (plan 'house') is refused: SolePro closes it by hand. The sign-in itself (auth.users) is deleted
-- by the function afterwards. Returns the ids of the businesses deleted.
create or replace function public.close_account(p_email text) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email)); gone uuid[];
begin
  if e = '' then raise exception 'no email'; end if;
  if exists (select 1 from public.members m join public.businesses b on b.id = m.business_id where m.email = e and b.plan = 'house') then
    raise exception 'house account';
  end if;
  select coalesce(array_agg(business_id), '{}') into gone from public.members where email = e and role = 'owner';
  delete from public.businesses where id = any(gone);
  delete from public.members where email = e;
  delete from public.push_subs where email = e;
  delete from public.invite_codes where email = e;
  return gone;
end $$;
revoke all on function public.close_account(text) from public, anon, authenticated;
grant execute on function public.close_account(text) to service_role;
