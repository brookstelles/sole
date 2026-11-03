#!/usr/bin/env node
// The app icons and launch screens for the iPhone and Android apps (ios/, android/), drawn in Chromium from SolePro's
// mark (site/favicon.svg, "sunrise B": the sun coming up over the horizon, gold on the indigo #3A3576 tile), so every
// size matches. The launch screen is the night sky the opening starts on (#14112E) with the tile and the wordmark,
// Sole + gold Pro in Jost (loaded from Google Fonts while drawing).
//   node scripts/build_native_icons.mjs      rerun after the mark changes, then npx cap sync
// CHROMIUM picks the browser (default: Playwright's own).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require('playwright'); } catch (_) { return require('/opt/node-tools/node_modules/playwright'); } })();
const INDIGO = '#3A3576', NIGHT = '#14112E', GOLD = '#F2B544';

// the mark's drawing (site/favicon.svg, without its rounded tile), in a 100 box; `zoom` shrinks it toward the middle
const fav = fs.readFileSync(path.join(APP, '..', 'site', 'favicon.svg'), 'utf8');
const inner = fav.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<rect width="100" height="100" rx="23" fill="#3A3576"\/>/, '');
if (inner === fav || !inner.includes(GOLD)) throw new Error('site/favicon.svg is not the mark this expects');
const mark = (zoom = 1, id = 'm') => `<g transform="translate(50 50) scale(${zoom}) translate(-50 -50)">${inner.replaceAll('sp-h', id)}</g>`;
const icon = ({ shape = 'square', zoom = 1, bg = true }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  ${!bg ? '' : shape === 'circle' ? `<circle cx="50" cy="50" r="50" fill="${INDIGO}"/>` : shape === 'rounded' ? `<rect width="100" height="100" rx="22" fill="${INDIGO}"/>` : `<rect width="100" height="100" fill="${INDIGO}"/>`}
  ${mark(zoom)}</svg>`;
// a launch screen: the night sky, the tile and the wordmark
const splash = (w, h) => { const u = Math.min(w, h) / 10, t = u * 2.2;
  return `<div style="width:${w}px;height:${h}px;background:${NIGHT};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${u * 0.45}px">
    <svg viewBox="0 0 100 100" width="${t}" height="${t}"><rect width="100" height="100" rx="23" fill="${INDIGO}"/>${mark(1, 's')}</svg>
    <b style="font:700 ${u * 0.95}px/1 Jost,sans-serif;letter-spacing:-.01em;color:#fff">Sole<span style="color:${GOLD}">Pro</span></b></div>`; };

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@700&display=block">';
async function draw(file, w, h, body, transparent = false) {
  await page.setViewportSize({ width: Math.round(w), height: Math.round(h) });
  await page.setContent(`<!doctype html>${fonts}<style>html,body{margin:0;background:transparent}svg{display:block}</style>${body}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.dirname(path.join(APP, file)), { recursive: true });
  await page.screenshot({ path: path.join(APP, file), omitBackground: transparent });
}

// iPhone and iPad: one 1024 icon, full bleed (iOS rounds the corners), no transparency
await draw('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, 1024, icon({ shape: 'square' }));
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
  await draw(`ios/App/App/Assets.xcassets/Splash.imageset/${f}`, 2732, 2732, splash(2732, 2732));
// Android: legacy and round icons, and the adaptive icon's foreground (the mark inside the middle, the safe zone)
const res = path.join(APP, 'android/app/src/main/res');
for (const [d, n] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  await draw(`android/app/src/main/res/mipmap-${d}/ic_launcher.png`, n, n, icon({ shape: 'rounded', zoom: 0.9 }), true);
  await draw(`android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`, n, n, icon({ shape: 'circle', zoom: 0.85 }), true);
  await draw(`android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`, n * 2.25, n * 2.25, icon({ bg: false, zoom: 0.72 }), true);
}
const SIZES = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const dir of fs.readdirSync(res).filter(d => d.startsWith('drawable'))) {
  const f = path.join(res, dir, 'splash.png');
  if (!fs.existsSync(f)) continue;
  const s = SIZES[dir.split('-').pop()], [w, h] = !s ? [480, 320] : dir.includes('land') ? [s[1], s[0]] : s;
  await draw(path.relative(APP, f), w, h, splash(w, h));
}
fs.writeFileSync(path.join(res, 'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${INDIGO}</color>\n</resources>\n`);
await browser.close();
console.log('native icons and launch screens drawn');
