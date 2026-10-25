// Prints the SQL that puts the private business (the PRIVATE block of index.html) into the database, where only
// its members can read it after signing in. The website itself carries a made-up business in its place.
// Run after changing the PRIVATE block:  node supabase/profile.mjs > /tmp/profile.sql  and apply it to the Sole project.
import fs from 'fs';
const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('/* PRIVATE:START */') + 19, src.indexOf('/* PRIVATE:END */'));
const { massage } = new Function(`return ({${block}})`)();
const { cloud, ...profile } = massage;
const json = JSON.stringify(profile);
// nothing may be lost on the way to JSON (functions, regular expressions, undefined)
const same = (a, b) => typeof a === 'object' && a ? Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => same(a[k], b[k])) : a === b;
if (!same(profile, JSON.parse(json))) { console.error('the profile does not survive JSON'); process.exit(1); }
if (json.includes('$p$')) { console.error('the profile contains the SQL quote marker'); process.exit(1); }
console.log(`update public.businesses set data = $p$${json}$p$::jsonb where name = ${"'" + profile.biz.replace(/'/g, "''") + "'"};`);
