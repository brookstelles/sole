// What a business's public website shows, read live from Sole: its name, words, services with prices and descriptions,
// usual hours, address, about, specialties and reviews (the profile's `site`), and where new clients fill in the intake form.
// Services are the owner's own list when she has changed them in Sole (the book's people/prefs `services`; ones she
// stopped offering are left out), else the profile's.
// Never a phone number or email (visitors send a message through intake instead), clients, the book or money.
// GET ?b=<site slug> (heart-and-soul). Deploy with verify_jwt off.
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } });
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const clock = (m: number) => { const h = Math.floor(m / 60), mi = m % 60; return `${h % 12 || 12}${mi ? ':' + String(mi).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`; };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return reply({ error: 'GET only' }, 405);
  const slug = new URL(req.url).searchParams.get('b') ?? '';
  const { data: bs, error } = await db.from('businesses').select('id,data');
  if (error) return reply({ error: 'failed' }, 500);
  const b = (bs ?? []).find((x: any) => x.data && x.data.site && x.data.site.slug === slug);
  if (!b) return reply({ error: 'not found' }, 404);
  const p = b.data;
  const { data: pr, error: pe } = await db.from('items').select('data').eq('business_id', b.id).eq('col', 'people').eq('id', 'prefs').maybeSingle();
  if (pe) return reply({ error: 'failed' }, 500);
  const own = pr?.data?.services, list: any[] = Array.isArray(own) && own.length ? own.filter((v: any) => !v.off) : Object.values(p.services || {});
  const s = p.site, h = p.hours || {}, closed: number[] = h.closed || [];
  const open = DAYS.map((d, i) => ({ day: d, open: !closed.includes(i), from: h.open != null ? clock(h.open) : null, to: h.close != null ? clock(h.close) : null }));
  // listed from the lowest starting price, then by length
  const from: Record<string, number> = {};
  for (const v of list) from[v.name] = Math.min(from[v.name] ?? Infinity, v.price);
  const services = [...list]
    .sort((a, b) => from[a.name] - from[b.name] || a.name.localeCompare(b.name) || a.min - b.min)
    .map(v => ({ name: v.name, minutes: v.min, price: v.price, description: v.desc || '' }));
  return reply({
    business: p.biz, owner: p.owner, trade: p.trade || null, unit: p.unitOne || 'appointment',
    tagline: s.tagline || '', about: s.about || [], specialties: s.specialties || [], reviews: s.reviews || [],
    address: s.address || '', hoursNote: s.hoursNote || '',
    hours: open, services,
    intakeUrl: `https://app.solepro.app/?new=${encodeURIComponent(s.slug)}`,
    updated: new Date().toISOString(),
  });
});
