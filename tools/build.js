/* =====================================================================
   Build step for GitHub Pages (run by .github/workflows/publish.yml on every push, including
   every Save in /admin). Copies the site into _site/ and creates a real page at each clean address
   from js/urls.js, so links like these open directly and can be shared:

     /portfolio/  /team/ …                       homepage, landing on that section
     /category/realistic-character/              one category
     /portfolio/realistic-character/lehri/       one artwork, with its own title + preview image
     /breakdowns/  /breakdowns/orc-fanart/       breakdowns

   Run locally:  node tools/build.js   (then serve the _site folder)
   ===================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const URLS = require("../js/urls.js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "_site");
const SITE = "https://brothersinteractive.com";
// Never published: tooling, local notes, and the build output itself
const SKIP = new Set([".git", ".github", "_site", "tools", "node_modules", "HANDOFF.md", "DEPLOY.md", ".gitignore"]);

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const json = (f, fallback) => { try { return JSON.parse(read(f)); } catch (e) { return fallback; } };
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const abs = (u) => !u ? SITE + "/assets/img/brand/og-image.jpg" : /^https?:\/\//.test(u) ? u : SITE + (u.charAt(0) === "/" ? u : "/" + u.replace(/^(\.\.\/)+/, ""));
const short = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };

// ---- 1. copy the site --------------------------------------------------------------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const name of fs.readdirSync(ROOT)) {
  if (SKIP.has(name)) continue;
  fs.cpSync(path.join(ROOT, name), path.join(OUT, name), { recursive: true });
}

// ---- 1b. grid thumbnails -----------------------------------------------------------------
// Grids show WebP copies 960px wide (assets/img/thumbs/<folder>/<name>.webp, see imgAttrs() in
// js/script.js): sharp in the 3-column grid even on screens scaled up to ~167%. Images uploaded through
// /admin have none, and the older copies in the repo are only 640px, so make or remake them here; the
// originals (used by the viewer and the lens) are never touched. Needs the "sharp" package (installed by
// the GitHub workflow); without it the build still works and grids use the copies already in the repo.
const THUMB_W = 960;
async function makeThumbs() {
  let sharp;
  try { sharp = require("sharp"); } catch (e) { console.log("Thumbnails: sharp not installed, skipped (grids use the copies in the repo, or the full image for new uploads)."); return; }
  sharp.cache(false);   // sharp keeps files open in its cache, which on Windows blocks overwriting them
  let made = 0, remade = 0;
  for (const folder of ["portfolio", "games", "categories"]) {
    const src = path.join(OUT, "assets/img", folder), dst = path.join(OUT, "assets/img/thumbs", folder);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src)) {
      if (!/\.(webp|jpe?g|png)$/i.test(f)) continue;
      const from = path.join(src, f), out = path.join(dst, f.replace(/\.(webp|jpe?g|png)$/i, ".webp"));
      try {
        const exists = fs.existsSync(out), source = fs.readFileSync(from);   // read into memory: no open file handles
        if (exists) {
          // keep a copy that is already as wide as it can usefully be (960px, or the whole original)
          const [have, orig] = await Promise.all([sharp(fs.readFileSync(out)).metadata(), sharp(source).metadata()]);
          if (have.width >= Math.min(THUMB_W, orig.width)) continue;
        }
        const buf = await sharp(source).resize({ width: THUMB_W, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
        fs.writeFileSync(out, buf);
        exists ? remade++ : made++;
      } catch (e) { console.log("Thumbnail failed for " + folder + "/" + f + ": " + e.message); }
    }
  }
  console.log("Thumbnails (" + THUMB_W + "px): made " + made + " new, remade " + remade + " narrower ones.");
  // the homepage collage's own copies: 480px on the short side, enough for a 2x2 tile and for wide or tall crops
  const csrc = path.join(OUT, "assets/img/portfolio"), cdst = path.join(OUT, "assets/img/thumbs/collage");
  fs.mkdirSync(cdst, { recursive: true });
  let cmade = 0;
  const covers = new Set(PROJECTS.map((p) => path.basename(String(p.thumb || p.i || ""))));   // each piece's collage picture (else its main one)
  for (const f of fs.readdirSync(csrc)) {
    if (!covers.has(f)) continue;
    const out = path.join(cdst, f.replace(/\.(webp|jpe?g|png)$/i, ".webp"));
    if (fs.existsSync(out)) continue;
    try {
      const buf = await sharp(fs.readFileSync(path.join(csrc, f))).resize({ width: 480, height: 480, fit: "outside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
      fs.writeFileSync(out, buf); cmade++;
    } catch (e) { console.log("Collage thumbnail failed for " + f + ": " + e.message); }
  }
  console.log("Collage thumbnails (480px short side): made " + cmade + ".");
  // the dragged crops: that rectangle of the picture, 640px on the short side (sharp in a 2x2 tile)
  let crmade = 0;
  for (const p of PROJECTS) for (const [field, key, shape] of CROPS) {
    if (!p[key]) continue;
    const out = path.join(OUT, p[key]), from = path.join(csrc, path.basename(String(p.thumb || p.i)));
    if (fs.existsSync(out) || !fs.existsSync(from)) continue;
    try {
      const own = parseCrop(p[field]), img = sharp(fs.readFileSync(from)), m = await img.metadata();
      const buf = await img.extract(cropRect(own || parseCrop(p.crop), own ? "" : shape, m.width, m.height)).resize({ width: 640, height: 640, fit: "outside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      fs.writeFileSync(out, buf); crmade++;
    } catch (e) { console.log("Collage crop failed for " + p.t + ": " + e.message); }
  }
  console.log("Collage crops: made " + crmade + ".");
  // the strip of views (viewer and artwork page): tiny copies, 200px tall, for every portfolio picture
  const sdst = path.join(OUT, "assets/img/thumbs/strip");
  fs.mkdirSync(sdst, { recursive: true });
  let smade = 0;
  for (const f of fs.readdirSync(csrc)) {
    if (!/\.(webp|jpe?g|png)$/i.test(f)) continue;
    const out = path.join(sdst, f.replace(/\.(webp|jpe?g|png)$/i, ".webp"));
    if (fs.existsSync(out)) continue;
    try {
      const buf = await sharp(fs.readFileSync(path.join(csrc, f))).resize({ height: 200, withoutEnlargement: true }).webp({ quality: 74 }).toBuffer();
      fs.writeFileSync(out, buf); smade++;
    } catch (e) { console.log("Strip thumbnail failed for " + f + ": " + e.message); }
  }
  console.log("Strip thumbnails (200px tall): made " + smade + ".");
}

// ---- 1b. share pictures: LinkedIn and some chat apps do not show WebP previews, so each page's
//      og:image points at a 1200px JPG copy made here (only when sharp is available) ----------------
let HAS_SHARP = false; try { require.resolve("sharp"); HAS_SHARP = true; } catch (e) {}
const SHARE = new Map();   // site path of the original -> site path of its JPG copy
function shareImage(img) {
  if (!HAS_SHARP || !img || !/^\/?assets\/img\/.+\.(webp|png)$/i.test(img)) return img;
  const src = "/" + img.replace(/^\//, ""), jpg = "/assets/img/share/" + path.basename(src).replace(/\.(webp|png)$/i, ".jpg");
  SHARE.set(src, jpg);
  return jpg;
}
async function makeShareImages() {
  if (!SHARE.size) return;
  const sharp = require("sharp"); sharp.cache(false);
  fs.mkdirSync(path.join(OUT, "assets/img/share"), { recursive: true });
  let n = 0;
  for (const [src, jpg] of SHARE) {
    const from = path.join(OUT, src);
    if (!fs.existsSync(from)) continue;
    const buf = await sharp(fs.readFileSync(from)).flatten({ background: "#0b1020" }).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    fs.writeFileSync(path.join(OUT, jpg), buf); n++;
  }
  console.log("Share pictures (JPG for link previews): " + n);
}

// ---- 2. page writer ------------------------------------------------------------------
const TEMPLATES = { home: read("index.html"), category: read("category.html"), asset: read("asset.html"), breakdown: read("breakdown.html") };
const written = [];

/* Copies a template to <address>/index.html with: what this page shows (window.__BI_PAGE, read by
   js/script.js) and, when given, its own title / description / preview image / canonical address. */
function writePage(address, tpl, info, meta) {
  let html = TEMPLATES[tpl];
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
  if (meta) {
    html = html
      .replace(/<title>[^<]*<\/title>/, "<title>" + esc(meta.title) + "</title>")
      .replace(/^[ \t]*<meta (name="description"|property="og:(title|description|image|url)"|name="twitter:card")[^>]*>\r?\n/gm, "")
      .replace(/^[ \t]*<link rel="canonical"[^>]*>\r?\n/gm, "");
    const tags = [
      '<meta name="description" content="' + esc(meta.description) + '" />',
      '<meta property="og:title" content="' + esc(meta.title) + '" />',
      '<meta property="og:description" content="' + esc(meta.description) + '" />',
      '<meta property="og:image" content="' + esc(abs(shareImage(meta.image))) + '" />',
      '<meta property="og:url" content="' + SITE + address + '" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      '<link rel="canonical" href="' + SITE + address + '" />'
    ];
    html = html.replace(/(<\/title>)/, "$1" + nl + "  " + tags.join(nl + "  "));
  }
  html = html.replace(/(<base href="\/" \/>)/, "$1" + nl + "  <script>window.__BI_PAGE = " + JSON.stringify(info) + ";</script>");
  const dir = path.join(OUT, address);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
  written.push({ address, sitemap: !!meta });
}

// ---- 3. homepage sections: /portfolio/, /team/ … ------------------------------------
// A section ticked "Hide this section from the website" in /admin gets no page (its address then shows the
// 404 page, which takes visitors home), and is hidden with every link to it (see step 8).
const HIDDEN = (URLS.TEXT_SECTIONS || []).filter((id) => (json("data/sections/" + id + ".json", {}) || {}).hidden);
if (HIDDEN.length) console.log("Hidden sections: " + HIDDEN.join(", "));
for (const id of URLS.SECTIONS) if (id !== "home" && HIDDEN.indexOf(id) === -1) writePage("/" + id + "/", "home", { section: id });

// ---- 4. categories: /category/<slug>/ opens the homepage at the Portfolio collage with that filter on ---------
// Categories as edited in /admin (data/categories.json) replace the built-in list
URLS.setCategories(json("data/categories.json", {}).items);
// Portfolio pieces live one file each in data/pieces/ (one entry each in /admin); they are joined here, by
// Order then title, into the data/portfolio.json the site reads
const ALL_PIECES = fs.readdirSync(path.join(ROOT, "data/pieces")).filter((f) => f.endsWith(".json"))
  .map((f) => json("data/pieces/" + f, null)).filter((p) => p && p.t)
  .sort((a, b) => ((+a.order || 1000) - (+b.order || 1000)) || String(a.t).localeCompare(String(b.t)));
// "Collage crop" (x,y,w,h in % of the picture, drawn on /admin/focus.html): the collage copy is that rectangle,
// cut out in makeThumbs; its name carries the numbers, so a new crop always makes a new file
const parseCrop = (c) => { const n = String(c || "").split(",").map((v) => +v); return n.length === 4 && n.every((v) => isFinite(v)) && n[2] > 0 && n[3] > 0 ? n.map((v) => Math.max(0, Math.min(100, v))) : null; };
// The one crop (square tiles) -> p.ct. Wide (2x1) and tall (1x2) tiles get their own cut-out made from it
// (p.ctw / p.ctt, see cropRect), for pieces with that shape ticked. A cropWide / cropTall still in a file from
// before is used as it is.
const CROPS = [["crop", "ct", ""], ["cropWide", "ctw", "w"], ["cropTall", "ctt", "t"]];
for (const p of ALL_PIECES) {
  const src = String(p.thumb || p.i || ""), base = parseCrop(p.crop);
  if (!/^\/?assets\/img\/portfolio\//.test(src)) continue;
  for (const [field, key, shape] of CROPS) {
    const own = parseCrop(p[field]), c = own || (shape && base && ((shape === "w" && p.wide) || (shape === "t" && p.tall)) ? base : null);
    if (c) p[key] = "assets/img/thumbs/collage/" + path.basename(src).replace(/\.(webp|jpe?g|png)$/i, "") + "-crop-" + c.map((v) => Math.round(v * 10)).join("-") + (own || !shape ? "" : "-" + shape) + ".webp";
  }
}
// the cut-out in pixels: the crop itself, or for a wide / tall tile the same centre stretched to 2:1 / 1:2
function cropRect(c, shape, W, H) {
  let w = W * c[2] / 100, h = H * c[3] / 100;
  const cx = W * (c[0] + c[2] / 2) / 100, cy = H * (c[1] + c[3] / 2) / 100;
  if (shape === "w") { w = 2 * h; if (w > W) { w = W; h = W / 2; } }
  if (shape === "t") { h = 2 * w; if (h > H) { h = H; w = H / 2; } }
  const left = Math.round(Math.max(0, Math.min(W - w, cx - w / 2))), top = Math.round(Math.max(0, Math.min(H - h, cy - h / 2)));
  return { left, top, width: Math.max(1, Math.min(W - left, Math.round(w))), height: Math.max(1, Math.min(H - top, Math.round(h))) };
}
fs.writeFileSync(path.join(OUT, "data/portfolio.json"), JSON.stringify({ items: ALL_PIECES }, null, 2) + "\n");
console.log("Portfolio: " + ALL_PIECES.length + " pieces joined from data/pieces/");
const PROJECTS = ALL_PIECES.filter((p) => p && p.id && !p.hidden); // "Hide from the website" in /admin
const inCat = (p, key) => p.c === key || (Array.isArray(p.cats) && p.cats.indexOf(key) !== -1);
for (const b of URLS.BROWSE_CATS) {
  const pieces = PROJECTS.filter((p) => b.match.some((k) => inCat(p, k)));
  writePage(URLS.categoryPath(b.slug), "home", { section: "portfolio", cat: b.slug }, {
    title: b.label + " | Brothers Interactive",
    description: b.label + " from the Brothers Interactive portfolio: game-ready 3D work by a studio specialized in characters for games.",
    image: b.tile || (pieces[0] && pieces[0].i)   // the tile picture chosen in /admin, else the first piece
  });
  // /portfolio/<slug>/ (someone trimming an artwork link) leads to the same category
  writePage("/portfolio/" + b.slug + "/", "home", { section: "portfolio", cat: b.slug });
}

// ---- 5. artworks: /portfolio/<category>/<name>/ -------------------------------------
const CAT_LABEL = {};
URLS.BROWSE_CATS.forEach((b) => b.match.forEach((k) => { CAT_LABEL[k] = b.label; }));
const PIECE_PATH = URLS.piecePaths(PROJECTS);
for (const p of PROJECTS) {
  writePage(PIECE_PATH[p.id], "asset", { asset: p.id }, {
    title: p.t + " | Brothers Interactive",
    description: short(p.desc, 180) || (p.t + " (" + (CAT_LABEL[p.c] || "3D artwork") + ") by Brothers Interactive, 3D characters for games."),
    image: p.i
  });
}

// ---- 6. breakdowns: /breakdowns/ and /breakdowns/<id>/ -----------------------------
const BREAKDOWNS = HIDDEN.indexOf("breakdown") !== -1 ? [] : (json("data/breakdowns.json", {}).items || []).filter((b) => b && b.t && b.id);
if (HIDDEN.indexOf("breakdown") === -1) writePage(URLS.breakdownPath(), "breakdown", {}, {
  title: "Production Breakdowns | Brothers Interactive",
  description: "Sculpt to final, in detail: production breakdowns of game characters from Brothers Interactive.",
  image: BREAKDOWNS[0] && (BREAKDOWNS[0].cover || BREAKDOWNS[0].after)
});
for (const b of BREAKDOWNS) {
  writePage(URLS.breakdownPath(b.id), "breakdown", { bd: b.id }, {
    title: b.t + " Breakdown | Brothers Interactive",
    description: short(b.sub || b.desc, 180) || (b.t + " production breakdown by Brothers Interactive."),
    image: b.cover || b.after || (b.gallery && b.gallery[0])
  });
}

// ---- 6a. old brothersinteractive.com addresses ---------------------------------------------
/* Until Oct 2026 brothersinteractive.com was an ArtStation Pro website. Its addresses (in Google and in
   links people shared) get a small page that sends visitors to the same thing here. Piece ids in
   data/pieces came from its /projects/<id> addresses; albums and pages were matched by hand (5 Oct 2026). */
function writeRedirect(address, to) {
  const url = SITE + to;
  const dir = path.join(OUT, address);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8" />\n' +
    '<title>Brothers Interactive</title>\n<meta name="robots" content="noindex" />\n<link rel="canonical" href="' + url + '" />\n' +
    '<meta http-equiv="refresh" content="0; url=' + to + '" />\n<script>location.replace(' + JSON.stringify(to) + ' + location.hash);</script>\n' +
    '</head><body><p>This page has moved: <a href="' + to + '">' + url + '</a></p></body></html>\n');
}
const OLD_ALBUMS = {
  605137: "/portfolio/", 14601427: "realistic-character", 14601428: "realistic-creature", 15044198: "realistic-hair",
  14601429: "stylized-character", 15073267: "stylized-creature", 15019467: "stylized-character" /* Hand-Paint */,
  15019469: "stylized-character" /* Anime */, 15044192: "props", 15117469: "midnight-walk", 15044251: "lost-in-random"
};
const OLD_PAGES = { "/pages/about/": "/about/", "/pages/services/": "/services/", "/pages/projects/": "/games/",
  "/pages/deck/": "/", "/resume/": "/about/", "/projects/": "/portfolio/", "/albums/": "/portfolio/" };
const live = (to) => to === "/" || fs.existsSync(path.join(OUT, to, "index.html")) ? to : "/";   // a hidden section -> home
let oldCount = 0;
for (const p of ALL_PIECES) if (p.id) { writeRedirect("/projects/" + p.id + "/", PIECE_PATH[p.id] || "/portfolio/"); oldCount++; }
for (const id in OLD_ALBUMS) {
  const to = OLD_ALBUMS[id].charAt(0) === "/" ? OLD_ALBUMS[id] : URLS.categoryPath(OLD_ALBUMS[id]);
  writeRedirect("/albums/" + id + "/", live(to)); oldCount++;
}
for (const from in OLD_PAGES) { writeRedirect(from, live(OLD_PAGES[from])); oldCount++; }
console.log("Old .com addresses: " + oldCount + " redirect pages.");

// ---- 6b. admin dropdowns ------------------------------------------------------------------
/* The Portfolio form's Category, "Also show in" and Project dropdowns are filled from the Categories and
   Projects lists (and the Games list) every build, so something added there appears in the form about two
   minutes after saving. In admin/config.yml the option lines sit between "# @categories" / "# @projects"
   and "# @end" marker comments; only the published copy in _site is rewritten. */
(function fillAdminDropdowns() {
  const cfgPath = path.join(OUT, "admin/config.yml");
  if (!fs.existsSync(cfgPath)) return;
  const q = (v) => JSON.stringify(String(v));
  const catLines = URLS.BROWSE_CATS.map((b) => "{ label: " + q(b.label) + ", value: " + q(b.match[0]) + " }");
  const projectNames = [];
  (json("data/projects.json", {}).items || []).concat((json("data/games.json", {}).items || []).map((g) => ({ name: g && g.t })))
    .forEach((p) => { const n = p && String(p.name || "").trim(); if (n && projectNames.indexOf(n) === -1) projectNames.push(n); });
  const projLines = projectNames.map(q);
  // Rebuild the option lines between each "# @categories" / "# @projects" marker and its "# @end"
  const src = fs.readFileSync(cfgPath, "utf8").split(/\r?\n/), out = [];
  let n = 0;
  for (let i = 0; i < src.length; i++) {
    const m = src[i].match(/^(\s*)# @(categories|projects)\b/);
    if (!m) { out.push(src[i]); continue; }
    const indent = m[1], kind = m[2];
    let j = i + 1;
    while (j < src.length && !/^\s*# @end\b/.test(src[j])) j++;
    out.push(indent + "# @" + kind + " (filled in by tools/build.js)");
    (kind === "categories" ? catLines : projLines).forEach((l) => out.push(indent + "- " + l));
    out.push(indent + "# @end");
    i = j; n++;
  }
  const cfg = out.join("\n");
  fs.writeFileSync(cfgPath, cfg);
  console.log("Admin dropdowns: " + n + " filled (" + catLines.length + " categories, " + projLines.length + " projects).");
})();

// ---- 7. sitemap ---------------------------------------------------------------------------
const urls = ["/", "/contact", "/getting-started"].concat(written.filter((w) => w.sitemap).map((w) => w.address));
fs.writeFileSync(path.join(OUT, "sitemap.xml"),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => "  <url><loc>" + SITE + u + "</loc></url>").join("\n") + "\n</urlset>\n");

console.log("Built _site: " + written.length + " pages (" + PROJECTS.length + " artworks, " + URLS.BROWSE_CATS.length +
  " categories, " + BREAKDOWNS.length + " breakdowns), sitemap with " + urls.length + " addresses.");

// ---- 8. hidden sections: one style block in every page hides the section and every link to it -------
if (HIDDEN.length) {
  const sel = [];
  for (const id of HIDDEN) {
    sel.push("#" + id, 'a[href="#' + id + '"]', 'a[href="/' + id + '/"]', 'li:has(> a[href="#' + id + '"])', 'li:has(> a[href="/' + id + '/"])');
    if (id === "breakdown") sel.push('a[href^="/breakdowns"]');
  }
  const css = "<style>/* hidden in /admin */" + sel.join(",") + "{display:none!important}</style>";
  (function walk(dir) {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) { if (f !== "admin") walk(p); continue; }
      if (!f.endsWith(".html")) continue;
      const html = fs.readFileSync(p, "utf8");
      if (html.includes("</head>")) fs.writeFileSync(p, html.replace("</head>", css + "</head>"));
    }
  })(OUT);
}

// ---- Blog thumbnails: assets/img/thumbs/blog/<video id>.webp, 640x360 -------------------------------
// From the post's own "Thumbnail" in /admin when set, otherwise YouTube's picture with its black bars trimmed.
// The site then never waits on YouTube for these; if one cannot be made, the card falls back to YouTube's.
async function makeBlogThumbs() {
  let sharp; try { sharp = require("sharp"); sharp.cache(false); } catch (e) { return; }
  const ytId = (v) => { const m = String(v || "").match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : String(v || "").trim(); };
  const dst = path.join(OUT, "assets/img/thumbs/blog");
  fs.mkdirSync(dst, { recursive: true });
  let made = 0, failed = 0;
  for (const p of (json("data/posts.json", {}).items || [])) {
    const id = ytId(p.yt); if (!/^[\w-]{11}$/.test(id)) continue;
    const out = path.join(dst, id + ".webp");
    try {
      let buf, trim = false;
      if (p.thumb && fs.existsSync(path.join(ROOT, p.thumb.replace(/^\//, "")))) buf = fs.readFileSync(path.join(ROOT, p.thumb.replace(/^\//, "")));
      else {
        if (fs.existsSync(out)) continue;
        let r = null;
        for (let t = 0; t < 3 && !(r && r.ok); t++) { try { r = await fetch("https://img.youtube.com/vi/" + id + "/hqdefault.jpg"); } catch (e) { if (t === 2) throw e; } }   // up to 3 tries: a network hiccup is common
        if (!r || !r.ok) throw new Error("YouTube said " + r.status);
        buf = Buffer.from(await r.arrayBuffer()); trim = true;
      }
      let img = sharp(buf);
      if (trim) { const m = await img.metadata(), h = Math.round(m.width * 9 / 16); img = img.extract({ left: 0, top: Math.round((m.height - h) / 2), width: m.width, height: h }); }   // 4:3 with bars -> 16:9
      fs.writeFileSync(out, await img.resize({ width: 640, height: 360, fit: "cover", withoutEnlargement: !trim }).webp({ quality: 80 }).toBuffer());
      made++;
    } catch (e) { failed++; console.log("Blog thumbnail failed for " + (p.t || id) + ": " + e.message); }
  }
  console.log("Blog thumbnails: made " + made + (failed ? ", " + failed + " failed (those cards use YouTube's picture)" : "") + ".");
}

makeThumbs().then(makeShareImages).then(makeBlogThumbs).catch((e) => { console.error(e); process.exit(1); });
