-- Messages from the business's website live in the book as their own kind of row ("inbox"), written by the intake
-- Edge Function and marked answered by the owner in Sole.
alter table public.items drop constraint if exists items_col_check;
alter table public.items add constraint items_col_check check (col in ('appts', 'blocks', 'clients', 'ledger', 'visits', 'weeks', 'forms', 'people', 'days', 'inbox'));
