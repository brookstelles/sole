// The store screenshots' look (Nov 6, 2026, Brooks: "sexy pics"): each screen inside a real-looking device (an iPhone
// with its Dynamic Island and status bar, an iPad, an Android phone with its camera hole), on the app's own gradient
// with a soft glow behind the device and a large faint motif, under a big two-line headline and the app's name as an
// eyebrow. The first screen is the hero (the icon, the name and the first caption, the device lower down); the third
// tilts two devices together (the screen before it behind). The same file is in Pasalo, SolePro and ROBUSTO; each
// passes its own theme. framePage() returns a whole HTML page sized to the store's image (CSS px; the caller sets dpr).
//
// theme: { name, nameHtml?, head (font <link>/<style>), display (font-family), displayWeight, body (font-family),
//          bg: [top, bottom], glow, accent, ink, motif: "diamond" | "sun" | "rings", icon (PNG base64) }

const b64 = buf => (typeof buf === "string" ? buf : buf.toString("base64"));

function motifHtml(t, w, h) {
  const c = t.accent;
  if (t.motif === "sun") {
    const r = w * 0.62;
    const rays = Array.from({ length: 18 }, (_, i) => `<i style="transform:rotate(${i * 10}deg)"></i>`).join("");
    return `<div class="motif sun" style="width:${r * 2}px;height:${r * 2}px;left:${w / 2 - r}px;top:${-r * 1.05}px">${rays}</div>
      <style>.sun{position:absolute;border-radius:50%;border:${w * 0.004}px solid ${c};opacity:.16}
      .sun i{position:absolute;left:50%;top:50%;width:${r * 1.5}px;height:${w * 0.003}px;margin-left:${-r * 0.75}px;background:linear-gradient(90deg,transparent,${c} 30%,transparent 50%,${c} 70%,transparent)}</style>`;
  }
  if (t.motif === "rings") {
    return [0.9, 0.7, 0.5].map((f, i) => `<div style="position:absolute;width:${w * f * 1.6}px;height:${w * f * 1.6}px;left:${w * (1 - f * 0.8) - w * 0.3}px;top:${-w * f * 0.45}px;border-radius:50%;border:${w * 0.003}px solid ${c};opacity:${0.1 + i * 0.04}"></div>`).join("");
  }
  const s = w * 0.95;
  return `<div style="position:absolute;width:${s}px;height:${s}px;left:${(w - s) / 2}px;top:${h * 0.5 - s / 2}px;border:${w * 0.005}px solid ${c};transform:rotate(45deg);opacity:.14"></div>
    <div style="position:absolute;width:${s * 1.45}px;height:${s * 1.45}px;left:${(w - s * 1.45) / 2}px;top:${h * 0.55 - s * 0.725}px;border:${w * 0.003}px solid ${c};transform:rotate(45deg);opacity:.07"></div>`;
}

// One device with its screen. sw: the screen's width in CSS px of the store image.
function deviceHtml(img, d, dev, sw, cls = "") {
  const tablet = dev === "ipad", android = dev === "android";
  const bez = sw * (tablet ? 0.026 : 0.034);
  const sb = sw * (tablet ? 0.03 : android ? 0.085 : 0.128); // the status bar above the app
  const ih = sw * d.raw.h / d.raw.w;
  const rOut = sw * (tablet ? 0.06 : android ? 0.11 : 0.165), rIn = rOut - bez;
  const fs = sb * (tablet ? 0.62 : android ? 0.42 : 0.36);
  const cam = tablet ? "" : android
    ? `<i class="hole" style="width:${sb * 0.42}px;height:${sb * 0.42}px;top:${sb * 0.29}px"></i>`
    : `<i class="island" style="width:${sw * 0.3}px;height:${sb * 0.58}px;top:${sb * 0.2}px;border-radius:${sb}px"></i>`;
  const bars = `<span class="sig" style="height:${fs * 0.75}px">${[0.35, 0.55, 0.75, 1].map(f => `<b style="height:${f * 100}%"></b>`).join("")}</span>`;
  const batt = `<span class="bat" style="width:${fs * 1.7}px;height:${fs * 0.82}px;border-radius:${fs * 0.24}px"><b></b></span>`;
  const side = tablet ? "" : `<i class="btn" style="left:${-bez * 0.35}px;top:${sw * 0.42}px;height:${sw * 0.2}px"></i>
    <i class="btn" style="left:${-bez * 0.35}px;top:${sw * 0.67}px;height:${sw * 0.2}px"></i>
    <i class="btn" style="right:${-bez * 0.35}px;top:${sw * 0.55}px;height:${sw * 0.3}px"></i>`;
  return `<div class="dev ${cls}" style="padding:${bez}px;border-radius:${rOut}px;width:${sw + bez * 2}px">${side}
    <div class="scr" style="border-radius:${rIn}px">
      <div class="sb" style="height:${sb}px;font-size:${fs}px;padding:0 ${sw * (tablet ? 0.03 : 0.085)}px ${tablet ? 0 : sb * 0.06}px">
        <span class="t">9:41</span>${cam}<span class="r">${bars}${batt}</span></div>
      <img src="data:image/png;base64,${b64(img)}" style="height:${ih}px">
    </div></div>`;
}

export function framePage({ img, back, caption, i, d, dev, theme: t }) {
  const { w, h } = d.out;
  const tablet = dev === "ipad";
  const hero = i === 0, duo = i === 2 && back;
  const capSize = w * (tablet ? 0.056 : 0.083);
  const eyebrow = w * (tablet ? 0.016 : 0.028);
  let sw = w * (tablet ? 0.74 : 0.76);
  let top = h * (tablet ? 0.215 : 0.25);
  if (hero) top = h * (tablet ? 0.34 : 0.37);
  if (duo) sw = w * (tablet ? 0.6 : 0.64);
  const head = hero
    ? `<div class="hero"><img class="icon" src="data:image/png;base64,${b64(t.icon)}" style="width:${w * (tablet ? 0.11 : 0.17)}px;border-radius:${w * (tablet ? 0.025 : 0.038)}px">
        <div class="nm" style="font-size:${w * (tablet ? 0.07 : 0.115)}px">${t.nameHtml || t.name}</div>
        <div class="tag" style="font-size:${w * (tablet ? 0.028 : 0.048)}px">${caption}</div></div>`
    : `<div class="cap"><div class="eb" style="font-size:${eyebrow}px"><i style="width:${eyebrow * 0.55}px;height:${eyebrow * 0.55}px"></i>${t.name}</div>
        <div class="hl" style="font-size:${capSize}px">${caption}</div></div>`;
  const devices = duo
    ? `<div class="pos back" style="left:${w * 0.36}px;top:${top - h * 0.03}px">${deviceHtml(back, d, dev, sw * 0.92)}</div>
       <div class="pos front" style="left:${w * 0.04}px;top:${top + h * 0.05}px">${deviceHtml(img, d, dev, sw)}</div>`
    : `<div class="pos" style="left:${(w - sw) / 2 - sw * (tablet ? 0.026 : 0.034)}px;top:${top}px">${deviceHtml(img, d, dev, sw)}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8">${t.head}<style>
    html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
    body{position:relative;background:radial-gradient(70% 45% at 50% ${hero ? 78 : 66}%, ${t.glow}, transparent 70%),linear-gradient(172deg, ${t.bg[0]} 0%, ${t.bg[1]} 100%)}
    .cap{position:absolute;left:${w * 0.08}px;right:${w * 0.08}px;top:${h * (tablet ? 0.045 : 0.05)}px;height:${h * (tablet ? 0.15 : 0.18)}px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
    .eb{font:700 1em/1 ${t.body};letter-spacing:.3em;text-transform:uppercase;color:${t.accent};display:flex;align-items:center;gap:.7em;margin-bottom:.9em;padding-left:.3em}
    .eb i{display:block;border:2px solid ${t.accent};transform:rotate(45deg)}
    .hl{font-family:${t.display};font-weight:${t.displayWeight};line-height:1.06;letter-spacing:-.015em;color:${t.ink};text-wrap:balance}
    .hero{position:absolute;left:${w * 0.08}px;right:${w * 0.08}px;top:${h * (tablet ? 0.045 : 0.05)}px;display:flex;flex-direction:column;align-items:center;text-align:center}
    .icon{display:block;box-shadow:0 ${w * 0.02}px ${w * 0.06}px rgba(0,0,0,.45),0 0 0 ${Math.max(1, w * 0.0025)}px ${t.accent}66,0 0 ${w * 0.1}px ${t.glow}}
    .nm{font-family:${t.display};font-weight:${t.displayWeight};line-height:1;color:${t.ink};margin-top:.28em;letter-spacing:-.01em}
    .nm span{color:${t.accent}}
    .tag{font:500 1em/1.25 ${t.body};color:${t.accent};margin-top:.55em;max-width:90%;text-wrap:balance}
    .pos{position:absolute}
    .back{transform:rotate(6deg);transform-origin:top left;filter:brightness(.78) saturate(.9)}
    .front{transform:rotate(-4deg);transform-origin:top left}
    .dev{position:relative;background:linear-gradient(145deg,#2a2c31,#0c0d0f 40%,#16171a);
      box-shadow:0 0 0 ${w * 0.003}px #4a4d53,0 0 0 ${w * 0.006}px #0c0d0f,0 ${w * 0.05}px ${w * 0.12}px rgba(0,0,0,.55),0 0 ${w * 0.25}px ${t.glow}}
    .btn{position:absolute;width:${w * 0.006}px;background:#2b2d32;border-radius:2px}
    .scr{overflow:hidden;background:var(--sbg,#fff);position:relative}
    .scr img{display:block;width:100%}
    .sb{display:flex;align-items:center;justify-content:space-between;background:var(--sbg,#fff);color:var(--sfg,#000);font-family:-apple-system,'SF Pro Text',${t.body};font-weight:600;position:relative;box-sizing:border-box}
    .island,.hole{position:absolute;left:50%;transform:translateX(-50%);background:#000;display:block}
    .hole{border-radius:50%}
    .r{display:flex;align-items:center;gap:.35em}
    .sig{display:flex;align-items:flex-end;gap:.12em}.sig b{display:block;width:.2em;background:currentColor;border-radius:1px}
    .bat{position:relative;border:1.5px solid currentColor;box-sizing:border-box;opacity:.9}.bat b{position:absolute;inset:1.5px;right:20%;background:currentColor;border-radius:1px}
  </style></head><body>${motifHtml(t, w, h)}${head}${devices}
  <script>
    // The status bar takes the color of the top of the app's own screen, with light or dark text to match.
    for (const scr of document.querySelectorAll('.scr')) {
      const im = scr.querySelector('img'), c = document.createElement('canvas');
      const go = () => { c.width = 8; c.height = 8; const x = c.getContext('2d'); x.drawImage(im, 0, 0, im.naturalWidth, 24, 0, 0, 8, 8);
        const [r, g, b] = x.getImageData(4, 4, 1, 1).data; scr.style.setProperty('--sbg', 'rgb(' + r + ',' + g + ',' + b + ')');
        scr.style.setProperty('--sfg', (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#000' : '#fff'); };
      im.complete ? go() : im.addEventListener('load', go);
    }
  </script></body></html>`;
}
