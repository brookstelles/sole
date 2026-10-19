# Sole

Sole (spelled S-O-L-E, as in sole proprietor; never "Soleil") is a phone app for one-person businesses, or an owner and one employee, in any trade: massage, hair, barbers, tattoo, tennis coaching, landscaping, cleaning and anything else that books people and gets paid. No chains or corporate groups, so no manager or executive levels. The owner is Brooks. Heart and Soul Massage (Kelli Telles, LMT, Juno Beach) is the first business on Sole.

## Rules

- The business's identity comes first inside the app (its logo, name and colors); Sole appears on the welcome screen, setup and the business switcher.
- Every business gets the same framework (Today, Schedule, Snapshot, Forms). What changes per business lives in data: words (clients/customers/students, appointments/jobs/lessons), services, client-note fields, forms, hours. Don't hard-code one trade's wording in the engine; use `P.who`, `P.whoOne`, `P.unit`, `P.unitOne`, `W1`, `WN`.
- Keep it simple for non-technical owners: big targets, plain words, no settings screens.
- `index.html` holds Heart and Soul Massage's real yearly numbers and P&L. Keep the repo and the published page private; anything shown to outsiders uses a made-up massage business.
- Run `node tests/run.mjs` before every publish and push (Playwright; set `CHROMIUM` if needed). Check the page at 390px wide in light and dark.

## Layout

- `index.html`: the whole app. `PROFILES` (six built-in businesses), `TRADES` (kinds of business offered in setup), `makeProfile(id)` (setup account to profile), `boot(key)` (renders one business).
- `tests/run.mjs`, `tests/fixtures/`: end-to-end test.

## Publishing

Publish `index.html` as the claude.ai artifact https://claude.ai/artifact/AsBAX1NXNyuv6T1MdPGVSd (same URL every time).

## Drive

Google Drive: Business / Sole (folder id `17ApCM08dXre6TGuXqkEF_zoUHscD2DzI`). The plan is the Google Doc *Sole: Product Plan* (id `1SlNHcJMCPG62BhRMYFlwJBEBfTX0bgCNOZ0OWURUXUg`); keep its "Next steps" current. Kelli's source data is in Business / Heart and Soul / Taxes (Heart and Soul Breakdown, Heart and Soul 2024, Heart and Soul 2025).

## Open questions

- Kelli's Breakdown values each massage at $110; her P&L records about $85 (2024) and $100 (2025) per massage.
- Square income for Sept to Dec 2025 is $0 on her P&L.
- Her intake form in Drive must be shared "Anyone with the link" for "Text to a client" to work.
