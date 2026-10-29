-- Brooks's owner view (asked for Oct 29, 2026): every business on SolePro at a glance, so he can see who's in and how
-- they're doing without approving anyone. Counts and dates only: never a business's clients, notes or money.
-- Called by the admin Edge Function (service role), which first checks the signed-in person is one of SolePro's owners.
create or replace function public.admin_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
    select b.id, coalesce(nullif(b.data ->> 'biz', ''), b.name) as name, b.profile as trade, b.data ->> 'owner' as owner,
      b.created_at, b.plan, b.plan_status, b.plan_until, b.plan_cancel_at, b.stripe_customer, b.invite,
      (select coalesce(jsonb_agg(m.email order by m.email), '[]'::jsonb) from public.members m where m.business_id = b.id) as members,
      (select max(u.last_sign_in_at) from auth.users u join public.members m on lower(u.email) = m.email where m.business_id = b.id) as last_sign_in,
      c.last_change, c.clients, c.appts, c.visits_30, c.upcoming, c.forms, c.messages,
      (select count(*) from public.push_subs p where p.business_id = b.id) as phones,
      exists (select 1 from public.square_sellers s where s.business_id = b.id) as square,
      (select count(*) from public.texts t where t.business_id = b.id and t.dir = 'out' and t.created_at > now() - interval '30 days') as texts_30
    from public.businesses b
    left join lateral (
      select max(i.updated_at) as last_change,
        count(*) filter (where i.col = 'clients') as clients,
        count(*) filter (where i.col = 'appts') as appts,
        count(*) filter (where i.col = 'appts' and i.data ->> 'date' between to_char(now() - interval '30 days', 'YYYY-MM-DD') and to_char(now(), 'YYYY-MM-DD')) as visits_30,
        count(*) filter (where i.col = 'appts' and i.data ->> 'date' > to_char(now(), 'YYYY-MM-DD')) as upcoming,
        count(*) filter (where i.col = 'forms') as forms,
        count(*) filter (where i.col = 'inbox') as messages
      from public.items i where i.business_id = b.id) c on true
  ) x
$$;
revoke all on function public.admin_overview() from public, anon, authenticated;
grant execute on function public.admin_overview() to service_role;
