// End-to-end check of both editions: every built-in business through every tab, setup for a new business,
// and day one (getting started, first customer, first booking, getting paid, saved across a reload).
// Run: python3 build_demo.py && node tests/run.mjs   (Playwright; set CHROMIUM to a Chromium binary if needed)
import { chromium } from 'playwright';
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname, fx = root + 'tests/fixtures/';
const b = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {});
const errs = [];
const check = (ok, what) => { if (!ok) errs.push(what); };

async function open(file, init){
  const html = '<!doctype html><meta charset="utf-8"><meta name=viewport content="width=device-width,initial-scale=1">' + fs.readFileSync(root + file, 'utf8');
  const p = await (await b.newContext({viewport:{width:390, height:844}})).newPage();
  p.on('pageerror', e => errs.push(file + ': ' + e.message));
  if (init) await p.addInitScript(init);
  await p.route('http://sole.test/', r => r.fulfill({contentType:'text/html; charset=utf-8', body:html}));
  await p.goto('http://sole.test/', {waitUntil:'networkidle'});
  return p;
}
const wide = p => p.evaluate(() => document.documentElement.scrollWidth > 390);
// the schedule's day n days from today (the week strip runs Monday to Sunday, so it may be on next week's)
const goDay = async (p, n) => { for (let i = 0; i < 3 && !(await p.locator(`[data-act=day][data-v="${n}"]`).count()); i++) await p.click('[data-act=snav][data-v="1"]'); await p.click(`[data-act=day][data-v="${n}"]`); };

async function tour(p, label, keys = ['massage','hair','barber','tattoo','landscape','tennis']){
  for (const k of keys) {
    if (keys.length > 1) { await p.click('[data-act=trade]'); await p.click(`[data-act=pick][data-v=${k}]`); }
    { const g = await p.textContent('.glance'); check(/Today so far/.test(g) && /Booked today/.test(g) && /after .*fees|Nothing booked/.test(g), `${label} ${k}: today in against booked`);
      await p.click('[data-act=glance][data-v=week]'); check(/In so far/.test(await p.textContent('.glance')) && /Booked this week\s*\$[\d,]+/.test(await p.textContent('.glance')), `${label} ${k}: this week`);
      await p.click('[data-act=glance][data-v=next]'); check(/still open/.test(await p.textContent('.glance')) && /% of your hours booked/.test(await p.textContent('.glance')), `${label} ${k}: next week`);
      await p.click('[data-act=glance][data-v=year]'); check(/Sales this year/.test(await p.textContent('.glance')) && /on pace for/.test(await p.textContent('.glance')), `${label} ${k}: this year`);
      check(!(await wide(p)), `${label} ${k}: the money bar fits the phone`);
      await p.click('[data-act=glance][data-v=today]'); }
    // To do: tomorrow's confirmations and the thank-yous open in place
    // a long To do shows the four that matter most, the rest behind "Show more"
    if (await p.locator('[data-act=td-all]').count() && /more/.test(await p.textContent('[data-act=td-all]'))) {
      check(await p.locator('.todo .li.td').count() === 4, `${label} ${k}: a long To do shows four`);
      await p.click('[data-act=td-all]'); check(await p.locator('.todo .li.td').count() > 4 && /Show less/.test(await p.textContent('[data-act=td-all]')), `${label} ${k}: Show more opens the rest`); }
    if (await p.locator('[data-act=td-open][data-v=rm]').count()) await p.click('[data-act=td-open][data-v=rm]');
    if (await p.locator('.li.rm').count()) { const h = await p.getAttribute('[data-act=rm-sent] >> nth=0', 'href');
      check(/^sms:/.test(h) && /Just%20confirming%20your/.test(h), `${label} ${k}: the confirmation text is written for her`);
      await p.evaluate(() => document.querySelector('[data-act=rm-sent]').removeAttribute('href')); await p.click('[data-act=rm-sent] >> nth=0'); await p.waitForTimeout(500);
      await p.click('[data-act=rm-ok] >> nth=0'); check(/Confirmed/.test(await p.textContent('.li.rm >> nth=0')), `${label} ${k}: marked confirmed`);
      check(!(await wide(p)), `${label} ${k}: the confirm list fits the phone`); }
    if (await p.locator('[data-act=td-open][data-v=ty]').count()) await p.click('[data-act=td-open][data-v=ty]');
    if (await p.locator('[data-act=ty-sent]').count()) { const h = await p.getAttribute('[data-act=ty-sent] >> nth=0', 'href'), n = await p.locator('[data-act=ty-sent]').count();
      check(/^sms:/.test(h) && /Thank%20you%20for%20coming/.test(h), `${label} ${k}: the thank-you text is written for her`);
      await p.evaluate(() => document.querySelector('[data-act=ty-sent]').removeAttribute('href')); await p.click('[data-act=ty-sent] >> nth=0'); await p.waitForTimeout(500);
      check(await p.locator('[data-act=ty-sent]').count() === n - 1, `${label} ${k}: a thanked client leaves the list`); }
    await p.click('[data-act=ask][data-q*="spent"]');
    await p.click('.tab[data-v=schedule]'); await goDay(p, 2);
    if (await p.locator('[data-act=gap]').count()) { await p.click('[data-act=gap] >> nth=0'); await p.click('[data-act=b-c] >> nth=0');
      if (await p.locator('[data-act=b-t]').count()) { await p.click('[data-act=b-t] >> nth=0'); await p.click('#book-go'); if (await p.locator('.sheet .close').count()) await p.click('.sheet .close'); } else await p.click('.sheet .close'); }
    await p.click('.tab[data-v=money]'); await p.click('.topc >> nth=0'); await p.click('.sheet .close');
    // Snapshot: the months chart opens a month with what's done, what's left and the same month last year
    check(await p.locator('.months .mbar button').count() === 12, `${label} ${k}: Snapshot shows the twelve months`);
    await p.click('.mbar button.now');
    { const m = await p.textContent('main');
      check(/So far/.test(m) && /Still to come/.test(m) && /By \w{3} \d+/.test(m) && await p.locator('.month-cmp table').count() === 1, `${label} ${k}: this month, what's left, and last year by this date`); }
    check(!(await wide(p)), `${label} ${k}: the month page fits the phone`);
    if (await p.locator('[data-act=mo-cmp]').count() > 1) { const y2 = await p.getAttribute('[data-act=mo-cmp] >> nth=1', 'data-v'); await p.click('[data-act=mo-cmp] >> nth=1');
      check(new RegExp(`\\w{3} ${y2}`).test(await p.textContent('.month-cmp thead')), `${label} ${k}: compare with another year`); }
    await p.click('[data-act=mo-nav][data-v="-1"]'); check(/All of/.test(await p.textContent('main')), `${label} ${k}: the month before, whole`);
    await p.click('.tab[data-v=money]');
    // Dig in shows two, the rest a tap away
    if (await p.locator('[data-act=dig-all]').count()) { check(await p.locator('.bento .tile').count() === 2, `${label} ${k}: Dig in shows two`); await p.click('[data-act=dig-all]'); check(await p.locator('.bento .tile').count() > 2, `${label} ${k}: Dig in opens the rest`); }
    await p.click('[data-act=snapgo][data-sec=y-costs] >> nth=0');
    // Clients tab: the list, a filter, one person's page with their visits and forms, and back
    await p.click('.tab[data-v=clients]');
    check(await p.locator('#clt-list .li.client').count() > 0, `${label} ${k}: the Clients tab lists people`);
    await p.click('[data-act=cl-f][data-v=soon] >> nth=0'); await p.click('[data-act=cl-f][data-v=all] >> nth=0');
    await p.fill('#clt-search', 'zzzz'); check(/No .* named/.test(await p.textContent('#clt-list')), `${label} ${k}: client search`); await p.fill('#clt-search', '');
    // A to Z: jump to a letter in a long list
    { const nAz = await p.locator('.az button').count(); if (nAz) { const mid = Math.floor(nAz / 2), L = await p.getAttribute(`.az button >> nth=${mid}`, 'data-v'); await p.click(`.az button >> nth=${mid}`); await p.waitForTimeout(600);
      const top = await p.evaluate(L => document.getElementById('clg-' + (L === '#' ? 'num' : L)).getBoundingClientRect().top, L);
      check(top > 0 && top < 300, `${label} ${k}: the A to Z strip jumps to ${L}`); } }
    await p.click('#clt-list .li.client >> nth=0');
    check(await p.locator('.cl-hero').count() === 1 && await p.locator('.tl, .sec .muted').count() > 0, `${label} ${k}: a client's page`);
    check(!(await wide(p)), `${label} ${k}: client page wider than the phone`);
    await p.click('[data-act=cl-back]');
    await p.click('.tab[data-v=forms]'); await p.click('.tab[data-v=today]');
    check(!(await wide(p)), `${label} ${k}: wider than the phone`);
    // the end-of-day notes run works for every trade's own notes
    if (await p.locator('[data-act=vn-run]').count()) {
      await p.click('[data-act=vn-run]'); const n = +((await p.textContent('.sheet .sh-top')).match(/· 1 of (\d+)/) || [])[1];
      check(n >= 1, `${label} ${k}: the notes run counts the visits`);
      if (await p.locator('.sheet [data-act=vn-q]').count()) { await p.click('.sheet [data-act=vn-q] >> nth=0'); check(/\.$/.test(await p.inputValue('.sheet textarea >> nth=0')), `${label} ${k}: a tapped phrase is written in`); }
      await p.click('.sheet [data-act=vn-save]');
      if (n > 1) { check(new RegExp(`· 2 of ${n}`).test(await p.textContent('.sheet .sh-top')), `${label} ${k}: save goes on to the next visit`); check(!(await wide(p)), `${label} ${k}: the notes run fits the phone`); }
      if (await p.locator('.sheet .close').count()) await p.click('.sheet .close');
    }
    // health notes show as a small mark on the day's list, not words
    check(!/see notes/.test(await p.textContent('main')), `${label} ${k}: no "see notes" words on Today`);
    console.log('ok', label, k, '-', await p.textContent('.biz-name'));
  }
}

// private edition, with made-up Square data injected the way the page's database would supply it
const sq = fs.readFileSync(fx + 'square-sample.json', 'utf8');
let p = await open('index.html', `window.__SOLE_SQUARE = ${sq};`);
check((await p.textContent('.biz-name')) === 'Heart and Soul Massage', 'private edition opens on Heart and Soul Massage');
await p.click('.tab[data-v=money]');
check(/Card payments/.test(await p.textContent('main')), 'private: Square card payments show in Snapshot');
check(/card customers/.test(await p.textContent('#s-clients')), 'private: Square customers show in Snapshot');
await p.click('[data-act=sqall] >> nth=0'); await p.click('.sheet [data-act=sqclient] >> nth=0');
check(/Spent with you/.test(await p.textContent(await p.locator('.sheet').count() ? '.sheet' : 'main')), 'private: a Square customer opens with their spending');
// combining two cards that belong to one person, then separating them again: a card with a client opens their page,
// a card with no one yet opens its own sheet
const shut = async () => { if (await p.locator('.sheet .close').count()) await p.click('.sheet .close'); await p.click('.tab[data-v=money]'); };
await shut();
const cardCount = async () => { await p.click('[data-act=sqall] >> nth=0'); const n = await p.locator('.sheet [data-act=sqclient]').count(); await p.click('.sheet .close'); return n; };
const openCard = async (i) => { await p.click('[data-act=sqall] >> nth=0'); await p.click(`.sheet [data-act=sqclient] >> nth=${i}`); await p.waitForTimeout(100); };
const n0 = await cardCount();
check(/Test Person 1/.test(await (async () => { await p.click('[data-act=sqall] >> nth=0'); const t = await p.textContent('.sheet'); await p.click('.sheet .close'); return t; })()), 'private: saved combined cards show as one person');
let mi = -1;
for (let i = 0; i < Math.min(n0, 6) && mi < 0; i++) { await openCard(i); if (await p.locator('[data-act=sqmerge]').count()) mi = i; else await shut(); }
check(mi >= 0, 'private: a card customer offers "same person"');
await p.click('[data-act=sqmerge]'); await p.click('.sheet [data-act=sqmerge-go] >> nth=0'); await p.waitForTimeout(150); await shut();
check(await cardCount() === n0 - 1, 'private: combining two cards leaves one person');
let si = -1;
for (let i = 0; i < n0 && si < 0; i++) { await openCard(i); if (await p.locator('[data-act=sqsplit]').count()) si = i; else await shut(); }
check(si >= 0, 'private: a combined card offers to separate');
await p.click('[data-act=sqsplit]'); await p.waitForTimeout(150); await shut();
check(await cardCount() > n0 - 1, 'private: separating cards adds them back');
await p.click('.tab[data-v=money]');
await p.click('[data-act=snapgo][data-sec=y-square] >> nth=0');
check(/Card payments by year/.test(await p.textContent('main')), 'private: Square by year in the year view');
check(/weren’t in the sheet/.test(await p.textContent('#y-kept')), 'private: missing 2025 Square months are filled in');
await p.click('.tab[data-v=today]');
console.log('ok private Square views');

// live Square: payments taken today show up right away (made-up payments, the way the Square connector returns them)
{
  const now = new Date().toISOString(), pay = (id, cust, amt, tip) => ({id, created_at:now, updated_at:now, status:'COMPLETED', customer_id:cust,
    amount_money:{amount:amt, currency:'USD'}, tip_money:{amount:tip, currency:'USD'}, total_money:{amount:amt + tip, currency:'USD'}, processing_fee:[{amount_money:{amount:300, currency:'USD'}}]});
  const live = {payments:[pay('T1', 'TESTCUSTOMER0000', 12000, 2500), pay('T2', 'TESTNEWCUSTOMER', 8000, 0), {...pay('T3', 'TESTCUSTOMER0000', 5000, 0), status:'FAILED'}]};
  const q = await open('index.html', `window.__SOLE_SQUARE = ${sq}; window.__SOLE_SQUARE_LIVE = ${JSON.stringify(live)};`);
  check(/Today so far\s*\$200/.test(await q.textContent('.glance')), 'live: Today shows card payments taken today');
  await q.click('.tab[data-v=money]');
  check(/Today: \$200 from 2 card payments/.test(await q.textContent('main')), 'live: Square card shows today');
  check(/Live · \d/.test(await q.textContent('main')), 'live: Square card says it is live');
  await q.click('[data-act=sqall] >> nth=0');
  check(await q.locator('.sheet [data-act=sqclient][data-v=TESTNEWCUSTOMER]').count() === 1, 'live: a new card customer appears');
  await q.click('.sheet .close');
  check(!(await wide(q)), 'live: wider than the phone');
  await q.close();
  console.log('ok live Square');
}

// Square Appointments: the real schedule replaces the sample one (made-up bookings, the way the Square connector returns them)
{
  const at = (dayOff, h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); d.setDate(d.getDate() + dayOff); return d.toISOString(); };
  const bk = (id, cust, dayOff, h, m, status = 'ACCEPTED') => ({id, version:0, status, customer_id:cust, start_at:at(dayOff, h, m), appointment_segments:[{duration_minutes:90, service_variation_id:'TESTVAR1'}]});
  const book = {bookings:[bk('B1', 'TESTCUSTOMER0003', 0, 23, 30), bk('B2', 'TESTBOOKER', 1, 9, 0), bk('B3', 'TESTCUSTOMER0004', 1, 13, 0, 'CANCELLED_BY_CUSTOMER')],
    services:{TESTVAR1:{name:'Test Deep Tissue', min:90, price:150}}, names:{TESTBOOKER:'Booker Test'}};
  const q = await open('index.html', `window.__SOLE_SQUARE = ${sq}; window.__SOLE_SQUARE_BOOK = ${JSON.stringify(book)};`);
  const today = await q.textContent('main');
  check(/Test Person 3/.test(today) && /Test Deep Tissue/.test(today), 'bookings: today shows the Square booking');
  check(!/Dana Whitfield/.test(today), 'bookings: the sample schedule is gone');
  await q.click('.tab[data-v=schedule]'); await goDay(q, 1);
  const tmr = await q.textContent('main');
  check(/Booker Test/.test(tmr), 'bookings: tomorrow shows a new client by name');
  check(!/Test Person 4/.test(tmr), 'bookings: cancelled bookings stay off');
  await q.click('[data-act=appt] >> nth=0');
  check(/Spent with you|Before you start/.test(await q.textContent('.sheet')), 'bookings: a booking opens');
  await q.click('.sheet [data-act=move]');
  check(/Booked in Square/.test(await q.textContent('.sheet')), 'bookings: moving a Square booking points to Square');
  await q.click('.sheet .close');
  check(!(await wide(q)), 'bookings: wider than the phone');
  await q.close();
  console.log('ok Square bookings');
}
// Kelli's forms open in SolePro, never in Google Drive: the intake form's every question, the trafficking procedure's
// words with numbers to tap, a blank copy to print
{ const q = await open('index.html', `window.__SOLE_SQUARE = ${sq};`); await q.click('.tab[data-v=forms]');
  check(await q.locator('a[href*="drive.google"], a[href*="docs.google"]').count() === 0 && !/Google Drive/.test(await q.textContent('main')), 'forms: nothing opens Google Drive');
  await q.click('main .form:has-text("Client intake form") [data-act=formview]');
  { const t = await q.textContent('.sheet'); check(/How much pressure do you like\?/.test(t) && /Light · Medium · Firm/.test(t) && /sign with a finger/i.test(t), 'forms: the whole intake form, in SolePro'); }
  await q.evaluate(() => { window.print = () => { window.__printed = true; }; }); await q.click('.sheet [data-act=formprint]'); await q.waitForTimeout(150);
  check(await q.evaluate(() => window.__printed && /Are you pregnant\?/.test(document.getElementById('print').textContent) && document.querySelectorAll('#print .pr-blank').length > 5), 'forms: a blank copy prints');
  await q.click('.sheet .close'); await q.waitForTimeout(250);
  await q.click('main .form:has-text("Human trafficking") [data-act=formview]');
  check(/immediately contact the National Human Trafficking Resource Center/.test(await q.textContent('.sheet')) && await q.locator('.sheet a[href="tel:8883737888"]').count() === 1, 'forms: the procedure reads in SolePro, numbers tap to call');
  check(!(await wide(q)), 'forms: fit the phone');
  await q.click('.sheet .close'); await q.waitForTimeout(250);
  // on an iPhone or iPad: Print makes a PDF and hands it to the share sheet (Print, Save to Files)
  await q.route('http://sole.test/vendor/jspdf.umd.min.js', r => r.fulfill({contentType:'text/javascript', body:fs.readFileSync(root + 'site/vendor/jspdf.umd.min.js', 'utf8')}));
  await q.evaluate(() => { window.__SOLE_PDF = true; window.__shared = []; navigator.canShare = () => true;
    navigator.share = async d => { const f = d.files[0]; window.__shared.push({name:f.name, type:f.type, head:await f.slice(0, 5).text(), size:f.size}); }; });
  await q.click('main .form:has-text("Client intake form") [data-act=formprint]'); await q.waitForSelector('.sheet [data-act=pdf-go]');
  await q.click('.sheet [data-act=pdf-go]'); await q.waitForTimeout(300);
  await q.click('main .form:has-text("Human trafficking") [data-act=formprint]'); await q.waitForTimeout(500);
  { const sh = await q.evaluate(() => window.__shared);
    check(sh.length === 2 && sh.every(x => x.type === 'application/pdf' && x.head === '%PDF-' && x.size > 1500) && sh[0].name === 'Client intake form.pdf', 'forms: on a phone, Print hands over a real PDF to print or save'); }
  await q.close(); console.log('ok forms in SolePro'); }
// Kelli's own book: appointments, clients, payments and costs kept in SolePro (made-up data, the way the page's database holds it)
{
  const today = new Date(), iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const sole = {appts:[{uid:'aT1', c:'nTEST', s:'sw60', date:iso(today), start:1380, paid:false, tip:0, w:'Kelli'}], blocks:[],
    clients:{nTEST:{name:'Casey Sample', phone:'(555) 010-0000', since:2026, visits:0, last:null, isNew:true, intake:true, pressure:0, focus:'Not known yet', setup:'', note:'', mine:true}}, ledger:[]};
  const base = JSON.parse(sq);
  const q = await open('index.html', `window.__SOLE_SQUARE = ${JSON.stringify({...base, sole})};`);
  check(/Casey Sample/.test(await q.textContent('main')), 'own book: an appointment kept in SolePro shows today');
  await q.click('[data-act=appt] >> nth=0'); await q.click('.sheet [data-act=editnotes]');
  await q.click('.sheet [data-act=en-p][data-v="4"]'); await q.fill('#en-focus', 'Low back'); await q.fill('#en-health', 'Test allergy'); await q.click('.sheet [data-act=en-save]');
  const ap = await q.textContent('.sheet');
  check(/Low back/.test(ap) && /Firm/.test(ap) && /Test allergy/.test(ap), 'own book: edited notes show before the appointment');
  await q.click('.sheet .close');
  check(await q.evaluate(() => SQ.sole.clients.nTEST.focus) === 'Low back', 'own book: notes are saved to the book');
  await q.click('.tab[data-v=money]');
  await q.click('#s-books [data-act=addpay]'); await q.fill('#pf-amt', '80'); await q.click('.sheet [data-act=pf-m][data-v=Zelle]'); await q.click('.sheet [data-act=pf-save]');
  check(/\+\$80/.test(await q.textContent('#s-books')) && /Zelle/.test(await q.textContent('#s-books')), 'own book: a Zelle payment shows in Money in and out');
  await q.click('#s-books [data-act=addcost]'); await q.fill('#rc-what', 'Test Oils'); await q.fill('#rc-amt', '42.50'); await q.click('.sheet [data-act=rc-cat][data-v=Supplies]'); await q.click('.sheet [data-act=rc-save]');
  check(/Test Oils/.test(await q.textContent('#s-books')) && /\$43/.test(await q.textContent('#s-books')), 'own book: a cost shows in Money in and out');
  check(await q.evaluate(() => SQ.sole.ledger.length) === 2, 'own book: payment and cost are saved to the book');
  await q.click('#s-books [data-act=lg]:has-text("Test Oils")'); await q.click('.sheet [data-act=lg-del]'); await q.click('.sheet [data-act=lg-del-yes]');
  check(await q.evaluate(() => SQ.sole.ledger.length) === 1, 'own book: an entry can be removed');
  await q.click('.tab[data-v=today]');
  check(/Today so far\s*\$80/.test(await q.textContent('.glance')), 'own book: Today counts the Zelle payment');
  await q.click('.tab[data-v=schedule]'); await goDay(q, 1);
  for (let i = 2; i < 8 && !(await q.locator('[data-act=gap]').count()); i++) await goDay(q, i);
  await q.click('[data-act=gap] >> nth=0'); await q.click('.sheet [data-act=b-c] >> nth=0'); await q.click('.sheet [data-act=b-t] >> nth=0'); await q.click('#book-go');
  check(/You’re booked/.test(await q.inputValue('#msg')), 'own book: booking offers a confirmation text');
  await q.click('.sheet .close');
  check(await q.evaluate(() => SQ.sole.appts.length) === 2, 'own book: the new booking is saved to the book');
  check(!(await wide(q)), 'own book: wider than the phone');
  await q.close();
  console.log('ok own book');
}
// the weekly check and visit notes
{
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const y = new Date(); y.setDate(y.getDate() - 1); const t = new Date(); t.setDate(t.getDate() + 3);
  const at = new Date(y); at.setHours(15, 5, 0, 0);
  const sole = {appts:[{uid:'aY', c:'nW', s:'sw60', date:iso(y), start:600, paid:false, tip:0, w:'Kelli'}, {uid:'aN', c:'nW', s:'sw60', date:iso(t), start:660, paid:false, tip:0, w:'Kelli'}], blocks:[],
    clients:{nW:{name:'Wren Sample', phone:'', since:2026, visits:1, last:1, intake:true, pressure:0, focus:'Not known yet', setup:'', note:'', mine:true}}, ledger:[]};
  const live = {payments:[{id:'LZ', created_at:at.toISOString(), updated_at:at.toISOString(), status:'COMPLETED', customer_id:'TESTCUSTOMER0000', amount_money:{amount:7700}, tip_money:{amount:0}, total_money:{amount:7700}, processing_fee:[]}]};
  const q = await open('index.html', `window.__SOLE_SQUARE = ${JSON.stringify({...JSON.parse(sq), sole})}; window.__SOLE_SQUARE_LIVE = ${JSON.stringify(live)};`);
  const wk = new Date().getDay() === 1 ? -1 : 0;
  await q.click('.tab[data-v=money]'); await q.click('#s-books [data-act=wkcheck]'); await q.click(`[data-act=wkcheck][data-v="${wk}"]`);
  let m = await q.textContent('main');
  check(/2 to look at/.test(m) && /Wren Sample/.test(m) && /\$77/.test(m), 'weekly check: an unpaid visit and a stray card payment');
  await q.click('[data-act=wk-ignore]'); await q.click('[data-act=wk-noshow]');
  m = await q.textContent('main');
  check(/All matched/.test(m) && /1 no-show/.test(m), 'weekly check: fixed with a no-show and "not a visit"');
  await q.click('[data-act=wk-done]');
  check(/All checked/.test(await q.textContent('main')) && await q.evaluate(() => Object.values(SQ.sole.weeks).some(w => w.checked)), 'weekly check: the week is marked checked and saved');
  await q.close();
  // notes: write SOAP notes on yesterday's visit, then see them before the next one
  const r = await open('index.html', `window.__SOLE_SQUARE = ${JSON.stringify({...JSON.parse(sq), sole})};`);
  await r.click('.tab[data-v=schedule]'); await r.click('[data-act=snav][data-v="-1"]');   // yesterday
  check(!(await r.locator('[data-act=gap]').count()), 'schedule: past days show no openings to book');
  await r.click('[data-act=appt]:has-text("Wren")');
  await r.click('.sheet [data-act=vnotes]');
  await r.click('.sheet [data-act=vn-c][data-v="Neck"]'); await r.click('.sheet [data-act=vn-c][data-v="Deep tissue"]'); await r.click('.sheet [data-act=vn-c][data-v="Firm"]');
  await r.fill('#vn-S', 'Test stiff neck'); await r.fill('#vn-P', 'Test focus on left trap'); await r.click('.sheet [data-act=vn-save]');
  const sh = await r.textContent('.sheet');
  check(/Neck, Deep tissue/.test(sh) || /Neck · Deep tissue/.test(sh), 'visit notes: chips show on the visit');
  check(/Test focus on left trap/.test(sh), 'visit notes: the plan shows on the visit');
  await r.click('.sheet .close');
  await r.click('[data-act=snav][data-v="0"]'); for (let i = 0; i < 3; i++) await r.click('[data-act=snav][data-v="1"]');   // three days from today
  await r.click('[data-act=appt]:has-text("Wren")');
  check(/From last time/.test(await r.textContent('.sheet')) && /Test focus on left trap/.test(await r.textContent('.sheet')), 'visit notes: the plan shows before the next visit');
  check(await r.evaluate(() => Object.values(SQ.sole.visits).some(v => v.P === 'Test focus on left trap')), 'visit notes: saved to the book');
  check(!(await wide(r)), 'visit notes: wider than the phone');
  await r.close();
  console.log('ok weekly check and visit notes');
  // the end-of-day run: every visit waiting for notes, one at a time, started from last time or tapped phrases
  const old = new Date(); old.setDate(old.getDate() - 12);
  const sole2 = {...sole, clients:{nW:{...sole.clients.nW, pressure:4}}, visits:{oldW:{c:'nW', date:iso(old), s:'sw60', at:old.toISOString(), S:'Test old stiff neck', P:'Test old plan', tech:['Myofascial']}}};
  const u = await open('index.html', `window.__SOLE_SQUARE = ${JSON.stringify({...JSON.parse(sq), sole:sole2})};`);
  check(/Write Wren’s SOAP notes/.test(await u.textContent('main')), 'notes run: Today offers the notes still to write');
  await u.click('[data-act=vn-run]');
  const ut = await u.textContent('.sheet');
  check(/1 of 1/.test(ut) && /Save, all done/.test(ut), 'notes run: one visit at a time with a count');
  check(await u.getAttribute('.sheet [data-act=vn-c][data-v="Swedish"]', 'aria-pressed') === 'true' && await u.getAttribute('.sheet [data-act=vn-c][data-v="Firm"]', 'aria-pressed') === 'true', 'notes run: technique from the service and pressure from the intake filled in');
  await u.click('.sheet [data-act=vn-last]');
  check(await u.inputValue('#vn-S') === 'Test old stiff neck' && await u.getAttribute('.sheet [data-act=vn-c][data-v="Myofascial"]', 'aria-pressed') === 'true', 'notes run: same as last time fills in the last note');
  await u.click('.sheet [data-act=vn-q][data-t=A][data-v="Tension released"]'); await u.click('.sheet [data-act=vn-q][data-t=A][data-v="Pain went down"]');
  check(await u.inputValue('#vn-A') === 'Tension released. Pain went down.', 'notes run: tapped phrases are written in');
  await u.click('.sheet [data-act=vn-q][data-t=A][data-v="Tension released"]');
  check(await u.inputValue('#vn-A') === 'Pain went down.', 'notes run: tapping a phrase again takes it out');
  check(!(await wide(u)), 'notes run: fits the phone');
  await u.click('.sheet [data-act=vn-save]');
  check(/All caught up/.test(await u.textContent('.toast')) && !(await u.locator('[data-act=vn-run]').count()), 'notes run: done, and Today has nothing left to write');
  check(await u.evaluate(() => Object.values(SQ.sole.visits).some(v => v.S === 'Test old stiff neck' && v.A === 'Pain went down.' && v.at && v.c === 'nW' && v !== SQ.sole.visits.oldW)), 'notes run: saved to the book');
  await u.close();
  console.log('ok notes run');
}
// the website copy is served as it is (no charset from the server): it must be a whole page of its own
{
  const p = await (await b.newContext({viewport:{width:390, height:844}})).newPage();
  p.on('pageerror', e => errs.push('site/index.html: ' + e.message));
  await p.route('http://sole.test/', r => r.fulfill({contentType:'text/html', body:fs.readFileSync(root + 'site/index.html')}));
  await p.route('http://sole.test/apple-touch-icon.png', r => r.fulfill({contentType:'image/png', body:fs.readFileSync(root + 'site/apple-touch-icon.png')}));
  await p.goto('http://sole.test/', {waitUntil:'networkidle'});
  check(await p.evaluate(() => document.characterSet) === 'UTF-8' && /How’s my year going\?/.test(await p.textContent('main')), 'site: text reads as UTF-8');
  check(await p.evaluate(() => document.compatMode === 'CSS1Compat' && !!document.querySelector('meta[name=viewport]')), 'site: a full page with a phone viewport');
  check(await p.evaluate(() => fetch('/apple-touch-icon.png').then(r => r.ok)), 'site: home screen icon');
  await p.close();
  // solepro.app on its own is the curious visitor's: on to getsolepro.com; a texted link with more after it goes on to the app
  for (const [from, to] of [['https://solepro.app/', /^https:\/\/getsolepro\.com\/?$/], ['https://www.solepro.app/', /^https:\/\/getsolepro\.com\/?$/], ['https://solepro.app/?f=abc', /^https:\/\/app\.solepro\.app\/\?f=abc$/]]) {
    const r = await (await b.newContext()).newPage(); let went = '';
    await r.route('**/*', x => { const u = x.request().url(); if (u.startsWith(from.split('?')[0]) && x.request().isNavigationRequest() && !went) return x.fulfill({contentType:'text/html', body:fs.readFileSync(root + 'site/index.html')});
      if (x.request().isNavigationRequest()) { went = u; return x.fulfill({contentType:'text/html', body:'<p>elsewhere'}); } return x.abort(); });
    await r.goto(from).catch(() => {}); await r.waitForTimeout(400);
    check(to.test(went), `site: ${from} goes on to ${to}: went to ${went}`); await r.context().close(); }
  console.log('ok website page');
}
// SolePro's mark, and the weather on Today and the schedule (a made-up forecast shaped like Open-Meteo's)
{
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const days = [...Array(8)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return iso(d); });
  const hours = days.flatMap(d => [...Array(24)].map((_, h) => `${d}T${String(h).padStart(2, '0')}:00`));
  const wx = {current:{temperature_2m:78.4, weather_code:0, is_day:1},
    daily:{time:days, weather_code:days.map(() => 1), temperature_2m_max:days.map(() => 84.2), temperature_2m_min:days.map(() => 70), precipitation_probability_max:days.map(() => 80)},
    hourly:{time:hours, precipitation_probability:hours.map(t => +t.slice(11, 13) >= 6 && +t.slice(11, 13) < 22 ? 80 : 0)}};
  const p = await open('dist/demo.html', `window.__SOLE_WX = ${JSON.stringify(wx)};`);
  check(await p.locator('.welcome .brand svg.badge').count() === 1, 'mark: the badge on the welcome');
  await p.click('[data-act=welcome-look]'); await p.click('[data-act=trade]');
  check(await p.locator('.sheet .brand svg.badge').count() === 1 && /^SolePro$/.test((await p.textContent('.sheet .brand .wordmark')).trim()), 'mark: the sunrise badge and the SolePro wordmark');
  await p.click('[data-act=pick][data-v=landscape]');
  const line = await p.textContent('.wx');
  check(/^(\d+° and sunny · high 84°|Tomorrow: partly cloudy, high 84°)/.test(line.trim()), 'weather: a quiet line on Today: ' + line);
  check(/rain likely .*\spm/.test(line), 'weather: when rain is likely: ' + line);
  await p.click('.tab[data-v=schedule]');
  check(/84°, rain/.test(await p.textContent('main')), 'weather: the schedule day has its high and rain');
  check(!(await wide(p)), 'weather: fits the phone');
  // turned off from the account sheet
  await p.click('.tab[data-v=today]');
  await p.click('[data-act=trade]'); await p.click('[data-act=pick][data-v=massage]'); check(await p.locator('.wx').count() === 1, 'weather: on the massage business too');
  await p.click('[data-act=me]'); await p.click('.sheet [data-act=me-wx][data-v=off]'); await p.click('.sheet .close');
  check(await p.locator('.wx').count() === 0, 'weather: Hide it means gone');
  await p.close();
  console.log('ok mark and weather');
}

// SolePro's own website: sign in with a code, the book and Square payments from Supabase (a stand-in client, made-up data)
{
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const now = new Date(), early = new Date(now); early.setHours(0, 5, 0, 0);
  const pay = (id, when, amt, tip, cust) => ({id, created_at:when.toISOString(), updated_at:when.toISOString(), status:'COMPLETED', customer_id:cust, amount_money:{amount:amt}, tip_money:{amount:tip}, total_money:{amount:amt + tip}, processing_fee:[{amount_money:{amount:300}}]});
  const seed = {items:[{business_id:'B1', col:'inbox', id:'mTEST', data:{id:'mTEST', name:'Jamie Sample', phone:'(555) 010-0199', email:'', message:'Hi! Do you have anything open Friday afternoon?', at:new Date().toISOString(), via:'website'}}, {business_id:'B1', col:'clients', id:'nC', data:{name:'Cloud Sample', phone:'', since:2026, visits:0, last:null, intake:true, pressure:0, focus:'Not known yet', setup:'', note:'', mine:true}},
      {business_id:'B1', col:'visits', id:'mb:old1', data:{c:'mb:imported-person', date:'2025-03-04', start:600, s:'sw60', price:100, from:'MassageBook', at:'2025-03-04T15:00:00Z', S:'Test sore shoulders', P:'Test rebook in a month'}},
      {business_id:'B1', col:'visits', id:'mb:old2', data:{c:'mb:imported-person', date:'2025-04-01', start:660, s:'sw60', svc:'Aromatherapy massage', price:140, from:'MassageBook'}},
      {business_id:'B1', col:'clients', id:'mb:holly', data:{name:'Holly', phone:'', since:2023, from:'MassageBook', mine:true, visits:0, last:null, intake:true, pressure:0, focus:'Not known yet', setup:'', note:''}},
      {business_id:'B1', col:'clients', id:'sq:CARDPERSON', data:{name:'Card Person Imported', phone:'(555) 010-9988', from:'MassageBook'}},
      {business_id:'B1', col:'visits', id:'mb:old3', data:{c:'sq:CARDPERSON', date:'2025-05-06', start:630, s:'sw90', price:140, from:'MassageBook'}},
      {business_id:'B1', col:'visits', id:'mb:old4', data:{c:'sq:CARDPERSON', date:'2025-05-13', start:630, s:'sw90', price:140, from:'MassageBook'}},
      {business_id:'B1', col:'clients', id:'mb:imported-person', data:{name:'Imported Person', phone:'(555) 010-2233', email:'imported@example.com', born:'1980-01-02', since:2022, from:'MassageBook', mine:true, visits:0, last:null, intake:true, pressure:0, focus:'Not known yet', setup:'', note:''}},
      {business_id:'B1', col:'appts', id:'aC', data:{c:'nC', s:'sw60', date:iso(now), start:1410, paid:false, tip:0, w:'Kelli'}}],
    payments:[{business_id:'B1', id:'P1', created_at:'2026-03-02T15:00:00Z', status:'COMPLETED', customer_id:'TESTCUST1', data:pay('P1', new Date('2026-03-02T15:00:00Z'), 11500, 2000, 'TESTCUST1')},
      // a card with no name in Square that paid the day Imported Person came in
      {business_id:'B1', id:'P2', created_at:'2025-03-04T16:10:00Z', status:'COMPLETED', customer_id:'NONAMECARD', data:pay('P2', new Date('2025-03-04T16:10:00Z'), 10000, 1500, 'NONAMECARD')}],
    customers:[{business_id:'B1', id:'TESTCUST1', name:'Test Card Person'}]};
  // the website carries a made-up business; the real one comes from the database after signing in (members only)
  const demoMassage = new Function('genHist', `return ({${fs.readFileSync(root + 'demo/massage.js', 'utf8')}})`)(() => ({2025:Array(12).fill(30), 2026:Array(9).fill(30)})).massage;
  { const d = new Date(now); d.setDate(d.getDate() + 2); while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
    seed.items.push({business_id:'B1', col:'clients', id:'nL', data:{name:'Weekly Tester', phone:'', since:2026, visits:0, last:null, intake:true, pressure:0, focus:'Not known yet', setup:'', note:'', mine:true}});
    [0, 7, 14].forEach(n => { const x = new Date(d); x.setDate(x.getDate() + n); seed.items.push({business_id:'B1', col:'appts', id:'aL' + n, data:{c:'nL', s:'sw90', date:iso(x), start:630, paid:false, tip:0, w:'Kelli'}}); }); }
  seed.businesses = [{id:'B1', name:'Cloud Test Massage', profile:'massage', data:{...demoMassage, site:{slug:'cloud-test', url:'https://example.com/cloud-test'}, biz:'Cloud Test Massage', owner:'Robin', real:true, books:{2024:{take:28000, rent:8000, other:900, kept:19100}, 2025:{take:30000, rent:8000, other:1000, kept:21000}}, booksNote:''}}];
  const fake = fs.readFileSync(fx + 'fake-supabase.js', 'utf8');
  const site = fs.readFileSync(root + 'site/index.html', 'utf8');
  check(!/Cloud Test Massage/.test(site) && /Tidewater Massage/.test(site), 'website: the page carries only the made-up business');
  const q = await (await b.newContext({viewport:{width:390, height:844}})).newPage();
  q.on('pageerror', e => errs.push('site/index.html: ' + e.message));
  // the phone's Face ID, standing in for the real prompt
  await q.addInitScript(`window.__SOLE_INTRO_MS = 0; window.print = () => { window.__printed = true; };\nnavigator.credentials.get = navigator.credentials.create = async () => ({id:'fake-pk', toJSON(){ return {id:'fake-pk'}; }});\nwindow.__FAKE_DB = ${JSON.stringify(seed)};\n${fake}`);
  await q.route('https://sole.test/', r => r.fulfill({contentType:'text/html', body:site}));   // https: Face ID needs a secure page
  await q.route('https://sole.test/vendor/qrcode.js', r => r.fulfill({contentType:'text/javascript', body:fs.readFileSync(root + 'site/vendor/qrcode.js', 'utf8')}));
  await q.goto('https://sole.test/', {waitUntil:'networkidle'});
  check(/Send me a code/.test(await q.textContent('main')), 'website: asks to sign in');
  await q.fill('#si-email', 'test@example.com'); await q.click('#si-form button');
  await q.fill('#si-code', '123456'); await q.click('#si-form button');
  await q.waitForSelector('#fx-on'); check(/Skip the code next time/.test(await q.textContent('main')), 'website: offers Face ID after the email code');
  await q.click('#fx-on'); await q.waitForSelector('.biz-name');
  check(await q.evaluate(() => localStorage.getItem('sole-face') === '1'), 'website: Face ID is remembered on this phone');
  check(/Cloud Sample/.test(await q.textContent('main')), 'website: the book loads from the database');
  // a card Square has no name for is the client who came in the day it paid; tapping it opens their page
  await q.waitForTimeout(300); await q.click('.tab[data-v=money]'); await q.click('#s-clients [data-act=sqall] >> nth=0');
  { const t = await q.textContent('.sheet'); check(/Imported Person/.test(t) && !/Card customer|Card with no name/.test(t), 'website: nameless cards are named by the visit that day'); }
  await q.click('.sheet .topc:has-text("Imported Person")'); check(/Imported Person/.test(await q.textContent('main')) && /Not Imported\?/.test(await q.textContent('main')), 'website: a named card opens the client page');
  await q.click('.tab[data-v=today]');
  // book again: a calendar to pick the day, the same client and service
  await q.click('[data-act=appt] >> nth=0'); await q.click('[data-act=rebook]');
  check(await q.locator('.sheet .cal').count() === 1 && /again/.test(await q.textContent('.sheet h2, .sheet .sheet-h, .sheet')), 'website: book again opens a calendar');
  check(await q.locator('.sheet [data-act=b-t]').count() === 0 && /Pick a day/.test(await q.textContent('#book-go')), 'website: book again waits for her to pick the day');
  await q.click('.sheet [data-act=b-calm][data-v="1"]'); await q.click('.sheet .cal-d:not(.off):not([disabled]) >> nth=2');
  if (!(await q.locator('.sheet [data-act=b-t][aria-pressed=true]').count())) await q.click('.sheet [data-act=b-t] >> nth=0');
  check(/Book Cloud/.test(await q.textContent('#book-go')), 'website: a day and time picked from the calendar');
  check(!(await wide(q)), 'website: the calendar fits the phone');
  const nAp = () => q.evaluate(() => window.__FAKE.T.items.filter(r => r.col === 'appts').length), ap0 = await nAp();
  await q.click('#book-go'); await q.waitForTimeout(400); const ap1 = await nAp();
  await q.click('.toast [data-act=undo]'); await q.waitForTimeout(400);
  check(ap1 === ap0 + 1 && await nAp() === ap0, 'website: undo takes a booking back out of the book');
  if (await q.locator('.sheet .close').count()) await q.click('.sheet .close');
  // a form texted to a client: a one-time link, filled in and signed on their own phone, back in the book
  await q.click('.tab[data-v=clients]'); await q.fill('#clt-search', 'Imported Person'); await q.click('#clt-list .li.client >> nth=0');
  await q.click('main [data-act=intake]');   await q.waitForSelector('.sheet');
  const link = await q.evaluate(() => window.__FAKE.T.form_links[0]);
  check(link && link.token.length >= 32 && link.client === 'mb:imported-person' && (await q.innerHTML('.sheet')).includes('/?f=' + link.token), 'website: texting the form makes a one-time link');
  await q.click('.sheet .close');
  const fq = await (await b.newContext({viewport:{width:390, height:844}})).newPage();
  fq.on('pageerror', e => errs.push('site/index.html (form link): ' + e.message));
  await fq.addInitScript(`window.__SOLE_INTRO_MS = 0;\nwindow.__FAKE_DB = ${JSON.stringify({...seed, form_links:[link]})};\n${fake}`);
  await fq.route('https://sole.test/**', r => r.fulfill({contentType:'text/html', body:site}));
  await fq.goto('https://sole.test/?f=' + link.token, {waitUntil:'networkidle'});
  { const t = await fq.textContent('main'); check(/Hi Imported!/.test(t) && /Cloud Test Massage/.test(t) && !/Cloud Sample|Send me a code/.test(t) && !(await fq.locator('.tab').count()), 'form link: the client sees only the form, no sign-in'); }
  check(await fq.inputValue('#ff-name') === 'Imported Person', 'form link: their name is filled in');
  await fq.fill('#ff-phone', '(555) 010-2233'); await fq.click('label.pick:has(input[name="ff-pressure"][value="Firm"])'); await fq.check('#ff-consent');
  await fq.locator('#sig').scrollIntoViewIfNeeded(); { const bx = await fq.locator('#sig').boundingBox();
    await fq.mouse.move(bx.x + 20, bx.y + 40); await fq.mouse.down(); await fq.mouse.move(bx.x + 150, bx.y + 80, {steps:8}); await fq.mouse.up(); }
  check(!(await wide(fq)), 'form link: fits the phone');
  await fq.click('#fill-go'); await fq.waitForSelector('.thanks');
  check(/Thank you, Imported/.test(await fq.textContent('main')), 'form link: thank-you after sending');
  const sent = await fq.evaluate(() => window.__FAKE.sent);
  check(sent && sent.col === 'forms' && sent.data.client === 'mb:imported-person' && /^data:image\/png/.test(sent.data.sig) && sent.data.answers.pressure === 'Firm', 'form link: answers and signature saved to the book');
  await fq.goto('https://sole.test/?f=nope', {waitUntil:'networkidle'}); check(/link has closed/.test(await fq.textContent('main')), 'form link: an unknown link says so');
  // a new client from the business's website: the same form, no link made for them; lands in the book as a new client
  await fq.goto('https://sole.test/?new=cloud-test', {waitUntil:'networkidle'});
  check(/Welcome!/.test(await fq.textContent('main')) && /Cloud Test Massage/.test(await fq.textContent('main')) && await fq.inputValue('#ff-name') === '', 'website form: a new client gets the intake form');
  await fq.fill('#ff-name', 'Web Newcomer'); await fq.fill('#ff-phone', '(555) 010-7788'); await fq.check('#ff-consent');
  await fq.locator('#sig').scrollIntoViewIfNeeded(); { const bx = await fq.locator('#sig').boundingBox();
    await fq.mouse.move(bx.x + 20, bx.y + 40); await fq.mouse.down(); await fq.mouse.move(bx.x + 150, bx.y + 80, {steps:8}); await fq.mouse.up(); }
  await fq.click('#fill-go'); await fq.waitForSelector('.thanks');
  check(await fq.evaluate(() => window.__FAKE.sent && window.__FAKE.sent.data.via === 'website' && window.__FAKE.sent.data.client === null && window.__FAKE.sent.data.name === 'Web Newcomer'), 'website form: saved as a new client');
  await fq.goto('https://sole.test/?new=nobody', {waitUntil:'networkidle'}); check(/link has closed/.test(await fq.textContent('main')), 'website form: an unknown business says so');
  await fq.close();
  await q.evaluate(row => window.__FAKE.emit('items', {eventType:'INSERT', new:row}), sent);
  check(await q.waitForFunction(() => /Imported sent their client intake form/.test((document.querySelector('.toast') || {}).textContent || ''), null, {timeout:4000}).then(() => true, () => false), 'website: a texted form shows up on her phone the moment it is sent');
  await q.click('.tab[data-v=today]');
  check(/Cloud Test Massage/.test(await q.textContent('.biz-name')) && /Robin/.test(await q.textContent('#hdr')), 'website: the business comes from the database');
  check(await q.evaluate(() => __FAKE.invoked.filter(x => 'full' in x).length === 1), 'website: asks the server to catch up with Square');
  await q.click('.tab[data-v=money]');
  check(/\$115/.test(await q.textContent('main')) && /Test Card Person/.test(await q.textContent('#s-clients')), 'website: Square payments and card customers come from the tables');
  await q.click('#s-books [data-act=addpay]'); await q.fill('#pf-amt', '60'); await q.click('.sheet [data-act=pf-save]'); await q.waitForTimeout(200);
  check(await q.evaluate(() => __FAKE.T.items.some(r => r.col === 'ledger' && r.data.amount === 60)), 'website: a payment is saved to the database');
  await q.evaluate(p => __FAKE.emit('square_payments', {eventType:'INSERT', new:{data:p}}), pay('P2', early, 9500, 1500, null));
  await q.click('.tab[data-v=today]'); await q.waitForTimeout(100);
  check(/Today so far\s*\$155/.test(await q.textContent('.glance')), 'website: a card payment shows the moment it comes in');
  // a client brought in from MassageBook: how long they've come, found by phone, contact details on their page
  await q.click('.tab[data-v=clients]'); await q.fill('#clt-search', '010-22');
  check(/Imported Person/.test(await q.textContent('#clt-list')) && /Last in \d+ weeks ago/.test(await q.textContent('#clt-list')), 'website: imported client found by phone, shown with when they were last in');
  await q.click('#clt-list .li.client'); const pg = await q.textContent('main');
  check(/imported@example\.com/.test(pg) && /January 2/.test(pg) && !/>New</.test(await q.innerHTML('.cl-hero')), 'website: imported client page has their contact details');
  check(/Aromatherapy massage/.test(pg) && /\$140/.test(pg) && /Mar 4, 2025/.test(pg) && /\$240/.test(await q.textContent('.spend')) && /2 massages/.test(await q.textContent('.cl-hero')), 'website: visits from the old booking app show with their prices and count');
  check(await q.evaluate(() => __FAKE.T.items.filter(r => r.col === 'clients' && r.id === 'mb:imported-person').every(r => r.data.last == null && !r.data.old && !r.data._saved)), 'website: worked-out history is not saved over the client');
  // a Square card customer brought over from the old app keeps their history until Square knows them
  await q.click('[data-act=cl-back]'); await q.fill('#clt-search', 'Card Person'); await q.click('#clt-list .li.client');
  check(/\$280/.test(await q.textContent('.spend')) && /2 massages/.test(await q.textContent('.cl-hero')), 'website: a card customer from the old app shows their visits and spending');
  // records on file: who has notes, without what's in them; a client's record prints
  await q.click('.tab[data-v=clients]'); await q.fill('#clt-search', '');
  check(/1 SOAP note on file for 1 client/.test(await q.textContent('[data-act=cl-rec]')), 'records: the Clients tab says how many notes are on file');
  await q.click('[data-act=cl-rec]');
  const rec = await q.textContent('main'); check(/Imported Person/.test(rec) && /1 note · Mar 4, 2025/.test(rec) && !/Test sore shoulders/.test(rec), 'records: the list shows what is on file, not what is in it');
  await q.click('[data-act=print-list]'); await q.waitForTimeout(120);
  check(await q.evaluate(() => window.__printed && /Records on file/.test(document.getElementById('print').textContent)), 'records: the list prints');
  await q.click('.list [data-act=cl-open]'); await q.click('[data-act=print-rec]'); await q.waitForTimeout(120);
  check(await q.evaluate(() => /Test sore shoulders/.test(document.getElementById('print').textContent) && /Imported Person/.test(document.getElementById('print').textContent)), 'records: a client record prints with every note');
  // booking someone with a one-word name, found by search
  await q.click('.tab[data-v=schedule]'); await q.click('[data-act=book]');
  await q.fill('#b-find', 'holl'); await q.click('#b-who [data-act=b-c][data-v="mb:holly"]');
  for (let i = 0; i < 6 && !(await q.locator('[data-act=b-t]').count()); i++) await q.click(`[data-act=b-d] >> nth=${i + 1}`);
  await q.click('[data-act=b-t] >> nth=0'); await q.click('#book-go'); await q.waitForTimeout(150);
  check(await q.evaluate(() => __FAKE.T.items.some(r => r.col === 'appts' && r.data.c === 'mb:holly')), 'website: booking works for a one-word name found by search');
  if (await q.locator('.sheet .close').count()) await q.click('.sheet .close');
  await q.click('.tab[data-v=today]');
  // papers on the website: the file goes to private storage, the list into the book
  { const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    await q.click('.tab[data-v=forms]'); await q.click('#papers .pp-miss >> nth=0');
    await q.setInputFiles('#pp-file', {name:'license.png', mimeType:'image/png', buffer:png}); await q.click('.sheet [data-act=pp-save]'); await q.waitForTimeout(400);
    check(await q.evaluate(() => { const r = window.__FAKE.T.items.find(x => x.col === 'people' && x.id === 'papers'); return !!(r && r.data.list.length === 1 && /^B1\/papers\/.+\.png$/.test(r.data.list[0].file)); }), 'website: a paper is stored privately and listed in the book');
    await q.click('.tab[data-v=today]'); }
  // a message from the website: on Today's To do, open it, text back, mark it answered
  { await q.click('.tab[data-v=today]');
    check(/Jamie wrote from your website/.test(await q.textContent('main')), 'messages: a website message is on Today');
    await q.click('[data-act=inb][data-v=mTEST]');
    const h = await q.getAttribute('.sheet a.btn.primary', 'href');
    check(/Do you have anything open Friday/.test(await q.textContent('.sheet')) && /^sms:5550100199&body=Hi%20Jamie/.test(h || ''), 'messages: the sheet shows it with Text back written');
    await q.click('.sheet [data-act=inb-done]'); await q.waitForTimeout(300);
    check(!/Jamie wrote from your website/.test(await q.textContent('main')), 'messages: answered ones leave To do');
    check(await q.evaluate(() => { const r = window.__FAKE.T.items.find(x => x.col === 'inbox' && x.id === 'mTEST'); return !!(r && r.data.done); }), 'messages: answered is saved');
    await q.click('.tab[data-v=forms]'); check(/Messages from your website/.test(await q.textContent('main')) && /0 to answer/.test(await q.textContent('#inbox')), 'messages: listed in Forms');
    await q.click('.tab[data-v=today]'); }
  // a copy of the appointments in Google Calendar: a private link from the account sheet, and a new one on request
  { await q.click('[data-act=me]'); await q.click('.sheet [data-act=gcal]'); await q.waitForSelector('#gc-url');
    const t = await q.textContent('.sheet');
    check(/a{48}$/.test(await q.inputValue('#gc-url')) && /Other calendars/.test(t) && /From URL/.test(t) && /Cloud Test Massage appointments/.test(t), 'google calendar: the private link and how to add it');
    check(!(await wide(q)), 'google calendar: the sheet fits the phone');
    await q.click('.sheet [data-act=gc-reset]'); check(/old link stops working/.test(await q.textContent('.sheet [data-act=gc-reset]')), 'google calendar: a new link asks once more first');
    await q.click('.sheet [data-act=gc-reset]'); await q.waitForTimeout(200);
    check(/b{48}$/.test(await q.inputValue('#gc-url')), 'google calendar: a new link replaces the old');
    await q.click('.sheet .close'); }
  // the account: initials at the top; light or dark on this phone; a name; thank-you texts on or off for the business
  check((await q.textContent('.me')).trim() === 'T', 'account: initials of who is signed in');
  check(await q.evaluate(() => { const b = document.querySelector('[data-act=me]'); b.click(); const t = document.querySelector('.sheet').textContent; document.querySelector('.sheet .close').click(); return /isn’t allowed to send them/.test(t); }), 'notifications: blocked on this phone says where to turn them on');
  await q.evaluate(() => Object.defineProperty(Notification, 'permission', {get:() => 'default', configurable:true}));   // a phone that hasn't been asked yet
  await q.click('[data-act=me]');
  check(await q.locator('.sheet [data-act=me-push-on]').count() === 1, 'notifications: the account menu offers to turn them on');
  await q.click('.sheet [data-act=me-theme][data-v=dark]');
  check(await q.evaluate(() => document.documentElement.dataset.theme === 'dark' && localStorage.getItem('sole-theme') === 'dark'), 'account: dark on this phone');
  await q.click('.sheet [data-act=me-theme][data-v=""]'); check(await q.evaluate(() => !document.documentElement.dataset.theme), 'account: back to the phone setting');
  await q.fill('#me-name', 'Test Owner'); await q.click('.sheet [data-act=me-thanks][data-v=off]'); await q.waitForTimeout(1000); await q.click('.sheet .close'); await q.waitForTimeout(300);
  check((await q.textContent('.me')).trim() === 'TO' && /Good \w+, Test/.test(await q.textContent('h1')), 'account: the name shows at the top');
  check(await q.evaluate(() => { const r = window.__FAKE.T.items.find(x => x.col === 'people' && x.id === 'prefs'); return r && r.data.thanks === false && r.data.names['test@example.com'] === 'Test Owner'; }), 'account: choices saved for the business');
  check(!(await wide(q)), 'account: the top row fits the phone');
  check(!(await wide(q)), 'website: wider than the phone');
  // the forms' link for a client is SolePro's own page for the business (fill in and sign, no sign-in)
  { await q.click('.tab[data-v=forms]'); await q.click('main .form:has-text("Client intake form") [data-act=formsend]');
    check(/https:\/\/sole\.test\/\?new=cloud-test/.test(await q.textContent('.sheet')), 'forms: Text a link sends SolePro’s own form page');
    await q.click('.sheet .close'); await q.waitForTimeout(250); await q.click('.tab[data-v=today]'); }
  // a QR code for the business's website: two taps from anywhere (the initials, then Show my QR code)
  { await q.click('[data-act=me]'); await q.click('.sheet [data-act=qr]'); await q.waitForSelector('#qr-box svg');
    check(/example\.com\/cloud-test/.test(await q.textContent('#qr-box')) && (await q.getAttribute('#qr-box svg path', 'd') || '').length > 500, 'QR code: shows a code for the website and its address');
    check(await q.evaluate(() => getComputedStyle(document.getElementById('qr-box')).backgroundColor) === 'rgb(255, 255, 255)' && !(await wide(q)), 'QR code: black on white, fits the phone');
    await q.click('.sheet .close'); await q.waitForTimeout(300); }
  // services and prices: add a 2 hour one, change a price (visits before today keep theirs), stop offering one; then a
  // booked visit changes to the new one, with the client's other upcoming ones
  { await q.click('[data-act=me]'); await q.click('.sheet [data-act=sv-list]');
    check(/Services and prices/.test(await q.textContent('.sheet')) && await q.locator('.sheet [data-act=sv-edit]').count() >= 8, 'services: the list opens from the account menu');
    await q.click('.sheet [data-act=sv-new]'); await q.fill('#sv-name', 'Swedish'); await q.fill('#sv-price', ''); await q.click('.sheet [data-act=sv-save]');
    check(/Add its price/.test(await q.textContent('#sv-err')), 'services: it asks for a price');
    await q.click('.sheet [data-act=sv-min][data-v="120"]'); check(await q.inputValue('#sv-name') === 'Swedish', 'services: picking a length keeps what she typed');
    await q.fill('#sv-price', '$195'); await q.click('.sheet [data-act=sv-save]'); await q.waitForTimeout(500);
    const pref = () => q.evaluate(() => (window.__FAKE.T.items.find(x => x.col === 'people' && x.id === 'prefs') || {}).data || {});
    const two = ((await pref()).services || []).find(x => x.name === 'Swedish' && x.min === 120);
    check(two && two.price === 195, 'services: a new one is saved for the business');
    check(/Swedish\s*1 hr\s*\$\d+[\s\S]*Swedish\s*1 hr 30 min[\s\S]*Swedish\s*2 hr\s*\$195/.test(await q.textContent('.sheet')), 'services: the new length sits with the others of its name');
    await q.click('.sheet [data-act=sv-edit][data-v=tp60]'); await q.fill('#sv-price', '120'); await q.click('.sheet [data-act=sv-save]'); await q.waitForTimeout(500);
    const tp = (await pref()).services.find(x => x.k === 'tp60');
    check(tp.price === 120 && tp.was && tp.was[0].price === 110 && tp.was[0].to === iso(new Date()), 'services: a new price counts from today, the old one stays with earlier days');
    await q.click('.sheet [data-act=sv-edit][data-v=gs60]'); await q.click('.sheet [data-act=sv-off]'); await q.waitForTimeout(500);
    check(/Not offered right now[\s\S]*Gua sha/.test(await q.textContent('.sheet')) && (await pref()).services.find(x => x.k === 'gs60').off === true, 'services: one she stops offering moves aside');
    check(!(await wide(q)), 'services: fits the phone');
    await q.click('.sheet .close'); await q.waitForTimeout(300);
    await q.click('.tab[data-v=schedule]'); await q.click('main [data-act=book]');
    { const t = await q.textContent('.sheet'); check(/2 hr · \$195/.test(t) && !/Gua sha/.test(t) && /Trigger point\s*60 min · \$120/.test(t), 'services: booking offers the new list'); }
    await q.click('.sheet .close'); await q.waitForTimeout(300);
    // Weekly Tester is booked 90 minutes three weeks running: the first one becomes 2 hours, and the other two with it
    await q.click('.tab[data-v=clients]'); await q.click('#clt-list [data-c=nL]'); await q.click('main .cl-next'); await q.click('.sheet [data-act=move]');
    check(/Move or change Weekly’s massage/.test(await q.textContent('.sheet')), 'services: a booked visit can be changed');
    await q.click('.sheet [data-act=b-s]:has-text("2 hr")');
    check(/Weekly’s other 2 upcoming massages too/.test(await q.textContent('.sheet [data-act=b-also]')), 'services: offers the client’s other upcoming visits too');
    await q.click('.sheet [data-act=b-also]'); check(/Save the change/.test(await q.textContent('#book-go')), 'services: same day and time, a different service');
    await q.click('#book-go'); await q.waitForTimeout(500);
    check(/now 2 hr swedish .* and 2 more/.test(await q.textContent('.toast')), 'services: says what changed');
    check(await q.evaluate(k => ['aL0', 'aL7', 'aL14'].every(id => window.__FAKE.T.items.find(x => x.col === 'appts' && x.id === id).data.s === k), two.k), 'services: all three are saved as the new service');
    await q.click('.tab[data-v=today]'); }
  // back, one step at a time: from a sheet opened inside another sheet to that one, then to the page
  { await q.click('[data-act=me]'); await q.click('.sheet [data-act=sv-list]'); await q.click('.sheet [data-act=sv-edit] >> nth=0');
    check(/Change a service/.test(await q.textContent('.sheet')), 'back: a service open from the list');
    await q.evaluate(() => history.back()); await q.waitForTimeout(300);
    check(/Services and prices/.test(await q.textContent('.sheet')) && !/Change a service/.test(await q.textContent('.sheet')), 'back: from a service to the list of services');
    await q.evaluate(() => history.back()); await q.waitForTimeout(300);
    check(/Your account/.test(await q.textContent('.sheet')), 'back: from the list to the account menu');
    await q.evaluate(() => history.back()); await q.waitForTimeout(300);
    check(await q.locator('#layer .sheet').count() === 0, 'back: then the sheet closes, the page stays'); }
  // pull down: the page you're on, fresh from the server, without starting the app over
  { await q.click('.tab[data-v=clients]'); await q.click('#clt-list [data-c=nL]'); await q.waitForTimeout(200);
    await q.evaluate(() => { window.__still = true; const r = window.__FAKE.T.items.find(x => x.col === 'clients' && x.id === 'nL'); r.data = {...r.data, name:'Weekly Tester Renamed'}; });
    await q.evaluate(() => pullGo()); await q.waitForTimeout(1500);
    check(await q.evaluate(() => window.__still === true) && await q.locator('.signin').count() === 0, 'pull down: the app doesn’t start over');
    check(/Weekly Tester Renamed/.test(await q.textContent('main')) && await q.locator('main .cl-next').count() === 1, 'pull down: the same page, with what changed on the server');
    await q.click('.tab[data-v=today]'); }
  // signed out (a new day, a cleared session): Face ID comes first and opens the book without a code
  await q.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('sb-')) localStorage.removeItem(k); });
  await q.reload({waitUntil:'networkidle'}); await q.waitForSelector('#si-face');
  check(await q.evaluate(() => document.querySelector('#sky-card .btn').id === 'si-face'), 'website: Face ID is the first choice once it is on');
  await q.click('#si-face'); await q.waitForSelector('.biz-name');
  check(/Cloud Test Massage/.test(await q.textContent('.biz-name')), 'website: Face ID signs in');
  // no signal: the phone's own copy of the book opens; a change made then waits and is saved once back online
  await q.waitForTimeout(500); await q.evaluate(() => new Promise(r => { document.dispatchEvent(new Event('visibilitychange')); setTimeout(r, 300); }));
  const page = async (init) => { const x = await q.context().newPage(); x.on('pageerror', e => errs.push('site/index.html (offline): ' + e.message));
    await x.addInitScript(`window.__SOLE_INTRO_MS = 0; ${init}\nnavigator.credentials.get = navigator.credentials.create = async () => ({id:'fake-pk', toJSON(){ return {id:'fake-pk'}; }});\nwindow.__FAKE_DB = ${JSON.stringify(seed)};\n${fake}`);
    await x.route('https://sole.test/**', r => r.fulfill({contentType:'text/html', body:site})); await x.goto('https://sole.test/', {waitUntil:'networkidle'}); return x; };
  await q.close();
  // Face ID set up for another address (as right after a move): never offered, the email code carries on
  { const mv = await page('window.__FAKE_RP = "old.example.com";'); await mv.waitForSelector('#si-email');
    check(await mv.locator('#si-face').count() === 0, 'moved address: no Face ID button that cannot work');
    await mv.fill('#si-email', 'test@example.com'); await mv.click('#si-form button'); await mv.fill('#si-code', '123456'); await mv.click('#si-form button');
    await mv.waitForSelector('.biz-name'); check(!(await mv.locator('#fx-on').count()), 'moved address: signs in with the code, no Face ID offer');
    await mv.close(); }
  const off = await page('window.__SOLE_OFFLINE = true;');
  await off.waitForSelector('#offline-bar', {timeout:5000}).catch(() => {});
  check(/No signal/.test(await off.textContent('body')) && /Cloud Sample/.test(await off.textContent('main')), 'no signal: the book opens from the phone');
  await off.click('.tab[data-v=clients]'); await off.click('[data-act=addc] >> nth=0'); await off.fill('#ac-name', 'Offline Person'); await off.click('[data-act=ac-save]'); await off.waitForTimeout(400);
  check(/1 change will save/.test(await off.textContent('#offline-bar')), 'no signal: a change waits to be saved');
  check(!(await wide(off)), 'no signal: fits the phone');
  await off.close();
  const on = await page('');
  await on.waitForSelector('#si-face'); await on.click('#si-face'); await on.waitForSelector('.biz-name');
  await on.waitForTimeout(300);
  check(await on.evaluate(() => window.__FAKE.T.items.some(r => r.col === 'clients' && r.data && r.data.name.trim() === 'Offline Person')), 'back online: the change made with no signal is saved');
  check(/Offline Person/.test(await (async () => { await on.click('.tab[data-v=clients]'); return on.textContent('main'); })()), 'back online: and shows in the book');
  await on.close();
  // the opening plays once: the sun rises steadily while the book loads under it (moving the scene above the book used
  // to start every animation over), and a phone that has opened the book before says welcome back from the start
  { const o = await (await b.newContext({viewport:{width:390, height:844}})).newPage(); o.on('pageerror', e => errs.push('opening: ' + e.message));
    const slow = fake.replace('then:(ok, no) => Promise.resolve(run()).then(ok, no)', 'then:(ok, no) => new Promise(r => setTimeout(r, 250)).then(() => run()).then(ok, no)');
    await o.addInitScript(`window.__SOLE_HOUR = 7; localStorage.setItem('sole-been','1'); localStorage.setItem('sole-face-later', String(Date.now())); localStorage.setItem('sole-biz-name','Cloud Test Massage');\nwindow.__FAKE_DB = ${JSON.stringify(seed)};\n${slow}\nwindow.__SOLE_CLOUD_CLIENT.auth.verifyOtp({email:'test@example.com', token:'123456'});`);
    await o.route('https://sole.test/', r => r.fulfill({contentType:'text/html', body:site})); o.goto('https://sole.test/').catch(() => {});
    const ys = [], cards = new Set();
    for (let i = 0; i < 30; i++) { const r = await o.evaluate(() => { const s = document.querySelector('.sky .sun'), c = document.getElementById('sky-card');
        return s ? {y:new DOMMatrix(getComputedStyle(s).transform).m42, card:c ? c.textContent : '', veil:!!document.querySelector('.signin.veil')} : null; }).catch(() => null);
      if (r) { ys.push(r.y); cards.add(r.card); } await o.waitForTimeout(80); }
    check(ys.length > 10 && ys.every((y, i) => !i || y <= ys[i - 1] + 0.5), 'opening: the sun rises once, without starting over');
    check([...cards].every(c => /Welcome back\s*Cloud Test Massage/.test(c)), 'opening: a returning phone says welcome back from the start');
    await o.close(); }
  // the opening shows the time of day: sunrise in the morning, the sun high at midday, sunset, and the moon at night
  for (const [h, tod] of [[7, 'dawn'], [13, 'day'], [18, 'dusk'], [23, 'night']]) {
    const x = await page(`window.__SOLE_HOUR = ${h};`);
    await x.waitForSelector('.signin');
    const r = await x.evaluate(() => ({tod:document.querySelector('.signin').dataset.tod, moon:!!document.querySelector('.sky .moon'), sun:!!document.querySelector('.sky .sun')}));
    check(r.tod === tod && r.moon === (tod === 'night') && r.sun === (tod !== 'night'), `opening at ${h}:00 shows ${tod}: ${JSON.stringify(r)}`);
    await x.close(); }
  // texts from SolePro's number: booking texts the client by itself once the Undo window has passed, Undo stops it, the
  // owner can turn it off, and a reply lands in Messages and is answered from SolePro
  { const t = await (await b.newContext({viewport:{width:390, height:844}})).newPage(); t.on('pageerror', e => errs.push('texts: ' + e.message));
    const tseed = {...seed, items:[...seed.items, {business_id:'B1', col:'inbox', id:'mTXT', data:{id:'mTXT', name:'Imported Person', phone:'(555) 010-2233', message:'Can we do 3 instead?', at:new Date().toISOString(), via:'text'}}]};
    await t.addInitScript(`window.__SOLE_INTRO_MS = 0; window.__SOLE_TEXT_MS = 1500; window.__FAKE_TEXT_ON = true; localStorage.setItem('sole-face-later', String(Date.now()));\nwindow.__FAKE_DB = ${JSON.stringify(tseed)};\n${fake}`);
    await t.route('https://sole.test/', r => r.fulfill({contentType:'text/html', body:site})); await t.goto('https://sole.test/', {waitUntil:'networkidle'});
    await t.fill('#si-email', 'test@example.com'); await t.click('#si-form button'); await t.fill('#si-code', '123456'); await t.click('#si-form button'); await t.waitForSelector('.biz-name'); await t.waitForTimeout(300);
    const sent = () => t.evaluate(() => window.__FAKE.texts || []);
    const bookIt = async () => { await t.click('.tab[data-v=schedule]'); await t.click('[data-act=book]'); await t.fill('#b-find', 'imported'); await t.click('#b-who [data-act=b-c][data-v="mb:imported-person"]');
      for (let i = 0; i < 6 && !(await t.locator('[data-act=b-t]').count()); i++) await t.click(`[data-act=b-d] >> nth=${i + 1}`);
      await t.click('[data-act=b-t] >> nth=0'); await t.click('#book-go'); await t.waitForTimeout(150); };
    await bookIt();
    check(/SolePro will text Imported/.test(await t.textContent('.toast')) && !(await t.locator('.sheet').count()), 'texts: booking says SolePro will text, and Messages doesn’t open');
    check(!(await sent()).length, 'texts: nothing goes during the Undo window');
    await t.waitForTimeout(1700);
    { const L = await sent(); check(L.length === 1 && L[0].kind === 'confirm' && /You’re booked for/.test(L[0].body) && L[0].to === '(555) 010-2233' && L[0].business_id === 'B1', 'texts: the confirmation goes out by itself'); }
    check(/Texted Imported/.test(await t.textContent('.toast')), 'texts: and says so');
    await bookIt(); await t.click('.toast [data-act=undo]'); await t.waitForTimeout(2000);
    check((await sent()).length === 1, 'texts: Undo stops the text');
    await t.click('[data-act=me]'); check(/SolePro sends them/.test(await t.textContent('.sheet')), 'texts: the account sheet has the choice');
    await t.click('.sheet [data-act=me-autotext][data-v=off]'); await t.click('.sheet .close');
    await bookIt(); check(/You’re booked/.test(await t.inputValue('#msg')), 'texts: turned off, Messages opens with it written'); await t.click('.sheet .close');
    check(await t.evaluate(() => { const r = window.__FAKE.T.items.find(x => x.col === 'people' && x.id === 'prefs'); return !!r && r.data.autoText === false; }), 'texts: the choice is saved with the business');
    await t.click('.tab[data-v=today]'); check(/Imported texted back/.test(await t.textContent('main')), 'texts: a reply is on Today');
    await t.click('[data-act=inb][data-v=mTXT]'); check(/Texted back/.test(await t.textContent('.sheet')) && await t.locator('#inb-reply').count() === 1, 'texts: a reply is answered from SolePro');
    await t.fill('#inb-reply', '3 works! See you then.'); await t.click('.sheet [data-act=inb-send]'); await t.waitForTimeout(300);
    { const L = await sent(), r = L[L.length - 1] || {}; check(r.kind === 'reply' && r.body === '3 works! See you then.' && /3 works/.test(await t.textContent('.sheet .msg-mine')), 'texts: the answer goes from SolePro and shows under theirs'); }
    check(await t.evaluate(() => { const r = window.__FAKE.T.items.find(x => x.col === 'inbox' && x.id === 'mTXT'); return !!(r && r.data.done && r.data.replies.length === 1); }), 'texts: answered and saved');
    check(!(await wide(t)), 'texts: the message sheet fits the phone');
    await t.close(); }
  // paid sign-up (Stripe, asked for Oct 28, 2026): getsolepro.com's Start button, a 14-day trial with a card, monthly
  // or yearly, then setup; a plan that has ended keeps the book to see and print but saves nothing
  { const n = await (await b.newContext({viewport:{width:390, height:844}})).newPage(); n.on('pageerror', e => errs.push('paid sign-up: ' + e.message));
    const pseed = {businesses:[seed.businesses[0]], members:[{business_id:'B1', email:'owner@example.com', role:'owner'}], invite_codes:[], items:[], payments:[], customers:[]};
    await n.addInitScript(`window.__SOLE_INTRO_MS = 0; window.__FAKE_KEEP = true; window.__FAKE_BILLING = true; window.__FAKE_OWNER = 'paid@example.com'; localStorage.setItem('sole-face-later', String(Date.now()));\nwindow.__FAKE_DB = ${JSON.stringify(pseed)};\n${fake}`);
    let went = '';
    await n.route('https://sole.test/**', r => r.fulfill({contentType:'text/html', body:site}));
    await n.route('https://checkout.stripe.test/**', r => { went = r.request().url(); return r.fulfill({contentType:'text/html', body:'<p>Stripe checkout'}); });
    await n.route('https://billing.stripe.test/**', r => { went = r.request().url(); return r.fulfill({contentType:'text/html', body:'<p>Stripe portal'}); });
    await n.goto('https://sole.test/?start', {waitUntil:'networkidle'});
    check(/Start your free trial/.test(await n.textContent('.signin')), 'paid sign-up: getsolepro.com’s Start button asks for an email first');
    await n.fill('#si-email', 'paid@example.com'); await n.click('#si-form button'); await n.fill('#si-code', '123456'); await n.click('#si-form button');
    await n.waitForSelector('#nb-trial');
    check(/\$29 a month/.test(await n.textContent('#nb-terms')) && /invite code/.test(await n.textContent('.signin')) && !(await wide(n)), 'paid sign-up: the trial, what it costs after, and an invite code still works');
    await n.click('.nb-plan [data-plan=y]'); check(/\$290 a year/.test(await n.textContent('#nb-terms')), 'paid sign-up: or yearly');
    await n.click('#nb-trial'); await n.waitForTimeout(600);
    check(/cs_test_yearly/.test(went), 'paid sign-up: on to Stripe’s checkout: ' + went);
    await n.goto('https://sole.test/?paid=cs_test_ok_123', {waitUntil:'networkidle'}); await n.waitForSelector('.sheet.full');
    check(/What does your business do\?/.test(await n.textContent('.sheet')) && await n.evaluate(() => location.search === ''), 'paid sign-up: back from checkout, straight into setup');
    await n.click('.sheet [data-act=ob-trade][data-v=landscape]'); await n.click('.sheet [data-act=ob-next]');
    await n.fill('#ob-biz', 'Paid Lawn Co'); await n.fill('#ob-owner', 'Pat'); await n.click('.sheet [data-act=ob-next]');
    await n.click('.sheet [data-act=ob-next]'); await n.fill('.sheet [id^=ob-price-] >> nth=0', '50');
    await n.click('.sheet [data-act=ob-done]'); await n.waitForSelector('.biz-name', {timeout:8000});
    const pb = await n.evaluate(() => window.__FAKE.T.businesses.find(x => x.name === 'Paid Lawn Co'));
    check(pb && pb.plan === 'monthly' && pb.plan_status === 'trialing' && pb.stripe_sub === 'sub_test_1', 'paid sign-up: the business carries its plan');
    check(!/plan has ended|didn’t go through/.test(await n.textContent('main')), 'paid sign-up: nothing about the plan on Today during the trial');
    await n.click('[data-act=me]');
    { const t = await n.textContent('.sheet'); check(/Your plan/.test(t) && /Free trial: 14 days left\. Then \$29 a month/.test(t), 'paid sign-up: the account shows the trial'); }
    // the owner view (Brooks's): every business with its plan and how much it's used, never their clients
    await n.click('.sheet [data-act=owner]'); await n.waitForSelector('.own-row');
    { const t = await n.textContent('.sheet'); check(/Every business on SolePro/.test(t) && /Paid Lawn Co/.test(t) && /Trial · 14 days left/.test(t) && /1\s*on a free trial/.test(t) && /practice mode/.test(t), 'owner view: every business, its plan and the totals'); }
    check(!(await wide(n)), 'owner view: fits the phone');
    await n.click('.sheet [data-act=own-f][data-v=paying]'); check(/Nobody here/.test(await n.textContent('.own-list')), 'owner view: filters');
    await n.click('.sheet .close'); await n.click('[data-act=me]');
    await n.click('.sheet [data-act=plan]'); await n.waitForTimeout(600);
    check(/billing\.stripe\.test/.test(went), 'paid sign-up: card, receipts or cancel open Stripe’s page');
    // the plan ends: the book is there to see, Today says how to start again, and nothing is saved
    await n.goto('https://sole.test/', {waitUntil:'networkidle'}); await n.waitForSelector('.biz-name');
    await n.evaluate(id => { const b = window.__FAKE.T.businesses.find(x => x.id === id); b.plan_status = 'canceled'; }, pb && pb.id);
    await n.reload({waitUntil:'networkidle'}); await n.waitForSelector('.biz-name');
    check(/Your SolePro plan has ended/.test(await n.textContent('main')) && await n.locator('main [data-act=plan-restart]').count() === 1, 'plan ended: Today says so, with a way back');
    const before = await n.evaluate(() => window.__FAKE.T.items.length);
    await n.click('.tab[data-v=clients]'); await n.click('[data-act=addc] >> nth=0'); await n.fill('#ac-name', 'Should Not Save'); await n.click('[data-act=ac-save]'); await n.waitForTimeout(500);
    check(await n.evaluate(() => window.__FAKE.T.items.length) === before && /plan has ended/.test(await n.textContent('body')), 'plan ended: a change isn’t saved, and it says why');
    await n.click('.sheet .close'); await n.click('.tab[data-v=today]'); await n.click('main [data-act=plan-restart]'); await n.waitForTimeout(600);
    check(/cs_test_restart/.test(went), 'plan ended: Start my plan again opens checkout');
    // Heart and Soul (the house account) never sees any of this
    await n.close(); }
  // a new business: someone signs in with an email that isn't on one, gives an invite code, goes through setup, and
  // opens their own empty book; nobody else's business shows
  { const n = await (await b.newContext({viewport:{width:390, height:844}})).newPage(); n.on('pageerror', e => errs.push('new business: ' + e.message));
    const nseed = {businesses:[seed.businesses[0]], members:[{business_id:'B1', email:'owner@example.com', role:'owner'}], invite_codes:[{code:'TEST-CODE-1', uses:0, max_uses:1}], items:[], payments:[], customers:[]};
    await n.addInitScript(`window.__SOLE_INTRO_MS = 0; window.__FAKE_KEEP = true; localStorage.setItem('sole-face-later', String(Date.now()));\nwindow.__FAKE_DB = ${JSON.stringify(nseed)};\n${fake}`);
    await n.route('https://sole.test/', r => r.fulfill({contentType:'text/html', body:site})); await n.goto('https://sole.test/', {waitUntil:'networkidle'});
    await n.fill('#si-email', 'new@example.com'); await n.click('#si-form button'); await n.fill('#si-code', '123456'); await n.click('#si-form button');
    await n.waitForSelector('#nb-code');
    check(/Welcome to SolePro/.test(await n.textContent('.signin')) && /new@example\.com/.test(await n.textContent('.signin')), 'new business: a new email is asked for an invite code');
    await n.fill('#nb-code', 'NOPE'); await n.click('#nb-form button'); await n.waitForTimeout(200);
    check(/isn’t right/.test(await n.textContent('#si-msg')), 'new business: a wrong code says so');
    await n.fill('#nb-code', ' test-code-1 '); await n.click('#nb-form button'); await n.waitForSelector('.sheet.full');
    check(/What does your business do\?/.test(await n.textContent('.sheet')) && !(await wide(n)), 'new business: setup fills the screen');
    await n.click('.sheet [data-act=ob-trade][data-v=barber]'); await n.click('.sheet [data-act=ob-next]');
    await n.fill('#ob-biz', 'Fade Street Barbers'); await n.fill('#ob-owner', 'Sam'); await n.click('.sheet [data-act=ob-next]');
    await n.click('.sheet [data-act=ob-next]');   // no logo
    check(/What you offer/.test(await n.textContent('.sheet')), 'new business: from the logo straight to services');
    await n.fill('.sheet [id^=ob-price-] >> nth=0', '42');
    await n.click('.sheet [data-act=ob-done]'); await n.waitForSelector('.biz-name', {timeout:8000});
    const nb = await n.evaluate(() => window.__FAKE.T.businesses.find(x => x.name === 'Fade Street Barbers'));
    check(nb && nb.profile === 'barber' && nb.data.real && nb.data.fresh && !nb.data.site, 'new business: made in the database as a real, new book');
    check(await n.evaluate(id => window.__FAKE.T.members.some(m => m.business_id === id && m.email === 'new@example.com') && window.__FAKE.T.invite_codes[0].uses === 1, nb && nb.id), 'new business: its owner is the new email, and the code is used');
    { const t = await n.evaluate(() => ['#hdr', '#main', '#tabs', '#layer'].map(q => document.querySelector(q).textContent).join(' ')); check(/Fade Street Barbers/.test(await n.textContent('.biz-name')) && /Get set up/.test(t) && !/sample data|Tidewater|Cloud Test Massage|Cloud Sample/.test(t), 'new business: opens its own empty book, nobody else’s'); }
    await n.click('main [data-act=gs-svc]'); check(/\$42/.test(await n.textContent('.sheet')), 'new business: its prices from setup');
    check(await n.evaluate(() => !document.querySelector('[data-act=owner]') && !OWNER), 'owner view: nobody else sees it');
    check(await n.evaluate(id => { const r = window.__FAKE.T.items.find(x => x.business_id === id && x.col === 'people' && x.id === 'prefs'); return !!(r && r.data.steps && r.data.steps.svc); }, nb && nb.id), 'new business: setup steps are saved with the business');
    // bringing in clients from the app used before: a file, a typed list and phone contacts; anyone already here is left out
    await n.click('.sheet .close');
    { const nid = nb && nb.id, rowsOf = () => n.evaluate(id => window.__FAKE.T.items.filter(x => x.business_id === id && x.col === 'clients').map(x => x.data), nid);
      check(/Bring in your/.test(await n.textContent('main .getstarted')), 'import: the first setup step brings in the client list');
      await n.click('main .getstarted [data-act=im-open]');
      await n.setInputFiles('#im-file', {name:'clients.xlsx', mimeType:'application/vnd.ms-excel', buffer:Buffer.from('x')}); await n.waitForSelector('.im-err');
      check(/Save it as CSV/.test(await n.textContent('.im-err')), 'import: a spreadsheet file is asked for as CSV');
      const csv = 'First Name,Surname,Email Address,Phone Number,Email Subscription Status,Birthday,Memo,First Visit,Last Visit,Transaction Count\n'
        + 'Jamie,Rivera,jamie@example.com,+1 555-201-3344,subscribed,1990-03-05,"Likes a low fade, no beard trim",2023-01-10,2026-10-01,22\n'
        + 'SAM,LEE,,555.777.1212,,,,,,\n,,nobody@example.com,,,,,,,\nJamie,Rivera,jamie@example.com,5552013344,,,,,,\n'
        + '"Dana","Ortiz","dana@example.com","(555) 300-4000","","03/07/1985","","","2026-09-15","3"\nLee Anne,Park,,,,,,,,\n';
      await n.setInputFiles('#im-file', {name:'customers.csv', mimeType:'text/csv', buffer:Buffer.from('﻿' + csv)}); await n.waitForSelector('.im-sum');
      { const t = await n.textContent('.sheet'); check(/4 \w+ to bring in/.test(t) && /Jamie Rivera/.test(t) && /Sam Lee/.test(t) && /\(555\) 201-3344/.test(t) && /2\s*left out/.test(t) && /listed twice/.test(t) && /had no name/.test(t), 'import: a Square-style file is read, column by column'); }
      check(!(await wide(n)), 'import: the preview fits the phone');
      await n.click('.im-map summary'); await n.selectOption('.sheet select[data-im=phone]', '-1');
      check(/Sam Lee\s*No phone or email/.test(await n.textContent('.im-list')), 'import: a column can be changed by hand');
      await n.selectOption('.sheet select[data-im=phone]', '3'); check(/555\) 777-1212/.test(await n.textContent('.im-list')), 'import: and put back');
      await n.click('.sheet [data-act=im-go]'); await n.waitForTimeout(400);
      { const t = await n.textContent('main'); check(/Jamie Rivera/.test(t) && /Lee Anne Park/.test(t) && /Last in/.test(t) && /brought in/.test(await n.textContent('.toast')), 'import: everyone shows on the Clients tab'); }
      { const L = await rowsOf(), j = L.find(c => /Jamie/.test(c.name)) || {};
        check(L.length === 4 && j.phone === '(555) 201-3344' && j.email === 'jamie@example.com' && j.born === '1990-03-05' && /low fade/.test(j.note) && j.since === 2023 && j.visits === 22 && j.lastOn === '2026-10-01' && j.last == null && j.every > 30 && j.mine, 'import: saved with phone, email, birthday, notes and history');
        check(await n.evaluate(() => (window.__FAKE.batches || []).includes(4)), 'import: saved in one go, not one at a time'); }
      await n.click('main .li.client:has-text("Jamie Rivera")'); check(/22 \w+ before SolePro/.test(await n.textContent('main .cl-hero')), 'import: the visits before SolePro show on the client page'); await n.click('main [data-act=cl-back]');
      await n.click('.toast .undo'); await n.waitForTimeout(400);
      check((await rowsOf()).length === 0 && /No \w+ yet/.test(await n.textContent('main')), 'import: Undo takes them all out again');
      await n.click('main .im-empty [data-act=im-open]');
      await n.fill('#im-paste', 'Jamie Rivera, (555) 201-3344\nsam lee sam@example.com 555 777 1212, walk-in\n'); await n.click('.sheet [data-act=im-paste]');
      check(/2 \w+ to bring in/.test(await n.textContent('.sheet .sh-top')), 'import: a typed list is read line by line');
      await n.click('.sheet [data-act=im-go]'); await n.waitForTimeout(400);
      { const s = (await rowsOf()).find(c => c.name === 'Sam Lee') || {}; check(s.email === 'sam@example.com' && s.phone === '(555) 777-1212' && s.note === 'walk-in', 'import: the name, phone, email and note found in a typed line'); }
      const vcf = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Rivera;Jamie;;;\r\nFN:Jamie Rivera\r\nTEL;type=CELL:+1 (555) 201-3344\r\nEND:VCARD\r\n'
        + 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Nguyen;Kim;;;\r\nFN:Kim Nguyen\r\nEMAIL;type=INTERNET:kim@example.com\r\nTEL;type=HOME:555-000-1111\r\nTEL;type=CELL:555-000-2222\r\nBDAY;X-APPLE-OMIT-YEAR=1604:1604-07-04\r\nEND:VCARD\r\n';
      await n.click('main [data-act=im-open]'); await n.setInputFiles('#im-file', {name:'Contacts.vcf', mimeType:'text/vcard', buffer:Buffer.from(vcf)}); await n.waitForSelector('.im-sum');
      { const t = await n.textContent('.sheet'); check(/1 \w+ to bring in/.test(t) && /1\s*already here/.test(t) && /Kim Nguyen/.test(t) && /Already here, left as they are: Jamie Rivera/.test(t), 'import: phone contacts, with anyone already here left out'); }
      await n.click('.sheet [data-act=im-go]'); await n.waitForTimeout(400);
      { const k = (await rowsOf()).find(c => c.name === 'Kim Nguyen') || {}; check(k.phone === '(555) 000-2222' && k.born === '1604-07-04' && (await rowsOf()).length === 3, 'import: the mobile number and a birthday with no year'); }
      await n.click('main .li.client:has-text("Kim Nguyen")'); check(/July 4/.test(await n.textContent('main')) && !/1604/.test(await n.textContent('main')), 'import: the birthday shows without a made-up year');
    }
    await n.close(); }
  console.log('ok website');
}
// the family's days and holidays show on the schedule
{
  await p.click('.tab[data-v=schedule]'); await p.click('[data-act=sview][data-v=month]');
  let found = false;
  for (let i = 0; i < 12 && !found; i++) { if (await p.locator('.mo-c.fam').count() && await p.locator('.mo-c.holi').count()) found = true; else await p.click('[data-act=snav][data-v="1"]'); }
  check(found && /No school · Rylee/.test(await p.textContent('.mo-key')) && /Holiday/.test(await p.textContent('.mo-key')), 'family: no-school days and holidays marked on the month');
  await p.click('.mo-c.fam >> nth=0');
  check(/No school · Rylee · /.test(await p.textContent('.day-tags')), 'family: the day says why');
  await p.click('[data-act=sview][data-v=day]'); await p.click('.tab[data-v=today]');
  console.log('ok family days and holidays');
}
// Kelli's app is only her business: no switcher, no sample businesses
check(await p.locator('[data-act=trade]').count() === 0, 'private: no business switcher or sample businesses');
await tour(p, 'private', ['massage']);

// public demo: welcome first, no private business anywhere
p = await open('dist/demo.html');
check(await p.locator('[data-act=welcome-look]').count() === 1, 'demo shows the welcome');
await p.click('[data-act=welcome-look]');
check((await p.textContent('.biz-name')) === 'Tidewater Massage', 'demo opens on the sample massage business');
await tour(p, 'demo');

// time off: a vacation over days with clients booked, a weekly lunch, and removing a whole series
{
  await p.click('[data-act=trade]'); await p.click('[data-act=pick][data-v=massage]');
  await p.click('.tab[data-v=schedule]'); await p.click('[data-act=blockt]');
  await p.click('[data-act=b-l][data-v=Vacation]');
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`, a = new Date(), b = new Date();
  a.setDate(a.getDate() + 1); b.setDate(b.getDate() + 10);
  await p.fill('#b-from', iso(a)); await p.fill('#b-to', iso(b)); await p.fill('#b-name', 'Beach week');
  check(/working days? off/.test(await p.textContent('.sheet')) && /booked then/.test(await p.textContent('.sheet')), 'time off: a vacation counts working days and shows who is booked then');
  const go = await p.textContent('#book-go'); check(/Take \d+ days off/.test(go), 'time off: the button says how many days');
  await p.click('#book-go'); await p.waitForTimeout(150);
  check(/Beach week: \d+ days off/.test(await p.textContent('.toast')), 'time off: vacation saved');
  await goDay(p, 1);
  check(/All day/.test(await p.textContent('main')) && /Beach week/.test(await p.textContent('main')), 'time off: the day shows the vacation all day');
  await p.click('[data-act=block] >> nth=0');
  check(/Remove all \d+/.test(await p.textContent('.sheet')), 'time off: a vacation can be removed in one go');
  await p.click('[data-act=unblock-grp]');
  check(await p.locator('[data-act=block]').count() === 0 || !/Beach week/.test(await p.textContent('main')), 'time off: removing the vacation frees the days');
  await p.click('[data-act=blockt]'); await p.click('[data-act=b-l][data-v=Lunch]');
  for (let i = 0; i < 5 && !(await p.locator('[data-act=b-t]').count()); i++) await p.click(`[data-act=b-d] >> nth=${i + 1}`);
  await p.click('[data-act=b-t] >> nth=0'); await p.click('[data-act=b-rep]');
  check(/^Every \w+day at/.test(await p.textContent('#book-go')), 'time off: a weekly lunch');
  await p.click('#book-go'); await p.waitForTimeout(150);
  check(/Lunch every \w+day at .*: \d+ weeks? blocked/.test(await p.textContent('.toast')), 'time off: weekly lunch saved for the coming weeks');
  check(!(await wide(p)), 'time off: wider than the phone');
  await p.click('.tab[data-v=today]');
  console.log('ok time off');
}

// the schedule by day, week or month; hours for one day; booking on a closed day and outside the usual hours
{
  await p.click('.tab[data-v=schedule]');
  await p.click('[data-act=sview][data-v=week]');
  check(await p.locator('.wk-day').count() === 7 && /This week/.test(await p.textContent('.snav')), 'schedule: the week, Monday to Sunday');
  await p.click('[data-act=snav][data-v="1"]'); check(await p.locator('[data-act=snav][data-v="0"]').count() === 1, 'schedule: next week, with a way back to today');
  await p.click('[data-act=sview][data-v=month]');
  check(await p.locator('.mo-c').count() >= 28, 'schedule: the month as a calendar');
  await p.click('[data-act=snav][data-v="0"]'); await p.click('.mo-c.now');
  check(await p.locator('[data-act=sview][data-v=day][aria-pressed=true]').count() === 1 && /Today/.test(await p.textContent('.snav')), 'schedule: a day in the month opens that day');
  // a closed day: open it with its own hours
  await p.click('.day.off >> nth=0'); await p.click('.sec-h [data-act=dayhours]');
  await p.selectOption('#dh-open', '600'); await p.selectOption('#dh-close', '840'); await p.click('.sheet [data-act=dh-save]'); await p.waitForTimeout(100);
  check(/open 10 am to 2 pm/.test(await p.textContent('.toast')) && /10 am–2 pm/.test(await p.textContent('.sec-h')), 'hours: a closed day opened for 10 to 2');
  await p.click('.sec-h [data-act=dayhours]'); await p.click('.sheet [data-act=dh-usual]');
  // booking: a closed day can be opened from the booking sheet, and earlier or later times
  await p.click('[data-act=book]'); await p.click('[data-act=b-c] >> nth=0');
  const closedDay = p.locator('[data-act=b-d]', {hasText:'closed'}).first(); await closedDay.click();
  check(/usually closed/.test(await p.textContent('.sheet')), 'booking: a closed day offers to open');
  await p.click('.sheet [data-act=dh-save]'); await p.waitForTimeout(100);
  check(await p.locator('[data-act=b-t]').count() > 0, 'booking: once opened, the day has times');
  await p.click('[data-act=b-wide]');
  check(/7:00 am/.test(await p.textContent('.sheet')) && /8:00 pm/.test(await p.textContent('.sheet')), 'booking: earlier or later times');
  check(!(await wide(p)), 'schedule: wider than the phone');
  await p.click('.sheet .close'); await p.click('.tab[data-v=today]');
  console.log('ok schedule views and hours');
}

// setup for a business that isn't on the list, then day one
await p.click('[data-act=trade]'); await p.click('[data-act=ob-start]'); await p.click('[data-act=ob-next]');
await p.click('[data-act=ob-trade][data-v=other]'); await p.fill('#ob-what', 'Mobile car detailing');
await p.click('[data-act=ob-who][data-v="1"]'); await p.click('[data-act=ob-unit][data-v="1"]'); await p.click('[data-act=ob-next]');
await p.fill('#ob-biz', 'Shine On Detailing'); await p.fill('#ob-owner', 'Marcus'); await p.click('[data-act=ob-next]');
await p.setInputFiles('#ob-logo', fx + 'test-logo.png'); await p.waitForSelector('.swatches button'); await p.click('[data-act=ob-next]');
await p.setInputFiles('#ob-docs', [fx + 'Intake-Form.pdf', fx + 'sales-2025.csv', fx + 'policy.jpg']); await p.waitForSelector('.docrow'); await p.click('[data-act=ob-next]');
await p.fill('#ob-name-s1', 'Full detail'); await p.fill('#ob-price-s1', '180'); await p.click('[data-act=ob-done]'); await p.waitForTimeout(300);
check((await p.textContent('.biz-name')) === 'Shine On Detailing', 'setup opens the new business');
check(/Nothing booked today/.test(await p.textContent('.lede')), 'day one starts empty');
check((await p.textContent('.getstarted .aside')).startsWith('0 of 6'), 'getting started shows 0 of 6');
await p.click('.gs[data-act=addc]'); await p.fill('#ac-name', 'Jordan Ellis'); await p.fill('#ac-note', 'White Tacoma, ceramic coat in spring'); await p.click('[data-act=ac-save]');
await p.click('.sheet [data-act=book]'); await p.click('[data-act=b-d] >> nth=1'); await p.click('[data-act=b-t] >> nth=0'); await p.click('#book-go');
await p.click('.gs[data-act=connect][data-v=square]'); await p.click('[data-act=connect-go][data-v=square]');
check((await p.textContent('.getstarted .aside')).startsWith('3 of 6'), 'three steps done after customer, booking and Square');
await p.click('.tab[data-v=money]');
check(/Jordan Ellis/.test(await p.textContent('#s-clients')), 'new customer shows in Snapshot');
const findDay = async (re) => { await p.click('.tab[data-v=schedule]'); for (let i = 0; i < 7; i++) { await p.click(`[data-act=day] >> nth=${i}`); if (re.test(await p.textContent('main'))) return true; } return false; };
check(await findDay(/Jordan Ellis/), 'booking shows on the schedule');
check(/Full detail/.test(await p.textContent('main')), 'renamed service is used');
await p.reload({waitUntil:'networkidle'});
check((await p.textContent('.biz-name')) === 'Shine On Detailing', 'business is still open after a reload');
check((await p.textContent('.getstarted .aside')).startsWith('3 of 6'), 'progress is kept after a reload');
check(await findDay(/Jordan Ellis/), 'booking is kept after a reload');
await p.click('.tab[data-v=money]'); await p.click('#s-books [data-act=addpay]'); await p.selectOption('#pf-c', {label:'Jordan Ellis'}); await p.fill('#pf-amt', '180'); await p.click('.sheet [data-act=pf-save]');
await p.reload({waitUntil:'networkidle'}); await p.click('.tab[data-v=money]');
check(/Jordan Ellis/.test(await p.textContent('#s-books')) && /\+\$180/.test(await p.textContent('#s-books')), 'a cash payment is kept after a reload');
await p.click('.tab[data-v=today]'); await p.click('[data-act=fillsample]');
check(!(await p.locator('.getstarted').count()) && /customers today/.test(await p.textContent('.lede')), 'sample data fills the business');
await p.click('[data-act=trade]'); await p.click('[data-act=clearsample]');
check(await p.locator('.getstarted').count() === 1, 'clearing sample data goes back to day one');
for (const t of ['schedule','money','forms','today']) { await p.click(`.tab[data-v=${t}]`); check(!(await wide(p)), 'day one ' + t + ' fits'); }
console.log('ok setup and day one -', await p.textContent('.biz-name'));

// digital forms: a new client fills in the massage intake form on the phone, with a signature
await p.click('[data-act=trade]'); await p.click('[data-act=pick][data-v=massage]');
await p.click('.tab[data-v=forms]'); await p.click('[data-act=fill] >> nth=0');
await p.click('.fill-form [type=submit]');
check(/Please fill in: Full name/.test(await p.textContent('.toast')), 'forms: required fields are checked');
await p.fill('#ff-name', 'Riley Test'); await p.fill('#ff-phone', '(555) 010-2020');
await p.click('label.pick:has(input[name="ff-allergies"][value="yes"])'); await p.fill('#ff-allergies-more', 'Lavender oil');
await p.click('label.pick:has(input[value="Headaches"])'); await p.click('label.pick:has(input[value="Sciatica"])');
await p.click('label.pick:has(input[name="ff-pressure"][value="Firm"])');
await p.check('#ff-consent');
await p.locator('#sig').scrollIntoViewIfNeeded(); const box = await p.locator('#sig').boundingBox();
await p.mouse.move(box.x + 20, box.y + 40); await p.mouse.down(); await p.mouse.move(box.x + 120, box.y + 90, {steps:8}); await p.mouse.move(box.x + 220, box.y + 50, {steps:8}); await p.mouse.up();
await p.click('.fill-form [type=submit]');
check(/Thank you, Riley/.test(await p.textContent('.sheet')), 'forms: thank-you screen after submitting');
await p.click('.sheet [data-act=resp]');
const ans = await p.textContent('.sheet');
check(/Lavender oil/.test(ans) && /Headaches, Sciatica/.test(ans) && await p.locator('.sheet .sig-img').count() === 1, 'forms: answers and signature are saved');
await p.evaluate(() => { window.print = () => { window.__printed = true; }; }); await p.click('.sheet [data-act=resp-print]'); await p.waitForTimeout(150);
check(await p.evaluate(() => window.__printed && /Lavender oil/.test(document.getElementById('print').textContent) && !!document.querySelector('#print img[alt=Signature]')), 'forms: a filled-in form prints with its answers and signature');
await p.click('.sheet .close');
await p.click('[data-act=resps] >> nth=0'); check(/Riley Test/.test(await p.textContent('.sheet')), 'forms: response listed under the form'); await p.click('.sheet .close');
await p.click('.tab[data-v=money]'); await p.click('[data-act=snapgo][data-sec=y-proj] >> nth=0'); await p.click('.tab[data-v=today]');
// papers on file: suggested slots, a photo with an expiry date, the renewal on Today
{ const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const soon = new Date(); soon.setDate(soon.getDate() + 20); const iso = `${soon.getFullYear()}-${String(soon.getMonth()+1).padStart(2,'0')}-${String(soon.getDate()).padStart(2,'0')}`;
  await p.click('.tab[data-v=forms]');
  check(await p.locator('#papers .pp-miss').count() === 4 && /Liability insurance/.test(await p.textContent('#papers')), 'papers: suggested slots for the trade');
  await p.click('#papers .pp-miss:has-text("Liability insurance")');
  await p.setInputFiles('#pp-file', {name:'insurance.png', mimeType:'image/png', buffer:png}); await p.fill('#pp-exp', iso);
  await p.click('.sheet [data-act=pp-save]'); await p.waitForTimeout(300);
  check(await p.locator('#papers .pp-miss').count() === 3 && /Renew by/.test(await p.textContent('#papers')), 'papers: added with its expiry date');
  check(!(await wide(p)), 'papers: fits the phone');
  await p.click('#papers [data-act=pp-open]'); await p.waitForTimeout(200);
  check(/^blob:/.test(await p.getAttribute('#pp-img', 'src') || ''), 'papers: the photo opens'); await p.click('.sheet .close');
  await p.click('.tab[data-v=today]'); check(/Liability insurance is due for renewal/.test(await p.textContent('main')), 'papers: renewal on Today a month ahead'); }
// undo: cancel a visit, then put it back from the toast
{ await p.click('.tab[data-v=today]'); const L = () => p.locator('section:has(h2:has-text("Today’s")) [data-act=appt]'), n0 = await L().count();
  await L().nth(n0 - 1).click(); await p.click('.sheet [data-act=cancel]'); await p.click('.sheet [data-act=cancel-yes]');
  const n1 = await L().count(), hasUndo = await p.locator('.toast [data-act=undo]').count();
  if (hasUndo) await p.click('.toast [data-act=undo]');
  check(n1 === n0 - 1 && hasUndo === 1 && await L().count() === n0 && /Undone/.test(await p.textContent('.toast')), 'undo: a canceled visit comes back'); }
console.log('ok digital forms');

// an iPad held upright gets the big-screen layout with a slim rail of tabs; a phone turned sideways keeps the phone's
{ const html = '<!doctype html><meta charset="utf-8"><meta name=viewport content="width=device-width,initial-scale=1">' + fs.readFileSync(root + 'dist/demo.html', 'utf8');
  for (const [w, h, big] of [[820, 1180, true], [744, 1133, true], [844, 390, false]]) {
    const c = await (await b.newContext({viewport:{width:w, height:h}})).newPage(); c.on('pageerror', e => errs.push(`${w}x${h}: ` + e.message));
    await c.route('http://sole.test/', r => r.fulfill({contentType:'text/html; charset=utf-8', body:html})); await c.goto('http://sole.test/', {waitUntil:'networkidle'});
    if (await c.locator('[data-act=welcome-look]').count()) await c.click('[data-act=welcome-look]');
    const t = await c.locator('.tabbar').boundingBox();
    check(big ? t.x === 0 && t.width < 120 && t.height >= h - 2 : t.y > h - 120, `${w}x${h}: ${big ? 'a rail of tabs down the side' : 'the phone layout with tabs at the bottom'}`);
    for (const tab of ['today', 'schedule', 'money', 'clients', 'forms']) { await c.click(`.tab[data-v=${tab}]`); await c.waitForTimeout(80);
      check(await c.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${w}x${h}: ${tab} fits`); }
    if (big) { await c.click('.tab[data-v=schedule]'); check(await c.locator('.wg .wg-day').count() === 7, `${w}x${h}: the week as a calendar`); }
    await c.close(); }
  console.log('ok iPad'); }

// tomorrow's confirmation text: she reads and changes the wording; the Text button then uses hers, and nothing sends by itself
{ const html = '<!doctype html><meta charset="utf-8"><meta name=viewport content="width=device-width,initial-scale=1">' + fs.readFileSync(root + 'dist/demo.html', 'utf8');
  const c = await (await b.newContext({viewport:{width:390, height:844}})).newPage(); c.on('pageerror', e => errs.push('confirm wording: ' + e.message));
  await c.route('http://sole.test/', r => r.fulfill({contentType:'text/html; charset=utf-8', body:html})); await c.goto('http://sole.test/', {waitUntil:'networkidle'});
  if (await c.locator('[data-act=welcome-look]').count()) await c.click('[data-act=welcome-look]');
  if (await c.locator('[data-act=td-all]').count() && /more/.test(await c.textContent('[data-act=td-all]'))) await c.click('[data-act=td-all]');
  await c.click('[data-act=td-open][data-v=rm]'); await c.click('[data-act=rm-edit]');
  check(/Just confirming your/.test(await c.inputValue('#rm-tpl')) && !/\[name\]/.test(await c.textContent('#rm-prev')), 'confirm wording: she sees the wording and how it reads for a real client');
  await c.fill('#rm-tpl', 'Hello [name], see you [when]. Test wording from [me]');
  check(/^Hello \w+, see you tomorrow at .+ Test wording from Lena$/.test(await c.textContent('#rm-prev')), 'confirm wording: the preview follows what she types');
  check(!(await wide(c)), 'confirm wording: fits the phone');
  await c.click('[data-act=rm-save]');
  check(/Test%20wording%20from/.test(await c.getAttribute('[data-act=rm-sent] >> nth=0', 'href')), 'confirm wording: the Text button uses her wording');
  await c.click('[data-act=rm-edit]'); await c.click('[data-act=rm-reset]');
  check(/Just confirming your/.test(await c.inputValue('#rm-tpl')), 'confirm wording: back to the original');
  await c.close(); console.log('ok confirmation wording'); }

// on a computer: the sidebar, Today in two columns, the week as a calendar, clients beside their page, sheets from the right,
// and back to the phone layout when the window narrows
for (const [file, init, name] of [['dist/demo.html', null, null], ['index.html', `window.__SOLE_SQUARE = ${sq};`, 'Heart and Soul Massage']]) {
  const html = '<!doctype html><meta charset="utf-8"><meta name=viewport content="width=device-width,initial-scale=1">' + fs.readFileSync(root + file, 'utf8');
  const d = await (await b.newContext({viewport:{width:1280, height:800}})).newPage(), L = file + ' (computer)';
  d.on('pageerror', e => errs.push(L + ': ' + e.message));
  if (init) await d.addInitScript(init);
  await d.route('http://sole.test/', r => r.fulfill({contentType:'text/html; charset=utf-8', body:html}));
  await d.goto('http://sole.test/', {waitUntil:'networkidle'});
  if (await d.locator('[data-act=welcome-look]').count()) await d.click('[data-act=welcome-look]');
  const box = s => d.locator(s).first().boundingBox(), fits = () => d.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  { const t = await box('.tabbar'); check(t && t.x === 0 && t.height >= 790 && t.width < 300, `${L}: the tabs are a sidebar`); }
  check(await d.locator('.side-biz .biz-name').count() === 1 && await d.locator('.hdr .biz').count() === 0, `${L}: the business's name heads the sidebar`);
  if (name) check((await d.textContent('.side-biz .biz-name')) === name, `${L}: ${name} in the sidebar`);
  { const a = await box('.dash-a'), c = await box('.dash-b'); check(a && c && c.x > a.x + a.width - 1, `${L}: Today in two columns`); }
  check(await fits(), `${L}: Today fits the window`);
  await d.click('.tab[data-v=schedule]');
  check(await d.locator('.wg .wg-day').count() === 7 && await d.locator('.wg-body .wg-col').count() === 7, `${L}: the schedule opens on the week as a calendar`);
  if (!name) { check(await d.locator('.wg-ev[data-act=appt]').count() > 5, `${L}: visits on the calendar`);
    await d.click('.wg-ev[data-act=appt] >> nth=0'); await d.waitForTimeout(400); const s = await box('.sheet');
    check(s && Math.round(s.x + s.width) === 1280 && s.width <= 545, `${L}: a visit opens in a panel on the right`); await d.click('.sheet .close');
    const g = d.locator('.wg-gap').first(); await g.hover({position:{x:20, y:4}}); await g.click({position:{x:20, y:4}});
    check(await d.locator('.sheet #book-go').count() === 1, `${L}: clicking open time starts a booking`); await d.click('.sheet .close'); }
  const t0 = await d.textContent('.snav b'); await d.keyboard.press('ArrowRight');
  check((await d.textContent('.snav b')) !== t0, `${L}: the arrow keys page the week`); await d.keyboard.press('t');
  await d.click('[data-act=sview][data-v=month]'); check(await d.locator('.mo-c .mo-list').count() > 27, `${L}: the month shows who's coming`);
  await d.click('[data-act=sview][data-v=week]'); check(await fits(), `${L}: the week fits the window`);
  await d.click('.tab[data-v=clients]');
  check(await d.locator('.split-l #clt-list .li.client').count() > 0 && await d.locator('.split-r .split-hint').count() === 1, `${L}: clients list beside a place for one person`);
  await d.click('#clt-list .li.client >> nth=1');
  check(await d.locator('.split-r .cl-hero').count() === 1 && await d.locator('#clt-list .li.client[aria-current=true]').count() === 1, `${L}: a client opens beside the list`);
  check(await fits(), `${L}: the clients page fits the window`);
  await d.click('.tab[data-v=money]'); check(await d.locator('.cols2 .col').count() === 2 && await fits(), `${L}: Snapshot in two columns`);
  await d.click('.tab[data-v=forms]'); check(await fits(), `${L}: Forms fit the window`);
  await d.setViewportSize({width:390, height:844}); await d.waitForTimeout(200);
  { const t = await box('.tabbar'); check(t && t.y > 700 && await d.locator('.side-biz').count() === 0 && await d.locator('.hdr .biz').count() === 1, `${L}: back to the phone layout when narrow`); }
  console.log('ok', L);
}

await b.close();
if (errs.length) { console.error('FAILED\n - ' + errs.join('\n - ')); process.exit(1); }
console.log('all passed');
