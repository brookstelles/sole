// Inside SolePro's iPhone and Android apps only (Capacitor: app/capacitor.config.json, app/ios, app/android). The page is
// the same as app.solepro.app (index.html sees NATIVE and leaves out what an app shouldn't have: buying, the service
// worker, web push, passkeys). This adds what a phone app is expected to do, and is bundled by app/scripts/build_web.mjs
// into the apps' copy of the page only (never the website):
//   - Android's back button goes back the way the swipe does (a sheet closes, then the page before), and from the
//     first page leaves the app to the home screen.
//   - Links that belong outside open outside: the web (Stripe, getsolepro.com's terms, maps) in the phone's browser,
//     tel:, sms: and mailto: in Phone, Messages and Mail. A file the page made itself (blob:) goes to the share sheet.
//   - navigator.share and navigator.canShare for files (PDFs to print or save, papers, the QR code's link), through the
//     phone's own share sheet, which Android's web view doesn't have.
//   - The status bar's text: light over the opening's sky and in dark mode, dark otherwise.
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { AppLauncher } from '@capacitor/app-launcher';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';

if (Capacitor.isNativePlatform()) {
  const here = location.origin;
  document.documentElement.classList.add('native', 'native-' + Capacitor.getPlatform());

  // ---- files and the share sheet ----
  const b64 = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(r.error); r.readAsDataURL(blob); });
  const safe = n => String(n || 'SolePro').replace(/[^\w .()-]/g, '').trim().slice(0, 80) || 'SolePro';
  async function shareFiles(files, title, text) {
    const uris = [];
    for (const f of files) {
      const w = await Filesystem.writeFile({ path: `share/${Date.now()}-${safe(f.name)}`, data: await b64(f), directory: Directory.Cache, recursive: true });
      uris.push(w.uri);
    }
    await Share.share({ title, text, files: uris, dialogTitle: title });
  }
  const shareNow = async (data = {}) => {
    try {
      if (data.files && data.files.length) await shareFiles(data.files, data.title, data.text);
      else await Share.share({ title: data.title, text: data.text, url: data.url, dialogTitle: data.title });
    } catch (e) {
      // the person closed the share sheet: the page treats that as AbortError, as a browser would
      if (/cancel/i.test(String((e && e.message) || e))) throw new DOMException('Share canceled', 'AbortError');
      throw e;
    }
  };
  try {
    Object.defineProperty(navigator, 'share', { configurable: true, value: shareNow });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: data => !!data && (!!(data.files && data.files.length) || !!data.url || !!data.text) });
  } catch (_) { /* keep the web view's own */ }

  // ---- links that open outside the app ----
  const outside = u => /^(tel|sms|mailto|maps|geo):/i.test(u.protocol) || (/^https?:$/.test(u.protocol) && u.origin !== here);
  async function openOut(href) {
    const u = new URL(href, location.href);
    if (u.protocol === 'blob:' || u.protocol === 'data:') {   // a file made on the phone: share it, there's no browser to open it in
      const b = await (await fetch(u.href)).blob(), ext = (b.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
      return shareNow({ files: [new File([b], `SolePro.${ext}`, { type: b.type })], title: 'SolePro' });
    }
    return AppLauncher.openUrl({ url: u.href });
  }
  document.addEventListener('click', e => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented) return;
    let u; try { u = new URL(a.getAttribute('href'), location.href); } catch (_) { return; }
    if (!outside(u) && u.protocol !== 'blob:' && !(u.protocol === 'data:' && a.target === '_blank')) return;
    e.preventDefault();
    openOut(u.href).catch(() => {});
  }, true);
  const open = window.open.bind(window);
  window.open = (url, target, features) => {
    try { const u = new URL(url, location.href); if (outside(u) || u.protocol === 'blob:') { openOut(u.href).catch(() => {}); return null; } } catch (_) {}
    return open(url, target, features);
  };

  // ---- Android's back button ----
  if (Capacitor.getPlatform() === 'android') {
    App.addListener('backButton', ({ canGoBack }) => {
      if (document.querySelector('#layer .sheet') || canGoBack) history.back();
      else App.minimizeApp();
    });
  }

  // ---- the status bar ----
  let last = '';
  const dark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
  const bars = () => {
    const want = document.querySelector('.signin') || dark() ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
    if (want !== last) { last = want; SystemBars.setStyle({ style: want }).catch(() => {}); }
  };
  let queued = false;
  const soon = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; bars(); }); } };
  addEventListener('DOMContentLoaded', () => {
    new MutationObserver(soon).observe(document.body, { childList: true, subtree: true });
    new MutationObserver(soon).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', soon);
    bars();
  });
}
