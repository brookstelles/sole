// The nightly backup (the private repository brookstelles/heart-and-soul-backup, job "Nightly backup") fetches every
// business's book here: the profile, every item, card customers' names and card payments. No key is kept anywhere: the
// job sends the identity token GitHub signs for it, and only a token for that repository's main branch, made for
// "sole-backup", is answered. Deploy with verify_jwt off.
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';

const REPO = 'brookstelles/heart-and-soul-backup';
const GITHUB = 'https://token.actions.githubusercontent.com';
const jwks = createRemoteJWKSet(new URL(GITHUB + '/.well-known/jwks'));
const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function allowed(token: string) {
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: GITHUB, audience: 'sole-backup' });
    return payload.repository === REPO && payload.ref === 'refs/heads/main' && payload.repository_visibility === 'private';
  } catch (_) { return false; }
}

async function all(table: string, cols: string, biz: string) {
  let out: any[] = [], from = 0;
  for (;;) {
    const { data, error } = await db.from(table).select(cols).eq('business_id', biz).range(from, from + 999);
    if (error) throw error; out = out.concat(data); if (data.length < 1000) return out; from += 1000;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);
  if (!(await allowed(req.headers.get('x-github-token') ?? ''))) return reply({ error: 'no' }, 401);
  try {
    const { data: bs, error } = await db.from('businesses').select('id,name,data'); if (error) throw error;
    const out = [];
    for (const b of bs ?? []) {
      const [items, customers, pays] = await Promise.all([all('items', 'col,id,data', b.id), all('square_customers', 'id,name', b.id), all('square_payments', 'id,created_at,status,customer_id,data', b.id)]);
      out.push({ id: b.id, name: b.name, profile: b.data, items, customers,
        payments: pays.map((p: any) => ({ id: p.id, at: p.created_at, status: p.status, customer: p.customer_id, amount: (p.data?.amount_money?.amount ?? 0) / 100, tip: (p.data?.tip_money?.amount ?? 0) / 100, refunded: (p.data?.refunded_money?.amount ?? 0) / 100 })) });
    }
    return reply({ at: new Date().toISOString(), businesses: out });
  } catch (e) {
    console.error('backup:', String((e as Error).message ?? e));
    return reply({ error: 'failed' }, 500);
  }
});
