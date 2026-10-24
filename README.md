# Sole

The app for the owner who does the work: a one-person business, or an owner and one employee, in any trade. Every business gets the same four tabs, set up with its own words, services, forms, logo and colors.

- **Today**: the next appointment and that person's notes, what needs the owner, and an ask box ("How much has Maria spent?").
- **Schedule**: book, move, cancel and block time, with the business's own hours and the time it needs between bookings. With two people, each has a schedule.
- **Snapshot**: the year and where it's headed, every customer with what they've spent (month, year, all time), what the owner kept, where the money goes, seasons, a what-if, license renewals.
- **Forms**: every form the business uses, to print or send, and who still owes one.

Setup (tap the business name, then *Set up a new business*): what the business does (18 kinds, or *Something else* with its own words), name and owner, logo (the app takes its colors from it), forms and documents, services and prices.

Product plan: Google Drive, Business / Sole / *Sole: Product Plan*.

## Files

- `index.html`: the whole app, one self-contained page.
  - `PROFILES`: the six built-in businesses. `massage` is Heart and Soul Massage with Kelli's real year numbers and P&L; the others are sample businesses.
  - `TRADES`: the kinds of business setup offers, with their words, starter services and the profile each one builds on.
  - `makeProfile(id)`: turns a business created in setup into a full profile.
  - `boot(key)`: builds and renders one business; switching businesses calls it again.
- `demo/massage.js`, `build_demo.py`, `dist/demo.html`: the public demo.
- `tests/run.mjs`: both editions, every business through every tab, setup, and day one. `python3 build_demo.py && node tests/run.mjs`.

## Two editions

- **Private** (`index.html`): includes Heart and Soul Massage with its real numbers. Published at https://claude.ai/artifact/AsBAX1NXNyuv6T1MdPGVSd.
- **Public demo** (`dist/demo.html`, built by `python3 build_demo.py`): the private business between the `PRIVATE:START` / `PRIVATE:END` markers is replaced by `demo/massage.js` (Tidewater Massage, made up). The build stops if any private detail is left. Published at https://claude.ai/artifact/Wk3yTmZAva3UbfY6eShtXe. First-time visitors see a welcome: set up a business, or look around.

## Day one

A business made in setup starts empty: a "Get set up" list (first customer, first booking, Square, calendar, intake form, license), real totals from what it books and gets paid, and empty states everywhere else. "Fill with sample data" shows what a busy year looks like and can be cleared again. Customers, bookings, time off and setup steps the owner adds are saved with the account (in this browser for now).

## Data

This repo is private because `index.html` holds Heart and Soul Massage's real yearly numbers. Before showing Sole to anyone else, publish a demo build with a made-up massage business in place of Kelli's.

Heart and Soul Massage runs on its own book in the private edition: appointments, time off, clients and notes, cash and Zelle payments and costs live in the page's database and sync between phones; card payments and card customers come live from Square. Sample businesses keep what's added for the visit, and businesses created in setup keep it in the browser that made them. Next: Sole on its own website, so clients can book themselves, get reminders and fill in forms from a link.
