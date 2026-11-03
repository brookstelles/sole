// Deleting your own SolePro account (asked for Nov 3, 2026: Apple and Google require it inside the app; account sheet →
// Delete my account, or "Delete this sign-in" for an email with no business). POST JSON with the signed-in person's token:
//   "check": what would go: {role: 'owner' | 'staff' | null, biz, others (other people on the business), paid (a plan
//            that is still running), house}
//   "delete" {confirm: 'DELETE'}: for an owner, the business and its whole book (public.close_account: clients, visits,
//            notes, forms, papers, card payments, texts, links, phones, nightly snapshots, all by on delete cascade),
//            its receipts and papers in storage, and its plan stopped at Stripe first (nothing is deleted if that fails);
//            for someone working for a business, only their place on it; then the sign-in itself (auth.users, which
//            takes their Face ID passkeys with it). Stripe keeps its own payment records (the law asks for them).
// The house account (plan 'house') is never deleted here: SolePro closes it by hand.
// Needs migration 20261103000000_close_account.sql. Deploy with verify_jwt off. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase; STRIPE_SECRET_KEY is the billing function's.
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const KEY = env('STRIPE_SECRET_KEY');
const ENDED = ['canceled', 'unpaid', 'incomplete_expired', 'paused', 'incomplete'];

// a subscription stopped now (no refund, no more charges); one Stripe no longer has counts as stopped
async function cancel(sub: string) {
  const r = await fetch('https://api.stripe.com/v1/subscriptions/' + encodeURIComponent(sub), { method: 'DELETE', headers: { Authorization: 'Bearer ' + KEY } });
  if (r.ok) return;
  const j = await r.json().catch(() => ({}));
  if (j.error?.code === 'resource_missing') return;
  throw new Error(`stripe cancel ${sub}: ${j.error?.message ?? r.status}`);
}
// every file of a business in the receipts bucket (receipts at the top, papers under papers/)
async function removeFiles(biz: string) {
  const bucket = db.storage.from('receipts');
  for (const dir of [biz, `${biz}/papers`]) {
    for (;;) {
      const { data, error } = await bucket.list(dir, { limit: 1000 }); if (error) throw error;
      const files = (data ?? []).filter(f => f.id).map(f => `${dir}/${f.name}`);   // folders have no id
      if (!files.length) break;
      const { error: e2 } = await bucket.remove(files); if (e2) throw e2;
      if (files.length < 1000) break;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);
  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u } = await db.auth.getUser(token), user = u?.user, email = (user?.email ?? '').toLowerCase();
    if (!user || !email) return reply({ error: 'sign in first' }, 401);
    const { action, confirm } = JSON.parse((await req.text()) || '{}');
    const { data: mine, error } = await db.from('members').select('business_id,role').eq('email', email); if (error) throw error;
    const ids = (mine ?? []).map(m => m.business_id);
    const { data: bizs, error: e1 } = ids.length ? await db.from('businesses').select('id,name,data,plan,plan_status,stripe_sub').in('id', ids) : { data: [], error: null }; if (e1) throw e1;
    const owned = (bizs ?? []).filter(b => (mine ?? []).some(m => m.business_id === b.id && m.role === 'owner'));
    const first = (bizs ?? [])[0], role = (mine ?? [])[0]?.role ?? null, name = (b: any) => b?.data?.biz || b?.name || null;
    if ((bizs ?? []).some(b => b.plan === 'house')) return reply({ error: 'house', house: true, role, biz: name(first) });
    // plans still charging: an owned business's, and a paid code this email never used to set one up
    const { data: codes, error: e3 } = await db.from('invite_codes').select('stripe_sub,plan_status').eq('email', email).not('stripe_sub', 'is', null); if (e3) throw e3;
    const subs = [...new Set([...owned, ...(codes ?? [])].filter(x => x.stripe_sub && !ENDED.includes(x.plan_status ?? '')).map(x => x.stripe_sub as string))];

    if (action === 'check') {
      let others = 0;
      if (first) { const { count, error: e4 } = await db.from('members').select('email', { count: 'exact', head: true }).eq('business_id', first.id).neq('email', email); if (e4) throw e4; others = count ?? 0; }
      return reply({ role, biz: name(first), others, paid: subs.length > 0 });
    }
    if (action !== 'delete') return reply({ error: 'unknown action' }, 400);
    if (confirm !== 'DELETE') return reply({ error: 'confirm' }, 400);

    // money first: if a plan can't be stopped, nothing is deleted
    if (subs.length && !KEY) return reply({ error: 'billing' }, 500);
    try { for (const s of subs) await cancel(s); } catch (e) { console.error('account:', String((e as Error).message ?? e)); return reply({ error: 'billing' }, 502); }
    for (const b of owned) await removeFiles(b.id);
    const { error: e5 } = await db.rpc('close_account', { p_email: email }); if (e5) throw e5;
    const { error: e6 } = await db.auth.admin.deleteUser(user.id); if (e6) throw e6;
    // SolePro's owners hear about it, as they do about a new business
    if (owned.length) await fetch(env('SUPABASE_URL') + '/functions/v1/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env('SUPABASE_SERVICE_ROLE_KEY') },
      body: JSON.stringify({ action: 'owners', msg: { title: 'A business left SolePro', body: `${owned.map(name).join(', ')} deleted its account${subs.length ? ' (plan stopped)' : ''}.`, url: '/', tag: 'gone-' + owned[0].id } }) })
      .catch(e => console.error('account: push', String(e)));
    return reply({ ok: true });
  } catch (e) {
    console.error('account:', String((e as Error).message ?? e));
    return reply({ error: 'failed' }, 500);
  }
});
