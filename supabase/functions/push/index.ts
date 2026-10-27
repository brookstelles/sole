// Notifications for SolePro (web push, RFC 8291 and 8292): a message from the business's website buzzes the owner's
// phone like a text. The phone must have SolePro on its home screen (an iPhone's rule) and notifications turned on in
// SolePro (account menu). Actions: "key" (public: the server's public key, for subscribing), "subscribe" and
// "unsubscribe" (a signed-in member, for this phone), and "send" (only the other Edge Functions, with the service key).
// The signing keys are made here the first time and kept in push_keys; they never leave the database.
// Deploy with verify_jwt off. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

let SERVER: webpush.ApplicationServer | null = null, PUBLIC = '';
async function server() {
  if (SERVER) return SERVER;
  let { data, error } = await db.from('push_keys').select('keys').eq('id', 'vapid').maybeSingle(); if (error) throw error;
  if (!data) {
    const keys = await webpush.exportVapidKeys(await webpush.generateVapidKeys({ extractable: true }));
    const { error: e } = await db.from('push_keys').insert({ id: 'vapid', keys }); if (e && e.code !== '23505') throw e;   // 23505: another call made them first
    ({ data, error } = await db.from('push_keys').select('keys').eq('id', 'vapid').maybeSingle()); if (error || !data) throw error || new Error('no keys');
  }
  const vapidKeys = await webpush.importVapidKeys(data.keys);
  PUBLIC = await webpush.exportApplicationServerKey(vapidKeys);
  SERVER = await webpush.ApplicationServer.new({ contactInformation: 'https://app.solepro.app', vapidKeys });
  return SERVER;
}
// send to every phone of a business; a phone that's gone (uninstalled, turned off) is forgotten
async function send(business_id: string, msg: { title: string; body: string; url?: string; tag?: string }) {
  const as = await server(), { data: subs, error } = await db.from('push_subs').select('endpoint,sub').eq('business_id', business_id); if (error) throw error;
  let sent = 0, gone = 0;
  for (const s of subs ?? []) {
    // no Topic header: Apple turned every message away with it (400, Oct 27, 2026); the notification's own tag does the same job
    try { await as.subscribe(s.sub).pushTextMessage(JSON.stringify(msg), { urgency: webpush.Urgency.High, ttl: 86400 });
      sent++; await db.from('push_subs').update({ last_sent: new Date().toISOString() }).eq('endpoint', s.endpoint); }
    catch (e) {
      const st = e instanceof webpush.PushMessageError ? e.response.status : 0;
      if (st === 404 || st === 410) { gone++; await db.from('push_subs').delete().eq('endpoint', s.endpoint); }
      else console.error('push:', st, e instanceof webpush.PushMessageError ? await e.response.text().catch(() => '') : String((e as Error).message ?? e));
    }
  }
  return { sent, gone };
}
async function member(req: Request, business_id: unknown) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await db.auth.getUser(token), email = (u?.user?.email ?? '').toLowerCase();
  if (!email || typeof business_id !== 'string') return null;
  const { data: m } = await db.from('members').select('business_id').eq('business_id', business_id).eq('email', email).maybeSingle();
  return m ? email : null;
}
const okSub = (s: any) => s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 2000 && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);
  try {
    const body = await req.text(); if (body.length > 20_000) return reply({ error: 'too big' }, 413);
    const { action, business_id, sub, endpoint, msg } = JSON.parse(body || '{}');
    if (action === 'key') { await server(); return reply({ key: PUBLIC }); }
    if (action === 'send') {   // the other Edge Functions only
      if ((req.headers.get('authorization') ?? '') !== 'Bearer ' + env('SUPABASE_SERVICE_ROLE_KEY')) return reply({ error: 'not allowed' }, 403);
      if (typeof business_id !== 'string' || !msg || typeof msg.title !== 'string') return reply({ error: 'nothing to send' }, 400);
      return reply(await send(business_id, { title: String(msg.title).slice(0, 120), body: String(msg.body || '').slice(0, 300), url: typeof msg.url === 'string' ? msg.url.slice(0, 200) : '/', tag: typeof msg.tag === 'string' ? msg.tag : undefined }));
    }
    const email = await member(req, business_id);
    if (!email) return reply({ error: 'not a member of this business' }, 403);
    if (action === 'subscribe') {
      if (!okSub(sub)) return reply({ error: 'not a subscription' }, 400);
      const { error } = await db.from('push_subs').upsert({ endpoint: sub.endpoint, business_id, email, sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } } }); if (error) throw error;
      // a first one right away, so she knows it works
      await (await server()).subscribe(sub).pushTextMessage(JSON.stringify({ title: 'Notifications are on', body: 'A message from your website will show up here, like a text.', url: '/', tag: 'push-on' }), { urgency: webpush.Urgency.High, ttl: 3600 }).catch(e => console.error('push: first one', String(e)));
      return reply({ ok: true });
    }
    if (action === 'unsubscribe') {
      if (typeof endpoint !== 'string') return reply({ error: 'no endpoint' }, 400);
      const { error } = await db.from('push_subs').delete().eq('endpoint', endpoint).eq('email', email); if (error) throw error;
      return reply({ ok: true });
    }
    return reply({ error: 'unknown action' }, 400);
  } catch (e) {
    console.error('push:', String((e as Error).message ?? e));
    return reply({ error: String((e as Error).message ?? e) }, 500);
  }
});
