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
      if (await p.locator('[data-act=b-t]').count()) { await p.click('[data-act=b-t] >> nth=0'); await p.click('#book-go'); } else await p.click('.sheet .close'); }
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
await p.click('.tab[data-v=schedule]'); await p.click('[data-act=day] >> nth=1');
check(/Jordan Ellis/.test(await p.textContent('main')), 'booking shows on the schedule');
check(/Full detail/.test(await p.textContent('main')), 'renamed service is used');
await p.reload({waitUntil:'networkidle'});
check((await p.textContent('.biz-name')) === 'Shine On Detailing', 'business is still open after a reload');
check((await p.textContent('.getstarted .aside')).startsWith('3 of 6'), 'progress is kept after a reload');
await p.click('.tab[data-v=schedule]'); await p.click('[data-act=day] >> nth=1');
check(/Jordan Ellis/.test(await p.textContent('main')), 'booking is kept after a reload');
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
