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

async function tour(p, label){
  for (const k of ['massage','hair','barber','tattoo','landscape','tennis']) {
    await p.click('[data-act=trade]'); await p.click(`[data-act=pick][data-v=${k}]`);
    await p.click('[data-act=ask][data-q*="spent"]');
    await p.click('.tab[data-v=schedule]'); await p.click('[data-act=day] >> nth=2');
    if (await p.locator('[data-act=gap]').count()) { await p.click('[data-act=gap] >> nth=0'); await p.click('[data-act=b-c] >> nth=0');
      if (await p.locator('[data-act=b-t]').count()) { await p.click('[data-act=b-t] >> nth=0'); await p.click('#book-go'); if (await p.locator('.sheet .close').count()) await p.click('.sheet .close'); } else await p.click('.sheet .close'); }
    await p.click('.tab[data-v=money]'); await p.click('.topc >> nth=0'); await p.click('.sheet .close');
    await p.click('[data-act=snapgo][data-sec=y-costs] >> nth=0');
    await p.click('.tab[data-v=forms]'); await p.click('.tab[data-v=today]');
    check(!(await wide(p)), `${label} ${k}: wider than the phone`);
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
check(/Spent with you/.test(await p.textContent('.sheet')), 'private: a Square customer opens with their spending');
await p.click('.sheet .close');
// combining two cards that belong to one person, then separating them again
const cardCount = async () => { await p.click('[data-act=sqall] >> nth=0'); const n = await p.locator('.sheet [data-act=sqclient]').count(); await p.click('.sheet .close'); return n; };
const openCard = async (i) => { await p.click('[data-act=sqall] >> nth=0'); await p.click(`.sheet [data-act=sqclient] >> nth=${i}`); };
const n0 = await cardCount();
check(/Test Person 1/.test(await (async () => { await p.click('[data-act=sqall] >> nth=0'); const t = await p.textContent('.sheet'); await p.click('.sheet .close'); return t; })()), 'private: saved combined cards show as one person');
let mi = -1;
for (let i = 0; i < Math.min(n0, 6) && mi < 0; i++) { await openCard(i); if (await p.locator('.sheet [data-act=sqmerge]').count()) mi = i; else await p.click('.sheet .close'); }
check(mi >= 0, 'private: a card customer offers "same person"');
await p.click('.sheet [data-act=sqmerge]'); await p.click('.sheet [data-act=sqmerge-go] >> nth=0'); await p.waitForTimeout(150);
check(await cardCount() === n0 - 1, 'private: combining two cards leaves one person');
let si = -1;
for (let i = 0; i < n0 && si < 0; i++) { await openCard(i); if (await p.locator('.sheet [data-act=sqsplit]').count()) si = i; else await p.click('.sheet .close'); }
check(si >= 0, 'private: a combined card offers to separate');
await p.click('.sheet [data-act=sqsplit]'); await p.waitForTimeout(150);
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
  check(/Card customer OMER/.test(await q.textContent('.sheet')), 'live: a new card customer appears');
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
  await q.click('.tab[data-v=schedule]'); await q.click('[data-act=day] >> nth=1');
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
// Kelli's own book: appointments, clients, payments and costs kept in Sole (made-up data, the way the page's database holds it)
{
  const today = new Date(), iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const sole = {appts:[{uid:'aT1', c:'nTEST', s:'sw60', date:iso(today), start:1380, paid:false, tip:0, w:'Kelli'}], blocks:[],
    clients:{nTEST:{name:'Casey Sample', phone:'(555) 010-0000', since:2026, visits:0, last:null, isNew:true, intake:true, pressure:0, focus:'Not known yet', setup:'', note:'', mine:true}}, ledger:[]};
  const base = JSON.parse(sq);
  const q = await open('index.html', `window.__SOLE_SQUARE = ${JSON.stringify({...base, sole})};`);
  check(/Casey Sample/.test(await q.textContent('main')), 'own book: an appointment kept in Sole shows today');
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
  await q.click('.tab[data-v=schedule]'); await q.click('[data-act=day] >> nth=1');
  for (let i = 1; i < 7 && !(await q.locator('[data-act=gap]').count()); i++) await q.click(`[data-act=day] >> nth=${i}`);
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
  const live = {payments:[{id:'LZ', created_at:at.toISOString(), updated_at:at.toISOString(), status:'COMPLETED', customer_id:'TESTCUSTOMER0005', amount_money:{amount:7700}, tip_money:{amount:0}, total_money:{amount:7700}, processing_fee:[]}]};
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
  await r.click('.tab[data-v=schedule]'); await r.click('[data-act=week][data-v="-1"]'); await r.click('[data-act=day] >> nth=6');
  check(!(await r.locator('[data-act=gap]').count()), 'schedule: past days show no openings to book');
  await r.click('[data-act=appt]:has-text("Wren")');
  await r.click('.sheet [data-act=vnotes]');
  await r.click('.sheet [data-act=vn-c][data-v="Neck"]'); await r.click('.sheet [data-act=vn-c][data-v="Deep tissue"]'); await r.click('.sheet [data-act=vn-c][data-v="Firm"]');
  await r.fill('#vn-S', 'Test stiff neck'); await r.fill('#vn-P', 'Test focus on left trap'); await r.click('.sheet [data-act=vn-save]');
  const sh = await r.textContent('.sheet');
  check(/Neck, Deep tissue/.test(sh) || /Neck · Deep tissue/.test(sh), 'visit notes: chips show on the visit');
  check(/Test focus on left trap/.test(sh), 'visit notes: the plan shows on the visit');
  await r.click('.sheet .close');
  await r.click('[data-act=week][data-v="1"]'); await r.click('[data-act=day] >> nth=3'); await r.click('[data-act=appt]:has-text("Wren")');
  check(/From last time/.test(await r.textContent('.sheet')) && /Test focus on left trap/.test(await r.textContent('.sheet')), 'visit notes: the plan shows before the next visit');
  check(await r.evaluate(() => Object.values(SQ.sole.visits).some(v => v.P === 'Test focus on left trap')), 'visit notes: saved to the book');
  check(!(await wide(r)), 'visit notes: wider than the phone');
  await r.close();
  console.log('ok weekly check and visit notes');
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
  console.log('ok website page');
}

// Sole's own website: sign in with a code, the book and Square payments from Supabase (a stand-in client, made-up data)
{
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const now = new Date(), early = new Date(now); early.setHours(0, 5, 0, 0);
  const pay = (id, when, amt, tip, cust) => ({id, created_at:when.toISOString(), updated_at:when.toISOString(), status:'COMPLETED', customer_id:cust, amount_money:{amount:amt}, tip_money:{amount:tip}, total_money:{amount:amt + tip}, processing_fee:[{amount_money:{amount:300}}]});
  const seed = {items:[{business_id:'B1', col:'clients', id:'nC', data:{name:'Cloud Sample', phone:'', since:2026, visits:0, last:null, intake:true, pressure:0, focus:'Not known yet', setup:'', note:'', mine:true}},
      {business_id:'B1', col:'appts', id:'aC', data:{c:'nC', s:'sw60', date:iso(now), start:1410, paid:false, tip:0, w:'Kelli'}}],
    payments:[{business_id:'B1', id:'P1', created_at:'2026-03-02T15:00:00Z', status:'COMPLETED', customer_id:'TESTCUST1', data:pay('P1', new Date('2026-03-02T15:00:00Z'), 11500, 2000, 'TESTCUST1')}],
    customers:[{business_id:'B1', id:'TESTCUST1', name:'Test Card Person'}]};
  const fake = fs.readFileSync(fx + 'fake-supabase.js', 'utf8');
  const q = await open('index.html', `window.__FAKE_DB = ${JSON.stringify(seed)};\n${fake}`);
  check(/Send me a code/.test(await q.textContent('main')), 'website: asks to sign in');
  await q.fill('#si-email', 'test@example.com'); await q.click('#si-form button');
  await q.fill('#si-code', '123456'); await q.click('#si-form button'); await q.waitForSelector('.biz-name');
  check(/Cloud Sample/.test(await q.textContent('main')), 'website: the book loads from the database');
  check(await q.evaluate(() => __FAKE.invoked.length === 1), 'website: asks the server to catch up with Square');
  await q.click('.tab[data-v=money]');
  check(/\$115/.test(await q.textContent('main')) && /Test Card Person/.test(await q.textContent('#s-clients')), 'website: Square payments and card customers come from the tables');
  await q.click('#s-books [data-act=addpay]'); await q.fill('#pf-amt', '60'); await q.click('.sheet [data-act=pf-save]'); await q.waitForTimeout(200);
  check(await q.evaluate(() => __FAKE.T.items.some(r => r.col === 'ledger' && r.data.amount === 60)), 'website: a payment is saved to the database');
  await q.evaluate(p => __FAKE.emit('square_payments', {eventType:'INSERT', new:{data:p}}), pay('P2', early, 9500, 1500, null));
  await q.click('.tab[data-v=today]'); await q.waitForTimeout(100);
  check(/Today so far\s*\$155/.test(await q.textContent('.glance')), 'website: a card payment shows the moment it comes in');
  check(!(await wide(q)), 'website: wider than the phone');
  await q.close();
  console.log('ok website');
}
await tour(p, 'private');

// public demo: welcome first, no private business anywhere
p = await open('dist/demo.html');
check(await p.locator('[data-act=welcome-look]').count() === 1, 'demo shows the welcome');
await p.click('[data-act=welcome-look]');
check((await p.textContent('.biz-name')) === 'Tidewater Massage', 'demo opens on the sample massage business');
await tour(p, 'demo');

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
await p.click('.sheet .close');
await p.click('[data-act=resps] >> nth=0'); check(/Riley Test/.test(await p.textContent('.sheet')), 'forms: response listed under the form'); await p.click('.sheet .close');
await p.click('.tab[data-v=money]'); await p.click('[data-act=snapgo][data-sec=y-proj] >> nth=0'); await p.click('.tab[data-v=today]');
console.log('ok digital forms');

await b.close();
if (errs.length) { console.error('FAILED\n - ' + errs.join('\n - ')); process.exit(1); }
console.log('all passed');
