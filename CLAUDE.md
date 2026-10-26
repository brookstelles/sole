# Sole

Sole (spelled S-O-L-E, as in sole proprietor; never "Soleil") is a phone app for one-person businesses, or an owner and one employee, in any trade: massage, hair, barbers, tattoo, tennis coaching, landscaping, cleaning and anything else that books people and gets paid. No chains or corporate groups, so no manager or executive levels. The owner is Brooks. Heart and Soul Massage (Kelli Telles, LMT, Juno Beach) is the first business on Sole.

## Rules

- The business's identity comes first inside the app (its logo, name and colors); Sole appears on the welcome screen, setup and the business switcher.
- Every business gets the same framework: five tabs, Today, Schedule, Snapshot (raised in the middle), Clients (named for the trade: `cap(WN)`), Forms; the open tab glows. What changes per business lives in data: words (clients/customers/students, appointments/jobs/lessons), services, client-note fields, forms, hours. Don't hard-code one trade's wording in the engine; use `P.who`, `P.whoOne`, `P.unit`, `P.unitOne`, `W1`, `WN`.
- Keep it simple for non-technical owners: big targets, plain words, no settings screens.
- `index.html` holds Heart and Soul Massage's real yearly numbers and P&L. Keep the repo and the published page private; anything shown to outsiders uses a made-up massage business.
- Never put private details outside the `PRIVATE:START` / `PRIVATE:END` block in `index.html`, including comments and placeholders. `build_demo.py` refuses to build if any are left.
- Run `python3 build_demo.py && node tests/run.mjs` before every publish and push (Playwright; set `CHROMIUM` if needed). Check the page at 390px wide in light and dark.
- Publish both editions together: `index.html` (private) and `dist/demo.html` (public demo).

## Layout

- `index.html`: the whole app. `PROFILES` (six built-in businesses), `TRADES` (kinds of business offered in setup), `makeProfile(id)` (setup account to profile), `boot(key)` (renders one business).
- `demo/massage.js`, `build_demo.py`, `dist/demo.html`: the public demo edition.
- `tests/run.mjs`, `tests/fixtures/`: end-to-end test of both editions, setup and day one.

## Publishing

- Private edition: `index.html` to https://claude.ai/artifact/AsBAX1NXNyuv6T1MdPGVSd
- Public demo: `dist/demo.html` to https://claude.ai/artifact/Wk3yTmZAva3UbfY6eShtXe

## Website

- Moving off claude.ai (decided Oct 24, 2026). sole.brookstelles.com is a Cloudflare Worker (static assets) built from this repo on every push to `main`. `wrangler.jsonc` publishes only `site/` and keeps the workers.dev and preview addresses off; never publish the repository root. The website page is public, so it carries no private details: `build_demo.py` writes `site/index.html` from `index.html` with the made-up massage business (`demo/massage.js`) in place of the PRIVATE block, keeps only its `cloud` line, adds the document head (charset, viewport, `site/apple-touch-icon.png`) and refuses to build if a private detail is left. The real business (the PRIVATE block without `cloud`) is `businesses.data` in the database, readable only by its members; `cloudGo()` swaps it in after sign-in. After changing the PRIVATE block, run `node supabase/profile.mjs` and apply the SQL it prints to the Sole project. The sign-in code emails are `supabase/templates/` (pasted into Supabase → Authentication → Emails; header picture in the public `brand` bucket). The website edition runs on Supabase (project **Sole**, organization Sole, free, East US (Ohio)): when `PROFILES.massage.cloud` has the project's URL and publishable key and the page is on brookstelles.com, `cloudStart()` signs in with an email code and stands in for `window.claude` (`cloudDb()` maps the book onto the `items` table, square/summary and square/customers are computed from `square_payments` and `square_customers` by `squareShape()`, receipts go to the private `receipts` bucket). The `square` Edge Function (`supabase/functions/square`, verify_jwt off) takes Square's webhooks and pulls history. Schema in `supabase/migrations/`; every schema change is a new migration file applied with the same SQL. Tests stand in for Supabase with `tests/fixtures/fake-supabase.js`. `supabase/GO-LIVE.md` lists what's left before Kelli switches; until then she keeps using the claude.ai link.

## Drive

Google Drive: Business / Sole (folder id `17ApCM08dXre6TGuXqkEF_zoUHscD2DzI`). The plan is the Google Doc *Sole: Product Plan* (id `1SlNHcJMCPG62BhRMYFlwJBEBfTX0bgCNOZ0OWURUXUg`); keep its "Next steps" current. Kelli's source data is in Business / Heart and Soul / Taxes (Heart and Soul Breakdown, Heart and Soul 2024, Heart and Soul 2025).

## Square (private edition only)

- The private artifact's database holds `square/summary` (months, fees by year, last 60 days) and `square/customers` (per customer: all time, this year, this month, last paid; id and name only). Rules: `square` read `view`, write `admin`.
- Written once a day by the scheduled task "Sole: daily Square refresh" (`trig_01F99bDVej3nNA496pg6DVLo`, 5:48 am Eastern, read only on Square). The page reads it in `loadSquare()`; tests inject `tests/fixtures/square-sample.json` (made up) through `window.__SOLE_SQUARE`. Never commit real Square data.
- Live on top of that: the page reads Square's Payments list through the viewer's own Square connector (`mcp` capability, `Square` / `make_api_request_read`, read only) for every payment since the 1st of the month `summary.through` falls in, and checks again every two minutes while open (`watchSquare`, overlay in `SQX`). Those months, today's total, per-customer month, year, all time and last paid come from the payments; fees and tips only add payments after `summary.updated`. A viewer without the Square connector sees the daily numbers; one who hasn't allowed it gets a "See payments as they come in" button. Tests inject made-up payments through `window.__SOLE_SQUARE_LIVE`. Square's Reporting API files payments one day early (an Oct 19 payment lands on Oct 18), so trust payment times over Reporting days.
- Square's "net sales" is the service price before Square's processing fee, without tips. Kelli's P&L "Square" column matches it; tips and fees are separate.
- Sole is Kelli's appointment book and client records (decided Oct 24, 2026); Square is for payments. Her own book lives in the private artifact's database, one document per item: `appts` (uid, client, service, date, start, paid, tip, method), `blocks` (time off), `clients` (clients added in Sole, plus notes written on anyone, Square card customers keyed `sq:<customer id>`), `ledger` (payments Square didn't take, kind `pay`, and costs, kind `cost`, with an optional receipt photo stored as an asset). Rules: read and write `interact`. `saveState()` builds the book each render and `persistReal()` writes only what changed (compared with `canon()`); `watchSole()` listens to all four so another phone's changes show in seconds (`SOLE_VER`, redrawn when no sheet is open). With the book loaded (`SOLE`, `LIVEBOOK`), the sample schedule and clients are gone, "now" is the real time, Square's named customers are the client list, and bookings made in Square still show (read only: move and cancel point to Square). A visit is paid when a card payment from that person (or for that price) or a payment logged in Sole came in that day; those `auto` payments aren't written back. After booking or moving, Sole writes the confirmation text (Messages opens when the client has a phone number). Kelli keeps Square's online booking page off until Sole has its own, so nobody books over a time she booked in Sole.
- Two more parts of the book: `visits` (notes on each visit, keyed by the appointment's uid, `sq:<booking id>` for Square bookings; `noshow` marks a no-show) and `weeks` (the weekly check, keyed by Monday's date: `checked`, `at`, `ignore` for card payments that weren't a visit). Visit notes come from `VISIT_FORMS` by trade (`P.visitKind` or the profile key, then the trade's base): SOAP notes for massage with chips for areas, techniques and pressure; the field marked `plan` becomes the client's "Last time" and shows before their next visit. The weekly check (`weekInfo`, `viewCheck`, Snapshot → Money in and out → Weekly check) lists visits with no payment (Paid, No-show) and card payments no visit claimed (`PAY_USED`; Add it, Not a visit); Today nudges for last week's check and for today's visits without notes. The live Square window reaches back to the 1st of the month two weeks ago so last week is covered. The schedule can go back four weeks to read or write notes; past days show no openings to book.
- Kelli takes cards with Tap to Pay in Square at the in-person rate (decided Oct 24, 2026: no payment links, no paid texting service for now); the payments come into Sole by themselves.
- Payments, costs and notes work in every edition: the private one keeps them in the database, setup accounts in `ACC.state` (`ledger`, `notes`), the built-in businesses for the visit. A receipt photo is read by Claude on the viewer's own account (`sample` with images, `takeReceipt`), which fills in the store, amount, day and kind of cost. Tests inject Kelli's book through `__SOLE_SQUARE.sole` and still read made-up Square bookings through `window.__SOLE_SQUARE_BOOK`.
- Square knows money and card customers (many card customers have no name; anyone who books gets one). Older notes and intake answers are still in MassageBook.
- One person can pay with several cards. `people/merges` (`{groups:[{ids, name}]}`, rules read and write `interact`) combines card profiles into one client; `mergeCards()` applies it and Kelli combines or separates cards from a card customer's sheet ("Same person?"). Jason Jewell's three cards are combined.

## Clients tab

- `viewClientsTab()`: counts (everyone, booked ahead, due back), search, filters (`CL_FILTERS`, `clFlags()`: coming up, due back, new, health notes, needs a form) and an A to Z list. `clientPage(k)` is one person's page: who they are with Book, Text, Call and Payment, next visit, "Before you start" notes, spending, every visit newest first (`clientVisits()`: appointments plus visit notes from outside the schedule's reach) with its SOAP notes or a prompt to write them, and their forms. `cl-open` opens it from anywhere (the client sheet has "All visits and notes").

## Website extras

- Sign-in: email code, then Face ID (Supabase passkeys, experimental, `experimental:{passkey:true}`; relying party `sole.brookstelles.com`). The challenge is fetched before the tap (`pkFetch`, `pkCeremony`) because iPhones refuse a Face ID prompt that waits on the network. After a code sign-in, or once on a phone already signed in, `offerFace()` offers it; the sign-in screen then puts it first (`sole-face` in the phone's storage).
- The opening (sunrise, "Welcome back" and the business name) plays every time for about 3½ seconds (`INTRO_MS`; tests set `__SOLE_INTRO_MS = 0`) while the book loads under it (`introVeil`, `introDone`).
- Each page (tab, Snapshot page, client) is a browser history step (`navNote`), so swiping back works in Safari; back with a sheet open closes the sheet. Opened from the home screen (`STANDALONE`), Sole adds swipe from the left edge to go back and pull down to reload.

## Digital forms

- Every form can be filled in on the phone ("Fill in now"): fields come from `FIELDSETS` (`massage` is Kelli's intake form question for question, `tattoo`, `waiver`) or are built from a template's `sections` by `fieldsFor()`. Finger signature on a canvas, saved as a PNG.
- A filled-in form updates its person (`applyResponse`): intake done, health flags into their notes, pressure and reason for massage.
- Private edition saves responses to the `forms` collection (read and write `interact`); accounts made in setup keep them with the account; the built-in demos keep them for the visit.
- "Text a link" for clients to fill in on their own phone needs Sole hosted outside claude.ai (clients aren't claude.ai users).

## Open questions

- Kelli's Breakdown values each massage at $110; her P&L records about $85 (2024) and $100 (2025) per massage.
- Square income for Sept to Dec 2025 is $0 on her P&L.
- Her intake form in Drive must be shared "Anyone with the link" for "Text to a client" to work.
