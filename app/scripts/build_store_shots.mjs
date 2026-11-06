#!/usr/bin/env node
// The App Store and Google Play screenshots (app/store/screenshots/<device>/), taken from the public demo edition
// (dist/demo.html: Tidewater Massage, a made-up business; never Heart and Soul or anyone's real book) and framed with a
// caption on SolePro's night sky: iPhone 6.9" (1290x2796), iPad 13" (2064x2752, the big-screen layout), Android phone
// (1080x1920), and Google Play's feature graphic (1024x500). Captions are in store/screenshots/captions.json.
//   cd .. && python3 build_demo.py && cd app && node scripts/build_store_shots.mjs
// CHROMIUM picks the browser (default: Playwright's own); STORE_DEVICES=ipad,android limits the run to those devices.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { framePage } from './store_frame.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), ROOT = path.join(APP, '..');
const OUT = path.join(APP, 'store', 'screenshots');
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require('playwright'); } catch (_) { return require('/opt/node-tools/node_modules/playwright'); } })();
const NIGHT = '#14112E', INDIGO = '#3A3576', GOLD = '#F2B544';
const BASE = 'http://solepro.test/';

// the screens, in store order (captions.json has one caption for each, same order)
export const SHOTS = [
  { id: '1_today', go: async p => { await tab(p, 'today'); } },
  { id: '2_schedule', go: async p => { await tab(p, 'schedule'); if (await p.locator('[data-act=sview][data-v=week]').count() && p.viewportSize().width > 700) await p.click('[data-act=sview][data-v=week]'); } },
  { id: '3_client', go: async p => { await tab(p, 'clients'); await p.click('#clt-list .li.client >> nth=2'); await p.waitForTimeout(300); } },
  { id: '4_notes', go: async p => { await tab(p, 'today'); const run = p.locator('[data-act=vn-run]').first();
    if (await run.count()) await run.click(); else { await tab(p, 'clients'); await p.click('#clt-list .li.client >> nth=2'); await p.locator('main [data-act=vnotes]').first().click(); } } },
  { id: '5_forms', go: async p => { await tab(p, 'forms'); const f = p.locator('[data-act=fill]').first(); if (await f.count()) await f.click(); } },
  { id: '6_snapshot', go: async p => { await tab(p, 'money'); } },
];
async function tab(p, v) { if (await p.locator('.sheet').count()) await p.evaluate(() => { document.getElementById('layer').innerHTML = ''; }); await p.click(`.tab[data-v=${v}]`); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(250); }

// raw: the screen the app is shown on (CSS px); out: the store's size (CSS px x dpr)
const DEVICES = {
  iphone: { raw: { w: 430, h: 932 }, out: { w: 430, h: 932, dpr: 3 } },
  ipad: { raw: { w: 1032, h: 1376 }, out: { w: 1032, h: 1376, dpr: 2 } },
  android: { raw: { w: 412, h: 869 }, out: { w: 360, h: 640, dpr: 3 } },
};
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@500;600;700&display=block">';
// The look (store_frame.mjs): SolePro's indigo night and sunrise gold, Jost, a rising-sun motif.
const THEME = {
  name: 'SolePro', nameHtml: 'Sole<span>Pro</span>', head: fonts, display: 'Jost,sans-serif', displayWeight: 700, body: 'Jost,sans-serif',
  bg: ['#332E78', NIGHT], glow: 'rgba(242,181,68,.30)', accent: GOLD, ink: '#FFFFFF', motif: 'sun',
  icon: fs.readFileSync(path.join(APP, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png')),
};
// The demo's own screens are kept in store/screenshots/.raw (not committed); STORE_REFRAME=1 frames them again
// without opening the demo (to change only the look).
const RAW = path.join(OUT, '.raw');

const fav = fs.readFileSync(path.join(ROOT, 'site', 'favicon.svg'), 'utf8');
const BADGE = fav.replace('<svg ', '<svg aria-hidden="true" ');
function feature(tagline) {
  return `<!doctype html><html><head>${fonts}<style>
    html,body{margin:0;width:1024px;height:500px;overflow:hidden;background:radial-gradient(circle at 25% 45%,${INDIGO} 0,${NIGHT} 62%)}
    .m{position:absolute;left:120px;top:150px;width:200px;height:200px}.m svg{width:100%;height:100%}
    h1{position:absolute;left:370px;top:150px;margin:0;font:700 118px/1 Jost,sans-serif;color:#fff;letter-spacing:-.01em}h1 span{color:${GOLD}}
    p{position:absolute;left:374px;top:292px;margin:0;font:500 32px/1.25 Jost,sans-serif;color:rgba(255,255,255,.85);width:600px}
  </style></head><body><div class="m">${BADGE}</div><h1>Sole<span>Pro</span></h1><p>${tagline}</p></body></html>`;
}

async function main() {
  const demo = path.join(ROOT, 'dist', 'demo.html');
  if (!fs.existsSync(demo)) throw new Error('run python3 build_demo.py first');
  const html = '<!doctype html><meta charset="utf-8"><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">' + fs.readFileSync(demo, 'utf8');
  if (/Heart and Soul|Kelli/i.test(html)) throw new Error('dist/demo.html carries a private detail');
  const caps = JSON.parse(fs.readFileSync(path.join(OUT, 'captions.json'), 'utf8'));
  if (caps.shots.length !== SHOTS.length) throw new Error('captions.json needs one caption per screen');
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const only = (process.env.STORE_DEVICES || '').split(',').filter(Boolean);
  for (const [dev, d] of Object.entries(DEVICES)) {
    if (only.length && !only.includes(dev)) continue;
    const rawDir = path.join(RAW, dev);
    let raws = [];
    if (process.env.STORE_REFRAME && fs.existsSync(path.join(rawDir, `${SHOTS.at(-1).id}.png`))) raws = SHOTS.map(s => fs.readFileSync(path.join(rawDir, `${s.id}.png`)));
    else {
    const ctx = await browser.newContext({ viewport: { width: d.raw.w, height: d.raw.h }, deviceScaleFactor: 3, hasTouch: true, isMobile: dev !== 'ipad', locale: 'en-US', timezoneId: 'America/New_York', colorScheme: 'light' });
    await ctx.addInitScript(() => { window.__SOLE_INTRO_MS = 0; window.__SOLE_WX = null; try { localStorage.setItem('sole-seen', '1'); } catch (_) {} });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.error(`store shots (${dev}): ${e.message}`));
    await page.route(BASE, r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('.biz-name').first().waitFor();
    for (const s of SHOTS) {
      await s.go(page);
      await page.waitForTimeout(600);
      await page.addStyleTag({ content: '*{caret-color:transparent!important}.toast{display:none!important}' });
      raws.push(await page.screenshot());
    }
    await ctx.close();
    fs.mkdirSync(rawDir, { recursive: true });
    SHOTS.forEach((s, i) => fs.writeFileSync(path.join(rawDir, `${s.id}.png`), raws[i]));
    }
    const dir = path.join(OUT, dev);
    fs.mkdirSync(dir, { recursive: true });
    const fp = await browser.newPage({ viewport: { width: d.out.w, height: d.out.h }, deviceScaleFactor: d.out.dpr });
    for (let i = 0; i < SHOTS.length; i++) {
      await fp.setContent(framePage({ img: raws[i], back: raws[i - 1], caption: caps.shots[i], i, d, dev, theme: THEME }), { waitUntil: 'networkidle' });
      await fp.evaluate(() => document.fonts.ready);
      await fp.screenshot({ path: path.join(dir, `${SHOTS[i].id}.png`) });
    }
    await fp.close();
    if (dev === 'android') {
      const gp = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
      await gp.setContent(feature(caps.feature), { waitUntil: 'networkidle' });
      await gp.evaluate(() => document.fonts.ready);
      await gp.screenshot({ path: path.join(dir, 'feature_graphic.png') });
      await gp.close();
    }
    console.log(`store shots: ${dev}: ${SHOTS.length} screens`);
  }
  await browser.close();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(e => { console.error(`store shots: ${e.message}`); process.exit(1); });
}
