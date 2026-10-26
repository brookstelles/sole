// A client filling in a form from a link texted to them (app.solepro.app/?f=<token>). They don't sign in: the
// token is the key. "open" gives the page what it needs to show the form (the business's name and look, the form, the
// client's name); "submit" saves the answers into the book as a filled-in form and closes the link. A new client from
// the business's website ("open-new", "submit-new" with the site slug) gets the same form without a link.
// Deploy with verify_jwt off. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
// only what the form page shows: never the clients, the book or the money
const PUBLIC = ['biz', 'owner', 'look', 'short', 'trade', 'firstVisit', 'unit', 'unitOne', 'intakeName', 'treat', 'logo'];

const okSig = (sig: unknown) => typeof sig === 'string' && sig.startsWith('data:image/png;base64,') && sig.length < 500_000;
async function fromWebsite(slug: unknown, action: string, answers: any, sig: unknown) {
  if (typeof slug !== 'string' || !slug) return { error: 'gone' };
  const { data: bs } = await db.from('businesses').select('id,data');
  const b = (bs ?? []).find((x: any) => x.data && x.data.site && x.data.site.slug === slug); if (!b) return { error: 'gone' };
  const p = b.data, form = (p.forms || []).find((f: any) => f.intake); if (!form) return { error: 'gone' };
  if (action === 'open-new') {
    const pub = Object.fromEntries(PUBLIC.filter(k => p[k] !== undefined).map(k => [k, p[k]]));
    return { pub, form: { name: form.name, fields: form.fields, sections: form.sections, intake: true, kind: form.kind }, name: '' };
  }
  // the form's own checks, again here: a name, a phone number, agreed and signed
  if (!answers || typeof answers !== 'object' || Array.isArray(answers) || JSON.stringify(answers).length > 50_000) return { error: 'no answers' };
  const name = String(answers.name || '').trim().slice(0, 200), phone = String(answers.phone || '').replace(/\D/g, '');
  if (!name || phone.length < 10 || answers.consent !== true || !okSig(sig)) return { error: 'incomplete' };
  const now = new Date(), day = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const { count } = await db.from('items').select('id', { count: 'exact', head: true }).eq('business_id', b.id).eq('col', 'forms').like('id', 'w%').gte('updated_at', new Date(now.getTime() - 864e5).toISOString());
  if ((count ?? 0) >= 25) return { error: 'busy' };   // more than a real day's worth: something's wrong
  const id = 'w' + now.getTime().toString(36) + crypto.randomUUID().slice(0, 4);
  const r = { id, form: form.name, client: null, name, date: day, at: now.toISOString(), answers, sig, via: 'website' };
  const { error } = await db.from('items').insert({ business_id: b.id, col: 'forms', id, data: r });
  if (error) throw error;
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);
  try {
    const body = await req.text();
    if (body.length > 600_000) return reply({ error: 'too big' });
    const { token, action, answers, sig, biz: slug } = JSON.parse(body || '{}');
    // a new client from the business's website (?new=<site slug>): no link was made for them
    if (action === 'open-new' || action === 'submit-new') return reply(await fromWebsite(slug, action, answers, sig));
    if (typeof token !== 'string' || token.length < 32 || token.length > 100) return reply({ error: 'gone' });
    const { data: link } = await db.from('form_links').select('*').eq('token', token).maybeSingle();
    if (!link || new Date(link.expires_at) < new Date()) return reply({ error: 'gone' });
    if (link.used_at) return reply({ error: 'used', name: (link.name || '').split(' ')[0] });
    const { data: biz } = await db.from('businesses').select('data').eq('id', link.business_id).maybeSingle();
    const p = (biz && biz.data) || {}, form = (p.forms || []).find((f: any) => f.name === link.form) || (p.forms || []).find((f: any) => f.intake);
    if (!form) return reply({ error: 'gone' });
    if (action === 'open') {
      const pub = Object.fromEntries(PUBLIC.filter(k => p[k] !== undefined).map(k => [k, p[k]]));
      return reply({ pub, form: { name: form.name, fields: form.fields, sections: form.sections, intake: !!form.intake, kind: form.kind }, name: link.name || '' });
    }
    if (action === 'submit') {
      if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return reply({ error: 'no answers' });
      if (sig != null && (typeof sig !== 'string' || !sig.startsWith('data:image/png;base64,') || sig.length > 500_000)) return reply({ error: 'bad signature' });
      const now = new Date(), day = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const id = 'r' + now.getTime().toString(36) + crypto.randomUUID().slice(0, 4);
      const r = { id, form: form.name, client: link.client || null, name: String(answers.name || link.name || '').slice(0, 200), date: day, at: now.toISOString(), answers, sig: sig || null, via: 'link' };
      const { data: used, error: e1 } = await db.from('form_links').update({ used_at: now.toISOString() }).eq('token', token).is('used_at', null).select('token');
      if (e1) throw e1;
      if (!used || !used.length) return reply({ error: 'used', name: (link.name || '').split(' ')[0] });
      const { error: e2 } = await db.from('items').insert({ business_id: link.business_id, col: 'forms', id, data: r });
      if (e2) { await db.from('form_links').update({ used_at: null }).eq('token', token); throw e2; }
      return reply({ ok: true });
    }
    return reply({ error: 'what?' });
  } catch (e) {
    console.error('intake:', String((e as Error).message ?? e));
    return reply({ error: 'failed' }, 500);
  }
});
