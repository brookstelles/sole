// Digital gift cards. Anyone can buy one from a business's gift card page (app.solepro.app/?gift=<site slug>):
// "open" gives the page the business's name and look, "buy" makes a Square checkout for the amount and sends the buyer
// there, and once Square has the money the card is made: a `gift` entry in the book's ledger (like a card sold in the
// app; Square already counts the money), an email to whoever it's for and a receipt to the buyer, and a buzz on the
// owner's phone. The money arrives three ways, whichever is first: the buyer coming back from checkout ("confirm"),
// the square function passing on Square's payment notice ("paid"), and its 15-minute catch-up ("sweep"). Making the
// card happens once (the order goes from pending to paid in one step). "view" is the card's own page (?card=<token>),
// with what's left on it. "send" lets a signed-in owner email a card sold in person, or get its link to text.
// Deploy with verify_jwt off: buying and viewing need no sign-in; "paid" and "sweep" need the service role key; "send"
// checks the member's token. Secrets: SQUARE_ACCESS_TOKEN (shared with the square function; making checkouts needs its
// payments and orders permissions), RESEND_API_KEY and GIFT_FROM (e.g. "SolePro <gifts@getsolepro.com>", on a domain
// verified in Resend) for the emails; without them the card is still made and shown, just not emailed. A card can go
// to someone's phone instead (send_by 'text'): SolePro's own number texts it once the text function's Twilio secrets
// (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM) are set; until then the thank-you page has the buyer text it.
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const SQ = 'https://connect.squareup.com/v2';
const env = (k: string) => Deno.env.get(k) ?? '';
const APP = () => env('APP_URL') || 'https://app.solepro.app';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const emailOk = (e: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e);
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
// +1 and ten digits (US and Canada), or null
const e164 = (v: unknown) => { let d = String(v ?? '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length === 10 ? '+1' + d : null; };
const money = (n: number) => '$' + (Math.round(n * 100) % 100 ? n.toFixed(2) : String(Math.round(n)));
// what the gift card page shows about the business: never the clients, the book or the money
const PUBLIC = ['biz', 'owner', 'look', 'color', 'logo', 'short', 'trade'];

async function square(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(SQ + path, { method, headers: { Authorization: `Bearer ${env('SQUARE_ACCESS_TOKEN')}`, 'Square-Version': '2024-10-17', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`Square ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}
async function bizBySlug(slug: unknown) {
  if (typeof slug !== 'string' || !slug || slug.length > 80) return null;
  const { data: bs, error } = await db.from('businesses').select('id,data'); if (error) throw error;
  return (bs ?? []).find((x: any) => x.data && x.data.site && x.data.site.slug === slug) ?? null;
}
// a business sells gift cards online once its Square is linked (the checkout takes the money into its Square)
async function sells(b: any) {
  const { data, error } = await db.from('square_sellers').select('business_id').eq('business_id', b.id).maybeSingle(); if (error) throw error;
  return !!data && !!env('SQUARE_ACCESS_TOKEN');
}
const pubOf = (b: any) => ({ ...Object.fromEntries(PUBLIC.filter(k => b.data[k] !== undefined).map(k => [k, b.data[k]])), address: b.data.site?.address ?? null, url: b.data.site?.url ?? null });
const today = (b: any) => new Date().toLocaleDateString('en-CA', { timeZone: b.data?.tz || 'America/New_York' });
const token = () => [...crypto.getRandomValues(new Uint8Array(24))].map(x => x.toString(16).padStart(2, '0')).join('');
async function newCode(business_id: string) {
  const A = 'ACDEFGHJKMNPQRTUVWXY3479';
  for (let i = 0; i < 20; i++) {
    const c = 'G' + Array.from(crypto.getRandomValues(new Uint8Array(4)), x => A[x % A.length]).join('');
    const [{ count: a }, { count: b }] = await Promise.all([
      db.from('gift_orders').select('id', { count: 'exact', head: true }).eq('business_id', business_id).eq('code', c),
      db.from('items').select('id', { count: 'exact', head: true }).eq('business_id', business_id).eq('col', 'ledger').eq('data->gift->>code', c)]);
    if (!a && !b) return c;
  }
  throw new Error('no free code');
}

// ---- the emails (Resend). The card is real whether or not an email goes out. ----
function cardHTML(o: any, pub: any, forBuyer: boolean) {
  const link = `${APP()}/?card=${o.view_token}`, to = o.to_name || 'you', biz = esc(pub.biz || 'us');
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#17153A">
  ${forBuyer ? `<p>Thank you${o.from_name ? ', ' + esc(o.from_name.split(' ')[0]) : ''}! ${o.send_to === 'them' && o.send_by === 'text' ? (o.texted_at ? `We texted this gift card to ${esc(o.to_name || 'them')}.` : `Text it to ${esc(o.to_name || 'them')} with the link below, or forward this email.`) : o.send_to === 'them' && o.to_email ? `We emailed this gift card to ${esc(o.to_name || o.to_email)}.` : 'Here is your gift card to print or pass along.'}</p>` : ''}
  <div style="border-radius:18px;padding:28px;background:#3A3576;color:#FAF8F4">
    <div style="font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#E0A62A">Gift card</div>
    <div style="font-size:22px;font-weight:700;margin-top:6px">${biz}</div>
    <div style="font-size:48px;font-weight:700;margin:18px 0 6px">${money(Number(o.amount))}</div>
    <div style="font-size:16px">For ${esc(to)}${o.from_name ? ` · from ${esc(o.from_name)}` : ''}</div>
    ${o.message ? `<div style="font-size:16px;margin-top:14px;font-style:italic">“${esc(o.message)}”</div>` : ''}
    <div style="margin-top:20px;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,.12);font-size:18px;letter-spacing:.14em;display:inline-block">${esc(o.code)}</div>
  </div>
  <p>To use it, book a visit with ${biz} and mention code <b>${esc(o.code)}</b>, or show this email. It never expires.</p>
  ${pub.address ? `<p style="color:#5b5878">${esc(pub.address)}</p>` : ''}
  <p><a href="${link}" style="color:#3A3576">See this gift card and what’s left on it</a></p>
  <p style="color:#8a87a3;font-size:13px">Sent by SolePro for ${biz}.</p></div>`;
}
// from the business by name, at SolePro's own address (GIFT_FROM's address; its name is used when there's no business name)
const fromOf = (biz: string) => { const f = env('GIFT_FROM'), at = (f.match(/<([^>]+)>/) || [])[1] || f.trim(); const name = clip(biz, 60).replace(/["<>\\,;]/g, ''); return name ? `${name} <${at}>` : f; };
async function email(to: string, subject: string, html: string, biz = '') {
  if (!env('RESEND_API_KEY') || !env('GIFT_FROM') || !emailOk(to)) return false;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromOf(biz), to: [to], subject, html }) });
  if (!r.ok) { console.error('gift: email', r.status, (await r.text()).slice(0, 200)); return false; }
  return true;
}
// ---- the text (Twilio, SolePro's own number; the same secrets, opt-outs and log as the text function) ----
async function textCard(o: any, pub: any) {
  const SID = env('TWILIO_ACCOUNT_SID'), TOKEN = env('TWILIO_AUTH_TOKEN'), FROM = env('TWILIO_FROM');
  if (!SID || !TOKEN || !FROM || o.send_by !== 'text' || !o.to_phone || o.texted_at) return false;
  const { data: stop } = await db.from('text_optouts').select('phone').eq('phone', o.to_phone).maybeSingle(); if (stop) return false;
  let body = `${o.from_name ? clip(o.from_name, 40).split(' ')[0] + ' sent you' : 'You have'} a ${money(Number(o.amount))} gift card to ${clip(pub.biz || 'us', 60)}!${o.message ? ` \u201c${clip(o.message, 160)}\u201d` : ''} Code ${o.code}. See it and what\u2019s left on it: ${APP()}/?card=${o.view_token}`;
  const { count: before } = await db.from('texts').select('id', { count: 'exact', head: true }).eq('phone', o.to_phone).eq('dir', 'out').eq('status', 'sent');
  if (!before) body += ' Reply STOP to opt out.';   // the carriers ask for it on a number's first text
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, { method: 'POST',
    body: new URLSearchParams({ To: o.to_phone, Body: body, [FROM.startsWith('MG') ? 'MessagingServiceSid' : 'From']: FROM }),
    headers: { Authorization: 'Basic ' + btoa(SID + ':' + TOKEN), 'Content-Type': 'application/x-www-form-urlencoded' } });
  const j = await r.json().catch(() => ({}));
  // logged like the text function's, so a reply goes to this business's inbox
  await db.from('texts').insert({ business_id: o.business_id, dir: 'out', phone: o.to_phone, name: o.to_name || null, kind: 'gift', ref: o.id, body, sid: j.sid ?? null, status: r.ok ? 'sent' : 'failed', error: r.ok ? null : clip(`${j.code ?? r.status} ${j.message ?? ''}`, 300) });
  if (!r.ok) { if (j.code === 21610) await db.from('text_optouts').upsert({ phone: o.to_phone }); return false; }
  const at = new Date().toISOString(); await db.from('gift_orders').update({ texted_at: at }).eq('id', o.id); o.texted_at = at;
  return true;
}
async function sendEmails(o: any, pub: any) {
  const sent: string[] = [...(o.emailed_to ?? [])];
  const biz = pub.biz || 'a business you love';
  if (o.send_to === 'them' && o.to_email && !sent.includes(o.to_email) && await email(o.to_email, `${o.from_name ? o.from_name.split(' ')[0] + ' sent you' : 'You have'} a ${money(Number(o.amount))} gift card to ${biz}`, cardHTML(o, pub, false), pub.biz)) sent.push(o.to_email);
  if (o.from_email && !sent.includes('buyer:' + o.from_email) && await email(o.from_email, `Your ${money(Number(o.amount))} gift card to ${biz}`, cardHTML(o, pub, true), pub.biz)) sent.push('buyer:' + o.from_email);
  if (sent.length !== (o.emailed_to ?? []).length) await db.from('gift_orders').update({ emailed_to: sent }).eq('id', o.id);
  return sent;
}

// ---- making the card once the money is in ----
async function fulfill(o: any) {
  const { data: won, error } = await db.from('gift_orders').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', o.id).eq('status', 'pending').select('*');
  if (error) throw error;
  if (!won || !won.length) return;   // made already
  o = won[0];
  const { data: b } = await db.from('businesses').select('id,data').eq('id', o.business_id).maybeSingle(); if (!b) return;
  const uid = 'g' + Date.now().toString(36) + crypto.randomUUID().slice(0, 4);
  const entry = { uid, kind: 'gift', date: today(b), amount: 0, tip: 0, method: 'Card', c: null, cname: o.from_name || null,
    gift: { code: o.code, to: null, toName: o.to_name || '', from: o.from_name || '', amount: Number(o.amount), email: o.to_email || null, phone: o.to_phone || null, online: true, order: o.id } };
  const { error: e1 } = await db.from('items').insert({ business_id: b.id, col: 'ledger', id: uid, data: entry });
  if (e1) { await db.from('gift_orders').update({ status: 'pending', paid_at: null }).eq('id', o.id); throw e1; }
  const { error: e2 } = await db.from('gift_orders').update({ status: 'sent', ledger_uid: uid }).eq('id', o.id); if (e2) throw e2;
  o.ledger_uid = uid;
  try { await textCard(o, pubOf(b)); } catch (e) { console.error('gift: text', String(e)); }
  try { await sendEmails(o, pubOf(b)); } catch (e) { console.error('gift: emails', String(e)); }
  try {
    await fetch(env('SUPABASE_URL') + '/functions/v1/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env('SUPABASE_SERVICE_ROLE_KEY') },
      body: JSON.stringify({ action: 'send', business_id: b.id, msg: { title: `Gift card sold online: ${money(Number(o.amount))}`, body: `For ${o.to_name || 'someone'}${o.from_name ? ', from ' + o.from_name : ''}. Code ${o.code}.`, url: '/', tag: 'gift-' + o.id } }) });
  } catch (e) { console.error('gift: push', String(e)); }
}
// has Square been paid for this order's checkout?
async function checkPaid(o: any) {
  if (o.status !== 'pending' || !o.square_order_id) return o;
  const { order } = await square('/orders/' + encodeURIComponent(o.square_order_id));
  const due = order?.net_amount_due_money?.amount, tenders = order?.tenders ?? [];
  if (tenders.length && (due === 0 || order.state === 'COMPLETED')) {
    await db.from('gift_orders').update({ square_payment_id: tenders[0].payment_id ?? null }).eq('id', o.id);
    await fulfill(o);
    const { data } = await db.from('gift_orders').select('*').eq('id', o.id).maybeSingle(); return data ?? o;
  }
  return o;
}
const cardOut = (o: any) => ({ status: o.status, code: o.status === 'pending' ? null : o.code, amount: Number(o.amount), to: o.to_name, from: o.from_name, message: o.message, send_to: o.send_to, send_by: o.send_by ?? 'email', texted: !!o.texted_at, to_phone: o.to_phone ?? null, emailed: (o.emailed_to ?? []).filter((x: string) => !x.startsWith('buyer:')), receipt: (o.emailed_to ?? []).some((x: string) => x.startsWith('buyer:')), card: o.status === 'pending' ? null : o.view_token });
async function leftOn(o: any) {
  if (!o.ledger_uid) return Number(o.amount);
  const { data: card } = await db.from('items').select('data').eq('business_id', o.business_id).eq('col', 'ledger').eq('id', o.ledger_uid).maybeSingle();
  if (!card) return 0;   // the owner took it off the books
  const { data: uses } = await db.from('items').select('data').eq('business_id', o.business_id).eq('col', 'ledger').eq('data->>kind', 'giftuse').eq('data->>card', o.ledger_uid);
  const used = (uses ?? []).reduce((t: number, u: any) => t + Number(u.data.amount || 0), 0);
  return Math.max(0, Math.round((Number(card.data.gift?.amount ?? o.amount) - used) * 100) / 100);
}
const isService = (req: Request) => (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '') === env('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);
  try {
    const body = await req.text();
    if (body.length > 20_000) return reply({ error: 'too big' });
    const q = JSON.parse(body || '{}'), action = q.action;

    if (action === 'open') {   // the gift card page
      const b = await bizBySlug(q.biz); if (!b) return reply({ error: 'gone' });
      return reply({ pub: pubOf(b), on: await sells(b), amounts: [50, 100, 150, 200] });   // round amounts; "Other" for the price of a visit
    }

    if (action === 'buy') {
      const b = await bizBySlug(q.biz); if (!b) return reply({ error: 'gone' });
      if (!(await sells(b))) return reply({ error: 'off' });
      const amount = Math.round(Number(q.amount) * 100) / 100;
      if (!(amount >= 10 && amount <= 1000)) return reply({ error: 'amount' });
      const from = q.from ?? {}, to = q.to ?? {}, sendTo = q.sendTo === 'me' ? 'me' : 'them', sendBy = q.sendTo === 'text' ? 'text' : 'email', toPhone = sendBy === 'text' ? e164(to.phone) : null;
      const o = { from_name: clip(from.name, 100), from_email: clip(from.email, 200).toLowerCase(), to_name: clip(to.name, 100), to_email: clip(to.email, 200).toLowerCase(), message: String(q.message ?? '').trim().slice(0, 300) };
      if (!o.from_name || !emailOk(o.from_email) || !o.to_name || (sendTo === 'them' && sendBy === 'email' && !emailOk(o.to_email)) || (sendBy === 'text' && !toPhone)) return reply({ error: 'incomplete' });
      const { count } = await db.from('gift_orders').select('id', { count: 'exact', head: true }).eq('business_id', b.id).gte('created_at', new Date(Date.now() - 864e5).toISOString());
      if ((count ?? 0) >= 60) return reply({ error: 'busy' });   // more than a real day's worth: something's wrong
      const { data: row, error } = await db.from('gift_orders').insert({ business_id: b.id, kind: 'online', code: await newCode(b.id), amount, ...o, to_email: sendTo === 'them' && sendBy === 'email' ? o.to_email : null, send_to: sendTo, send_by: sendBy, to_phone: toPhone, view_token: token() }).select('*').single();
      if (error) throw error;
      const { locations } = await square('/locations'), loc = (locations ?? []).find((l: any) => l.status === 'ACTIVE');
      if (!loc) throw new Error('no active Square location');
      const pl = await square('/online-checkout/payment-links', 'POST', {
        idempotency_key: row.id,
        quick_pay: { name: `${clip(b.data.biz || 'Gift', 80)} gift card`, price_money: { amount: Math.round(amount * 100), currency: loc.currency || 'USD' }, location_id: loc.id },
        checkout_options: { redirect_url: `${APP()}/?gift=${encodeURIComponent(q.biz)}&order=${row.id}`, ask_for_shipping_address: false },
        pre_populated_data: { buyer_email: o.from_email },
        payment_note: `Gift card ${row.code} for ${o.to_name}`.slice(0, 500),
      });
      const link = pl.payment_link ?? {};
      await db.from('gift_orders').update({ square_order_id: link.order_id ?? null, square_link_id: link.id ?? null }).eq('id', row.id);
      return reply({ url: link.url ?? link.long_url, order: row.id });
    }

    if (action === 'confirm') {   // back from Square's checkout
      if (typeof q.order !== 'string' || !/^[0-9a-f-]{36}$/.test(q.order)) return reply({ error: 'gone' });
      const { data: o } = await db.from('gift_orders').select('*').eq('id', q.order).maybeSingle(); if (!o) return reply({ error: 'gone' });
      const now = await checkPaid(o);
      return reply(cardOut(now));
    }

    if (action === 'view') {   // the card's own page
      if (typeof q.token !== 'string' || q.token.length !== 48) return reply({ error: 'gone' });
      const { data: o } = await db.from('gift_orders').select('*').eq('view_token', q.token).neq('status', 'pending').maybeSingle(); if (!o) return reply({ error: 'gone' });
      const { data: b } = await db.from('businesses').select('id,data').eq('id', o.business_id).maybeSingle(); if (!b) return reply({ error: 'gone' });
      return reply({ ...cardOut(o), to_phone: null, left: await leftOn(o), pub: pubOf(b), slug: b.data.site?.slug ?? null });
    }

    if (action === 'paid' || action === 'sweep') {   // the square function: Square's notice, or the 15-minute catch-up
      if (!isService(req)) return reply({ error: 'no' }, 401);
      let qq = db.from('gift_orders').select('*').eq('status', 'pending');
      qq = action === 'paid' ? qq.eq('square_order_id', String(q.order_id ?? '')) : qq.gte('created_at', new Date(Date.now() - 3 * 864e5).toISOString()).lte('created_at', new Date(Date.now() - 60e3).toISOString());
      const { data: rows, error } = await qq.limit(50); if (error) throw error;
      let made = 0; for (const o of rows ?? []) { if ((await checkPaid(o)).status !== 'pending') made++; }
      return reply({ ok: true, made });
    }

    if (action === 'send') {   // a signed-in owner: email a card sold in person, or get its link to text
      const tok = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data: u } = await db.auth.getUser(tok); const me = (u?.user?.email ?? '').toLowerCase();
      if (!me) return reply({ error: 'sign in' }, 401);
      const { data: m } = await db.from('members').select('business_id').eq('email', me).limit(1).maybeSingle(); if (!m) return reply({ error: 'no business' }, 403);
      const { data: card } = await db.from('items').select('data').eq('business_id', m.business_id).eq('col', 'ledger').eq('id', String(q.uid ?? '')).maybeSingle();
      const g = card?.data?.gift; if (!g || !g.code) return reply({ error: 'gone' });
      const to_email = clip(q.email, 200).toLowerCase(), to_name = clip(q.name, 100) || g.toName || '';
      if (to_email && !emailOk(to_email)) return reply({ error: 'email' });
      let { data: o } = await db.from('gift_orders').select('*').eq('business_id', m.business_id).eq('ledger_uid', String(q.uid)).maybeSingle();
      if (!o) {
        const r = await db.from('gift_orders').insert({ business_id: m.business_id, kind: 'sent', status: 'sent', code: g.code, amount: Number(g.amount), from_name: g.from || null, to_name, to_email: to_email || null, send_to: 'them', view_token: token(), ledger_uid: String(q.uid), paid_at: new Date().toISOString() }).select('*').single();
        if (r.error) throw r.error; o = r.data;
      } else if (to_email && to_email !== o.to_email) {
        await db.from('gift_orders').update({ to_email, to_name, emailed_to: (o.emailed_to ?? []).filter((x: string) => x !== to_email) }).eq('id', o.id); o = { ...o, to_email, to_name };
      }
      let emailed = false;
      if (to_email) { const { data: b } = await db.from('businesses').select('id,data').eq('id', m.business_id).maybeSingle(); emailed = (await sendEmails({ ...o, from_email: null, emailed_to: (o.emailed_to ?? []).filter((x: string) => x !== to_email) }, pubOf(b))).includes(to_email); }
      return reply({ link: `${APP()}/?card=${o.view_token}`, emailed, mail: !!env('RESEND_API_KEY') });
    }
    return reply({ error: 'what?' });
  } catch (e) {
    console.error('gift:', String((e as Error).message ?? e));
    return reply({ error: 'failed' }, 500);
  }
});
