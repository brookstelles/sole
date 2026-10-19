// Drives every demo business through every tab, then runs setup for a business that isn't on the list.
// Run: node tests/run.mjs   (needs Playwright; set CHROMIUM to a Chromium binary if it isn't found)
import { chromium } from 'playwright';
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname;
const html = '<!doctype html><meta charset="utf-8"><meta name=viewport content="width=device-width,initial-scale=1">' + fs.readFileSync(root + 'index.html', 'utf8');
const b = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {});
const p = await (await b.newContext({viewport:{width:390, height:844}})).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.route('http://sole.test/', r => r.fulfill({contentType:'text/html; charset=utf-8', body:html}));
await p.goto('http://sole.test/', {waitUntil:'networkidle'});
const wide = () => p.evaluate(() => document.documentElement.scrollWidth > 390);
for (const k of ['massage','hair','barber','tattoo','landscape','tennis']) {
  await p.click('[data-act=trade]'); await p.click(`[data-act=pick][data-v=${k}]`);
  await p.click('[data-act=ask][data-q*="spent"]');
  await p.click('.tab[data-v=schedule]'); await p.click('[data-act=day] >> nth=2');
  if (await p.locator('[data-act=gap]').count()) { await p.click('[data-act=gap] >> nth=0'); await p.click('[data-act=b-c] >> nth=0');
    if (await p.locator('[data-act=b-t]').count()) { await p.click('[data-act=b-t] >> nth=0'); await p.click('#book-go'); } else await p.click('.sheet .close'); }
  await p.click('.tab[data-v=money]'); await p.click('.topc >> nth=0'); await p.click('.sheet .close');
  await p.click('[data-act=snapgo][data-sec=y-costs] >> nth=0');
  await p.click('.tab[data-v=forms]'); await p.click('.tab[data-v=today]');
  if (await wide()) errs.push(k + ': page wider than the phone');
  console.log('ok', k, '-', await p.textContent('.biz-name'));
}
const fx = root + 'tests/fixtures/';
await p.click('[data-act=trade]'); await p.click('[data-act=ob-start]'); await p.click('[data-act=ob-next]');
await p.click('[data-act=ob-trade][data-v=other]'); await p.fill('#ob-what', 'Mobile car detailing');
await p.click('[data-act=ob-who][data-v="1"]'); await p.click('[data-act=ob-unit][data-v="1"]'); await p.click('[data-act=ob-next]');
await p.fill('#ob-biz', 'Shine On Detailing'); await p.fill('#ob-owner', 'Marcus'); await p.click('[data-act=ob-next]');
await p.setInputFiles('#ob-logo', fx + 'test-logo.png'); await p.waitForSelector('.swatches button'); await p.click('[data-act=ob-next]');
await p.setInputFiles('#ob-docs', [fx + 'Intake-Form.pdf', fx + 'sales-2025.csv', fx + 'policy.jpg']); await p.waitForSelector('.docrow'); await p.click('[data-act=ob-next]');
await p.fill('#ob-name-s1', 'Full detail'); await p.click('[data-act=ob-done]'); await p.waitForTimeout(300);
const lede = await p.textContent('.lede');
if (!/customers today/.test(lede)) errs.push('setup: words not applied: ' + lede);
console.log('ok setup -', await p.textContent('.biz-name'), '-', lede);
await b.close();
if (errs.length) { console.error('FAILED', errs); process.exit(1); }
console.log('all passed');
