// The nightly backup (backup/nightly.yml in the private backup repository) fetches every business's book here: the
// profile, every item, card customers' names and card payments. The caller proves itself with the backup key; only its
// SHA-256 is here, the key itself is a secret of the backup repository. Deploy with verify_jwt off.
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const KEY_SHA256 = '004b7229ac9c8713027d328f03166006e54f33b521bd4feaf4a5f887d8dcf125';
const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

async function all(table: string, cols: string, biz: string) {
  let out: any[] = [], from = 0;
  for (;;) {
    const { data, error } = await db.from(table).select(cols).eq('business_id', biz).range(from, from + 999);
    if (error) throw error; out = out.concat(data); if (data.length < 1000) return out; from += 1000;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);
  const key = req.headers.get('x-backup-key') ?? '';
  if (key.length < 32 || (await sha(key)) !== KEY_SHA256) return reply({ error: 'no' }, 401);
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
