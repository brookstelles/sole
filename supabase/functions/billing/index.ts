// SolePro's plan (asked for Oct 28, 2026): $29 a month, or $290 a year (two months free), after a 14-day free trial,
// a card up front, paid through Stripe (Sellet Solutions LLC's account). Anyone with a card can start a business; nobody has to approve them.
// Actions (POST JSON with the signed-in person's token):
//   "status" (public): {on}: is Stripe set up
//   "start" {yearly}: someone signed in whose email isn't on a business: Stripe's checkout page for the trial, or their code
//            straight away if they already paid and closed the page before setting up
//   "claim" {session}: back from checkout: the one-time code that lets this email set up one business
//   "portal": a member: Stripe's own page to change the card, see receipts or cancel
//   "restart" {yearly}: a member whose plan has ended: checkout again (no second trial) for the same business
// And Stripe's webhook (a Stripe-Signature header): a finished checkout, and every change to a subscription (trial,
// paid, card failed, canceled), which lands on the business (plan_status, plan_until); the database keeps a book whose
// plan has ended read-only (private.book_open). The prices are made the first time (lookup keys in PRICES).
// Off until the Edge Function secrets STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set (steps in GO-LIVE.md).
// Deploy with verify_jwt off. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const KEY = env('STRIPE_SECRET_KEY'), HOOK = env('STRIPE_WEBHOOK_SECRET'), APP = 'https://app.solepro.app';
const on = () => !!(KEY && HOOK);
const ENDED = ['canceled', 'unpaid', 'incomplete_expired', 'paused'];   // a plan in one of these keeps the book read-only
const TRIAL_DAYS = 14;

// Stripe's API takes form fields, nested as a[b][0][c]
function form(o: Record<string, unknown>, pre = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(o)) {
    if (v == null) continue; const key = pre ? `${pre}[${k}]` : k;
    if (typeof v === 'object') form(v as Record<string, unknown>, key, out); else out.append(key, String(v));
  }
  return out;
}
async function stripe(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>) {
  const r = await fetch('https://api.stripe.com/v1/' + path, { method, body: body ? form(body) : undefined,
    headers: { Authorization: 'Bearer ' + KEY, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`stripe ${path.split('?')[0]}: ${j.error?.message ?? r.status}`);
  return j;
}
// the two prices, each found by its lookup key or made the first time (a new price later: a new lookup key here)
const PRICES = { monthly: { key: 'solepro_monthly', cents: 2900, interval: 'month' }, yearly: { key: 'solepro_yearly', cents: 29000, interval: 'year' } };
const PRICE_ID: Record<string, string> = {};
let PRODUCT = '';
async function price(plan: 'monthly' | 'yearly') {
  if (PRICE_ID[plan]) return PRICE_ID[plan];
  const P = PRICES[plan], found = await stripe('GET', `prices?active=true&lookup_keys%5B%5D=${P.key}`);
  if (found.data?.length) return PRICE_ID[plan] = found.data[0].id;
  if (!PRODUCT) {   // one product, SolePro, with both prices
    const other = await stripe('GET', `prices?active=true&lookup_keys%5B%5D=${PRICES[plan === 'monthly' ? 'yearly' : 'monthly'].key}`);
    PRODUCT = other.data?.[0]?.product ?? (await stripe('POST', 'products', { name: 'SolePro', description: 'The app for people who work for themselves', metadata: { app: 'solepro' } })).id;
  }
  const p = await stripe('POST', 'prices', { product: PRODUCT, unit_amount: P.cents, currency: 'usd', recurring: { interval: P.interval }, lookup_key: P.key, nickname: 'SolePro ' + plan });
  return PRICE_ID[plan] = p.id;
}

const iso = (t: unknown) => typeof t === 'number' ? new Date(t * 1000).toISOString() : null;
// a subscription as Stripe has it now: its status, when the trial or the month paid for ends, and a cancel date
const planOf = (s: any) => ({ plan: s.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly', plan_status: String(s.status), plan_cancel_at: iso(s.cancel_at),
  plan_until: iso(s.status === 'trialing' ? s.trial_end : (s.current_period_end ?? s.items?.data?.[0]?.current_period_end)) });
// onto its business (or the code still waiting to make one); a restarted plan names its business
async function record(subId: string) {
  const s = await stripe('GET', 'subscriptions/' + subId);   // always the latest: webhooks can arrive out of order
  if (s.metadata?.app !== 'solepro') return;
  const row = planOf(s), biz = s.metadata?.business_id;
  const q = biz ? db.from('businesses').update({ ...row, stripe_customer: s.customer, stripe_sub: s.id }).eq('id', biz)
    : db.from('businesses').update(row).eq('stripe_sub', s.id);
  const { error } = await q; if (error) throw error;
  if (!biz) { const { error: e2 } = await db.from('invite_codes').update(row).eq('stripe_sub', s.id); if (e2) throw e2; }
}
// the one-time code a finished checkout earns: one business, for the email that signed in and paid
async function codeFor(sess: any) {
  const sub = typeof sess.subscription === 'string' ? sess.subscription : sess.subscription?.id; if (!sub) throw new Error('no subscription');
  const had = await db.from('invite_codes').select('code').eq('stripe_sub', sub).maybeSingle(); if (had.error) throw had.error; if (had.data) return had.data.code;
  const s = await stripe('GET', 'subscriptions/' + sub), email = String(sess.metadata?.email ?? '').toLowerCase();
  const code = 'PAID-' + crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  const { error } = await db.from('invite_codes').insert({ code, note: 'Paid by card: ' + email, max_uses: 1, email, stripe_customer: sess.customer, stripe_sub: sub, ...planOf(s) });
  if (error) {   // the webhook and the page back from checkout can arrive together: one code either way
    if (error.code === '23505') { const again = await db.from('invite_codes').select('code').eq('stripe_sub', sub).maybeSingle(); if (again.data) return again.data.code; }
    throw error;
  }
  return code;
}

// Stripe signs each webhook: HMAC-SHA256 of "<time>.<body>" with the endpoint's secret, sent as t=...,v1=...
async function fromStripe(req: Request, raw: string) {
  const parts = (req.headers.get('stripe-signature') ?? '').split(',').map(x => x.split('=')), t = parts.find(p => p[0] === 't')?.[1];
  if (!t || !HOOK || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(HOOK), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)))].map(b => b.toString(16).padStart(2, '0')).join('');
  return parts.filter(p => p[0] === 'v1').some(([, v]) => { if (!v || v.length !== mac.length) return false; let d = 0; for (let i = 0; i < v.length; i++) d |= v.charCodeAt(i) ^ mac.charCodeAt(i); return d === 0; });
}
async function hook(ev: any) {
  const o = ev.data?.object ?? {};
  if (ev.type === 'checkout.session.completed') {
    if (o.metadata?.app !== 'solepro' || o.mode !== 'subscription') return;
    if (o.metadata?.business_id) await record(typeof o.subscription === 'string' ? o.subscription : o.subscription?.id);   // a plan started again
    else await codeFor(o);   // waiting for them, even if they closed the page before coming back
  } else if (ev.type?.startsWith('customer.subscription.')) await record(o.id);
}

async function who(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data } = await db.auth.getUser(token); return { email: (data?.user?.email ?? '').toLowerCase(), uid: data?.user?.id ?? '' };
}
async function businessOf(email: string) {
  const { data: m, error } = await db.from('members').select('business_id').eq('email', email).limit(1); if (error) throw error;
  if (!m || !m.length) return null;
  const { data: b, error: e2 } = await db.from('businesses').select('id,plan,plan_status,stripe_customer').eq('id', m[0].business_id).maybeSingle(); if (e2) throw e2;
  return b;
}
const checkout = async (yearly: unknown, o: Record<string, unknown>) => (await stripe('POST', 'checkout/sessions', { mode: 'subscription', line_items: [{ price: await price(yearly === true ? 'yearly' : 'monthly'), quantity: 1 }],
  payment_method_collection: 'always', allow_promotion_codes: 'true', ...o })).url as string;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);
  try {
    const raw = await req.text(); if (raw.length > 200_000) return reply({ error: 'too big' }, 413);
    if (req.headers.get('stripe-signature')) {   // Stripe telling us something
      if (!(await fromStripe(req, raw))) return reply({ error: 'bad signature' }, 400);
      await hook(JSON.parse(raw)); return reply({ received: true });
    }
    const b = JSON.parse(raw || '{}');
    if (b.action === 'status') return reply({ on: on() });
    if (!on()) return reply({ error: 'off' });
    const { email, uid } = await who(req); if (!email) return reply({ error: 'sign in first' }, 401);
    const biz = await businessOf(email);
    if (b.action === 'start' || b.action === 'claim') {
      if (biz) return reply({ error: 'already' });
      if (b.action === 'claim') {
        const id = String(b.session ?? ''); if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(id)) return reply({ error: 'gone' });
        const sess = await stripe('GET', 'checkout/sessions/' + id);
        if (sess.status !== 'complete' || sess.metadata?.app !== 'solepro' || String(sess.metadata?.email ?? '').toLowerCase() !== email) return reply({ error: 'gone' });
        return reply({ code: await codeFor(sess) });
      }
      // paid already, then closed the page before setting up: carry on with that
      const { data: waiting, error } = await db.from('invite_codes').select('code,plan_status').eq('email', email).eq('uses', 0).not('stripe_sub', 'is', null); if (error) throw error;
      const w = (waiting ?? []).find(x => !ENDED.includes(x.plan_status ?? '')); if (w) return reply({ code: w.code });
      return reply({ url: await checkout(b.yearly, { customer_email: email, client_reference_id: uid, metadata: { app: 'solepro', email },
        subscription_data: { trial_period_days: TRIAL_DAYS, description: 'SolePro', metadata: { app: 'solepro', email } },
        success_url: APP + '/?paid={CHECKOUT_SESSION_ID}', cancel_url: APP + '/?start' }) });
    }
    if (!biz) return reply({ error: 'not on a business' }, 403);
    if (b.action === 'portal') {
      if (!biz.stripe_customer) return reply({ error: 'no plan' });
      return reply({ url: (await stripe('POST', 'billing_portal/sessions', { customer: biz.stripe_customer, return_url: APP + '/' })).url });
    }
    if (b.action === 'restart') {
      if (!['monthly', 'yearly'].includes(biz.plan) || !biz.stripe_customer) return reply({ error: 'no plan' });
      if (!ENDED.includes(biz.plan_status ?? '')) return reply({ error: 'still on' });
      return reply({ url: await checkout(b.yearly, { customer: biz.stripe_customer, metadata: { app: 'solepro', email, business_id: biz.id },
        subscription_data: { description: 'SolePro', metadata: { app: 'solepro', email, business_id: biz.id } },
        success_url: APP + '/?restarted=1', cancel_url: APP + '/' }) });
    }
    return reply({ error: 'unknown action' }, 400);
  } catch (e) {
    console.error('billing:', String((e as Error).message ?? e));
    return reply({ error: 'failed' }, 500);
  }
});
