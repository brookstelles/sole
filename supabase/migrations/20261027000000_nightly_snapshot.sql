-- A copy of every business's book inside the database each night (2 am Eastern), kept 30 nights, so anything deleted
-- or overwritten by mistake can be put back as it was. Only reachable with SQL (private schema, no API access).
create extension if not exists pg_cron;
create table private.book_snapshots (
  taken_at timestamptz not null default now(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  profile jsonb,                                      -- businesses.data that night
  items jsonb not null,                               -- every row of the book: [{col, id, data}]
  n int not null,
  primary key (business_id, taken_at)
);
alter table private.book_snapshots enable row level security;

create or replace function private.snapshot_books() returns void
language sql security definer set search_path = '' as $$
  insert into private.book_snapshots (business_id, profile, items, n)
    select b.id, b.data, coalesce(jsonb_agg(jsonb_build_object('col', i.col, 'id', i.id, 'data', i.data)) filter (where i.id is not null), '[]'::jsonb), count(i.id)
    from public.businesses b left join public.items i on i.business_id = b.id group by b.id, b.data;
  delete from private.book_snapshots where taken_at < now() - interval '30 days';
$$;
revoke all on function private.snapshot_books() from public, anon, authenticated;

-- 06:00 UTC is 2 am Eastern in summer and 1 am in winter
select cron.schedule('sole-nightly-snapshot', '0 6 * * *', $$select private.snapshot_books()$$);
-- To put a business's book back as it was (newest snapshot first; pick one):
--   select taken_at, n from private.book_snapshots where business_id = '<id>' order by taken_at desc;
