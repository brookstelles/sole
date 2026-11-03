# SolePro's iPhone and Android apps

The same page as https://app.solepro.app, bundled into an iPhone/iPad app and an Android app with Capacitor 8 (app id
`com.brookstelles.solepro`, name SolePro). The apps carry the page's files (they are not a wrapper around the
website, which Apple turns away under guideline 4.2) and talk to the same Supabase project.

```
cd app
npm ci                      # Capacitor, its plugins, supabase-js (the version the website loads), esbuild
npm run build               # python3 build_demo.py, then scripts/build_web.mjs: site/ → www/ (not committed)
npm run build:native        # build, then cap sync: www/ into ios/ and android/, plugins wired
node scripts/check_store.mjs
node scripts/build_native_icons.mjs     # icons and launch screens from site/favicon.svg (rerun if the mark changes)
node scripts/build_store_shots.mjs      # store screenshots from dist/demo.html (made-up business)
```

- `ios/`: Xcode project, Swift Package Manager (no CocoaPods). Open `ios/App/App.xcodeproj` on a Mac.
- `android/`: Gradle project (compile and target SDK 36, minimum 24). `cd android && ./gradlew assembleDebug`.
- `.github/workflows/native.yml` (Phone apps): compiles Android on each change to the apps or the page (the debug APK
  is kept 14 days under the run's Artifacts), and the iPhone app on demand (Run workflow, tick the box; macOS runner).
- `store/`: listing text, screenshots and every store form's answers (`store/README.md`).

## What's different inside the apps

`index.html` knows it is inside an app (`NATIVE`: Capacitor says so; tests set `__SOLE_NATIVE`). Then:

- **Nothing to buy** (`SELLS_HERE = !NATIVE`, the one switch): no prices, trial, plan choice, "Card, receipts or
  cancel", "Start my plan again" or Stripe link anywhere. The account sheet's "Your plan" says where the plan stands
  (trial days left, renews, canceled, card failed, ended) with no price or button; Today says only when it has ended or a
  card failed. `?start` and `?paid=` do nothing. Someone signed in with no business sees the invite code box and "No
  business on SolePro yet? New businesses start at getsolepro.com. Then sign in here with the same email." (no link or
  button). The website is unchanged and keeps selling.
- **Always on SolePro's servers**: `CLOUD_ON` doesn't depend on the address (the app's own is `capacitor://localhost`
  on iPhone, `https://localhost` on Android). Links sent to clients (forms) use `https://app.solepro.app` (`WEB_HOME`).
- **No service worker** (the app has its files) and supabase-js comes from the app (`vendor/supabase.min.js`), not
  jsDelivr. No signal still works: the book is kept on the phone (IndexedDB) as on the website.
- **No Face ID by passkey**: SolePro's passkeys belong to solepro.app, and an app at `localhost` can't use them (Apple
  allows WebAuthn in an app's web view only for the app's associated domains; Android's web view needs Digital Asset
  Links), so the button is never shown (`pkOk`). People sign in with the email code; the session stays signed in. A
  native Face ID unlock (a biometrics plugin guarding the stored session) is a later update.
- **No notifications yet**: web push doesn't reach an app's web view, so the account sheet doesn't offer them.
  Native notifications (APNs and FCM, as Pasalo has) are a later update.
- `web/native.js` (bundled into `www/native.js` only): Android's back button goes back like the swipe (a sheet closes,
  then the page before) and from the first page leaves the app; links that belong outside open outside (getsolepro.com's
  terms and privacy, maps and any web page in the phone's browser; tel:, sms:, mailto: in Phone, Messages and Mail, via
  `@capacitor/app-launcher`); `navigator.share` with files goes through the phone's share sheet (`@capacitor/share`,
  `@capacitor/filesystem`), so Print or save as PDF works on Android too (`pdfMode`); the status bar's text is light
  over the opening's sky and in dark mode. The pull-down refresh and the swipe from the left edge work as on the
  home-screen web app.
- Safe areas: the page already uses `env(safe-area-inset-*)` with `viewport-fit=cover`; iOS `contentInset: never`,
  Android `SystemBars.insetsHandling: native`.
- Info.plist asks for the camera and photos (receipts, papers) and location when in use (the weather, once). Android
  asks for location only (the camera opens through the system's own camera app).

## Buying inside the apps later (if Apple or Google insist)

v1 relies on Apple 3.1.3(f) (a free companion to a paid web service, nothing to buy in the app). If App Review asks
for in-app purchase, the options, in order of effort:
1. Make the line for someone with no business say only "This email isn't on a business yet." (`cloudNew`, `nb-web`).
2. US storefront only: since May 2025 Apple lets US apps link to buying on the web; flip `SELLS_HERE` to true for
   iOS in the US (and keep Android's choice separate), checking Apple's rules at the time.
3. In-app purchase: a subscription in App Store Connect and Play Console at the same prices, a purchases plugin
   (e.g. RevenueCat or `cordova-plugin-purchase`), and the `billing` function recording Apple and Google receipts
   like Stripe's (`businesses.plan_status`), so `private.book_open` keeps working.

## Signing and uploading (once the developer accounts exist)

**Apple** (Mac with Xcode, or the workflow later with fastlane match):
1. Apple Developer Program as Sellet Solutions LLC (needs the D-U-N-S number). In Certificates, Identifiers & Profiles,
   register the App ID `com.brookstelles.solepro`.
2. App Store Connect → New App: iOS, name SolePro, bundle id above, SKU `solepro`, primary language English (U.S.).
3. In Xcode: open `ios/App/App.xcodeproj`, target App → Signing & Capabilities → Team: Sellet Solutions LLC,
   "Automatically manage signing". Version 1.0, build 1 (raise the build number for every upload).
4. `cd app && npm ci && npm run build:native`, then in Xcode: Any iOS Device → Product → Archive → Distribute App →
   App Store Connect → Upload. Then TestFlight (internal testers first).
5. Fill the listing from `store/ios/en-US/`, upload `store/screenshots/iphone` and `ipad`, and answer the forms from
   `store/README.md`, with the review account in App Review Information.

**Google**:
1. Google Play developer account as an organization (Sellet Solutions LLC, D-U-N-S). Create the app: SolePro, app,
   free.
2. Make an upload key once, and keep it out of the repository (a password manager plus a backup):
   `keytool -genkeypair -v -keystore solepro-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
3. Build a signed bundle: `cd app && npm run build:native && cd android && ./gradlew bundleRelease`, then sign it in
   Android Studio (Build → Generate Signed App Bundle, with the upload key) or add a `signingConfigs.release` that reads
   the key from environment variables. Upload `app-release.aab` to Internal testing; Play App Signing holds the real key.
   Raise `versionCode` in `android/app/build.gradle` for every upload.
4. Fill the listing from `store/android/en-US/`, the screenshots and feature graphic from `store/screenshots/android/`,
   and the forms (content rating, target audience, data safety, app access) from `store/README.md`.
5. New personal accounts must run a closed test with 12 testers for 14 days before production; an organization account
   doesn't, as of this writing; check Play Console.

## Checked (Nov 3, 2026)

- `python3 build_demo.py && node tests/run.mjs`: the app edition (`__SOLE_NATIVE`): nothing to buy on sign-in, welcome,
  account sheet and Today; no Face ID or notifications rows; an invite code still sets up a business; form links go to
  app.solepro.app; deleting an owner's and a staff member's account and a bare sign-in; the review password. The website
  edition still passes everything it did.
- `www/` in Chromium with Capacitor's own `native-bridge.js` and a stand-in Android bridge: the page runs as the app
  (supabase-js from `vendor/`, no service worker registered, no Face ID), and links, tel:, sms:, mailto:, maps and
  `window.open` go to AppLauncher, a shared PDF goes through Filesystem then Share, the back button listener is set.
- Android: `./gradlew assembleDebug` compiles (JDK 21, SDK 36); the APK carries `public/index.html`, `native.js` and
  `vendor/supabase.min.js`, permissions INTERNET and location only.
- Not checked here: the iPhone build (needs macOS: run the workflow with the iPhone box ticked) and the apps on real
  phones (sign-in, camera, share sheet, back button, safe areas). Do both on TestFlight and Play internal testing.
