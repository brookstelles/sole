#!/usr/bin/env node
// Checks SolePro's store listings in app/store/ (the layout fastlane's deliver and supply upload): every listing has
// each required text within Apple's and Google's limits, no leftover placeholders, the terms and privacy links, and
// nothing about buying (the apps sell nothing, so neither may their listings: no prices, trials or plans; app/README.md).
//   node scripts/check_store.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STORE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'store');
export const LIMITS = {
  ios: { 'name.txt': 30, 'subtitle.txt': 30, 'description.txt': 4000, 'keywords.txt': 100, 'promotional_text.txt': 170, 'release_notes.txt': 4000, 'support_url.txt': 255, 'marketing_url.txt': 255, 'privacy_url.txt': 255 },
  android: { 'title.txt': 30, 'short_description.txt': 80, 'full_description.txt': 4000, 'changelogs/1.txt': 500 },
};
const DESC = { ios: 'description.txt', android: 'full_description.txt' };
const SALES = /\$\s?\d|\bprice[sd]?\b.*\b(plan|month|year)|free trial|\btrial\b|subscri|per month|a month|a year|\bplans?\b|cheaper|discount/i;

export function check() {
  const errs = [], locales = {};
  for (const [store, limits] of Object.entries(LIMITS)) {
    const dir = path.join(STORE, store);
    locales[store] = fs.readdirSync(dir).filter(n => fs.statSync(path.join(dir, n)).isDirectory() && /^[a-z]{2}(-[A-Z0-9]+)?$/.test(n));
    if (!locales[store].length) errs.push(`${store}: no listing`);
    for (const loc of locales[store]) {
      for (const [f, max] of Object.entries(limits)) {
        const p = path.join(dir, loc, f);
        if (!fs.existsSync(p)) { errs.push(`${store}/${loc}/${f} is missing`); continue; }
        const s = fs.readFileSync(p, 'utf8').replace(/\n+$/, '');
        if (!s.trim()) errs.push(`${store}/${loc}/${f} is empty`);
        if ([...s].length > max) errs.push(`${store}/${loc}/${f}: ${[...s].length} characters, the limit is ${max}`);
        if (/\[|\]|\bTODO\b|\{\w+\}|\bdraft\b/i.test(s)) errs.push(`${store}/${loc}/${f} has a placeholder`);
        if (SALES.test(s)) errs.push(`${store}/${loc}/${f} talks about buying: ${s.match(SALES)[0]}`);
        if (/Sole Pro|Soleil/.test(s)) errs.push(`${store}/${loc}/${f}: the name is SolePro`);
        if (/Kelli|Heart and Soul|Telles/i.test(s)) errs.push(`${store}/${loc}/${f}: a private detail`);
      }
      const d = fs.readFileSync(path.join(dir, loc, DESC[store]), 'utf8');
      for (const must of ['https://getsolepro.com/terms', 'https://getsolepro.com/privacy', 'Sellet Solutions LLC'])
        if (!d.includes(must)) errs.push(`${store}/${loc}/${DESC[store]} must name ${must}`);
      if (store === 'ios') {
        for (const f of ['support_url.txt', 'marketing_url.txt', 'privacy_url.txt']) {
          const u = fs.readFileSync(path.join(dir, loc, f), 'utf8').trim();
          if (!/^https:\/\/getsolepro\.com\//.test(u)) errs.push(`ios/${loc}/${f}: not on getsolepro.com`);
        }
        const k = fs.readFileSync(path.join(dir, loc, 'keywords.txt'), 'utf8').trim();
        if (/,\s/.test(k)) errs.push(`ios/${loc}/keywords.txt: no spaces after commas (they count)`);
      }
    }
  }
  for (const f of ['copyright.txt', 'primary_category.txt']) if (!fs.existsSync(path.join(STORE, 'ios', f))) errs.push(`ios/${f} is missing`);
  return { errs, locales };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { errs, locales } = check();
  console.log(`store: App Store ${locales.ios.join(', ')}; Google Play ${locales.android.join(', ')}`);
  if (errs.length) { console.error(errs.map(e => '  ✗ ' + e).join('\n')); process.exit(1); }
}
