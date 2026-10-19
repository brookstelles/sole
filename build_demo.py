"""Builds the public demo: index.html with the private massage business swapped for demo/massage.js.
Usage: python3 build_demo.py   ->  dist/demo.html. Fails if any private detail is left in the output."""
import sys, pathlib
root = pathlib.Path(__file__).parent
src = (root / 'index.html').read_text()
a, b = src.index('/* PRIVATE:START */'), src.index('/* PRIVATE:END */') + len('/* PRIVATE:END */')
out = src[:a] + (root / 'demo/massage.js').read_text().strip() + src[b:]
out = out.replace("const EDITION = 'private';", "const EDITION = 'demo';").replace('<title>Sole</title>', '<title>Sole Demo</title>', 1)
PRIVATE = ['Kelli', 'Telles', 'Heart and Soul', 'drive.google', 'docs.google', '(561)', '(352)', 'Juno', 'Breakdown', 'CE Broker', '32964', '24951', 'P&L sheets']
left = [w for w in PRIVATE if w.lower() in out.lower()]
if left: sys.exit('private details left in the demo: ' + ', '.join(left))
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist/demo.html').write_text(out)
print('dist/demo.html', len(out), 'bytes')
