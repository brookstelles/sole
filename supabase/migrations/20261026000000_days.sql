-- Hours for a single day (open a day she's usually closed, or stay later): items with col 'days', keyed by date.
alter table public.items drop constraint if exists items_col_check;
alter table public.items add constraint items_col_check check (col in ('appts', 'blocks', 'clients', 'ledger', 'visits', 'weeks', 'forms', 'people', 'days'));
