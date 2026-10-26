-- One-time links for a client to fill in a form on their own phone (sole.brookstelles.com/?f=<token>). Members make
-- them; the client never signs in: the `intake` Edge Function reads the link and saves the answers into the book.
create table public.form_links (
  token text primary key check (length(token) >= 32),
  business_id uuid not null references public.businesses(id) on delete cascade,
  client text,                                        -- the client's key in the book
  name text,                                          -- their name, to greet them and fill it in
  form text not null,                                 -- the form's name
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz
);
alter table public.form_links enable row level security;
create policy "members make form links" on public.form_links for insert to authenticated with check (business_id in (select private.my_businesses()));
create policy "members see their form links" on public.form_links for select to authenticated using (business_id in (select private.my_businesses()));
