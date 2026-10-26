"""Turns the nightly backup (the backup Edge Function's answer) into files anyone can read on a phone.

  python3 write.py book.json <folder>

For each business, in a folder named after it:
  README.md               when this copy was made and what's in it
  Schedule.md             the last 2 weeks and the next 60 days, with phone numbers
  Clients.csv             everyone, with their notes
  Visits and notes.csv    every visit, newest first, with SOAP notes
  Forms.csv               filled-in forms (answers; signatures are in book.json)
  Money.csv               payments and costs logged in Sole
  Card payments.csv       card payments from Square
  Papers/                 license, insurance, certificates on file
  book.json               everything, exactly as stored (to rebuild from)
"""
import csv, datetime as dt, io, json, os, re, sys
from zoneinfo import ZoneInfo

ET = ZoneInfo('America/New_York')


def val(v):
    if v is None: return ''
    if isinstance(v, bool): return 'yes' if v else 'no'
    if isinstance(v, list): return '; '.join(val(x) for x in v)
    if isinstance(v, dict): return json.dumps(v, ensure_ascii=False)
    return str(v)


def clock(m):
    try: m = int(m)
    except (TypeError, ValueError): return ''
    h, mi = divmod(m, 60)
    return f"{(h - 1) % 12 + 1}:{mi:02d} {'am' if h < 12 else 'pm'}"


def write_csv(path, head, rows):
    b = io.StringIO(); w = csv.writer(b, lineterminator='\n'); w.writerow(head); w.writerows(rows)
    open(path, 'w', encoding='utf-8').write(b.getvalue())


def business(b, out, at):
    p = b.get('profile') or {}
    sv = {k: v.get('name', k) for k, v in (p.get('services') or {}).items()}
    mins = {k: v.get('min', 60) for k, v in (p.get('services') or {}).items()}
    by = {}
    for r in b['items']: by.setdefault(r['col'], []).append(r)
    cl = {r['id']: r['data'] for r in by.get('clients', [])}
    sq = {c['id']: c['name'] for c in b.get('customers', []) if c.get('name')}
    name = lambda k: (cl.get(k) or {}).get('name') or (sq.get(k[3:]) if k and k.startswith('sq:') else None) or k or ''
    phone = lambda k: (cl.get(k) or {}).get('phone') or ''
    os.makedirs(out, exist_ok=True)
    json.dump({**b, 'papers': [{'path': x['path']} for x in b.get('papers', [])]}, open(os.path.join(out, 'book.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)   # the files are in Papers/

    # the schedule: the last 2 weeks and the next 60 days
    today = dt.datetime.fromisoformat(at.replace('Z', '+00:00')).astimezone(ET).date()
    lo, hi = (today - dt.timedelta(days=14)).isoformat(), (today + dt.timedelta(days=60)).isoformat()
    days = {}
    for r in by.get('appts', []):
        a = r['data']; d = a.get('date', '')
        if lo <= d <= hi: days.setdefault(d, []).append((a.get('start') or 0, f"{clock(a.get('start'))} · **{name(a.get('c'))}** · {sv.get(a.get('s'), a.get('s', ''))} ({mins.get(a.get('s'), '')} min){' · ' + phone(a.get('c')) if phone(a.get('c')) else ''}{' · paid' if a.get('paid') else ''}"))
    for r in by.get('blocks', []):
        a = r['data']; d = a.get('date', '')
        if lo <= d <= hi: days.setdefault(d, []).append((a.get('start') or 0, f"{clock(a.get('start'))} · _{a.get('label') or 'Time off'}_ ({a.get('min', '')} min)"))
    for r in by.get('days', []):
        a = r['data'] or {}; d = r['id']
        if lo <= d <= hi: days.setdefault(d, []).append((-1, '_Closed_' if a.get('closed') else f"_Hours: {clock(a.get('open'))} to {clock(a.get('close'))}_"))
    lines = [f"# {p.get('biz', b['name'])}: schedule", '', f"Backed up {dt.datetime.fromisoformat(at.replace('Z', '+00:00')).astimezone(ET):%A, %B %-d, %Y at %-I:%M %p}. Booked in Sole; bookings made in Square are in Square.", '']
    for d in sorted(days):
        day = dt.date.fromisoformat(d)
        lines += [f"## {day:%A, %B %-d}{' (today)' if day == today else ''}", ''] + [f"- {t}" for _, t in sorted(days[d])] + ['']
    open(os.path.join(out, 'Schedule.md'), 'w', encoding='utf-8').write('\n'.join(lines))

    keys = ['name', 'phone', 'email', 'address', 'born', 'since', 'visits', 'pressure', 'focus', 'health', 'avoid', 'reason', 'setup', 'note', 'intake', 'from']
    extra = sorted({k for c in cl.values() for k in c} - set(keys))
    write_csv(os.path.join(out, 'Clients.csv'), [k.capitalize() for k in keys] + extra + ['Key'],
              [[val(c.get(k)) for k in keys + extra] + [k0] for k0, c in sorted(cl.items(), key=lambda x: (x[1].get('name') or '').lower())])

    vs = sorted(by.get('visits', []), key=lambda r: ((r['data'] or {}).get('date', ''), str((r['data'] or {}).get('start', ''))), reverse=True)
    write_csv(os.path.join(out, 'Visits and notes.csv'),
              ['Date', 'Time', 'Client', 'Service', 'Price', 'Pressure', 'Areas', 'Techniques', 'Subjective', 'Objective', 'Assessment', 'Plan', 'No-show', 'From', 'Client key', 'Visit key'],
              [[v.get('date', ''), clock(v.get('start')), name(v.get('c')), v.get('svc') or sv.get(v.get('s'), val(v.get('s'))), val(v.get('price')), val(v.get('press')), val(v.get('areas')), val(v.get('tech')),
                val(v.get('S')), val(v.get('O')), val(v.get('A')), val(v.get('P')), val(v.get('noshow')), val(v.get('from')), val(v.get('c')), r['id']] for r in vs for v in [r['data'] or {}]])

    fs = sorted(by.get('forms', []), key=lambda r: (r['data'] or {}).get('at', ''), reverse=True)
    write_csv(os.path.join(out, 'Forms.csv'), ['Date', 'Form', 'Name', 'Client key', 'Signed', 'Answers'],
              [[f.get('date', ''), f.get('form', ''), f.get('name', ''), val(f.get('client')), 'yes' if f.get('sig') else 'no', json.dumps(f.get('answers') or {}, ensure_ascii=False)] for r in fs for f in [r['data'] or {}]])

    lg = sorted(by.get('ledger', []), key=lambda r: (r['data'] or {}).get('date', ''), reverse=True)
    write_csv(os.path.join(out, 'Money.csv'), ['Date', 'Kind', 'Amount', 'Tip', 'Method', 'Client', 'Store', 'Category', 'Note'],
              [[x.get('date', ''), x.get('kind', ''), val(x.get('amount')), val(x.get('tip')), val(x.get('method')), name(x.get('c')) if x.get('c') else val(x.get('cname')), val(x.get('store')), val(x.get('cat')), val(x.get('note'))] for r in lg for x in [r['data'] or {}]])

    ps = sorted(b.get('payments', []), key=lambda x: x.get('at') or '', reverse=True)
    write_csv(os.path.join(out, 'Card payments.csv'), ['When', 'Status', 'Amount', 'Tip', 'Refunded', 'Card customer', 'Square customer id', 'Payment id'],
              [[dt.datetime.fromisoformat(x['at'].replace('Z', '+00:00')).astimezone(ET).strftime('%Y-%m-%d %I:%M %p') if x.get('at') else '', x.get('status', ''), val(x.get('amount')), val(x.get('tip')), val(x.get('refunded')), sq.get(x.get('customer') or '', ''), val(x.get('customer')), x.get('id', '')] for x in ps])

    # papers on file: each one under its own name, earlier copies with the day they were added
    files = {x['path']: x['b64'] for x in b.get('papers', [])}
    pp = next((r['data'] for r in by.get('people', []) if r['id'] == 'papers'), None) or {}
    pdir = os.path.join(out, 'Papers'); papers = pp.get('list', [])
    if papers: os.makedirs(pdir, exist_ok=True)
    safe = lambda t: re.sub(r'[^A-Za-z0-9 ,&()-]+', '', t).strip() or 'Paper'
    for p in papers:
        for i, v in enumerate([p] + list(reversed(p.get('older', [])))):
            if v.get('file') in files:
                ext = v['file'].rsplit('.', 1)[-1]
                nm = safe(p['name']) + (f" (earlier, added {v.get('added', '')})" if i else (f" (expires {p['expires']})" if p.get('expires') else ''))
                open(os.path.join(pdir, f"{nm}.{ext}"), 'wb').write(__import__('base64').b64decode(files[v['file']]))
    n = {k: len(v) for k, v in by.items()}
    open(os.path.join(out, 'README.md'), 'w', encoding='utf-8').write('\n'.join([
        f"# {p.get('biz', b['name'])}", '',
        f"Last backed up **{dt.datetime.fromisoformat(at.replace('Z', '+00:00')).astimezone(ET):%A, %B %-d, %Y at %-I:%M %p}** (every night; History shows any earlier night).", '',
        f"- [Schedule](Schedule.md): the last 2 weeks and the next 60 days",
        f"- [Clients](Clients.csv): {len(cl)} people with their notes",
        f"- [Visits and notes](Visits%20and%20notes.csv): {n.get('visits', 0)} visits with SOAP notes",
        f"- [Forms](Forms.csv): {n.get('forms', 0)} filled in",
        f"- [Money](Money.csv): {n.get('ledger', 0)} payments and costs logged in Sole",
        f"- [Card payments](Card%20payments.csv): {len(ps)} from Square",
        f"- [Papers](Papers): {len(papers)} on file (license, insurance, certificates)",
        f"- [book.json](book.json): everything exactly as stored, to rebuild Sole from", '']))
    return p.get('biz', b['name'])


def main(src, dest):
    d = json.load(open(src, encoding='utf-8'))
    if not d.get('businesses'): sys.exit('nothing in the backup')
    names = []
    for b in d['businesses']:
        folder = re.sub(r'[^A-Za-z0-9 &-]+', '', (b.get('profile') or {}).get('biz') or b['name']).strip() or b['id']
        names.append((business(b, os.path.join(dest, folder), d['at']), folder))
    open(os.path.join(dest, 'README.md'), 'w', encoding='utf-8').write('\n'.join(['# Sole backup', '', 'Private. Written every night from Sole.', ''] + [f"- [{n}]({f.replace(' ', '%20')}/README.md)" for n, f in names] + ['']))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
