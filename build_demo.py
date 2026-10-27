"""Builds the public demo: index.html with the private massage business swapped for demo/massage.js.
Usage: python3 build_demo.py   ->  dist/demo.html. Fails if any private detail is left in the output."""
import re, sys, pathlib
root = pathlib.Path(__file__).parent
src = (root / 'index.html').read_text()
a, b = src.index('/* PRIVATE:START */'), src.index('/* PRIVATE:END */') + len('/* PRIVATE:END */')
out = src[:a] + (root / 'demo/massage.js').read_text().strip() + src[b:]
out = out.replace("const EDITION = 'private';", "const EDITION = 'demo';").replace('<title>SolePro</title>', '<title>SolePro Demo</title>', 1)
PRIVATE = ['Kelli', 'Telles', 'Heart and Soul', 'drive.google', 'docs.google', '(561)', '(352)', 'Juno', 'Breakdown', 'CE Broker', '32964', '24951', 'P&L sheets']
left = [w for w in PRIVATE if w.lower() in out.lower()]
if left: sys.exit('private details left in the demo: ' + ', '.join(left))
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist/demo.html').write_text(out)
print('dist/demo.html', len(out), 'bytes')
# the website (sole.brookstelles.com, Cloudflare): publish only the app, never the rest of the repository.
# index.html is a page body for claude.ai, which adds the document around it; the website needs its own, or Safari
# reads the text with the wrong encoding (Howâ€™s for How’s) and lays the page out for a desktop.
SITE_HEAD = ('<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n'
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  # solepro.app on its own is for people curious about SolePro: their website is getsolepro.com (Oct 27, 2026); links
  # with anything after the address (texted forms, notifications) still go on to the app below
  '<script>if(/^(www\\.)?solepro\\.app$/.test(location.hostname)&&location.pathname==="/"&&!location.search&&!location.hash)location.replace("https://getsolepro.com")</script>\n'
  '<style id="pre-bg">html{background:#14112E}</style>\n<script>(function(h){if(h>=11&&h<17)document.getElementById("pre-bg").textContent="html{background:#1C5AA6}"})(new Date().getHours())</script>\n<link rel="icon" href="favicon.svg" type="image/svg+xml">\n<link rel="icon" href="apple-touch-icon.png">\n<link rel="apple-touch-icon" href="apple-touch-icon.png">\n<meta name="apple-mobile-web-app-title" content="SolePro">\n<link rel="manifest" href="manifest.json">\n')
# The website is public: it carries the made-up massage business too, plus the Supabase address (public by design).
# The real business comes from the database after its owner signs in (supabase/profile.mjs puts it there).
cloud = re.search(r'^ *cloud:\{.*\},$', src[a:b], re.M)
if not cloud: sys.exit('no cloud line in the PRIVATE block')
demo = (root / 'demo/massage.js').read_text().strip().replace('massage: {', 'massage: {\n' + cloud.group(0), 1)
site = src[:a] + demo + src[b:]
left = [w for w in PRIVATE if w.lower() in site.lower().replace('brookstelles', '')]   # the site's own address
if left: sys.exit('private details left in the website: ' + ', '.join(left))
(root / 'site').mkdir(exist_ok=True)
(root / 'site/index.html').write_text(SITE_HEAD + site)
print('site/index.html', len(SITE_HEAD + site), 'bytes')
