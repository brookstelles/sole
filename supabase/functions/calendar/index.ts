// The business's appointments as a calendar feed (asked for Oct 27, 2026: a backup copy in Google Calendar). Google
// Calendar (Other calendars → From URL) or a phone's calendar subscribes to the private link and keeps its own copy;
// it only reads, so nothing made there comes back into Sole. Appointments only: no time off, no notes, no money.
// GET ?t=<token>: the feed (the token is the key; a new link turns the old one off).
// POST {action:'link'|'reset', business_id}: a signed-in member gets the link, or a new one.
// Deploy with verify_jwt off. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const feedUrl = (t: string) => `${env('SUPABASE_URL')}/functions/v1/calendar?t=${t}`;
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');

async function member(req: Request, business_id: unknown) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await db.auth.getUser(token), email = (u?.user?.email ?? '').toLowerCase();
  if (!email || typeof business_id !== 'string') return null;
  const { data: m } = await db.from('members').select('business_id').eq('business_id', business_id).eq('email', email).maybeSingle();
  return m ? email : null;
}
async function all(col: string, business_id: string) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('items').select('id,data').eq('business_id', business_id).eq('col', col).range(from, from + 999); if (error) throw error;
    out.push(...(data ?? [])); if (!data || data.length < 1000) return out;
  }
}

// iCalendar text: escape, and fold lines at 75 bytes
const esc = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line: string) {
  const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line;
  const parts: string[] = []; let cur = '';
  for (const ch of line) { if (enc.encode(cur + ch).length > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; } cur += ch; }
  parts.push(cur); return parts.join('\r\n ');
}
const pad = (n: number) => String(n).padStart(2, '0');
// a day and minutes after midnight, in the business's own time zone, as local iCalendar time
const at = (date: string, min: number) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + Math.floor(min / 1440)); const m = ((min % 1440) + 1440) % 1440;
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(Math.floor(m / 60))}${pad(m % 60)}00`; };

async function feed(token: string) {
  const { data: f } = await db.from('cal_feeds').select('business_id').eq('token', token).maybeSingle();
  if (!f) return new Response('This calendar link has been turned off. Get the new one in Sole.', { status: 404 });
  const { data: b, error } = await db.from('businesses').select('id,name,data').eq('id', f.business_id).maybeSingle(); if (error || !b) throw error || new Error('no business');
  const P = b.data || {}, tz = P.tz || 'America/New_York';
  const [appts, clients, prefs, { data: cards }] = await Promise.all([all('appts', b.id), all('clients', b.id), all('people', b.id),
    db.from('square_customers').select('id,name').eq('business_id', b.id)]);
  // services as the owner keeps them (her list first, with each one's earlier lengths), then the profile's
  const list = ((prefs.find(r => r.id === 'prefs') || {}).data || {}).services || [];
  const SV: Record<string, any> = { ...(P.services || {}) }; for (const s of list) SV[s.k] = s;
  const minOf = (a: any) => { const v = SV[a.s] || {}; const w = (v.was || []).find((x: any) => a.date < x.to); return (w ? w.min : v.min) || 60; };
  const CL = Object.fromEntries(clients.map(r => [r.id, r.data || {}])), CARD = Object.fromEntries((cards ?? []).map((c: any) => [c.id, c.name]));
  const who = (k: string) => (CL[k] && CL[k].name ? String(CL[k].name).trim() : '') || (k.startsWith('sq:') && CARD[k.slice(3)]) || 'Client';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'), place = P.site && P.site.address ? String(P.site.address) : '';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sole//Appointments//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc((P.biz || b.name || 'Sole') + ' appointments')}`, `X-WR-TIMEZONE:${tz}`, 'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H'];
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  for (const { data: a } of appts) {
    if (!a || !a.date || a.date < since || typeof a.start !== 'number') continue;
    const sv = SV[a.s] || {}, min = minOf(a), c = CL[a.c] || {}, phone = c.phone && c.phone !== 'Not added yet' ? String(c.phone) : '';
    lines.push('BEGIN:VEVENT', `UID:${esc(a.uid || a.c + a.date + a.start)}@solepro.app`, `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${tz}:${at(a.date, a.start)}`, `DTEND;TZID=${tz}:${at(a.date, a.start + min)}`,
      `SUMMARY:${esc(`${who(a.c)} · ${sv.name || 'Appointment'}, ${min} min`)}`,
      `DESCRIPTION:${esc([phone && `Phone: ${phone}`, a.paid ? 'Paid' : '', 'From Sole (a copy: change it in Sole)'].filter(Boolean).join('\n'))}`,
      ...(place ? [`LOCATION:${esc(place)}`] : []), 'TRANSP:OPAQUE', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.map(fold).join('\r\n') + '\r\n', { headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (req.method === 'GET') { const t = new URL(req.url).searchParams.get('t') ?? ''; if (!/^[0-9a-f]{48}$/.test(t)) return new Response('Not found', { status: 404 }); return await feed(t); }
    if (req.method !== 'POST') return reply({ error: 'GET or POST only' }, 405);
    const raw = await req.text(); if (raw.length > 5_000) return reply({ error: 'too big' }, 413);
    const { action, business_id } = JSON.parse(raw || '{}');
    if (!(await member(req, business_id))) return reply({ error: 'not a member of this business' }, 403);
    if (action === 'link') {
      const { data: f } = await db.from('cal_feeds').select('token').eq('business_id', business_id).maybeSingle();
      if (f) return reply({ url: feedUrl(f.token) });
    } else if (action !== 'reset') return reply({ error: 'unknown action' }, 400);
    const token = newToken();
    const { error } = await db.from('cal_feeds').upsert({ business_id, token, created_at: new Date().toISOString() }); if (error) throw error;
    return reply({ url: feedUrl(token) });
  } catch (e) {
    console.error('calendar:', String((e as Error).message ?? e));
    return reply({ error: String((e as Error).message ?? e) }, 500);
  }
});
