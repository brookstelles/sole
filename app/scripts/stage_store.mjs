// Lays out store/ the way fastlane's deliver (App Store) and supply (Google Play) read it, in build/store/:
//   build/store/ios/metadata/en-US/*.txt and build/store/ios/screenshots/en-US/*.png (iPhone and iPad; deliver tells
//     them apart by size)
//   build/store/android/en-US/{title,short_description,full_description}.txt, changelogs/, and
//     images/phoneScreenshots/*.png, images/featureGraphic.png (plus images/icon.png when the listing has one)
// The release workflow (.github/workflows/release.yml, "Also upload the store listings") runs this, then uploads.
import { cpSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const store = join(root, "store");
const shots = join(root, "store/screenshots");
const out = join(root, "build/store");
const pngs = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")).sort() : []);

rmSync(out, { recursive: true, force: true });
cpSync(join(store, "ios", "en-US"), join(out, "ios/metadata/en-US"), { recursive: true });
const ios = join(out, "ios/screenshots/en-US");
mkdirSync(ios, { recursive: true });
for (const dev of ["iphone", "ipad"]) for (const f of pngs(join(shots, dev))) cpSync(join(shots, dev, f), join(ios, `${dev}_${f}`));

const and = join(out, "android/en-US");
cpSync(join(store, "android", "en-US"), and, { recursive: true });
mkdirSync(join(and, "images/phoneScreenshots"), { recursive: true });
for (const f of pngs(join(shots, "android"))) {
  if (f === "feature_graphic.png") cpSync(join(shots, "android", f), join(and, "images/featureGraphic.png"));
  else cpSync(join(shots, "android", f), join(and, "images/phoneScreenshots", f));
}
console.log(`Store listings staged in ${out}`);
