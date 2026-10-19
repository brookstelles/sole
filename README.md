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
- `tests/run.mjs`: drives every business through every tab, then runs setup for a custom business. `node tests/run.mjs`.

## Publishing

Published as a private claude.ai artifact: https://claude.ai/artifact/AsBAX1NXNyuv6T1MdPGVSd (publish `index.html` to that URL).

## Data

This repo is private because `index.html` holds Heart and Soul Massage's real yearly numbers. Before showing Sole to anyone else, publish a demo build with a made-up massage business in place of Kelli's.

Today the daily schedule, payments and per-customer spending are sample data, and businesses created in setup live in the browser that made them. Next: Square and a booking calendar, then a real database for accounts and uploads.
