// Texts to clients from Sole's own number (Twilio), asked for Oct 27, 2026: when the owner books or moves a visit,
// the client gets the confirmation by itself, and a client's reply comes back into the book's inbox and buzzes the
// owner's phone, like a message from the website.
// Actions: "status" (public: is texting set up), "send" (a signed-in member of the business: one text to one client),
// and Twilio's own webhook for replies (POST form data, checked against Twilio's signature).
// Off until the Edge Function secrets TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM (the number, +1..., or a
// Messaging Service id, MG...) are set; the page then keeps opening Messages for the owner to send, as before.
// Deploy with verify_jwt off. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const twiml = () => new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
const SID = env('TWILIO_ACCOUNT_SID'), TOKEN = env('TWILIO_AUTH_TOKEN'), FROM = env('TWILIO_FROM');
const on = () => !!(SID && TOKEN && FROM);
const KINDS = ['confirm', 'moved', 'reply'];
const PER_DAY = 150;   // more than a real day's worth for one business: something's wrong

// +1 and ten digits (US and Canada), or null
const e164 = (v: unknown) => { let d = String(v ?? '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length === 10 ? '+1' + d : null; };
const shown = (p: string) => `(${p.slice(2, 5)}) ${p.slice(5, 8)}-${p.slice(8)}`;
const clip = (v: unknown, n: number) => String(v ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, n);

async function member(req: Request, business_id: unknown) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await db.auth.getUser(token), email = (u?.user?.email ?? '').toLowerCase();
  if (!email || typeof business_id !== 'string') return null;
  const { data: m } = await db.from('members').select('business_id').eq('business_id', business_id).eq('email', email).maybeSingle();
  return m ? email : null;
}

async function send(business_id: string, b: any) {
  if (!on()) return { error: 'off' };
  const to = e164(b.to), kind = String(b.kind ?? ''), ref = clip(b.ref, 80), name = clip(b.name, 100);
  let body = String(b.body ?? '').trim().slice(0, 600);
  if (!to) return { error: 'phone' };
  if (!KINDS.includes(kind) || body.length < 2) return { error: 'nothing to send' };
  const { data: stop } = await db.from('text_optouts').select('phone').eq('phone', to).maybeSingle();
  if (stop) return { error: 'stopped' };
  const day = new Date(Date.now() - 864e5).toISOString();
  const { count } = await db.from('texts').select('id', { count: 'exact', head: true }).eq('business_id', business_id).eq('dir', 'out').gte('created_at', day);
  if ((count ?? 0) >= PER_DAY) return { error: 'busy' };
  // the same booking's text twice in a few minutes (a double tap, a second phone): once is enough
  if (ref && kind !== 'reply') {
    const { data: same } = await db.from('texts').select('id').eq('business_id', business_id).eq('ref', ref).eq('kind', kind).eq('status', 'sent').gte('created_at', new Date(Date.now() - 15 * 6e4).toISOString()).limit(1);
    if (same && same.length) return { ok: true, again: true };
  }
  // the first text this number gets from Sole says how to stop them (the carriers ask for it)
  const { count: before } = await db.from('texts').select('id', { count: 'exact', head: true }).eq('phone', to).eq('dir', 'out').eq('status', 'sent');
  if (!before) body += ' Reply STOP to opt out.';
  const form = new URLSearchParams({ To: to, Body: body, [FROM.startsWith('MG') ? 'MessagingServiceSid' : 'From']: FROM });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, { method: 'POST', body: form,
    headers: { Authorization: 'Basic ' + btoa(SID + ':' + TOKEN), 'Content-Type': 'application/x-www-form-urlencoded' } });
  const j = await r.json().catch(() => ({}));
  const row = { business_id, dir: 'out', phone: to, name, kind, ref, body, sid: j.sid ?? null, status: r.ok ? 'sent' : 'failed', error: r.ok ? null : clip(`${j.code ?? r.status} ${j.message ?? ''}`, 300) };
  const { error } = await db.from('texts').insert(row); if (error) console.error('text: log', error.message);
  if (!r.ok) { if (j.code === 21610) { await db.from('text_optouts').upsert({ phone: to }); return { error: 'stopped' }; } return { error: j.code === 21211 || j.code === 21614 ? 'phone' : 'not sent' }; }
  return { ok: true, sid: j.sid };
}

// Twilio signs each webhook: HMAC-SHA1 of the address it called plus every field, sorted, with the auth token
async function fromTwilio(req: Request, p: URLSearchParams) {
  const sig = req.headers.get('x-twilio-signature') ?? ''; if (!sig || !TOKEN) return false;
  const url = (env('TEXT_HOOK_URL') || env('SUPABASE_URL') + '/functions/v1/text') + new URL(req.url).search;
  const data = url + [...new Set(p.keys())].sort().map(k => p.getAll(k).map(v => k + v).join('')).join('');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(TOKEN), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))));
  if (mac.length !== sig.length) return false;
  let diff = 0; for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ sig.charCodeAt(i); return diff === 0;
}
// a client's reply: into the inbox of the business that last texted them, and the owner's phone buzzes
async function incoming(p: URLSearchParams) {
  const from = e164(p.get('From')), text = String(p.get('Body') ?? '').trim().slice(0, 2000), word = text.toUpperCase().replace(/[^A-Z]/g, '');
  if (!from) return;
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT'].includes(word)) { await db.from('text_optouts').upsert({ phone: from }); return; }
  if (['START', 'UNSTOP', 'YES'].includes(word)) await db.from('text_optouts').delete().eq('phone', from);
  if (['START', 'UNSTOP', 'HELP', 'INFO'].includes(word)) return;   // Twilio answers these itself
  const { data: last } = await db.from('texts').select('business_id,name').eq('phone', from).eq('dir', 'out').order('created_at', { ascending: false }).limit(1);
  if (!last || !last.length) return;   // nobody on Sole texted this number
  const { business_id, name } = last[0], now = new Date(), pics = +(p.get('NumMedia') ?? 0);
  const message = text || (pics ? '(sent a picture)' : ''); if (!message) return;
  await db.from('texts').insert({ business_id, dir: 'in', phone: from, name, kind: 'in', body: message, sid: p.get('MessageSid'), status: 'received' });
  const id = 'm' + now.getTime().toString(36) + crypto.randomUUID().slice(0, 4);
  const { error } = await db.from('items').insert({ business_id, col: 'inbox', id, data: { id, name: name || shown(from), phone: shown(from), message, at: now.toISOString(), via: 'text' } }); if (error) throw error;
  try {
    await fetch(env('SUPABASE_URL') + '/functions/v1/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env('SUPABASE_SERVICE_ROLE_KEY') },
      body: JSON.stringify({ action: 'send', business_id, msg: { title: `${(name || shown(from)).split(' ')[0]} texted back`, body: message.slice(0, 160), url: '/?msg=' + id, tag: id } }) });
  } catch (e) { console.error('text: push', String(e)); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);
  try {
    if ((req.headers.get('content-type') ?? '').includes('application/x-www-form-urlencoded')) {   // Twilio: a reply came in
      const p = new URLSearchParams(await req.text());
      if (!(await fromTwilio(req, p))) return new Response('not allowed', { status: 403 });
      await incoming(p); return twiml();
    }
    const raw = await req.text(); if (raw.length > 20_000) return reply({ error: 'too big' }, 413);
    const b = JSON.parse(raw || '{}');
    if (b.action === 'status') return reply({ on: on() });
    if (b.action === 'send') {
      if (!(await member(req, b.business_id))) return reply({ error: 'not a member of this business' }, 403);
      return reply(await send(b.business_id, b));
    }
    return reply({ error: 'unknown action' }, 400);
  } catch (e) {
    console.error('text:', String((e as Error).message ?? e));
    return reply({ error: String((e as Error).message ?? e) }, 500);
  }
});
