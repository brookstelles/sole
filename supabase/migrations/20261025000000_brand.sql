-- Sole's own pictures for emails (the sign-in code email's header): public, so mail apps can show them.
-- Nothing private goes here; files are uploaded by hand, not by the app.
insert into storage.buckets (id, name, public, allowed_mime_types) values ('brand', 'brand', true, array['image/png'])
on conflict (id) do nothing;
