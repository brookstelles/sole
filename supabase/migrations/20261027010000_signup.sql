-- A new business on Sole, set up by its owner (asked for Oct 26, 2026): someone signs in with an email that isn't on a
-- business yet, gives an invite code, and goes through Sole's setup screens; the signup Edge Function then makes the
-- business and its owner here, in one step.
-- invite_codes: the codes Brooks hands out, each good for a number of new businesses (uses, max_uses) until it expires.
-- Row level security on with no policies: only the Edge Function (service role) reads them.
create table if not exists public.invite_codes (
  code text primary key check (code = upper(code) and length(code) between 4 and 40),
  note text,
  uses int not null default 0,
  max_uses int not null default 1 check (max_uses > 0),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.invite_codes enable row level security;
revoke all on table public.invite_codes from anon, authenticated;
grant select, insert, update, delete on table public.invite_codes to service_role;

-- which code made which business (for Brooks: who came in with whose code)
alter table public.businesses add column if not exists invite text;

-- the business, its owner and the code's use, together or not at all. Refuses an email that is already on a business
-- and a code that is used up, expired or unknown. Only the service role (the signup Edge Function) may call it.
create or replace function public.create_business(p_email text, p_name text, p_profile text, p_data jsonb, p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  if exists (select 1 from public.members where email = lower(p_email)) then raise exception 'already on a business'; end if;
  update public.invite_codes set uses = uses + 1
    where code = upper(trim(p_code)) and uses < max_uses and (expires_at is null or expires_at > now());
  if not found then raise exception 'bad code'; end if;
  insert into public.businesses (name, profile, data, invite) values (p_name, p_profile, p_data, upper(trim(p_code))) returning id into b;
  insert into public.members (business_id, email, role) values (b, lower(p_email), 'owner');
  return b;
end $$;
revoke all on function public.create_business(text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_business(text, text, text, jsonb, text) to service_role;
