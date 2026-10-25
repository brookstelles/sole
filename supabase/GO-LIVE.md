# Sole goes live on sole.brookstelles.com

Everything below is ready in this repo: the database (`migrations/20261024000000_sole.sql`), the Square server
function (`functions/square/index.ts`) and the website code in `index.html` (sign in with an email code; the book,
payments and costs in Supabase; Square payments live). On claude.ai the app keeps working as before.

Supabase project: **Sole** (organization Sole, free plan, East US (Ohio)), created Oct 24, 2026.

## Steps for Claude (a session where the Supabase connector can see the Sole organization)

1. Find the project (`list_projects`) and apply `migrations/20261024000000_sole.sql`.
2. Seed the business: `insert into businesses (name, profile) values ('Heart and Soul Massage', 'massage')`, then
   `members` rows (role `owner`) for brookstelles@gmail.com and Kelli's email (ask Brooks; it's also on the
   Cloudflare Access policy).
3. Put the project URL and publishable key (`get_project_url`, `get_publishable_keys`) into
   `PROFILES.massage.cloud` in `index.html` (inside the PRIVATE block), run the build and tests, push.
4. Deploy `functions/square` with **verify_jwt off** (it checks Square's signature and the member's token itself).
5. Ask Brooks to enter the secrets in the dashboard (`create_edge_function_secret`): `SQUARE_ACCESS_TOKEN`,
   `SQUARE_WEBHOOK_SIGNATURE_KEY`, and `SQUARE_WEBHOOK_URL` = `https://<project ref>.supabase.co/functions/v1/square`.
   Never take a token or key in chat.
6. Move Kelli's book from the private claude.ai artifact (ArtifactData, url in CLAUDE.md): collections `appts`,
   `blocks`, `ledger` (id = `uid`), `clients`, `visits`, `weeks`, `forms`, and `people/merges` → `items`
   (`col`, `id`, `data`). Receipt photos stored as artifact assets go to the `receipts` bucket at `<business id>/<file>`.
7. Check: sign in at sole.brookstelles.com, see the book; the first sign-in pulls Square history since 2022.
8. Switch: Kelli adds sole.brookstelles.com to her home screen. Then turn off the scheduled task
   "Sole: daily Square refresh" (`trig_01F99bDVej3nNA496pg6DVLo`) and stop publishing the claude.ai artifacts.

## Steps for Brooks (dashboards)

- **Supabase → Authentication → URL Configuration:** Site URL `https://sole.brookstelles.com`.
- **Supabase → Authentication → Emails → Magic Link:** the email must show the code: put `{{ .Token }}` in it
  (for example "Your Sole code is {{ .Token }}"). Kelli types the code into the app, which also works from her home
  screen.
- **Supabase → Authentication → Emails → SMTP:** Supabase's own mailer only sends to people on the Supabase team, so
  Kelli wouldn't get her code. Use Gmail: host `smtp.gmail.com`, port 465, user brookstelles@gmail.com, password = a
  Google app password (Google account → Security → App passwords), sender brookstelles@gmail.com, name "Sole".
- **Square (developer.squareup.com, signed in as Kelli's Square account):** application **Sole** → Production →
  Credentials: the access token goes into `SQUARE_ACCESS_TOKEN`. Webhooks → Add subscription: URL
  `https://<project ref>.supabase.co/functions/v1/square`, events `payment.created`, `payment.updated`,
  `customer.created`, `customer.updated`; its signature key goes into `SQUARE_WEBHOOK_SIGNATURE_KEY`.
- **Cloudflare Zero Trust → Access → Applications → sole:** delete it. The website no longer carries Kelli's numbers
  (they're in `businesses.data`, members only), so the Sole sign-in is the only lock she needs.
