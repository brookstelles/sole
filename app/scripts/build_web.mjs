#!/usr/bin/env node
// The page the iPhone and Android apps carry (app/www, made fresh each time, never committed): the website's own files
// from site/ (build_demo.py writes site/index.html with the made-up business, so nothing private), plus:
//   native.js            app/web/native.js bundled with its Capacitor plugins (back button, links, share sheet)
//   vendor/supabase.min.js  the same supabase-js the website loads from jsDelivr (2.115.0), so the apps run nothing
//                        from another site
// and without the service worker (sw.js: the app already has its files, and index.html doesn't register it in the
// apps) and the email header picture. Run by `npm run build` (after build_demo.py); `npm run build:native` then copies
// it into ios/ and android/ (cap sync).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), SITE = path.join(APP, '..', 'site'), OUT = path.join(APP, 'www');
const LEAVE = new Set(['sw.js', 'email-header.png']);

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SITE, OUT, { recursive: true, filter: src => !LEAVE.has(path.basename(src)) });

await build({ entryPoints: [path.join(APP, 'web', 'native.js')], bundle: true, format: 'iife', target: ['safari16', 'chrome110'], minify: true, legalComments: 'none', outfile: path.join(OUT, 'native.js') });

const sb = path.join(APP, 'node_modules', '@supabase', 'supabase-js'), sbv = JSON.parse(fs.readFileSync(path.join(sb, 'package.json'), 'utf8')).version;
const page = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const want = (page.match(/@supabase\/supabase-js@([\d.]+)\//) || [])[1];
if (want !== sbv) throw new Error(`the website loads supabase-js ${want}, the apps would carry ${sbv}: change app/package.json to ${want}`);
fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(sb, 'dist', 'umd', 'supabase.js'), path.join(OUT, 'vendor', 'supabase.min.js'));

// native.js runs first, before the page's own script
const at = page.indexOf('<meta name="viewport"');
if (at < 0 || !page.includes('const NATIVE =')) throw new Error('site/index.html is not the page this expects: run python3 build_demo.py');
const end = page.indexOf('>', at) + 1;
fs.writeFileSync(path.join(OUT, 'index.html'), page.slice(0, end) + '\n<script src="native.js"></script>' + page.slice(end));
const size = f => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + ' KB';
console.log(`app/www: index.html ${size('index.html')}, native.js ${size('native.js')}, supabase-js ${sbv} ${size('vendor/supabase.min.js')}`);
