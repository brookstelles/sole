# Sole

Sole (spelled S-O-L-E, as in sole proprietor; never "Soleil") is a phone app for one-person businesses, or an owner and one employee, in any trade: massage, hair, barbers, tattoo, tennis coaching, landscaping, cleaning and anything else that books people and gets paid. No chains or corporate groups, so no manager or executive levels. The owner is Brooks. Heart and Soul Massage (Kelli Telles, LMT, Juno Beach) is the first business on Sole.

## Rules

- The business's identity comes first inside the app (its logo, name and colors); Sole appears on the welcome screen, setup and the business switcher.
- Every business gets the same framework (Today, Schedule, Snapshot, Forms). What changes per business lives in data: words (clients/customers/students, appointments/jobs/lessons), services, client-note fields, forms, hours. Don't hard-code one trade's wording in the engine; use `P.who`, `P.whoOne`, `P.unit`, `P.unitOne`, `W1`, `WN`.
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

## Drive

Google Drive: Business / Sole (folder id `17ApCM08dXre6TGuXqkEF_zoUHscD2DzI`). The plan is the Google Doc *Sole: Product Plan* (id `1SlNHcJMCPG62BhRMYFlwJBEBfTX0bgCNOZ0OWURUXUg`); keep its "Next steps" current. Kelli's source data is in Business / Heart and Soul / Taxes (Heart and Soul Breakdown, Heart and Soul 2024, Heart and Soul 2025).

## Square (private edition only)

- The private artifact's database holds `square/summary` (months, fees by year, last 60 days) and `square/customers` (per customer: all time, this year, this month, last paid; id and name only). Rules: `square` read `view`, write `admin`.
- Written once a day by the scheduled task "Sole: daily Square refresh" (`trig_01F99bDVej3nNA496pg6DVLo`, 5:48 am Eastern, read only on Square). The page reads it in `loadSquare()`; tests inject `tests/fixtures/square-sample.json` (made up) through `window.__SOLE_SQUARE`. Never commit real Square data.
- Live on top of that: the page reads Square's Payments list through the viewer's own Square connector (`mcp` capability, `Square` / `make_api_request_read`, read only) for every payment since the 1st of the month `summary.through` falls in, and checks again every two minutes while open (`watchSquare`, overlay in `SQX`). Those months, today's total, per-customer month, year, all time and last paid come from the payments; fees and tips only add payments after `summary.updated`. A viewer without the Square connector sees the daily numbers; one who hasn't allowed it gets a "See payments as they come in" button. Tests inject made-up payments through `window.__SOLE_SQUARE_LIVE`. Square's Reporting API files payments one day early (an Oct 19 payment lands on Oct 18), so trust payment times over Reporting days.
- Square's "net sales" is the service price before Square's processing fee, without tips. Kelli's P&L "Square" column matches it; tips and fees are separate.
- The schedule comes from Square Appointments (turned on Oct 20, 2026, free plan; Kelli moved off MassageBook because its Google Calendar sync needs a paid plan). The page reads `bookings.list` (yesterday through 30 days ahead; Square allows 31 days per request) every minute, `catalog.list` ITEM services (`product_type` APPOINTMENTS_SERVICE) every ten minutes, and `customers.get` for names it doesn't have. With bookings in hand (`LIVEBOOK`), real bookings and Square's named customers replace the sample schedule and clients, "now" is the real time, and a booking that day is marked paid when a payment from that customer (or for that price) came in. On the free plan outside apps can only read bookings, so book, move, cancel and charge point to the Square Appointments app. Tests inject made-up bookings through `window.__SOLE_SQUARE_BOOK`.
- Square knows money and card customers (many card customers have no name; anyone who books gets one). Older notes and intake answers are still in MassageBook.
- One person can pay with several cards. `people/merges` (`{groups:[{ids, name}]}`, rules read and write `interact`) combines card profiles into one client; `mergeCards()` applies it and Kelli combines or separates cards from a card customer's sheet ("Same person?"). Jason Jewell's three cards are combined.

## Digital forms

- Every form can be filled in on the phone ("Fill in now"): fields come from `FIELDSETS` (`massage` is Kelli's intake form question for question, `tattoo`, `waiver`) or are built from a template's `sections` by `fieldsFor()`. Finger signature on a canvas, saved as a PNG.
- A filled-in form updates its person (`applyResponse`): intake done, health flags into their notes, pressure and reason for massage.
- Private edition saves responses to the `forms` collection (read and write `interact`); accounts made in setup keep them with the account; the built-in demos keep them for the visit.
- "Text a link" for clients to fill in on their own phone needs Sole hosted outside claude.ai (clients aren't claude.ai users).

## Open questions

- Kelli's Breakdown values each massage at $110; her P&L records about $85 (2024) and $100 (2025) per massage.
- Square income for Sept to Dec 2025 is $0 on her P&L.
- Her intake form in Drive must be shared "Anyone with the link" for "Text to a client" to work.
