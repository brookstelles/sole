-- The Edge Function talks to the database through the API, which only serves the public schema, so the Square seller
-- row was never saved (and Square's notices were turned away as an unknown seller). Row level security stays on with
-- no policies: only the Edge Function (service role) reads or writes it.
alter table private.square_sellers set schema public;
