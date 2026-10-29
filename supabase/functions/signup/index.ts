// A new business on SolePro (asked for Oct 26, 2026). Someone signed in with an email that isn't on a business yet:
// "check" says whether their invite code is good; "create" takes the profile SolePro's setup screens made and, with the
// code, makes the business and its owner (public.create_business, in one step). The profile is the business's own
// (only its members read it), but it is checked here: the right shape and size, no markup, and it is always a real,
// brand-new book (real, fresh, no public website, no Square).
// Deploy with verify_jwt off: it checks the signed-in person's token itself. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const TRADES = ['massage', 'hair', 'barber', 'tattoo', 'landscape', 'tennis'];   // the built-in templates a business starts from
const code = (c: unknown) => String(c ?? '').trim().toUpperCase();

// every string in the profile: no markup (the app shows these words), and a logo only as a small picture
function clean(v: any, key = ''): boolean {
  if (typeof v === 'string') return key === 'logo' ? /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < 300_000 : !/[<>]/.test(v) && v.length <= 4000;
  if (Array.isArray(v)) return v.length <= 500 && v.every(x => clean(x));
  if (v && typeof v === 'object') return Object.keys(v).length <= 500 && Object.entries(v).every(([k, x]) => k.length <= 60 && clean(x, k));
  return v === null || typeof v === 'number' || typeof v === 'boolean';
}
function profileOk(p: any) {
  if (!p || typeof p !== 'object' || Array.isArray(p) || JSON.stringify(p).length > 400_000 || !clean(p)) return false;
  const name = String(p.biz ?? '').trim(), owner = String(p.owner ?? '').trim();
  if (!name || name.length > 100 || !owner || owner.length > 60) return false;
  const svc = Object.values(p.services ?? {}) as any[];
  return svc.length > 0 && svc.length <= 60 && svc.every(s => s && typeof s.name === 'string' && s.name.trim() && Number.isInteger(s.min) && s.min >= 5 && s.min <= 720 && typeof s.price === 'number' && s.price >= 0 && s.price <= 100000);
}
// a code bought with a card (the billing function) is for the email that paid, and only while its plan is on
async function codeOk(c: string, email: string) {
  const { data, error } = await db.from('invite_codes').select('uses,max_uses,expires_at,email,plan_status').eq('code', c).maybeSingle(); if (error) throw error;
  return !!data && data.uses < data.max_uses && (!data.expires_at || new Date(data.expires_at) > new Date()) && (!data.email || data.email === email)
    && !['canceled', 'unpaid', 'incomplete_expired', 'paused'].includes(data.plan_status ?? '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);
  try {
    const body = await req.text(); if (body.length > 500_000) return reply({ error: 'too big' });
    const { action, code: raw, profile, trade } = JSON.parse(body || '{}');
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u } = await db.auth.getUser(token), email = (u?.user?.email ?? '').toLowerCase();
    if (!email) return reply({ error: 'sign in first' }, 401);
    const { data: on, error: me } = await db.from('members').select('business_id').eq('email', email).limit(1); if (me) throw me;
    if (on && on.length) return reply({ error: 'already' });
    const c = code(raw);
    if (action === 'check') return reply(c && await codeOk(c, email) ? { ok: true } : { error: 'bad code' });
    if (action === 'create') {
      if (!TRADES.includes(trade) || !profileOk(profile)) return reply({ error: 'bad profile' });
      // a real, brand-new book, whatever the page sent
      const { cloud: _c, site: _s, sample: _x, books: _b, ...rest } = profile;
      const data = { ...rest, biz: String(profile.biz).trim(), owner: String(profile.owner).trim(), real: true, fresh: true, custom: true };
      const { data: id, error } = await db.rpc('create_business', { p_email: email, p_name: data.biz, p_profile: trade, p_data: data, p_code: c });
      if (error) return reply({ error: /bad code/.test(error.message) ? 'bad code' : /already/.test(error.message) ? 'already' : 'failed' }, /bad code|already/.test(error.message) ? 200 : 500);
      // SolePro's owners hear about every new business (nobody approves them, but Brooks likes to know)
      try {
        await fetch(env('SUPABASE_URL') + '/functions/v1/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env('SUPABASE_SERVICE_ROLE_KEY') },
          body: JSON.stringify({ action: 'owners', msg: { title: 'New on SolePro', body: `${data.biz} (${trade}) ${c.startsWith('PAID-') ? 'started a free trial' : 'joined with an invite code'}.`, url: '/', tag: 'new-' + id } }) });
      } catch (e) { console.error('signup: push', String(e)); }
      return reply({ ok: true, business_id: id });
    }
    return reply({ error: 'what?' });
  } catch (e) {
    console.error('signup:', String((e as Error).message ?? e));
    return reply({ error: 'failed' }, 500);
  }
});
