# SolePro in the App Store and Google Play

Everything the two stores ask for, drafted Nov 3, 2026. The text files use the layout fastlane uploads (`deliver` for
Apple, `supply` for Google), so the signing-and-upload step can send them as they are. Check them with
`node scripts/check_store.mjs` (limits, required links, no placeholders, nothing about buying); rebuild the
screenshots with `cd .. && python3 build_demo.py && cd app && node scripts/build_store_shots.mjs`.

## What's here

| | App Store | Google Play |
|---|---|---|
| Listing text | `ios/en-US/`: name, subtitle, description, keywords, promotional text, release notes, support, marketing and privacy URLs; `ios/copyright.txt`, `ios/primary_category.txt` (Business), `ios/secondary_category.txt` (Productivity) | `android/en-US/`: title, short and full description, `changelogs/1.txt` |
| Screenshots | `screenshots/iphone/` (6, 1290x2796, iPhone 6.9") and `screenshots/ipad/` (6, 2064x2752, iPad 13") | `screenshots/android/` (6, 1080x1920) and `feature_graphic.png` (1024x500) |

English (US) only: the app is in English. The screenshots are the public demo's made-up business (Tidewater Massage,
`demo/massage.js`), never Heart and Soul or anyone's real book. Captions are in `screenshots/captions.json`.

**iPhone and iPad**: `TARGETED_DEVICE_FAMILY = "1,2"`; the iPhone stays upright, the iPad turns every way and gets the
computer layout (sidebar, week calendar), so App Store Connect needs the iPad 13" set as well as the iPhone set.

## Answers for the store forms

**Both stores**
- Price: free. **No in-app purchases.** The apps sell nothing and show no price, trial, plan or link to buy
  (`SELLS_HERE` in `index.html`, see `app/README.md`). Businesses pay SolePro on the web; the app is a free companion
  to that web service (Apple guideline 3.1.3(f), "Free Stand-alone Apps"; Google Play's payments policy has the same
  exception for apps that don't sell inside). Someone signed in with no business is told "New businesses start at
  getsolepro.com", with no link or button. If App Review objects to even that line, change it in `cloudNew()` (the
  `nb-web` line) to "This email isn't on a business yet." and resubmit; see `app/README.md` for the other options.
- Category: Business (Apple's secondary: Productivity). Google: Business.
- Contact: help@getsolepro.com (shown on getsolepro.com; Cloudflare Email Routing must forward it).
- Support URL: https://getsolepro.com/ (its footer has the help address). Marketing URL: https://getsolepro.com/.
- Privacy policy: https://getsolepro.com/privacy. Terms: https://getsolepro.com/terms (linked on the sign-in screen,
  the welcome screen and the account sheet, and in each description).
- Copyright: 2026 Sellet Solutions LLC.
- Sign-in required: yes, email and a one-time code; App Review's account below.
- Encryption: standard HTTPS only (`ITSAppUsesNonExemptEncryption` is `false` in Info.plist).
- Contains third-party content: no (the weather line is Open-Meteo's forecast; see "Still needed").
- Ads: none. Tracking: none.

**Apple: age rating questionnaire.** Every item "None" or "No" (no violence, sexual content, profanity, drugs,
gambling, contests, horror, medical or treatment *information*, user-generated content shared with other users,
messaging between users, unrestricted web access: links open in Safari). Expected rating: 4+.

**Google: content rating (IARC).** Category "Utility, productivity, communication or other"; every question "No".
Expected: Everyone. **Target audience**: 18 and over (business owners); not designed for children.

**Google: App access.** "All or some functionality is restricted": give the review account below.

**Google: Ads** No. **Government app** No. **Financial features** None (SolePro keeps the business's own sales
records; it moves no money). **Health apps** declaration: not a health app (it keeps a business's client notes, which
can include health notes a massage therapist writes down; it gives no medical advice and isn't a medical device).

### Apple: App Privacy ("nutrition label")

Data used to track you: **none**. Everything below is **linked to the user** (it lives with their business account)
and used for **App Functionality**; Product Interaction is also used for **Analytics** (Brooks's owner view counts how
much each business uses SolePro). What the business owner enters about their own clients is declared too.

| Apple's type | What it is in SolePro (checked against `index.html` and `supabase/migrations/`) |
|---|---|
| Contact Info: Name | The owner's name; clients' names in the book |
| Contact Info: Email Address | The sign-in email; clients' emails when the owner adds them |
| Contact Info: Phone Number | Clients' phone numbers (confirmation texts go to them through Twilio); the business's own |
| Contact Info: Physical Address | Clients' addresses (outdoor trades), the business's address |
| Health & Fitness: Health | Health notes and intake answers about clients (massage intake: conditions, medications, pressure) |
| Financial Info: Other Financial Info | The business's payments, tips and costs it records; card payments from Square for a business that links Square |
| Location: Coarse Location | Only if the owner taps "Show the weather here": the phone's location once, rounded to about 1 km, kept with the business |
| Contacts | Only if the owner brings in clients from a contacts file (vCard) or a list |
| User Content: Photos or Videos | Receipt photos and pictures of licenses or other papers |
| User Content: Other User Content | Appointments, visit notes (SOAP notes), forms clients fill in and sign (signatures), messages from the business's website, texts with clients |
| Identifiers: User ID | The sign-in account |
| Usage Data: Product Interaction | When the account last signed in, and counts of clients, visits and forms (the owner view) |

Not collected: browsing or search history, purchases inside the app (none), payment info (cards are entered on
Stripe's own page on the web, never in the app), sensitive info, precise location, audio, device ID (no notifications
in the app yet), diagnostics (no crash or analytics tools in the app).

### Google: Data safety

- Data collected: yes. **Shared: no** (Supabase, Cloudflare, Twilio, Google's mail servers that send the sign-in
  code, and Stripe on the web act as service providers, which Google doesn't count as sharing).
- **Encrypted in transit**: yes. **Users can ask for deletion**: yes, in the app (initials → Delete my account) and on
  the web.
- Personal info: Name, Email address, Phone number, Address (app functionality, account management; name and email
  required, the rest optional); Other info: none.
- Health and fitness: Health info (clients' health notes; app functionality; optional).
- Financial info: Other financial info (the business's own sales and cost records; app functionality; optional).
- Location: Approximate location (the weather line; app functionality; optional).
- Contacts: Contacts (only when bringing in clients from a contacts file; app functionality; optional).
- Photos and videos: Photos (receipts, papers; app functionality; optional).
- Files and docs: Files and docs (PDFs of papers and forms; app functionality; optional).
- App activity: Other user-generated content (the book: appointments, notes, forms, signatures; required for the app);
  App interactions (last sign-in and usage counts; analytics).
- App info and performance: none. Device or other IDs: none.
- **Delete account URL** (Google requires a web link): the privacy policy, https://getsolepro.com/privacy, once it
  describes the in-app steps (see "Still needed"). The steps: sign in at https://app.solepro.app (or in the app), tap
  your initials at the top right, then "Delete my account" at the bottom, type DELETE.

### Account deletion (Apple 5.1.1(v), Google's account deletion policy)

In the app since Nov 3, 2026: account sheet → Delete my account (also "Delete this sign-in" on the welcome screen for
an email with no business). The `account` Edge Function deletes at once: for an owner, the business and everything in
it (book, card payments, form links, texts, calendar feed, phones, nightly snapshots), its files, and the sign-in; a
running plan is stopped at Stripe first (nothing is deleted if that fails). Someone working for a business loses only
their place on it. The house account is closed by hand. Stripe keeps its own payment records, as the law asks.

## App Review sign-in (nothing secret in this repository)

Apple and Google need an account that works without reading an email. Supabase has fixed test codes only for phone
numbers, so SolePro's code box also accepts a **password**, for an account that has one; only the review account
does (`askSignIn`; everyone else signs in with codes). What it needs:

1. **An email Brooks can receive**, used only for review, e.g. `brookstelles+solepro-review@gmail.com` (the code
   email still goes to it when the reviewer taps "Send me a code"; they then type the password instead).
2. **A free business with sample data** (made up, never real): make an invite code in the SQL editor
   (`insert into invite_codes (code, note, max_uses) values ('<CODE>', 'App Review', 1);`), sign in at
   https://app.solepro.app with the review email, enter the code, set up a massage business (e.g. "Harbor Light Massage
   (sample)"), then: Clients → Bring in a list → `store/review/sample-clients.csv` (10 made-up people); book 5 or 6
   visits over the next days (one today); write one SOAP note; add a paper (any picture) with an expiry date. A
   business made with an invite code has no plan, so it shows nothing about plans or billing.
3. **The password**, set by Brooks in Supabase (SQL editor; pick a random 10-digit number, the box takes up to 10):
   `update auth.users set encrypted_password = extensions.crypt('<10 digits>', extensions.gen_salt('bf')) where email = '<review email>';`
   (the account exists once step 2 has signed in with it)
   It goes only in App Store Connect (App Review Information → Sign-in required) and Play Console (App access), never
   in this repository, Drive or a chat.
4. **Review notes** (paste into both stores):
   > SolePro is the appointment book, client records and forms for one-person businesses. Accounts are made on our
   > website; the app is a free companion and sells nothing. To sign in: type the email above and tap "Send me a
   > code", then type the password above in the code box and tap "Sign in". The sample business is made up. To try
   > account deletion: tap the initials at the top right, then "Delete my account" at the bottom.
5. **After review**: reviewers often try Delete my account, which deletes the sample business for good. Make it again
   (steps 2 and 3) before the next submission.

## Still needed before submitting

- **Developer accounts** (D-U-N-S for Sellet Solutions LLC first): Apple Developer Program (organization) and a Google
  Play developer account (organization). Then the App Store Connect app record for `com.brookstelles.solepro` and the
  Play Console app, signing (Apple certificates and profiles; Play App Signing with an upload key), and upload
  (TestFlight, then Play internal testing). Steps in `app/README.md`.
- **Deploy the deletion**: apply `supabase/migrations/20261103000000_close_account.sql` in the SQL editor and deploy the
  `account` Edge Function with verify_jwt off (it uses the billing function's `STRIPE_SECRET_KEY`). Until then
  "Delete my account" says it didn't go through.
- **The review account** (above).
- **help@getsolepro.com working** (Cloudflare Email Routing), since it is the support contact.
- **Privacy policy and terms updates on getsolepro.com** (Lovable), so they match the app: say accounts can be deleted
  in the app (initials → Delete my account; immediate, backups within 30 days) and give those steps on the privacy
  page (Google's delete-account link); add Google (the sign-in code emails go out through Gmail) and Google Fonts
  (the app loads its fonts from Google) to the companies list; say SolePro sees counts and last sign-in per business
  (the owner view); say SolePro is for adults running a business (18+); in the terms, "cancel from the app" is true only
  on the web (the phone apps have no plan buttons).
- **The weather line**: Open-Meteo's free API is for non-commercial use and asks for credit ("Weather data by
  Open-Meteo.com"). For a paid product: take their commercial plan (an API key) or switch provider, and show the credit.
- **Apple's decision on 3.1.3(f)** is App Review's to make; if they ask for in-app purchase, see `app/README.md`.

## Release: signing and upload (built Nov 3, 2026)

`.github/workflows/release.yml` (Actions > Release to the stores > Run workflow) signs both apps and sends them to the
stores' testing tracks: the iPhone app to TestFlight, the Android app to Google Play internal testing. With "Also upload
the store listings" it sends this folder's text and screenshots too (fastlane deliver and supply, laid out by
`scripts/stage_store.mjs`). It never submits for review or publishes. Each run's number is the build number; the
version people see is an input (1.0). Same design as Pasalo's (its `app/store/README.md`, "Release", has the longer
walk-through).

One-time setup, once the developer accounts for Sellet Solutions LLC exist:

1. **Apple**
   - `app/native.json` > `appleTeamId`: the Team ID (Apple Developer > Membership details). Not a secret; commit it.
   - Certificates, Identifiers & Profiles > Identifiers > +: App ID `com.brookstelles.solepro`.
   - App Store Connect > Apps > + > New App: iOS, SolePro, English (U.S.), bundle ID `com.brookstelles.solepro`.
   - Repository secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY`: an App Store Connect API key with the Admin role
     (Users and Access > Integrations > App Store Connect API). The same key as Pasalo's works for every app.
2. **Google**
   - Play Console > Create app: SolePro, app, free; then the Dashboard tasks (answers above).
   - An upload key (keep the file and password in a password manager, never in the repo):
     `keytool -genkeypair -v -keystore sole-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
     Repository secrets `ANDROID_UPLOAD_KEYSTORE` (`base64 -i sole-upload.jks`) and `ANDROID_UPLOAD_KEYSTORE_PASSWORD`.
   - Run the release once for Android and upload the `.aab` from the run's artifacts by hand in Play Console > Test
     and release > Internal testing (Google requires the first one by hand).
   - Repository secret `PLAY_SERVICE_ACCOUNT`: a service account's JSON key with release access to SolePro (the same
     one as Pasalo's works). From then on the workflow uploads by itself (status "draft" until first published).
3. **Run it**: Actions > Release to the stores > Run workflow. If the iPhone job fails with "not acquired by Runner",
   run it again with another Mac (macos-15-intel has worked when Apple-silicon Macs were short).

Checked Nov 3, 2026: a release bundle built with a throwaway upload key through these Gradle settings verified as signed.

