// Brooks's owner view (asked for Oct 29, 2026): every business on SolePro at a glance, so nobody needs approving and he
// can still see who's in and how they're doing. Only SolePro's owners (OWNERS) get an answer:
//   "check": {ok} for an owner, so the app shows the owner view in the account sheet
//   "overview": every business (public.admin_overview: plan, joined, last sign-in, last change, counts; never a
//               business's clients, notes or money) and the totals (paying, trials, monthly revenue, trials ending soon)
// Deploy with verify_jwt off. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const OWNERS = ['brookstelles@gmail.com'];
const ENDED = ['canceled', 'unpaid', 'incomplete_expired', 'paused'];
const DAY = 864e5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);
  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u } = await db.auth.getUser(token), email = (u?.user?.email ?? '').toLowerCase();
    const { action } = JSON.parse((await req.text()) || '{}');
    if (!OWNERS.includes(email)) return reply(action === 'check' ? { ok: false } : { error: 'not an owner' }, action === 'check' ? 200 : 403);
    if (action === 'check') return reply({ ok: true });
    if (action !== 'overview') return reply({ error: 'unknown action' }, 400);
    const { data, error } = await db.rpc('admin_overview'); if (error) throw error;
    const L = (data ?? []) as any[], now = Date.now(), live = (b: any) => ['monthly', 'yearly'].includes(b.plan) && !ENDED.includes(b.plan_status);
    const paying = L.filter(b => live(b) && (b.plan_status === 'active' || b.plan_status === 'past_due'));
    const totals = {
      paying: paying.length,
      trials: L.filter(b => b.plan_status === 'trialing').length,
      mrr: paying.filter(b => !b.plan_cancel_at).reduce((n, b) => n + (b.plan === 'yearly' ? 290 / 12 : 29), 0),
      ending7: L.filter(b => b.plan_status === 'trialing' && b.plan_until && new Date(b.plan_until).getTime() - now < 7 * DAY).length,
      new7: L.filter(b => now - new Date(b.created_at).getTime() < 7 * DAY).length,
    };
    const test = env('STRIPE_SECRET_KEY').startsWith('sk_test_');
    return reply({ businesses: L, totals, test, stripe: env('STRIPE_SECRET_KEY') ? `https://dashboard.stripe.com/${test ? 'test/' : ''}customers/` : null });
  } catch (e) {
    console.error('admin:', String((e as Error).message ?? e));
    return reply({ error: 'failed' }, 500);
  }
});
