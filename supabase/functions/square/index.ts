// Square for Sole: Square calls this the moment a payment or customer changes (a webhook), the app calls it to
// pull history ("sync"), and the database calls it every 15 minutes to catch up (20261026040000_square_catchup.sql).
// Read only on Square. Deploy with verify_jwt off: it checks Square's signature itself, a signed-in member's token
// for sync, and the database's own token (cron_token_ok) for the catch-up.
// Secrets: SQUARE_ACCESS_TOKEN (the Sole app's production token for the seller), SQUARE_WEBHOOK_SIGNATURE_KEY,
// SQUARE_WEBHOOK_URL (this function's address exactly as entered in Square). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const SQ = 'https://connect.squareup.com/v2';
const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function square(path: string) {
  const r = await fetch(SQ + path, { headers: { Authorization: `Bearer ${env('SQUARE_ACCESS_TOKEN')}`, 'Square-Version': '2024-10-17', 'Content-Type': 'application/json' } });
  if (!r.ok) throw new Error(`Square ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}
const payRow = (business_id: string, p: any) => ({ business_id, id: p.id, created_at: p.created_at, status: p.status, customer_id: p.customer_id ?? null, data: p });
const nameOf = (c: any) => [c.given_name, c.family_name].filter(Boolean).join(' ').trim() || null;

async function savePayments(business_id: string, list: any[]) {
  for (let i = 0; i < list.length; i += 200) {
    const { error } = await db.from('square_payments').upsert(list.slice(i, i + 200).map(p => payRow(business_id, p)));
    if (error) throw error;
  }
}

// pull payments since `since` (or everything) and every customer's name
async function sync(business_id: string, full: boolean) {
  const { data: seller, error: se } = await db.from('square_sellers').select('*').eq('business_id', business_id).maybeSingle();
  if (se) throw se;
  if (!seller) { const me = await square('/merchants/me'); const { error } = await db.from('square_sellers').upsert({ business_id, merchant_id: me.merchant.id }); if (error) throw error; }
  const since = full || !seller?.synced_at ? '2022-01-01T00:00:00Z' : new Date(new Date(seller.synced_at).getTime() - 3 * 864e5).toISOString();
  let cursor = '', n = 0, pays: any[] = [];
  do {
    const r = await square(`/payments?begin_time=${encodeURIComponent(since)}&sort_order=ASC&limit=100${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
    pays = pays.concat(r.payments ?? []); cursor = r.cursor ?? ''; n++;
  } while (cursor && n < 200);
  await savePayments(business_id, pays);
  cursor = ''; n = 0; let people: any[] = [];
  do {
    const r = await square(`/customers?limit=100${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
    people = people.concat((r.customers ?? []).map((c: any) => ({ business_id, id: c.id, name: nameOf(c) }))); cursor = r.cursor ?? ''; n++;
  } while (cursor && n < 100);
  if (people.length) { const { error } = await db.from('square_customers').upsert(people); if (error) throw error; }
  const { error } = await db.from('square_sellers').update({ synced_at: new Date().toISOString() }).eq('business_id', business_id); if (error) throw error;
  return { payments: pays.length, customers: people.length };
}

// the business a Square seller belongs to. A database error throws, so Square gets an error back and sends the notice
// again later (it retries for a day) instead of it being lost. If no business is linked yet and the seller is the one
// this function's token belongs to, link it to the only business without a seller.
async function sellerOf(merchant: string) {
  const { data, error } = await db.from('square_sellers').select('business_id').eq('merchant_id', merchant).maybeSingle();
  if (error) throw error;
  if (data) return data.business_id as string;
  const me = await square('/merchants/me');
  if (me.merchant?.id !== merchant) return null;
  const [{ data: biz, error: e1 }, { data: linked, error: e2 }] = await Promise.all([db.from('businesses').select('id'), db.from('square_sellers').select('business_id')]);
  if (e1) throw e1; if (e2) throw e2;
  const free = (biz ?? []).filter(b => !(linked ?? []).some(l => l.business_id === b.id));
  if (free.length !== 1) return null;
  const { error: e3 } = await db.from('square_sellers').upsert({ business_id: free[0].id, merchant_id: merchant }); if (e3) throw e3;
  return free[0].id as string;
}

async function signatureOk(req: Request, body: string) {
  const sig = req.headers.get('x-square-hmacsha256-signature') ?? '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('SQUARE_WEBHOOK_SIGNATURE_KEY')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(env('SQUARE_WEBHOOK_URL') + body)));
  const want = btoa(String.fromCharCode(...mac));
  return sig.length === want.length && sig.split('').reduce((d, ch, i) => d | (ch.charCodeAt(0) ^ want.charCodeAt(i)), 0) === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);
  const body = await req.text();
  try {
    // Square: a payment or customer changed
    if (req.headers.get('x-square-hmacsha256-signature')) {
      if (!(await signatureOk(req, body))) return reply({ error: 'bad signature' }, 401);
      const ev = JSON.parse(body), merchant = ev.merchant_id;
      const business_id = await sellerOf(merchant);
      if (!business_id) { console.error('square: notice for a seller no business is linked to'); return reply({ ignored: 'unknown seller' }); }
      const obj = ev.data?.object ?? {};
      // store the payment as Square has it now (a Tap to Pay payment is approved, then completed seconds later)
      if (obj.payment) { let p = obj.payment; try { p = (await square('/payments/' + encodeURIComponent(p.id))).payment ?? p; } catch (_) { /* keep the notice's copy */ } await savePayments(business_id, [p]); }
      if (obj.customer) { const { error } = await db.from('square_customers').upsert({ business_id, id: obj.customer.id, name: nameOf(obj.customer) }); if (error) throw error; }
      return reply({ ok: true });
    }
    // the database's own job, every 15 minutes: catch up every linked seller (and link one if none is yet)
    const cron = req.headers.get('x-sole-cron');
    if (cron) {
      const { data: ok, error } = await db.rpc('cron_token_ok', { t: cron }); if (error) throw error;
      if (!ok) return reply({ error: 'bad token' }, 401);
      const { data: rows, error: e } = await db.from('square_sellers').select('business_id'); if (e) throw e;
      let ids = (rows ?? []).map(r => r.business_id as string);
      if (!ids.length) { const me = await square('/merchants/me'); const b = await sellerOf(me.merchant.id); if (b) ids = [b]; }
      const synced = []; for (const b of ids) synced.push(await sync(b, false));
      return reply({ ok: true, synced });
    }
    // the app: pull history for a business the signed-in person belongs to
    const { business_id, full } = JSON.parse(body || '{}');
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u } = await db.auth.getUser(token);
    const email = (u?.user?.email ?? '').toLowerCase();
    const { data: m } = await db.from('members').select('business_id').eq('business_id', business_id).eq('email', email).maybeSingle();
    if (!email || !m) return reply({ error: 'not a member of this business' }, 403);
    return reply(await sync(business_id, !!full));
  } catch (e) {
    console.error('square:', String((e as Error).message ?? e));
    return reply({ error: String((e as Error).message ?? e) }, 500);
  }
});
