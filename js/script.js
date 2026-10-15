/* =====================================================================
   Brothers Interactive — site scripts
   Portfolio data, filtering, lightbox, games trailers, blog, nav, forms
   ===================================================================== */

function siteMain() {
  "use strict";

  /* ------------------------------------------------------------------
     DATA lives in data.js (window.BI). Edit content there, not here.
     ------------------------------------------------------------------ */
  var BI = window.BI || {};
  var CFG = BI.CONFIG || {};
  var CAT = {
    "modular-chr-skins": "Modular CHR Skins",
    "realistic-humans": "Realistic CHR",
    "realistic-creatures": "Realistic Creature",
    "realistic-hairs": "Realistic Hair Card",
    "stylized-human": "Stylized CHR",
    "stylized-creature": "Stylized Creature",
    "props": "Props",
    "weapons": "Realistic Weapons",
    "mid-night-walk": "Game - Midnight Walk",
    "lost-in-random": "Game - Lost in Random"
  };
  /* "Browse by style" tiles on the homepage/category pages. Each groups one or
     more of the CAT keys above (a piece's own p.c is untouched, so its label
     everywhere else — lightbox, asset page, work-card badge — is unaffected).
     A slug with an empty match list has no tagged work yet and renders as a
     non-clickable "Coming soon" tile instead of linking to an empty page. */
  // Category list and every page address live in js/urls.js (shared with the GitHub build step).
  var URLS = window.BIURL;
  var BROWSE_CATS = URLS.BROWSE_CATS;
  // What the build step baked into this page: { section } / { cat } / { asset } / { bd } / { section, game } (empty on plain pages)
  var PAGE_INFO = window.__BI_PAGE || {};
  // Show a clean address without reloading (old ?id= / ?cat= / #section links get tidied this way too)
  function setAddress(path) {
    if (path && location.pathname + location.search !== path) history.replaceState(history.state, "", path);
  }
  /* A piece belongs to its main category (p.c) plus any extra ones listed in
     p.cats ("Also show in" in /admin), so one upload can appear in several
     category pages. p.c alone still drives the piece's label elsewhere. */
  function inCat(p, key) { return p.c === key || (Array.isArray(p.cats) && p.cats.indexOf(key) !== -1); }
  function inAnyCat(p, keys) { for (var k = 0; k < keys.length; k++) { if (inCat(p, keys[k])) return true; } return false; }

  /* Grid images: a 640px WebP thumbnail (assets/img/thumbs/<folder>/<name>.webp) with the
     full image offered for high-res screens via srcset, so grids don't download 1000px+
     files to show them at ~400-600px. A missing thumbnail (e.g. a brand-new /admin upload)
     falls back to the full image automatically. Returns the src/srcset/sizes attributes. */
  var THUMB_RE = /assets\/img\/(portfolio|games|categories)\/([^\/?#]+)\.(webp|jpe?g|png)$/i;
  /* Small copies made by tools/build.js: the strip of views uses a tiny one (200px tall), and switching views
     shows the 960px grid copy at once while the full picture downloads. Both fall back to the original. */
  function stripThumb(u) { var m = THUMB_RE.exec(u || ""); return m && m[1] === "portfolio" ? "assets/img/thumbs/strip/" + m[2] + ".webp" : u; }
  function midThumb(u) { var m = THUMB_RE.exec(u || ""); return m ? "assets/img/thumbs/" + m[1] + "/" + m[2] + ".webp" : u; }
  // Show a picture straight away from its small copy, then swap in the full file once it has arrived
  function swapToFull(img, full, isCurrent) {
    var mid = midThumb(full);
    img.setAttribute("fetchpriority", "high");
    if (mid === full) { img.src = full; return; }
    img.classList.add("is-soft");
    img.src = mid;
    var pre = new Image();
    pre.onload = pre.onerror = function () { if (!isCurrent || isCurrent()) { img.src = full; img.classList.remove("is-soft"); } };
    pre.src = full;
  }
  // The strip's tiny pictures start loading only once the main picture is in, so it never waits behind them
  function loadStripAfter(main, box) {
    var go = function () { $$("img[data-src]", box).forEach(function (im) { im.src = im.getAttribute("data-src"); im.removeAttribute("data-src"); }); };
    if (main.complete && main.naturalWidth) go();
    else { main.addEventListener("load", go, { once: true }); main.addEventListener("error", go, { once: true }); setTimeout(go, 2500); }
  }
  function stripImg(u, alt) {
    return '<img data-src="' + esc(stripThumb(u)) + '" alt="' + esc(alt || "") + '" decoding="async" onerror="this.onerror=null;this.src=\'' + esc(midThumb(u)) + '\'" />';
  }
  function imgAttrs(u, sizes) {
    u = u || "";
    if (!THUMB_RE.test(u)) return 'src="' + u + '"';
    var t = u.replace(THUMB_RE, "assets/img/thumbs/$1/$2.webp");
    // Grid copies are 960px (tools/build.js), sharp in a 3-column grid up to about 167% screen scaling;
    // only bigger needs fall through to the full upload
    return 'src="' + t + '" srcset="' + t + ' 960w, ' + u + ' 2400w" sizes="' + (sizes || "33vw") + '" data-full="' + u + '"';
  }
  /* Magnifying lens: over a portfolio picture (mouse only, not touch) the cursor becomes a round
     lens showing that spot at 200%, taken from the full-size image. Up to 512px across, smaller on
     smaller pictures. One lens element is shared by every picture that has attachLens(). */
  var lensEl = null, lensImg = null;
  // Lens size picked with the two lens buttons in the viewer: "small" = up to 512px, "big" = up to 750px
  // (both never wider than the picture's shorter side). Remembered per visitor.
  var lensMode = "small";   // "small", "big" or "off" (the crossed-out lens button: no lens)
  try { var savedLens = localStorage.getItem("bi-lens"); if (savedLens === "big" || savedLens === "off") lensMode = savedLens; } catch (e) {}
  /* Zoom inside the lens, picked with the three zoom buttons (top to bottom): "native" = actual pixels, the
     uploaded file at its true 1:1 size, so the lens shows all the real detail there is and is never stretched,
     at least 1.5x so it still magnifies on smaller files; "2" = 2X and "3" = 3X the picture as shown on
     screen. Every visit starts at 1:1 (Arun: 1:1 is the default, so an earlier 2X/3X choice is not restored). */
  var lensZoom = "native";
  function lensFactor(img, shownW) { return lensZoom === "native" ? Math.max(1.5, img.naturalWidth / shownW) : +lensZoom; }
  /* At 2X and 3X the picture inside the lens is sharpened slightly (Arun chose "medium-low" after testing
     three levels): a 3x3 sharpen kernel, centre 1+4a and neighbours -a with a = 0.3, as an SVG filter on
     the lens picture only, never on its ring or handle. 1:1 shows the real pixels untouched. */
  var LENS_SHARPEN = 0.3;
  function sharpenDefs() {
    if (document.getElementById("biSharpDefs")) return;
    var c = (1 + 4 * LENS_SHARPEN).toFixed(2), n = (-LENS_SHARPEN).toFixed(2);
    var svg = document.createElement("div");
    svg.id = "biSharpDefs"; svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    svg.innerHTML = '<svg width="0" height="0"><defs><filter id="biSharp" color-interpolation-filters="sRGB">' +
      '<feConvolveMatrix order="3" preserveAlpha="true" divisor="1" kernelMatrix="0 ' + n + ' 0 ' + n + ' ' + c + ' ' + n + ' 0 ' + n + ' 0"/></filter></defs></svg>';
    document.body.appendChild(svg);
  }
  var lensPic = null;   // the picture inside the lens (the ring and handle stay on lensEl)
  function hideLens() {
    if (lensEl) lensEl.classList.remove("on");
    if (lensImg) lensImg.classList.remove("lens-active");
    document.body.classList.remove("lens-on");   // brings the paintbrush cursor back
    lensImg = null;
  }
  /* Mouse: the lens follows the pointer over the picture. Touch: press and hold on the picture (about a
     quarter second, so normal swipes still scroll), then drag; the lens sits above the finger so the
     finger never covers it, and it goes away when the finger lifts. lensMode "off" = no lens at all. */
  function attachLens(img, canShow) {
    if (!img) return;
    if (!lensEl) {
      lensEl = document.createElement("div");
      lensEl.className = "zoom-lens"; lensEl.setAttribute("aria-hidden", "true");
      lensPic = document.createElement("div");
      lensPic.className = "zoom-lens-pic";
      lensEl.appendChild(lensPic);
      document.body.appendChild(lensEl);
      sharpenDefs();
    }
    // Draw the lens for the point (cx, cy) on screen; touch = true lifts the lens above the finger
    function showAt(cx, cy, touch) {
      if (lensMode === "off" || (canShow && !canShow()) || !img.naturalWidth) { hideLens(); return false; }
      // The visible picture inside the element: object-fit: contain leaves empty bands around it, placed
      // by object-position (the viewer sits pictures on the bottom edge, so read it, don't assume centre)
      var r = img.getBoundingClientRect();
      var ratio = img.naturalWidth / img.naturalHeight, w = r.width, h = w / ratio;
      if (h > r.height) { h = r.height; w = h * ratio; }
      var pos = (getComputedStyle(img).objectPosition || "50% 50%").split(" ").map(function (v) { return /%$/.test(v) ? parseFloat(v) / 100 : 0.5; });
      var x = cx - (r.left + (r.width - w) * pos[0]), y = cy - (r.top + (r.height - h) * (pos[1] == null ? 0.5 : pos[1]));
      if (x < 0 || y < 0 || x > w || y > h) { hideLens(); return false; }
      var size = Math.round(Math.max(touch ? 140 : 160, lensMode === "big" ? Math.min(750, Math.min(w, h)) : Math.min(512, Math.min(w, h) * 0.7)));
      lensEl.style.setProperty("--r", (size / 2) + "px");   // the handle starts at the rim
      var src = img.currentSrc || img.src;
      if (lensEl.dataset.src !== src) { lensPic.style.backgroundImage = 'url("' + src.replace(/"/g, "%22") + '")'; lensEl.dataset.src = src; }
      lensEl.style.width = lensEl.style.height = size + "px";
      var z = lensFactor(img, w);
      lensPic.style.filter = lensZoom === "native" ? "" : "url(#biSharp)";
      lensPic.style.backgroundSize = (w * z) + "px " + (h * z) + "px";
      lensPic.style.backgroundPosition = (size / 2 - x * z) + "px " + (size / 2 - y * z) + "px";
      var lx = cx - size / 2, ly = touch ? cy - size - 36 : cy - size / 2;
      if (touch) {   // keep it on screen: above the finger, or below it near the top edge
        lx = Math.max(6, Math.min(window.innerWidth - size - 6, lx));
        if (ly < 6) ly = cy + 36;
      }
      lensEl.style.transform = "translate(" + lx + "px, " + ly + "px)";
      lensEl.classList.add("on");
      document.body.classList.add("lens-on");   // hide the paintbrush cursor: nothing in the middle of the lens
      if (lensImg !== img) { if (lensImg) lensImg.classList.remove("lens-active"); lensImg = img; img.classList.add("lens-active"); }
      return true;
    }
    img.addEventListener("pointermove", function (e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      showAt(e.clientX, e.clientY, false);
    });
    img.addEventListener("pointerleave", function (e) { if (!e.pointerType || e.pointerType === "mouse") hideLens(); });

    // Touch: hold, then drag
    var holdTimer = 0, holding = false, startX = 0, startY = 0;
    img.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1 || lensMode === "off") return;
      var t = e.touches[0]; startX = t.clientX; startY = t.clientY;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () { holding = showAt(startX, startY, true); }, 230);
    }, { passive: true });
    img.addEventListener("touchmove", function (e) {
      var t = e.touches[0];
      if (holding) { e.preventDefault(); showAt(t.clientX, t.clientY, true); return; }   // lens on: no scrolling
      if (Math.abs(t.clientX - startX) + Math.abs(t.clientY - startY) > 10) clearTimeout(holdTimer);   // a swipe
    }, { passive: false });
    function endTouch() { clearTimeout(holdTimer); if (holding) { holding = false; hideLens(); } }
    img.addEventListener("touchend", endTouch);
    img.addEventListener("touchcancel", endTouch);
    img.addEventListener("contextmenu", function (e) { if (holding) e.preventDefault(); });   // no "save image" menu mid-lens
  }
  window.addEventListener("scroll", function () { hideLens(); }, { passive: true });

  /* The lens buttons, shared by the viewer and the artwork page: zoom 1:1 / 2X / 3X, and
     lens normal (small magnifier) / bigger (big magnifier) / none (crossed-out circle). The chosen one in
     each group is lit up, and the choice is remembered per visitor. */
  var LENS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="M15 15l5.5 5.5"/></svg>';
  var NO_LENS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/></svg>';
  function lensBtn(cls, attr, label, icon) {
    return '<button type="button" class="lb-lens-btn ' + cls + '" ' + attr + ' aria-label="' + label + '" title="' + label + '">' + icon + '</button>';
  }
  function lensToolButtons(which) {
    // Order (top to bottom) as Arun set it: 1:1, 2X, 3X  /  no lens, normal lens, bigger lens
    var zoom = lensBtn("lb-lens-btn--small lb-lens-btn--native", 'data-zoom="native"', "Actual pixels (1:1)", '<span class="lb-native-label" aria-hidden="true">1:1</span>') +
      lensBtn("lb-lens-btn--small", 'data-zoom="2"', "Zoom 2X", '<span class="lb-native-label" aria-hidden="true">2X</span>') +
      lensBtn("lb-lens-btn--big", 'data-zoom="3"', "Zoom 3X", '<span class="lb-native-label" aria-hidden="true">3X</span>');
    var lens = lensBtn("lb-lens-btn--small lb-lens-btn--off", 'data-lens="off"', "No lens", NO_LENS_ICON) +
      lensBtn("lb-lens-btn--small", 'data-lens="small"', "Normal lens (512 px)", LENS_ICON) +
      lensBtn("lb-lens-btn--big", 'data-lens="big"', "Bigger lens (750 px)", LENS_ICON);
    return which === "zoom" ? zoom : which === "lens" ? lens : '<span class="lens-tools-group">' + zoom + '</span><span class="lens-tools-group">' + lens + '</span>';
  }
  function showLensMode() {
    $$(".lb-lens-btn").forEach(function (b) {
      var on = b.dataset.lens ? b.dataset.lens === lensMode : b.dataset.zoom === lensZoom;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
      if (b.dataset.zoom) b.disabled = lensMode === "off";   // zoom means nothing with no lens
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".lb-lens-btn"); if (!b) return;
    if (b.dataset.lens) { lensMode = b.dataset.lens; try { localStorage.setItem("bi-lens", lensMode); } catch (err) {} if (lensMode === "off") hideLens(); }
    else if (b.dataset.zoom) { lensZoom = b.dataset.zoom; }
    showLensMode();
  });

  document.addEventListener("error", function (e) {
    var img = e.target;
    if (img && img.tagName === "IMG" && img.dataset.full && !img.dataset.fellBack) {
      img.dataset.fellBack = "1"; img.removeAttribute("srcset"); img.src = img.dataset.full;
    }
  }, true);

  /* Closed pop-ups (image viewer, trailer, showreel) stay in the page, so their buttons could still be reached
     with Tab. Every pop-up marks itself aria-hidden="true" when closed; mirror that into `inert`, which takes it
     out of keyboard and screen-reader reach, whichever code opens or closes it. */
  function syncInert(el) { if (el.getAttribute("aria-hidden") === "true") el.setAttribute("inert", ""); else el.removeAttribute("inert"); }
  $$('[role="dialog"]').forEach(syncInert);
  if (window.MutationObserver) {
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        if (m.type === "attributes" && m.target.getAttribute("role") === "dialog") syncInert(m.target);
        else if (m.type === "childList") m.addedNodes.forEach(function (n) { if (n.nodeType === 1 && n.getAttribute("role") === "dialog") syncInert(n); });
      });
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-hidden"] });
  }

  /* All editable content lives in data/*.json (not data.js) so the /admin
     CMS can change it without touching any code. Loaded synchronously here
     so the rest of this file can keep assuming the data is ready. A file
     with no CMS-made changes yet just 404s and the data.js fallback (if any)
     is used instead — nothing breaks either way. */
  // Data files are normally already fetched, all in parallel, by the loader at the bottom of
  // this file (window.__BI_JSON). Anything not preloaded falls back to a one-off synchronous
  // request (the ?t= stamp stops a stale cached copy after an /admin edit).
  var JSON_STAMP = Date.now(), jsonCache = window.__BI_JSON || {};
  function loadJSON(name) {
    if (name in jsonCache) return jsonCache[name];
    var out = null;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "data/" + name + ".json?t=" + JSON_STAMP, false);
      xhr.send(null);
      if (xhr.status === 200) out = JSON.parse(xhr.responseText);
    } catch (e) {}
    return (jsonCache[name] = out);
  }
  function loadList(name, fallback) {
    var loaded = loadJSON(name);
    var list = Array.isArray(loaded) ? loaded : (loaded && loaded.items) || null;
    return list && list.length ? list : (fallback || []);
  }

  // Categories as edited in /admin (data/categories.json): replaces the built-in list, and every category's
  // name is known under both its code on pieces and its web address name
  var CATEGORY_LIST = loadList("categories", []);
  if (CATEGORY_LIST.length) URLS.setCategories(CATEGORY_LIST);
  BROWSE_CATS.forEach(function (b) { b.match.forEach(function (k) { CAT[k] = b.label; }); });

  // Pieces ticked "Hide from the website" in /admin stay out of every grid, the viewer and the artwork page
  var PROJECTS = loadList("portfolio", BI.PROJECTS).filter(function (p) { return p && !p.hidden; });
  // Each piece's own address, e.g. /portfolio/realistic-character/lehri/ (falls back to the old ?id= page)
  var PIECE_PATH = URLS.piecePaths(PROJECTS);
  function pieceUrl(id) { return PIECE_PATH[id] || "/asset.html?id=" + encodeURIComponent(id); }
  var GAMES = loadList("games", BI.GAMES);
  var CASES = loadList("cases", BI.CASES);
  var POSTS = loadList("posts", BI.POSTS);
  var TESTIMONIALS = loadList("testimonials", BI.TESTIMONIALS);
  var ROLES = loadList("roles", BI.ROLES);
  var PAIRS = BI.PAIRS || [];
  var CLIENTS = loadList("clients", BI.CLIENTS);
  var PRESS = loadList("press", BI.PRESS);
  var TEAM = loadList("team", []);
  var HERO_SHOWCASE = loadList("hero-showcase", BI.HERO_SHOWCASE);

  /* About section (homepage #about) — text, stat labels and tools from data/about.json
     (/admin > About). The words already in index.html stay as the fallback if the file is missing. */
  var ABOUT = loadJSON("about");
  var FOUNDED = 2019;
  var aboutEl = $("#about");
  if (aboutEl && ABOUT && typeof ABOUT === "object") {
    var setText = function (sel, v) { var el = $(sel, aboutEl); if (el && v) el.textContent = v; };
    setText(".eyebrow", ABOUT.eyebrow);
    var aTitle = $("#aboutTitle");
    if (aTitle && (ABOUT.titleStart || ABOUT.titleAccent)) {
      aTitle.innerHTML = esc(ABOUT.titleStart || "") + (ABOUT.titleAccent ? ' <span class="accent">' + esc(ABOUT.titleAccent) + '</span>' : "") + esc(ABOUT.titleEnd || "");
    }
    var aText = $("#aboutText");
    var paras = (ABOUT.paragraphs || []).filter(function (t) { return String(t || "").trim(); });
    if (aText && paras.length) aText.innerHTML = paras.map(function (t) { return "<p>" + esc(String(t).trim()) + "</p>"; }).join("");
    setText("#aboutPrimaryBtn", ABOUT.primaryBtnLabel);
    setText("#aboutSecondaryBtn", ABOUT.secondaryBtnLabel);
    if (+ABOUT.foundedYear > 1900) { FOUNDED = +ABOUT.foundedYear; var fy = $("#aboutFounded"); if (fy) fy.setAttribute("data-count", FOUNDED); }
    setText(".pipeline-title", ABOUT.toolsTitle);
    var aTools = $("#aboutTools");
    var groups = (ABOUT.toolGroups || []).filter(function (g) { return g && g.name; });
    // Groups marked "Second box" in /admin (e.g. Communication, Pipeline & delivery) get their own box under the tools
    var groupHtml = function (list) {
      return list.map(function (g) {
        return '<div class="tool-group"><dt>' + esc(g.name) + '</dt><dd><ul class="client-list tools-list">' +
          (g.tools || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></dd></div>";
      }).join("");
    };
    var mainGroups = groups.filter(function (g) { return g.box !== "workflow"; });
    var workGroups = groups.filter(function (g) { return g.box === "workflow"; });
    if (aTools && groups.length) aTools.innerHTML = groupHtml(mainGroups);
    setText(".tools-note", ABOUT.toolsNote);
    if (aTools && workGroups.length) {
      var box2 = document.createElement("div");
      box2.className = "pipeline pipeline--work";
      box2.innerHTML = '<h3 class="pipeline-title">' + esc(ABOUT.workflowTitle || "How we work with your team") + '</h3><dl class="tool-groups">' + groupHtml(workGroups) + "</dl>";
      aTools.closest(".pipeline").insertAdjacentElement("afterend", box2);
    }
  }

  /* Homepage text: one file per section, data/sections/<id>.json, edited in /admin inside that section's
     panel ("Section heading and text"). Each holds the section's small line, heading and subtitle, plus its
     extras: Testimonials the stat boxes, Services the cards and Why Choose Us, FAQ the questions and the
     call-to-action band, Careers the Google Form link. Put back together here as HOME. In headings, *words in
     stars* become the gold accent; in longer text, [label](/link) becomes a link. The words already in
     index.html stay as the fallback if a file is missing. */
  var SECTION_TEXT = {}, HOME = null;
  if (document.getElementById("services")) URLS.TEXT_SECTIONS.forEach(function (id) {
    var d = loadJSON("sections/" + id);
    if (!d || typeof d !== "object") return;
    SECTION_TEXT[id] = d;
    HOME = HOME || { sections: {} };
    HOME.sections[id] = { eyebrow: d.eyebrow, title: d.title, sub: d.sub };
    ["trustStats", "services", "whyTitle", "why", "faq", "cta"].forEach(function (k) { if (d[k] !== undefined) HOME[k] = d[k]; });
  });
  var SERVICE_ICONS = {
    character: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
    hair: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20c2-6 4-9 8-9s6 3 8 9"/><path d="M8 11c0-4 1-7 4-7s4 3 4 7"/><path d="M6 14c-1-2-1-4 0-6M18 14c1-2 1-4 0-6"/></svg>',
    props: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>',
    engine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/><path d="M7 12l3-3 3 3 4-4"/></svg>',
    texture: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3a9 9 0 100 18c1.5 0 2-1 2-2 0-1-1-1.5-1-2.5s1-1.5 2.5-1.5H17a4 4 0 004-4c0-4.5-4-8-9-8z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/></svg>',
    rigging: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="4" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="16" cy="20" r="2"/><path d="M12 6l-5.5 4M12 6l5.5 4M6 14l1.5 4M18 14l-1.5 4M7 12h10"/></svg>'
  };
  function accentTitle(t) { return esc(t || "").replace(/\*([^*]+)\*/g, '<span class="accent">$1</span>'); }
  function richText(t) {
    return esc(t || "").replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
      return /^(\/|https?:|mailto:)/.test(url) ? '<a href="' + url + '">' + label + '</a>' : label;
    });
  }
  /* Contact and Getting Started page text, edited in /admin (Contact pages): data/sections/contact.json and
     data/sections/getting-started.json. The words written in the two pages stay as the fallback. */
  (function () {
    var C = $("#contactForm") && loadJSON("sections/contact"), cc = $(".contact-copy");
    if (C && typeof C === "object" && cc) {
      var ce = $(".eyebrow", cc), ct = $(".section-title", cc), cp = $(".section-title + p", cc), co = $(".contact-sub", cc);
      if (ce && C.eyebrow) ce.textContent = C.eyebrow;
      if (ct && C.title) ct.innerHTML = accentTitle(C.title);
      if (cp && C.sub) cp.innerHTML = richText(C.sub);
      if (co && C.otherTitle) co.textContent = C.otherTitle;
    }
    var G = $(".quote-steps") && loadJSON("sections/getting-started"), gh = $(".page-hero");
    if (!G || typeof G !== "object") return;
    if (gh) {
      var ge = $(".eyebrow", gh), gt = $(".page-title", gh), gs = $(".page-sub", gh);
      if (ge && G.eyebrow) ge.innerHTML = '<span class="eyebrow-dot"></span> ' + esc(G.eyebrow);
      if (gt && G.title) gt.innerHTML = accentTitle(G.title);
      if (gs && G.sub) gs.innerHTML = richText(G.sub);
    }
    if (Array.isArray(G.steps) && G.steps.length) $(".quote-steps").innerHTML = G.steps.map(function (st, i) {
      return '<li class="process-step reveal"><span class="service-badge">' + esc(st.day || "") + '</span><span class="process-num">' + (i < 9 ? "0" : "") + (i + 1) + '</span>' +
        '<h3>' + esc(st.title || "") + '</h3><p>' + esc(st.text || "") + '</p></li>';
    }).join("");
    var notes = $(".process-notes");
    if (notes && Array.isArray(G.models) && G.models.length) notes.innerHTML = G.models.map(function (m) {
      return '<div class="note-card"><strong>' + esc(m.title || "") + '</strong><span>' + esc(m.text || "") + '</span></div>';
    }).join("");
    var band = $("main .cta-band");
    if (band && G.ctaTitle) $("h3", band).textContent = G.ctaTitle;
    if (band && G.ctaText) $("p", band).textContent = G.ctaText;
  })();

  if (HOME && typeof HOME === "object") {
    var HSEC = HOME.sections || {};
    Object.keys(HSEC).forEach(function (id) {
      var sec = document.getElementById(id), d = HSEC[id];
      if (!sec || !d || id === "about" || id === "home") return;
      var eb = $(".eyebrow", sec), ti = $(".section-title, .page-title", sec), sub = $(".section-sub, .page-sub, .faq-intro > p:not(.eyebrow)", sec);
      if (eb && d.eyebrow) eb.innerHTML = ($(".eyebrow-dot", eb) ? '<span class="eyebrow-dot"></span> ' : "") + esc(d.eyebrow);
      if (ti && d.title) ti.innerHTML = accentTitle(d.title);
      if (sub && d.sub) sub.innerHTML = richText(d.sub);
    });
    var trust = $("#testimonials .trust-row");
    if (trust && Array.isArray(HOME.trustStats) && HOME.trustStats.length) {
      trust.innerHTML = HOME.trustStats.map(function (st) {
        var auto = { games: "games", years: "years", portfolio: "projects" }[st.source];
        var num = auto ? 'data-stat="' + auto + '"' : 'data-count="' + (+st.number || 0) + '"';
        return '<li><span class="stat-num" ' + num + ' data-suffix="' + esc(st.suffix || "") + '">0</span><span class="stat-label">' + esc(st.label || "") + '</span></li>';
      }).join("");
    }
    var svcGrid = $("#services .services-grid");
    if (svcGrid && Array.isArray(HOME.services) && HOME.services.length) {
      svcGrid.innerHTML = HOME.services.map(function (c) {
        return '<article class="service-card reveal"><div class="service-icon">' + (SERVICE_ICONS[c.icon] || SERVICE_ICONS.character) + '</div>' +
          (c.specialization ? '<span class="service-badge">Specialization</span>' : "") +
          '<h3>' + esc(c.title || "") + '</h3><p>' + esc(c.text || "") + '</p>' +
          ((c.points || []).length ? '<ul class="service-list">' + c.points.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + '</ul>' : "") +
        '</article>';
      }).join("");
    }
    var whyT = $("#services .why-title"); if (whyT && HOME.whyTitle) whyT.textContent = HOME.whyTitle;
    var whyL = $("#services .why-list");
    if (whyL && Array.isArray(HOME.why) && HOME.why.length) {
      whyL.innerHTML = HOME.why.map(function (w) {
        return '<li><span class="why-icon">' + esc(w.icon || "") + '</span><div><strong>' + esc(w.title || "") + '</strong><small>' + esc(w.text || "") + '</small></div></li>';
      }).join("");
    }
    var faqL = $("#faqList");
    if (faqL && Array.isArray(HOME.faq) && HOME.faq.length) {
      faqL.innerHTML = HOME.faq.map(function (f, i) {
        return '<details class="faq-item"' + (i ? "" : " open") + '><summary>' + esc(f.q || "") + '</summary><p>' + richText(f.a || "") + '</p></details>';
      }).join("");
    }
    var ctaB = $("#faq .cta-band");
    if (ctaB && HOME.cta) {
      if (HOME.cta.title) $("h3", ctaB).textContent = HOME.cta.title;
      if (HOME.cta.text) $("p", ctaB).textContent = HOME.cta.text;
      if (HOME.cta.button) $(".btn", ctaB).textContent = HOME.cta.button;
    }
  }

  /* Stat counters that must track real data instead of a hand-typed number
     (data-stat="projects"/"games"/"clients"/"years" on any .stat-num, any page).
     Runs before the reveal/counter-animation wiring below picks up data-count. */
  $$(".stat-num[data-stat]").forEach(function (el) {
    var kind = el.dataset.stat;
    var val = kind === "projects" ? PROJECTS.length
      : kind === "games" ? GAMES.length
      : kind === "clients" ? CLIENTS.length
      : kind === "years" ? (new Date().getFullYear() - FOUNDED)
      : null;
    if (val != null) el.setAttribute("data-count", val);
  });

  (function () {
    var loadedCfg = loadJSON("config");
    if (loadedCfg && typeof loadedCfg === "object") {
      for (var k in loadedCfg) { if (loadedCfg[k] !== "" && loadedCfg[k] != null) CFG[k] = loadedCfg[k]; }
    }
  })();
  var EMAIL = CFG.email || "business@brothersinteractive.com";
  var JOBS_EMAIL = "contact@brothersinteractive.com";

  // Social links from Settings replace the ones written into each page (those stay as the fallback)
  (function () {
    var links = (Array.isArray(CFG.social) ? CFG.social : []).filter(function (l) { return l && l.label && /^https?:\/\//.test(l.url || ""); });
    if (!links.length) return;
    document.querySelectorAll(".social-row").forEach(function (row) {
      row.innerHTML = "";
      links.forEach(function (l) {
        var a = document.createElement("a");
        a.href = l.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = l.label;
        row.appendChild(a);
      });
    });
  })();

  var HERO = BI.HERO || {};
  (function () {
    var loadedHero = loadJSON("hero");
    if (loadedHero && typeof loadedHero === "object") {
      for (var k in loadedHero) { if (loadedHero[k] !== "" && loadedHero[k] != null) HERO[k] = loadedHero[k]; }
    }
  })();

  /* Analytics hook: no-op until CONFIG.plausibleDomain is set */
  function track(name, props) {
    try { if (window.plausible) window.plausible(name, props ? { props: props } : undefined); } catch (err) {}
  }

  /* Shared form sender: posts straight to the inbox via FormSubmit.co (no signup,
     just a one-time "Activate Form" email the first time EMAIL receives one),
     falls back to the visitor's email client if the request is blocked/offline. */
  function sendForm(formEl, noteEl, payload, eventName, mailtoHref, targetEmail) {
    noteEl.className = "form-note"; noteEl.textContent = "Sending...";
    var body = {};
    for (var k in payload) body[k] = payload[k];
    body._captcha = "false";
    body._template = "table";
    if (payload.email) body._replyto = payload.email;
    fetch("https://formsubmit.co/ajax/" + (targetEmail || EMAIL), {
      method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (out) { return { ok: r.ok, out: out }; }); })
      .then(function (res) {
        if (!res.ok || String(res.out.success) !== "true") throw new Error((res.out && res.out.message) || "send failed");
        noteEl.className = "form-note ok"; noteEl.textContent = "Sent! Thank you, we'll be in touch shortly.";
        formEl.reset(); track(eventName);
      }).catch(function () {
        noteEl.className = "form-note err"; noteEl.textContent = "Could not send online. Opening your email client instead...";
        window.location.href = mailtoHref;
      });
  }

  /* ------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------ */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  /* Accepts a bare YouTube ID (what the CMS asks for) or a pasted-in-by-mistake
     full URL (watch?v=, youtu.be/, embed/) and always returns just the ID. */
  function ytId(v) {
    if (!v) return "";
    var m = String(v).match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : v;
  }
  /* A link typed without http(s):// (e.g. "www.linkedin.com/...") would
     otherwise resolve as a relative path on the current page and 404.
     Leaves mailto:, tel:, #anchors and already-absolute URLs untouched. */
  function normalizeUrl(u) {
    u = String(u || "").trim();
    if (!u || /^(https?:|mailto:|tel:|#)/i.test(u)) return u;
    return "https://" + u;
  }

  /* ==================================================================
     HOME PAGE ONLY — everything inside this block needs the portfolio,
     games, case study and blog containers that exist on index.html.
     ================================================================== */
  if ($("#portfolioGrid")) {

  /* ------------------------------------------------------------------
     Hero (index.html only — category.html shares this HOME-only block
     but has no #home hero section, so this simply no-ops there)
     ------------------------------------------------------------------ */
  if ($("#home")) {
    if (HERO.eyebrow) $("#heroEyebrowText").textContent = HERO.eyebrow;
    if (HERO.titleLine1) $("#heroLine1").textContent = HERO.titleLine1;
    if (HERO.titleAccent) { $("#heroAccent").textContent = HERO.titleAccent; $("#heroAccent").setAttribute("data-text", HERO.titleAccent); }
    if (HERO.titleLine3) $("#heroLine3").textContent = HERO.titleLine3;
    if (HERO.subtitle) $("#heroSub").textContent = HERO.subtitle;
    if (HERO.primaryBtnLabel) $("#heroBtnPrimary").textContent = HERO.primaryBtnLabel;
    if (HERO.secondaryBtnLabel) $("#heroBtnSecondary").textContent = HERO.secondaryBtnLabel + " →";
    [1, 2, 3].forEach(function (n) {
      // Stat 2 (portfolio pieces) and stat 3 (shipped games) always reflect the
      // real data length -- never the CMS's typed-in number -- so the count on
      // screen can't drift out of sync when items are added or removed.
      var num = n === 2 ? PROJECTS.length : n === 3 ? GAMES.length : HERO["stat" + n + "Num"];
      var suffix = HERO["stat" + n + "Suffix"], label = HERO["stat" + n + "Label"];
      var numEl = $("#heroStat" + n + "Num"), labelEl = $("#heroStat" + n + "Label");
      if (num || num === 0) numEl.setAttribute("data-count", num);
      if (suffix != null) numEl.setAttribute("data-suffix", suffix);
      if (label) labelEl.textContent = label;
    });
    // Showcase: one entry picked at random on every load/refresh (Hero Showcase Images in /admin).
    // Priority per entry: 3D model (drag-to-rotate turntable) > video/GIF (silent loop) > image.
    // The entry's image, if any, is the loading picture for a model or video.
    // On localhost only, ?heroModel=<url> / ?heroVideo=<url> preview without touching the data.
    var showImg = $("#heroShowcaseImg");
    var entries = HERO_SHOWCASE.filter(function (x) { return x && (x.img || x.model || x.video); });
    var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    var previewModel = (location.search.match(/[?&]heroModel=([^&]+)/) || [])[1];
    var previewVideo = (location.search.match(/[?&]heroVideo=([^&]+)/) || [])[1];
    var previewSize = (location.search.match(/[?&]heroSize=(\d+)/) || [])[1];
    if (isLocal && previewModel) entries = [{ model: decodeURIComponent(previewModel), alt: "Preview model", modelSize: previewSize && +previewSize }];
    else if (isLocal && previewVideo) entries = [{ video: decodeURIComponent(previewVideo), alt: "Preview video" }];
    var ANIMS = ["float", "breathe", "sway", "drift", "glow", "none"];
    var SHOWCASE_MODE = ((loadJSON("hero-showcase") || {}).mode) || "together";
    // Normal size first (as the CSS draws it), then that width x "Picture size" as the real layout width: the
    // browser draws the picture once at that size, sharper than stretching it afterwards with a CSS scale
    function fitShowcase(el) {
      if (!el.complete || !el.naturalWidth) return;
      var k = el._picK || 1;
      el.style.width = ""; el.style.maxWidth = ""; el.style.setProperty("--pic-k", 1);
      var w0 = el.offsetWidth;
      el.style.setProperty("--pic-k", k);
      // never wider than the hero itself, or a phone gets a sideways scroll (150% of 280px is 420px)
      var box = el.closest(".container"), cs = box && getComputedStyle(box);
      var room = box ? box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : Infinity;
      if (k !== 1) { el.style.maxWidth = "none"; el.style.width = Math.round(Math.min(w0 * k, room)) + "px"; }
      // two-column hero (tablets): the picture's column grows with it, so if the page now scrolls sideways,
      // take back exactly the overflow (never below the normal 100% size)
      if (k > 1) for (var fi = 0; fi < 4; fi++) {
        var ex = document.documentElement.scrollWidth - document.documentElement.clientWidth, cur = parseFloat(el.style.width);
        if (ex <= 0 || cur <= w0) break;
        el.style.width = Math.max(w0, cur - ex - 2) + "px";
      }
    }
    // Size, animation and position from /admin, for one entry on one element (picture, video or 3D model).
    // Move: X + = right, - = left; Y + = up, - = down, in pixels (halved on tablets and phones).
    function styleShowcase(el, e, isPicture) {
      if (isPicture) {
        el._picK = Math.max(50, Math.min(150, +e.imgSize || 100)) / 100;
        el.setAttribute("data-anim", ANIMS.indexOf(e.animation) !== -1 ? e.animation : "float");
        if (!el._fitBound) { el._fitBound = true; el.addEventListener("load", function () { fitShowcase(el); }); }
        fitShowcase(el);
      }
      var ox = Math.max(-400, Math.min(400, +e.offsetX || 0)), oy = Math.max(-400, Math.min(400, +e.offsetY || 0));
      el.style.setProperty("--ox", ox); el.style.setProperty("--oy", -oy);
      el.classList.toggle("hero-moved", !!(ox || oy));
    }
    window.addEventListener("resize", function () { $$(".hero-showcase-img").forEach(fitShowcase); });

    if (showImg && entries.length) {
      var pictures = entries.filter(function (x) { return x.img && !x.model && !x.video; });
      var showPicture = function (el, e) { el.src = e.img; el.alt = e.alt || ""; styleShowcase(el, e, true); };
      if (SHOWCASE_MODE === "together" && pictures.length > 1) {
        // All picture entries stand on the podium side by side, in list order, each with its own settings.
        // (3D model and video entries are left out of this mode: they need the whole stage.)
        showImg.parentNode.classList.add("hero-stage--group");
        showImg.style.setProperty("--share", 1 / pictures.length);
        pictures.forEach(function (e, i) {
          var el = i ? showImg.cloneNode(false) : showImg;
          if (i) { el.removeAttribute("id"); showImg.parentNode.insertBefore(el, null); }
          el.style.setProperty("--share", 1 / pictures.length);
          el.style.animationDelay = (-i * 1.7) + "s";   // so they don't all bob in step
          showPicture(el, e);
        });
      } else {
        // One at a time. "random": one entry per visit. "turns": picture entries change every 8 s (cross-fade).
        // An entry with a 3D model or video stays on its own when the visit lands on it.
        var pick = entries[Math.floor(Math.random() * entries.length)];
        if (pick.model || pick.video) {
          if (pick.img) showImg.src = pick.img;
          showImg.alt = pick.alt || "";
          if (pick.model) mountHeroModel(pick.model, showImg, pick.alt, pick.modelSize);
          else mountHeroVideo(pick.video, showImg, pick.alt);
          var shown = showImg.hidden ? showImg.parentNode.querySelector(".hero-model, .hero-video") : showImg;
          if (shown) styleShowcase(shown, pick, shown === showImg);
        } else {
          var at = pictures.indexOf(pick);
          showPicture(showImg, pictures[at]);
          if (SHOWCASE_MODE === "turns" && pictures.length > 1) {
            pictures.forEach(function (e) { var pre = new Image(); pre.src = e.img; });   // ready before their turn
            setInterval(function () {
              if (document.hidden) return;
              at = (at + 1) % pictures.length;
              showImg.classList.add("hero-swap");                        // fade out...
              setTimeout(function () {
                showPicture(showImg, pictures[at]);
                var back = function () { showImg.classList.remove("hero-swap"); };   // ...and in once drawn
                if (showImg.complete) requestAnimationFrame(back); else showImg.addEventListener("load", back, { once: true });
              }, 600);
            }, 8000);
          }
        }
      }
    }
  }

  function mountHeroVideo(src, img, alt) {
    if (!img) return;
    // A GIF is just an animated image: show it in place of the still.
    if (/\.gif(\?|$)/i.test(src)) { img.src = src; return; }
    // Safari can't play WebM transparency (it would show a black box), so keep the image there.
    var isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
    if (/\.webm(\?|$)/i.test(src) && isSafari) return;
    var v = document.createElement("video");
    v.className = "hero-video";
    v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
    v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("preload", "auto");
    v.setAttribute("aria-label", alt || "Character video");
    if (img.getAttribute("src")) v.poster = img.getAttribute("src");
    v.src = src;
    // If the video can't play at all, fall back to the image.
    v.addEventListener("error", function () { v.remove(); img.hidden = false; });
    img.hidden = true;
    img.parentNode.insertBefore(v, img);
    var p = v.play(); if (p && p.catch) p.catch(function () {});
  }

  function mountHeroModel(src, img, alt, size) {
    // "3D model size (%)" from /admin: 100 = auto framing (whole model fits); 125 = camera 1.25x closer, etc.
    size = Math.max(50, Math.min(150, +size || 100));
    var radius = size === 100 ? "auto" : Math.round(10000 / size) + "%";
    if (!img) return;
    if (!document.querySelector("script[data-model-viewer]")) {
      var mvs = document.createElement("script");
      mvs.type = "module"; mvs.setAttribute("data-model-viewer", "");
      // model-viewer 3.5.0 and its Draco decoder are kept on this site (js/vendor): from jsDelivr / gstatic they
      // sometimes stalled for 10 s, holding the hero model back
      self.ModelViewerElement = self.ModelViewerElement || {};
      self.ModelViewerElement.dracoDecoderLocation = "/js/vendor/draco/";
      mvs.src = "/js/vendor/model-viewer.min.js";
      document.head.appendChild(mvs);
    }
    var mv = document.createElement("model-viewer");
    var attrs = {
      src: src, alt: alt || "3D character model",
      poster: img.getAttribute("src") || "", loading: "eager", reveal: "auto",
      "camera-controls": "", "disable-zoom": "", "disable-pan": "", "touch-action": "pan-y",
      "auto-rotate": "", "auto-rotate-delay": "0", "rotation-per-second": "18deg", "interaction-prompt": "none",
      "shadow-intensity": "1.2", "shadow-softness": "0.9", exposure: "1.05", "environment-image": "neutral",
      "camera-orbit": "0deg 80deg " + radius, // auto radius always fits the whole model; the size setting moves the camera closer/further
      // Spin freely left/right; only a small up/down tilt is allowed (phi 64°-96°), and it glides back to eye level on release.
      "min-camera-orbit": "-Infinity 64deg 50%", "max-camera-orbit": "Infinity 96deg 250%" // distance range wide enough for sizes 50-150
    };
    Object.keys(attrs).forEach(function (k) { mv.setAttribute(k, attrs[k]); });
    // Without a loading picture the model fades in smoothly once it's ready instead of popping in.
    mv.className = "hero-model" + (attrs.poster ? "" : " hero-model--fade");
    img.hidden = true;
    img.parentNode.insertBefore(mv, img);
    var hint = document.createElement("span");
    hint.className = "hero-model-hint"; hint.setAttribute("aria-hidden", "true");
    hint.innerHTML = "Loading 3D model&hellip;";
    img.parentNode.appendChild(hint);
    mv.addEventListener("load", function () {
      mv.classList.add("ready");
      if (!hint.classList.contains("gone")) hint.innerHTML = "&#8634; Drag to rotate";
    });
    mv.addEventListener("pointerdown", function () { hint.classList.add("gone"); }, { once: true });

    // After a drag, ease the vertical angle back to eye level slowly, keeping the horizontal angle.
    var settleTimer = 0;
    function settle() {
      if (!mv.getCameraOrbit) return;
      var o = mv.getCameraOrbit();
      if (Math.abs(o.phi * 180 / Math.PI - 80) < 0.5) return;
      mv.setAttribute("interpolation-decay", "600");            // slow glide (default is 50)
      mv.cameraOrbit = (o.theta * 180 / Math.PI).toFixed(2) + "deg 80deg " + radius;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(function () { mv.setAttribute("interpolation-decay", "50"); }, 2500); // snappy again for the next drag
    }
    mv.addEventListener("pointerdown", function () { clearTimeout(settleTimer); mv.setAttribute("interpolation-decay", "50"); });
    window.addEventListener("pointerup", function () { setTimeout(settle, 60); });
    window.addEventListener("touchend", function () { setTimeout(settle, 60); });
  }

  /* ------------------------------------------------------------------
     Portfolio grid + filters + load more
     ------------------------------------------------------------------ */
  var grid = $("#portfolioGrid");
  var loadMoreBtn = $("#loadMoreBtn");
  var PAGE = 12; // still used for the staggered fade-in animation, not for hiding items
  // A category page knows its category from the build step (/category/<slug>/), or from an old ?cat= link
  var qCat = PAGE_INFO.cat || (location.search.match(/[?&]cat=([^&]+)/) || [])[1];
  var activeFilter = qCat ? decodeURIComponent(qCat) : "all";
  var shown = Infinity; // show the whole portfolio at once, no "Load More" needed
  var visibleList = [];

  // ?cat= can be a BROWSE_CATS slug (grouped tile) or a raw CAT key (legacy link)
  var activeBrowseCat = BROWSE_CATS.filter(function (b) { return b.slug === activeFilter; })[0];

  // category.html: fill in the page title/heading from the ?cat= key
  var catTitleEl = $("#categoryTitle");
  if (catTitleEl) {
    var catLabel = (activeBrowseCat && activeBrowseCat.label) || CAT[activeFilter] || "Portfolio";
    catTitleEl.textContent = catLabel;
    document.title = catLabel + " | Brothers Interactive";
    // an old category.html?cat= link: category addresses now open the homepage collage with that filter on
    var oldCat = activeBrowseCat || BROWSE_CATS.filter(function (b) { return b.match.indexOf(activeFilter) !== -1; })[0];   // a slug, or an older code like realistic-humans
    if (oldCat) { location.replace(URLS.categoryPath(oldCat.slug)); return; }
  }

  /* A fresh random order on every page load, so the portfolio never looks the same twice */
  var SHUFFLED = PROJECTS.slice();
  for (var si = SHUFFLED.length - 1; si > 0; si--) {
    var sj = Math.floor(Math.random() * (si + 1));
    var tmp = SHUFFLED[si]; SHUFFLED[si] = SHUFFLED[sj]; SHUFFLED[sj] = tmp;
  }
  function filtered() {
    if (activeFilter === "all") return SHUFFLED;
    if (activeBrowseCat) return SHUFFLED.filter(function (p) { return inAnyCat(p, activeBrowseCat.match); });
    return SHUFFLED.filter(function (p) { return inCat(p, activeFilter); });
  }

  function renderGrid() {
    visibleList = filtered();
    var slice = visibleList.slice(0, shown);
    if (!slice.length) {
      grid.innerHTML = '<p class="portfolio-empty">No pieces in this category yet.</p>';
    } else {
      grid.innerHTML = slice.map(function (p, idx) {
        var ar = p.w && p.h ? 'aspect-ratio:' + p.w + '/' + p.h + ';' : '';
        return (
          '<article class="work-card ripple-host" data-index="' + PROJECTS.indexOf(p) + '" style="' + ar + '--i:' + idx + ';animation-delay:' + (idx % PAGE) * 40 + 'ms" tabindex="0" role="button" aria-label="Open ' + esc(p.t) + '">' +
            '<img ' + imgAttrs(p.i, "(max-width: 600px) 100vw, (max-width: 1100px) 50vw, 33vw") + ' alt="' + esc(p.t) + '" loading="lazy"' + (p.w ? ' width="' + p.w + '" height="' + p.h + '"' : '') + ' />' +
            '<span class="work-zoom" aria-hidden="true">&#x2922;</span>' +
            // On a category page, a piece shown via "Also show in" is labelled with that page's category
            '<div class="work-info"><span class="work-cat">' + esc(activeBrowseCat && activeBrowseCat.match.indexOf(p.c) === -1 ? activeBrowseCat.label : CAT[p.c]) + '</span><span class="work-title">' + esc(p.t) + '</span></div>' +
          '</article>'
        );
      }).join("");
    }
    loadMoreBtn.style.display = shown >= visibleList.length ? "none" : "";
  }

  var filterBarEl = $("#filterBar");
  if (filterBarEl) filterBarEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".filter-btn");
    if (!btn) return;
    // reset the lightbox list to the grid selection
    visibleList = [];
    $$(".filter-btn").forEach(function (b) { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    activeFilter = btn.dataset.filter;
    shown = Infinity;
    // animate old cards out, then render the new set (cards animate in with a stagger)
    grid.classList.add("leaving");
    setTimeout(function () { renderGrid(); grid.classList.remove("leaving"); }, 220);
  });

  loadMoreBtn.addEventListener("click", function () {
    shown += PAGE;
    renderGrid();
  });

  renderGrid();

  /* ------------------------------------------------------------------
     Category grid ("browse by art style" tiles) -- each tile links to
     category.html?cat=<key>, which reuses this same portfolio-grid +
     lightbox code path pre-filtered to that one category.
     ------------------------------------------------------------------ */
  var categoryGridEl = $("#categoryGrid");
  if (categoryGridEl) {
    // Tile picture: the one set in /admin > Categories, else the first piece in that category.
    categoryGridEl.innerHTML = BROWSE_CATS.map(function (b, i) {
      // Prefer a piece whose main category is this one for the tile image; fall back to an "Also show in" piece
      var thumb = PROJECTS.filter(function (p) { return b.match.indexOf(p.c) !== -1; })[0] ||
                  PROJECTS.filter(function (p) { return inAnyCat(p, b.match); })[0];
      if (!thumb) return "";   // a category with no pieces yet is left out; its tile appears once a piece is added
      return (
        '<a class="style-tile reveal" href="' + URLS.categoryPath(b.slug) + '" style="transition-delay:' + (i % 3) * 70 + 'ms" aria-label="Browse ' + esc(b.label) + '">' +
          '<img ' + imgAttrs(b.tile || thumb.i, "(max-width: 600px) 50vw, 33vw") + ' alt="" loading="lazy" />' +
          '<span class="style-tile-label">' + esc(b.label) + '</span>' +
        '</a>'
      );
    }).join("");
  }

  /* Portfolio collage (homepage). "All": every visible piece as a square tile, shuffled on each visit, with
     some 2x2, 2x1 and 1x2 tiles drawn at random from the pieces ticked for that shape in /admin ("Collage
     shapes"). For the current column count it tries mixes of those shapes, closest to a natural mix first,
     and keeps the first one that fills the last row exactly and can be placed: 2x2 and 1x2 tiles never reach
     the last row, 2x1 tiles can go anywhere, square tiles fill every remaining cell. So the bottom edge is
     always straight, however many pieces there are. A category filter shows that category's pieces as large
     cards, three per row. A tile or card opens the viewer, whose arrows follow what is on screen. The switch
     flips to the category tiles; the choice is remembered. */
  var collageEl = $("#collageGrid"), collageCatEl = $("#collageCat"), collageFiltersEl = $("#collageFilters");
  if (collageEl && PROJECTS.length) {
    var shuffle = function (a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
    // "Not in the collage" in /admin: the piece stays everywhere else (categories, viewer, its page)
    var COLLAGE_PIECES = PROJECTS.filter(function (p) { return !p.nocollage; });
    var collageOrder = shuffle(COLLAGE_PIECES.slice()), collageShown = collageOrder, collageAll = [], collageCols = 0, collageFilter = "all";
    var pool = { big: collageOrder.filter(function (p) { return p.big; }), tall: collageOrder.filter(function (p) { return p.tall; }), wide: collageOrder.filter(function (p) { return p.wide; }) };
    var SHAPE = { big: { h: 2, w: 2, extra: 3, lastRowOk: false }, tall: { h: 2, w: 1, extra: 1, lastRowOk: false }, wide: { h: 1, w: 2, extra: 1, lastRowOk: true } };
    var colsNow = function () { return window.matchMedia("(max-width: 600px)").matches ? 4 : window.matchMedia("(max-width: 1100px)").matches ? 8 : 12; };
    // the collage's own small copy (480px on the short side, made by tools/build.js); the full picture if it is missing
    // "Collage focus" in /admin: which part of the picture stays in view when a tile crops it
    var FOCUS = { left: "left center", right: "right center", top: "center top", bottom: "center bottom" };
    // Focus X / Y (any spot, 0-100 %) win over the preset; Zoom scales the picture around that spot
    var focusStyle = function (p) {
      var pos = (p.fx != null && p.fy != null && p.fx !== "" && p.fy !== "") ? Math.max(0, Math.min(100, +p.fx)) + "% " + Math.max(0, Math.min(100, +p.fy)) + "%" : FOCUS[p.focus];
      var z = +p.zoom > 100 ? Math.min(300, +p.zoom) / 100 : 0, css = "";
      if (pos) css += "object-position:" + pos + ";transform-origin:" + pos + ";";
      if (z) css += "--z:" + z + ";";
      return css ? ' style="' + css + '"' : "";
    };
    var collageThumb = function (u) { var m = THUMB_RE.exec(u || ""); return m && m[1] === "portfolio" ? "assets/img/thumbs/collage/" + m[2] + ".webp" : u; };
    // "Collage crop" in /admin: the build has cut that rectangle out as the piece's own collage copy, one per
    // tile shape (p.ct square, p.ctw wide, p.ctt tall; wide and tall fall back to the square one), so the
    // tile simply shows it centred, and focus / zoom no longer apply
    var cropFor = function (it) { return (it.kind === "wide" && it.p.ctw) || (it.kind === "tall" && it.p.ctt) || it.p.ct || ""; };
    var tileHtml = function (it) {
      var cut = cropFor(it);
      return '<button type="button" class="collage-tile' + (it.kind ? " is-" + it.kind : "") + '" data-index="' + PROJECTS.indexOf(it.p) + '" aria-label="Open ' + esc(it.p.t) + '"' +
        ' style="grid-row:' + (it.r + 1) + " / span " + it.h + ";grid-column:" + (it.c + 1) + " / span " + it.w + '">' +
        '<img src="' + esc(cut || collageThumb(it.p.thumb || it.p.i)) + '" alt="" loading="lazy" decoding="async"' + (cut ? "" : focusStyle(it.p)) +
        ' onerror="this.onerror=null;this.src=\'' + esc(it.p.thumb || it.p.i) + '\'" />' +
        '<span class="collage-name">' + esc(it.p.t) + '</span></button>';
    };
    // one attempt at placing a given mix; returns the placed tiles, or null if it did not fit
    var placeMix = function (mix, cols) {
      var n = collageOrder.length, rows = (n + 3 * mix.big + mix.tall + mix.wide) / cols;
      var used = [], picks = [];
      ["big", "tall", "wide"].forEach(function (k) {
        var got = pool[k].filter(function (p) { return used.indexOf(p) === -1; }).slice(0, mix[k]);
        got.forEach(function (p) { used.push(p); picks.push([p, k]); });
      });
      if (picks.length !== mix.big + mix.tall + mix.wide) return null;
      var smalls = collageOrder.filter(function (p) { return used.indexOf(p) === -1; });
      for (var attempt = 0; attempt < 25; attempt++) {
        var occ = [], items = [], ok = true;
        for (var r = 0; r < rows; r++) occ.push(new Array(cols).fill(false));
        var bigAt = [];
        for (var rb = 0; rb < rows; rb++) bigAt.push(new Array(cols).fill(false));
        var free = function (r0, c0, h, w) { for (var y = r0; y < r0 + h; y++) for (var x = c0; x < c0 + w; x++) if (occ[y][x]) return false; return true; };
        var nearBig = function (r0, c0, h, w) { for (var y = r0 - 1; y <= r0 + h; y++) for (var x = c0 - 1; x <= c0 + w; x++) if (y >= 0 && y < rows && x >= 0 && x < cols && bigAt[y][x]) return true; return false; };
        for (var q = 0; q < picks.length && ok; q++) {
          var sh = SHAPE[picks[q][1]], maxRow = sh.lastRowOk ? rows : rows - 1, spots = [];
          for (var y = 0; y + sh.h <= maxRow; y++) for (var x = 0; x + sh.w <= cols; x++) if (free(y, x, sh.h, sh.w) && !(picks[q][1] === "big" && nearBig(y, x, 2, 2))) spots.push([y, x]);
          if (!spots.length) { ok = false; break; }
          var sp = spots[Math.floor(Math.random() * spots.length)];
          for (var yy = sp[0]; yy < sp[0] + sh.h; yy++) for (var xx = sp[1]; xx < sp[1] + sh.w; xx++) { occ[yy][xx] = true; if (picks[q][1] === "big") bigAt[yy][xx] = true; }
          items.push({ p: picks[q][0], kind: picks[q][1], r: sp[0], c: sp[1], h: sh.h, w: sh.w });
        }
        if (!ok) continue;
        var si = 0;
        for (var y2 = 0; y2 < rows; y2++) for (var x2 = 0; x2 < cols; x2++) if (!occ[y2][x2]) {
          if (si >= smalls.length) { ok = false; break; }
          occ[y2][x2] = true; items.push({ p: smalls[si++], kind: "", r: y2, c: x2, h: 1, w: 1 });
        }
        if (ok && si === smalls.length) return items;
      }
      return null;
    };
    // every row exactly one square tall: a row holding only a wide tile and halves of 2-row tiles has nothing else to size it
    var sizeRows = function () {
      var w = collageEl.clientWidth; if (!w || !collageCols) return;
      var gap = parseFloat(getComputedStyle(collageEl).columnGap) || 0;
      collageEl.style.gridAutoRows = ((w - gap * (collageCols - 1)) / collageCols) + "px";
    };
    var layoutCollage = function () {
      var cols = colsNow(), n = collageOrder.length;
      collageCols = cols;
      // every mix that fills whole rows within the limits (big up to 10% of the pieces, wide and tall up to 15% each):
      // as many big tiles as the limit allows, and about 7% each of wide and tall for variety (never over 15%)
      var maxBig = Math.min(pool.big.length, Math.floor(n * 0.10)), maxSide = Math.floor(n * 0.15), mixes = [];
      var wantSide = Math.round(n * 0.07);
      for (var b = 0; b <= maxBig; b++)
        for (var t = 0; t <= Math.min(pool.tall.length, maxSide); t++)
          for (var w = 0; w <= Math.min(pool.wide.length, maxSide); w++) {
            if ((n + 3 * b + t + w) % cols) continue;
            mixes.push({ big: b, tall: t, wide: w, score: 4 * (maxBig - b) + Math.abs(w - Math.min(wantSide, pool.wide.length)) + Math.abs(t - Math.min(wantSide, pool.tall.length)) + Math.random() * 0.8 });
          }
      mixes.sort(function (m, q) { return m.score - q.score; });
      var placed = null;
      for (var i = 0; i < mixes.length && i < 40 && !placed; i++) placed = placeMix(mixes[i], cols);
      // nothing fits (e.g. no shapes ticked and the count does not divide): plain squares, last row partly empty
      if (!placed) placed = collageOrder.map(function (p, k) { return { p: p, kind: "", r: Math.floor(k / cols), c: k % cols, h: 1, w: 1 }; });
      placed.sort(function (m, q) { return m.r - q.r || m.c - q.c; });
      collageAll = placed.map(function (it) { return it.p; });
      collageEl.style.gridTemplateColumns = "repeat(" + cols + ", 1fr)";
      collageEl.innerHTML = placed.map(tileHtml).join("");
      sizeRows();
    };
    var showCategory = function (slug) {
      var b = BROWSE_CATS.filter(function (c) { return c.slug === slug; })[0];
      var list = b ? PROJECTS.filter(function (p) { return inAnyCat(p, b.match); }) : [];
      collageShown = list;
      collageCatEl.innerHTML = list.map(function (p) {
        return '<button type="button" class="style-tile collage-card" data-index="' + PROJECTS.indexOf(p) + '" aria-label="Open ' + esc(p.t) + '">' +
          '<img ' + imgAttrs(p.i, "(max-width: 600px) 100vw, (max-width: 1100px) 50vw, 33vw") + ' alt="" loading="lazy" />' +
          '<span class="style-tile-label">' + esc(p.t) + '</span></button>';
      }).join("");
    };
    // a category address (/category/<slug>/) opens the homepage with that filter on; All then shows /portfolio/
    var collageHome = PAGE_INFO.cat || location.pathname.indexOf("/category/") === 0 ? "/portfolio/" : location.pathname + location.search;
    var setFilter = function (f) {
      collageFilter = f;
      setAddress(f === "all" ? collageHome : URLS.categoryPath(f));
      var all = f === "all";
      collageEl.hidden = !all;
      // Shuffle only means something on All (a category shows its pieces as cards, and Shuffle would jump back to All)
      var shBtn = $("#collageShuffle"); if (shBtn) shBtn.hidden = !all;
      if (collageCatEl) collageCatEl.hidden = all;
      if (all) { if (collageCols !== colsNow()) layoutCollage(); sizeRows(); collageShown = collageAll; }
      else showCategory(f);
      if (collageFiltersEl) $$(".filter-btn", collageFiltersEl).forEach(function (btn) {
        var on = btn.dataset.filter === f; btn.classList.toggle("active", on); btn.setAttribute("aria-pressed", on ? "true" : "false");
        // phones: the filters are one sideways row, so bring the chosen one into view
        if (on && collageFiltersEl.scrollWidth > collageFiltersEl.clientWidth) collageFiltersEl.scrollLeft = btn.offsetLeft - (collageFiltersEl.clientWidth - btn.offsetWidth) / 2;
      });
    };
    if (collageFiltersEl) {
      collageFiltersEl.innerHTML = '<button type="button" class="filter-btn active" data-filter="all" aria-pressed="true">All</button>' +
        BROWSE_CATS.filter(function (b) { return PROJECTS.some(function (p) { return inAnyCat(p, b.match); }); }).map(function (b) {
          return '<button type="button" class="filter-btn" data-filter="' + esc(b.slug) + '" aria-pressed="false">' + esc(b.label) + '</button>';
        }).join("");
      collageFiltersEl.addEventListener("click", function (e) { var btn = e.target.closest(".filter-btn"); if (btn) setFilter(btn.dataset.filter); });
    }
    layoutCollage();
    collageShown = collageAll;
    // Shuffle: a new random order and a new mix of shapes, without reloading the page (from a category: back to All)
    var shuffleBtn = $("#collageShuffle");
    if (shuffleBtn) shuffleBtn.addEventListener("click", function () {
      shuffleBtn.classList.remove("spin"); void shuffleBtn.offsetWidth; shuffleBtn.classList.add("spin");
      collageEl.classList.add("is-shuffling");
      setTimeout(function () {
        collageOrder = shuffle(COLLAGE_PIECES.slice());
        ["big", "tall", "wide"].forEach(function (k) { pool[k] = collageOrder.filter(function (p) { return p[k]; }); });
        layoutCollage();
        if (collageFilter !== "all") setFilter("all");
        collageShown = collageAll;
        collageEl.classList.remove("is-shuffling");
      }, 250);
    });
    if (PAGE_INFO.cat && BROWSE_CATS.some(function (b) { return b.slug === PAGE_INFO.cat; })) setFilter(PAGE_INFO.cat);
    window.addEventListener("resize", function () { if (collageFilter !== "all") return; if (collageCols !== colsNow()) { layoutCollage(); collageShown = collageAll; } else sizeRows(); });
    // the collage's own width can change without a window resize (scrollbar appearing, zoom): keep the rows square
    if (window.ResizeObserver) { var lastW = 0; new ResizeObserver(function () { var w = collageEl.clientWidth; if (w && w !== lastW) { lastW = w; sizeRows(); } }).observe(collageEl); }
    var openFrom = function (e) {
      var t = e.target.closest(".collage-tile, .collage-card");
      if (t) { visibleList = collageShown.slice(); openLightbox(+t.dataset.index, t); }
    };
    collageEl.addEventListener("click", openFrom);
    if (collageCatEl) collageCatEl.addEventListener("click", openFrom);
  } else if (categoryGridEl) categoryGridEl.hidden = false;

  /* ------------------------------------------------------------------
     Lightbox
     ------------------------------------------------------------------ */
  var lb = $("#lightbox");
  var lbImg = $("#lightboxImg");
  var lbCat = $("#lightboxCat");
  var lbTitle = $("#lightboxTitle");
  var lbLink = $("#lightboxLink");
  var lbQuote = $("#lightboxQuote");
  var lbThumbs = $("#lightboxThumbs");
  var lbPos = 0; // position within visibleList
  var lbFigure = $(".lightbox-figure", lb);
  var lbOrigin = null; // element the lightbox was opened from (for the zoom animation)
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Zoom-from-thumbnail: a clone of the clicked image flies to where the lightbox image will sit.
     Cleanup runs on transitionend, with a timer as fallback, so a throttled tab never leaves a clone behind. */
  function clearClones() { $$(".flip-clone").forEach(function (c) { c.remove(); }); lbFigure.classList.remove("hidden-for-flip", "settle"); }
  function afterMove(clone, ms, fn) {
    var fired = false;
    var go = function () { if (fired) return; fired = true; fn(); };
    clone.addEventListener("transitionend", function (e) { if (e.propertyName === "transform") go(); });
    setTimeout(go, ms + 80);
  }
  /* Sizes/positions the clone at its FINAL (toRect) box immediately — no layout
     animation — then fakes the starting look with a transform (translate+scale)
     computed from fromRect. Only that transform is ever animated afterwards. */
  function makeClone(srcImg, fromRect, toRect, fit) {
    var clone = srcImg.cloneNode(false);
    // Reuse the exact picture already on screen: without this the bigger box makes the browser
    // pick the 1280px file from srcset and download/decode it mid-animation (the visible hitch).
    clone.removeAttribute("srcset"); clone.removeAttribute("sizes"); clone.removeAttribute("loading");
    clone.src = srcImg.currentSrc || srcImg.src;
    clone.className = "flip-clone loaded";
    var sx = fromRect.width / toRect.width, sy = fromRect.height / toRect.height;
    var tx = (fromRect.left + fromRect.width / 2) - (toRect.left + toRect.width / 2);
    var ty = (fromRect.top + fromRect.height / 2) - (toRect.top + toRect.height / 2);
    clone.style.cssText = "top:" + toRect.top + "px;left:" + toRect.left + "px;width:" + toRect.width + "px;height:" + toRect.height + "px;object-fit:" + fit + ";" +
      "transition:none;transform:translate(" + tx + "px," + ty + "px) scale(" + sx + "," + sy + ");";
    document.body.appendChild(clone);
    return clone;
  }
  function flipTo(fromEl, done) {
    clearClones();
    var srcImg = fromEl && fromEl.querySelector("img");
    if (!srcImg || reduceMotion) { done(); return; }
    var from = srcImg.getBoundingClientRect();
    if (!from.width) { done(); return; }
    lbFigure.classList.add("hidden-for-flip");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var box = lbImg.getBoundingClientRect();
        if (!box.width) { box = { top: window.innerHeight * 0.06, left: window.innerWidth * 0.2, width: window.innerWidth * 0.6, height: window.innerHeight * 0.78 }; }
        // Land on the picture's real (contained) rectangle inside the viewer box, with the card's
        // proportions — so the flight is one uniform scale, never a stretch/squash.
        var ratio = from.width / from.height, w = box.width, h = w / ratio;
        if (h > box.height) { h = box.height; w = h * ratio; }
        // In the wide viewer the picture sits on the bottom edge of its box (lines up with the side views)
        var to = { top: box.top + (box.height - h) * lbVAlign(), left: box.left + (box.width - w) / 2, width: w, height: h };
        var clone = makeClone(srcImg, from, to, "cover");
        clone.getBoundingClientRect(); // commit the instant starting transform before animating
        clone.style.transition = "transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s";
        clone.style.transform = "none";
        afterMove(clone, 420, function () {
          // Hand over only once the full-size picture is decoded, so there's no blank/pop frame.
          var ready = lbImg.decode ? lbImg.decode().catch(function () {}) : Promise.resolve();
          Promise.race([ready, new Promise(function (r) { setTimeout(r, 1200); })]).then(function () {
            lbFigure.classList.remove("hidden-for-flip");
            clone.style.opacity = "0";
            setTimeout(function () { clone.remove(); done(); }, 250);
          });
        });
      });
    });
  }
  function flipBack(toEl, done) {
    clearClones();
    var dstImg = toEl && toEl.querySelector("img");
    if (!dstImg || reduceMotion || !lb.classList.contains("open")) { done(); return; }
    var box = lbImg.getBoundingClientRect(); var to = dstImg.getBoundingClientRect();
    if (!box.width || !to.width || to.bottom < 0 || to.top > window.innerHeight) { done(); return; }
    // start from the picture's visible (contained) rectangle, in the card's proportions: uniform shrink, no squash
    var ratio = to.width / to.height, w = box.width, h = w / ratio;
    if (h > box.height) { h = box.height; w = h * ratio; }
    var from = { top: box.top + (box.height - h) * lbVAlign(), left: box.left + (box.width - w) / 2, width: w, height: h };
    var clone = makeClone(lbImg, from, to, "cover");
    lbFigure.classList.add("hidden-for-flip");
    clone.getBoundingClientRect(); // commit the instant starting transform before animating
    requestAnimationFrame(function () {
      clone.style.transition = "transform 0.38s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s";
      clone.style.transform = "none";
      afterMove(clone, 380, function () {
        clone.style.opacity = "0";
        setTimeout(function () { clone.remove(); lbFigure.classList.remove("hidden-for-flip"); done(); }, 200);
      });
    });
  }

  // While the viewer is open the address bar shows that piece's own link (ready to copy and send);
  // closing it puts the page's address back.
  var addressBeforeLb = null;
  function openLightbox(projectIndex, fromEl) {
    var p = PROJECTS[projectIndex];
    if (visibleList.indexOf(p) === -1) visibleList = [p];
    lbPos = visibleList.indexOf(p);
    lbOrigin = fromEl || null;
    if (addressBeforeLb === null) addressBeforeLb = location.pathname + location.search;
    showLightbox(p);
    lb.classList.add("open");
    lb.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    flipTo(fromEl, function () {});
  }
  function showLightbox(p, dir) {
    var swap = function () {
      lbImg.setAttribute("fetchpriority", "high");   // the main picture before anything else
      lbImg.classList.remove("is-soft");
      lbImg.src = p.i;
      lbImg.alt = p.t;
      lbImg.classList.add("loaded");
      lbCat.textContent = CAT[p.c];
      lbCat.href = URLS.categoryPath(URLS.catSlug(p.c));
      lbTitle.textContent = p.t;
      lbLink.href = pieceUrl(p.id);
      if (lbQuote) lbQuote.href = "/contact?ref=" + encodeURIComponent(p.id);   // the contact form opens with this piece filled in
      lbLink.textContent = "Asset details";
      setAddress(pieceUrl(p.id));
      lbVariants = [p.i].concat(p.imgs || []);
      lbActive = 0;
      renderLbThumbs();
    };
    hideLens();
    if (!dir || reduceMotion) { swap(); return; }
    lbImg.className = "loaded " + (dir > 0 ? "slide-out-left" : "slide-out-right");
    setTimeout(function () {
      swap();
      lbImg.className = "loaded " + (dir > 0 ? "slide-in-right" : "slide-in-left");
      setTimeout(function () { lbImg.className = "loaded"; }, 340);
    }, 200);
  }
  function closeLightbox() {
    if (!lb.classList.contains("open")) return;
    if (addressBeforeLb !== null) { setAddress(addressBeforeLb); addressBeforeLb = null; }
    hideLens();
    var origin = lbOrigin; lbOrigin = null;
    flipBack(origin, function () {
      lb.classList.remove("open");
      lb.setAttribute("aria-hidden", "true");
      document.body.classList.remove("no-scroll");
      clearClones();
    });
  }
  function stepLightbox(dir) {
    if (!visibleList.length) return;
    lbPos = (lbPos + dir + visibleList.length) % visibleList.length;
    var lbIdx = PROJECTS.indexOf(visibleList[lbPos]);
    lbOrigin = $('.work-card[data-index="' + lbIdx + '"], .collage-tile[data-index="' + lbIdx + '"], .collage-card[data-index="' + lbIdx + '"]') || lbOrigin;
    showLightbox(visibleList[lbPos], dir);
  }

  grid.addEventListener("click", function (e) {
    var card = e.target.closest(".work-card");
    if (card) { visibleList = filtered(); openLightbox(+card.dataset.index, card); }
  });
  grid.addEventListener("keydown", function (e) {
    var card = e.target.closest(".work-card");
    if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); visibleList = filtered(); openLightbox(+card.dataset.index); }
  });
  /* Extra views of the open piece. On wide screens the picture gets most of the screen and the other
     views sit in the two bottom corners (first half left, second half right, the one on show left out),
     their bottoms in line with the picture's; on small screens they stay as a row under the picture. */
  var lbVariants = [], lbActive = 0;
  var wideViewer = window.matchMedia ? window.matchMedia("(min-width: 1001px)") : { matches: true };
  function lbThumb(i) {
    return '<button class="asset-thumb' + (i === lbActive ? ' active' : '') + '" data-idx="' + i + '" aria-label="View image ' + (i + 1) + ' of ' + lbVariants.length + '">' + stripImg(lbVariants[i]) + '</button>';   // tiny copies, loaded once the main picture is in
  }
  /* Size the picture element to the picture itself: the largest fit inside one fixed box (wide pictures
     stop at its width, tall ones at its height), so the theme outline hugs the artwork. On wide screens
     the box is what the figure has left after the buttons row on top and the strip of views below. */
  function fitLbImg() {
    if (!lbImg.naturalWidth) return;
    var fig = lbFigure, cs = getComputedStyle(fig), boxW, boxH;
    if (lb.classList.contains("lb-split")) {
      var cap = $("figcaption", fig), strip = lbThumbs.children.length ? lbThumbs.offsetHeight : 0;
      var gap = parseFloat(cs.rowGap || cs.gap || 0);
      boxW = Math.min(fig.clientWidth, 1500);
      boxH = Math.min(750, fig.clientHeight - parseFloat(cs.paddingTop) - (cap ? cap.offsetHeight : 0) - strip - gap * (strip ? 2 : 1));
    } else {
      boxW = Math.min(window.innerWidth * 0.9, 1500);
      boxH = Math.min(window.innerHeight * 0.52, 1000);   // leaves room for the buttons and views below on a phone
    }
    var ratio = lbImg.naturalWidth / lbImg.naturalHeight, w = boxW, h = w / ratio;
    if (h > boxH) { h = boxH; w = h * ratio; }
    lbImg.style.width = Math.floor(w) + "px"; lbImg.style.height = Math.floor(h) + "px";
  }
  lbImg.addEventListener("load", function () { fitLbImg(); placeLbSides(); });
  // and once the viewer's opening zoom has finished (its size is final only then)
  lbFigure.addEventListener("transitionend", function (e) { if (e.target === lbFigure && e.propertyName === "transform") placeLbSides(); });
  function lbVAlign() { return lb.classList.contains("lb-split") ? 1 : 0.5; }

  /* Navigation. Wide screens: ‹ › = previous / next image of this piece, the two extra round buttons
     (and the Up / Down keys) = next / previous piece. All four hug the picture's sides. Small screens
     keep ‹ › for the previous / next piece and a row of views under the picture. */
  var lbPrevBtn = $("#lightboxPrev"), lbNextBtn = $("#lightboxNext");
  function lbCharButton(cls, label) {
    var bt = document.createElement("button");
    bt.className = "lightbox-nav lb-char " + cls; bt.setAttribute("aria-label", label);
    bt.innerHTML = '<span aria-hidden="true">&lsaquo;</span>';
    lb.appendChild(bt);
    return bt;
  }
  var lbCharNext = lbCharButton("lb-char--next", "Next piece"), lbCharPrev = lbCharButton("lb-char--prev", "Previous piece");
  // Lens buttons beside the picture on wide screens: zoom pair left, lens sizes + "no lens" right
  // (on small screens they move into a row under the picture, see renderLbThumbs)
  var lbLensPick = document.createElement("div");
  lbLensPick.className = "lb-lens-pick";
  lbLensPick.innerHTML = lensToolButtons("lens");
  var lbZoomPick = document.createElement("div");
  lbZoomPick.className = "lb-lens-pick lb-zoom-pick";
  lbZoomPick.innerHTML = lensToolButtons("zoom");
  lb.appendChild(lbLensPick); lb.appendChild(lbZoomPick);
  showLensMode();
  function showVariant(idx) {
    if (idx === lbActive || !lbVariants[idx]) return;
    lbActive = idx;
    hideLens();
    lbImg.classList.add("fading");
    setTimeout(function () {
      swapToFull(lbImg, lbVariants[idx], function () { return lbActive === idx; });
      lbImg.classList.remove("fading");
      renderLbThumbs();
    }, 160);
  }
  function stepImage(d) { showVariant(lbActive + d); }

  /* Every view of this piece in one strip under the picture: same height, width from each image's own
     proportions, centred, the one on show outlined like the picture. Any number of views fits: the strip
     scrolls sideways if it runs out of room. */
  /* Small screens: the four round buttons and the lens buttons move out of the corners into two rows under
     the picture (⌄ previous piece, ‹ previous image, › next image, ⌃ next piece / then the lens buttons). */
  var lbMobileBar = document.createElement("div"), lbMobileNav = document.createElement("div"), lbMobileTools = document.createElement("div");
  lbMobileBar.className = "lb-mobile-bar"; lbMobileNav.className = "lb-mobile-row"; lbMobileTools.className = "lb-mobile-row lb-mobile-tools";
  lbMobileBar.appendChild(lbMobileNav); lbMobileBar.appendChild(lbMobileTools);
  lbFigure.insertBefore(lbMobileBar, lbThumbs);
  function arrangeLbControls(split) {
    var navs = [lbCharPrev, lbPrevBtn, lbNextBtn, lbCharNext];
    if (split) navs.concat([lbLensPick, lbZoomPick]).forEach(function (el) { if (el.parentNode !== lb) lb.appendChild(el); });
    else { navs.forEach(function (el) { lbMobileNav.appendChild(el); }); lbMobileTools.appendChild(lbZoomPick); lbMobileTools.appendChild(lbLensPick); }
  }
  function renderLbThumbs() {
    var split = wideViewer.matches;
    lb.classList.toggle("lb-split", split);
    arrangeLbControls(split);
    var n = lbVariants.length;
    lbPrevBtn.disabled = lbActive === 0;
    lbNextBtn.disabled = lbActive >= n - 1;
    lbPrevBtn.setAttribute("aria-label", "Previous image");
    lbNextBtn.setAttribute("aria-label", "Next image");
    lbThumbs.innerHTML = n > 1 ? lbVariants.map(function (u, i) { return lbThumb(i); }).join("") : "";
    loadStripAfter(lbImg, lbThumbs);
    var on = $(".asset-thumb.active", lbThumbs);
    if (on && on.scrollIntoView && lbThumbs.scrollWidth > lbThumbs.clientWidth) on.scrollIntoView({ block: "nearest", inline: "center" });
    fitLbImg();
    placeLbSides();
    setTimeout(placeLbSides, 420);   // again once the viewer's opening zoom (0.35s) has settled
  }

  /* The four round buttons hug the picture's left and right edges (piece button above the middle, image
     button below it), placed from the picture's measured box so they follow wide and tall pictures. */
  function lbPlace(el, x, y) { el.style.left = Math.round(x) + "px"; el.style.top = Math.round(y) + "px"; el.style.right = "auto"; el.style.transform = "none"; }
  function placeLbSides() {
    var navs = [lbPrevBtn, lbNextBtn, lbCharPrev, lbCharNext];
    if (!lb.classList.contains("lb-split")) {
      navs.forEach(function (el) { el.style.left = el.style.top = el.style.right = el.style.transform = ""; });
      return;
    }
    var L = lb.getBoundingClientRect(), P = lbImg.getBoundingClientRect();
    if (!P.width) return;
    var gap = 14, bw = lbPrevBtn.offsetWidth || 56;
    var midY = P.top - L.top + P.height / 2;
    var leftX = P.left - L.left - gap - bw, rightX = P.right - L.left + gap;
    lbPlace(lbCharPrev, leftX, midY - bw - 8); lbPlace(lbPrevBtn, leftX, midY + 8);
    lbPlace(lbCharNext, rightX, midY - bw - 8); lbPlace(lbNextBtn, rightX, midY + 8);
    // lens buttons: right of the picture, standing on its bottom line
    lbPlace(lbLensPick, rightX + (bw - lbLensPick.offsetWidth) / 2, P.bottom - L.top - lbLensPick.offsetHeight);
    lbPlace(lbZoomPick, leftX + (bw - lbZoomPick.offsetWidth) / 2, P.bottom - L.top - lbZoomPick.offsetHeight);
  }
  window.addEventListener("resize", function () { if (lb.classList.contains("open")) { fitLbImg(); placeLbSides(); } });
  if (wideViewer.addEventListener) wideViewer.addEventListener("change", function () { if (lb.classList.contains("open")) renderLbThumbs(); });
  lb.addEventListener("click", function (e) {
    var btn = e.target.closest(".asset-thumb");
    if (btn) showVariant(+btn.dataset.idx);
  });
  // Magnifying lens on the big picture (only once the zoom-in animation has handed over)
  attachLens(lbImg, function () { return lb.classList.contains("open") && !lbFigure.classList.contains("hidden-for-flip") && !lbImg.classList.contains("fading"); });
  $("#lightboxClose").addEventListener("click", closeLightbox);
  lbPrevBtn.addEventListener("click", function () { stepImage(-1); });   // ‹ › = this piece's images, on every screen size
  lbNextBtn.addEventListener("click", function () { stepImage(1); });
  lbCharNext.addEventListener("click", function () { stepLightbox(1); });
  lbCharPrev.addEventListener("click", function () { stepLightbox(-1); });
  lb.addEventListener("click", function (e) { if (e.target === lb) closeLightbox(); });

  /* ------------------------------------------------------------------
     Games grid + trailer modal
     ------------------------------------------------------------------ */
  var gamesGrid = $("#gamesGrid");
  var GAME_PATHS = URLS.gamePaths(GAMES);   // /games/wavetale/ … one shareable address per game
  if (gamesGrid) gamesGrid.innerHTML = GAMES.map(function (g, i) {
    return (
      '<article class="game-card reveal" data-yt="' + esc(ytId(g.yt)) + '" data-game="' + i + '" tabindex="0" role="button" aria-label="Play trailer: ' + esc(g.t) + '" style="transition-delay:' + (i % 3) * 90 + 'ms">' +
        '<img ' + imgAttrs(g.i, "(max-width: 600px) 100vw, (max-width: 1100px) 50vw, 25vw") + ' alt="' + esc(g.t) + ' key art" loading="lazy" />' +
        '<span class="game-play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>' +
        '<div class="game-info"><div><span class="game-studio">' + esc(g.s || "") + '</span><span class="game-title">' + esc(g.t) + '</span></div><span class="game-tag">Watch trailer</span></div>' +
      '</article>'
    );
  }).join("");

  var vm = $("#videoModal");
  var vmFrame = $("#videoIframe");
  function openVideo(id) {
    if (!vm) return;
    id = ytId(id);
    track("trailer_played", { video: id });
    vmFrame.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0";
    vm.classList.add("open");
    vm.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
  }
  // While a game's trailer is open, the address shows that game's own link (/games/wavetale/) so it can be
  // copied and sent to a client; closing the trailer puts back the address from before.
  var addressBeforeVideo = null, titleBeforeVideo = null;
  function openGame(i) {
    var g = GAMES[i];
    if (!g) return;
    openVideo(g.yt);
    if (addressBeforeVideo === null) { addressBeforeVideo = location.pathname + location.search; titleBeforeVideo = document.title; }
    setAddress(GAME_PATHS[i]);
    document.title = g.t + " | Brothers Interactive";
  }
  function closeVideo() {
    if (!vm) return;
    vm.classList.remove("open");
    vm.setAttribute("aria-hidden", "true");
    vmFrame.src = "";
    document.body.classList.remove("no-scroll");
    if (addressBeforeVideo !== null) { setAddress(addressBeforeVideo); document.title = titleBeforeVideo; addressBeforeVideo = titleBeforeVideo = null; }
  }
  if (gamesGrid) {
    gamesGrid.addEventListener("click", function (e) {
      var card = e.target.closest(".game-card");
      if (card) openGame(+card.dataset.game);
    });
    gamesGrid.addEventListener("keydown", function (e) {
      var card = e.target.closest(".game-card");
      if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openGame(+card.dataset.game); }
    });
    // Arriving on a game's own link (made by the build step): open its trailer; closing it leaves /games/
    var gameAtStart = PAGE_INFO.game ? GAME_PATHS.indexOf("/games/" + PAGE_INFO.game + "/") : -1;
    if (gameAtStart !== -1) {
      // the page's own title names the game (for link previews); after closing, /games/ gets the site's title
      addressBeforeVideo = URLS.sectionPath("games"); titleBeforeVideo = "Brothers Interactive | 3D Characters for Games";
      openGame(gameAtStart);
    }
  }
  if (vm) {
    $("#videoClose").addEventListener("click", closeVideo);
    vm.addEventListener("click", function (e) { if (e.target === vm) closeVideo(); });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeLightbox(); closeVideo(); closeNav(); }
    if (lb.classList.contains("open")) {
      // ← → this piece's previous / next image, ↑ ↓ next / previous piece
      if (e.key === "ArrowLeft") { e.preventDefault(); stepImage(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); stepImage(1); }
      if (e.key === "ArrowUp") { e.preventDefault(); stepLightbox(1); }
      if (e.key === "ArrowDown") { e.preventDefault(); stepLightbox(-1); }
    }
  });

  /* ------------------------------------------------------------------
     Case studies
     ------------------------------------------------------------------ */
  var caseList = $("#caseList");
  function casePieces(c) {
    return c.cat ? PROJECTS.filter(function (p) { return p.c === c.cat; }) : [];
  }
  if (caseList) caseList.innerHTML = CASES.map(function (c, i) {
    var pieces = casePieces(c);
    var thumbs = pieces.slice(0, 6).map(function (p) {
      return '<button class="case-thumb" data-index="' + PROJECTS.indexOf(p) + '" data-case="' + i + '" aria-label="Open ' + esc(p.t) + '"><img src="' + p.i + '" alt="' + esc(p.t) + '" loading="lazy" /></button>';
    }).join("");
    var piecesHtml = pieces.length
      ? '<div class="case-pieces"><span class="case-pieces-label">' + pieces.length + ' published asset' + (pieces.length > 1 ? 's' : '') + ' from this project</span><div class="case-thumbs">' + thumbs + '</div></div>'
      : '<div class="case-pieces case-pieces--nda"><span class="case-pieces-label">Asset breakdowns available on request</span></div>';
    return (
      '<article class="case-card reveal' + (i % 2 ? ' case-card--flip' : '') + '">' +
        '<div class="case-media" data-yt="' + esc(ytId(c.yt)) + '" role="button" tabindex="0" aria-label="Play trailer: ' + esc(c.t) + '">' +
          '<img src="' + c.img + '" alt="' + esc(c.t) + ' key art" loading="lazy" />' +
          '<span class="game-play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>' +
        '</div>' +
        '<div class="case-body">' +
          '<span class="case-num">Case ' + (i + 1 < 10 ? '0' : '') + (i + 1) + '</span>' +
          '<h3 class="case-title">' + esc(c.t) + '</h3>' +
          '<ul class="case-meta">' +
            '<li><span>Client</span>' + esc(c.client) + '</li>' +
            '<li><span>Year</span>' + esc(c.year) + '</li>' +
            '<li><span>Style</span>' + esc(c.style) + '</li>' +
            '<li><span>Engine</span>' + esc(c.engine) + '</li>' +
          '</ul>' +
          '<p class="case-summary">' + esc(c.summary) + '</p>' +
          (c.stats ? '<ul class="case-stats">' + c.stats.map(function (st) { return '<li><strong>' + esc(st[1]) + '</strong><span>' + esc(st[0]) + '</span></li>'; }).join("") + '</ul>' : '') +
          '<ul class="case-scope">' + c.scope.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join("") + '</ul>' +
          piecesHtml +
        '</div>' +
      '</article>'
    );
  }).join("");

  if (caseList) caseList.addEventListener("click", function (e) {
    var media = e.target.closest(".case-media");
    if (media) { openVideo(media.dataset.yt); return; }
    var thumb = e.target.closest(".case-thumb");
    if (thumb) {
      visibleList = casePieces(CASES[+thumb.dataset.case]);
      openLightbox(+thumb.dataset.index, thumb);
    }
  });
  if (caseList) caseList.addEventListener("keydown", function (e) {
    var media = e.target.closest(".case-media");
    if (media && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openVideo(media.dataset.yt); }
  });

  /* ------------------------------------------------------------------
     Blog
     ------------------------------------------------------------------ */
  var blogGridEl = $("#blogGrid");
  if (blogGridEl) blogGridEl.innerHTML = POSTS.map(function (p, i) {
    var id = ytId(p.yt);
    return (
      '<article class="game-card reveal" data-yt="' + esc(id) + '" tabindex="0" role="button" aria-label="Play video: ' + esc(p.t) + '" style="transition-delay:' + (i % 3) * 90 + 'ms">' +
        // the site's own copy (made by tools/build.js from the post's Thumbnail, or YouTube's picture); YouTube's if missing.
        // On the Blog page itself they load at once instead of waiting for the scroll down to the section.
        '<img src="assets/img/thumbs/blog/' + esc(id) + '.webp" alt="' + esc(p.t) + '"' + (PAGE_INFO.section === "blog" ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async"' +
        ' onerror="this.onerror=null;this.src=\'https://img.youtube.com/vi/' + esc(id) + '/hqdefault.jpg\'" />' +
        '<span class="game-play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>' +
        '<div class="game-info"><div><span class="game-title">' + esc(p.t) + '</span></div><span class="game-tag">Watch video</span></div>' +
      '</article>'
    );
  }).join("");

  if (blogGridEl) {
    blogGridEl.addEventListener("click", function (e) {
      var card = e.target.closest(".game-card");
      if (card) openVideo(card.dataset.yt);
    });
    blogGridEl.addEventListener("keydown", function (e) {
      var card = e.target.closest(".game-card");
      if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openVideo(card.dataset.yt); }
    });
  }

  } /* ---- end HOME PAGE ONLY block ---- */

  /* ------------------------------------------------------------------
     Drag-to-compare slider (sculpt/final) — delegated at document level,
     not scoped to #compareGrid, so any page with static .compare-stage
     markup (e.g. breakdown.html) gets a working slider for free.
     ------------------------------------------------------------------ */
  document.addEventListener("input", function (e) {
    var r = e.target.closest(".compare-range"); if (!r) return;
    var st = r.parentElement, v = +r.value;
    $(".compare-before", st).style.clipPath = "inset(0 " + (100 - v) + "% 0 0)";
    $(".compare-handle", st).style.left = v + "%";
  });

  /* ------------------------------------------------------------------
     Testimonials + open roles (data-driven, used on several pages)
     ------------------------------------------------------------------ */
  var tGrid = $("#testimonialGrid");
  if (tGrid) {
    var initials = function (n) { return String(n || "").split(/\s+/).map(function (w) { return w.charAt(0); }).join("").slice(0, 2).toUpperCase() || "BI"; };
    var tCards = TESTIMONIALS.map(function (t) {
          return '<blockquote class="testimonial">' +
            (t.sample ? '<span class="sample-badge" title="Replace in data.js">Sample</span>' : '') +
            '<span class="quote-mark" aria-hidden="true">&ldquo;</span>' +
            '<p>' + esc(t.q) + '</p>' +
            '<footer>' +
              (t.img ? '<img class="t-avatar" src="' + t.img + '" alt="' + esc(t.n) + '" loading="lazy" />' : '<span class="t-avatar t-avatar--initials">' + esc(initials(t.n)) + '</span>') +
              '<div><strong>' + esc(t.n) + '</strong><span>' + esc(t.r) + (t.project ? ' &middot; ' + esc(t.project) : '') + '</span></div>' +
            '</footer>' +
          '</blockquote>';
        }).join("");
    // Horizontal auto-scrolling strip, like the logo wall. One "set" repeats the
    // quotes until it's wider than any screen (so a short list never leaves a gap),
    // then the set is duplicated once so translateX(-50%) loops seamlessly.
    // Everything after the first copy of each quote is hidden from screen readers.
    var tHidden = tCards.replace(/<blockquote class="testimonial">/g, '<blockquote class="testimonial" aria-hidden="true">');
    var tRepeats = Math.max(1, Math.ceil(6 / Math.max(1, TESTIMONIALS.length)));
    var tSet = tCards; for (var ti = 1; ti < tRepeats; ti++) tSet += tHidden;
    var tSetHidden = ""; for (var tj = 0; tj < tRepeats; tj++) tSetHidden += tHidden;
    tGrid.innerHTML = TESTIMONIALS.length
      ? '<div class="testimonial-track" style="animation-duration:' + (TESTIMONIALS.length * tRepeats * 9) + 's">' + tSet + tSetHidden + '</div>'
      : '<p class="portfolio-empty">Client quotes are being collected. Ask us for references directly.</p>';
  }
  $$("[data-roles]").forEach(function (list) {
    var applyHref = list.dataset.roles === "full" ? URLS.sectionPath("careers") : null;
    list.innerHTML = ROLES.length
      ? ROLES.map(function (r) {
          var href = applyHref || ("mailto:" + EMAIL + "?subject=" + encodeURIComponent("Application: " + r.t));
          return '<li class="role"><div><strong>' + esc(r.t) + '</strong><span>' + esc(r.type) + '</span></div><p>' + esc(r.d) + '</p><a href="' + href + '">Apply &rarr;</a></li>';
        }).join("")
      : '<li class="role role--empty">No open roles right now. Check back soon or send a speculative portfolio below.</li>';
  });
  if ($("#rolesCount")) $("#rolesCount").textContent = ROLES.length ? ROLES.length + " open role" + (ROLES.length > 1 ? "s" : "") : "No open roles at the moment";

  /* ------------------------------------------------------------------
     Header, mobile nav, active link, scroll progress, back to top
     ------------------------------------------------------------------ */
  var header = $("#siteHeader");
  var nav = $("#mainNav");
  var toggle = $("#navToggle");
  var progress = $("#scrollProgress");
  var backToTop = $("#backToTop");
  var navLinks = $$(".nav-link");
  var sections = navLinks.map(function (a) {
    var href = a.getAttribute("href") || "";
    return href.charAt(0) === "#" && href.length > 1 ? $(href) : null;
  }).filter(Boolean);

  function closeNav() {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  }
  toggle.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  navLinks.forEach(function (a) { a.addEventListener("click", closeNav); });

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (header) header.classList.toggle("scrolled", y > 20);
    if (progress) progress.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";
    if (backToTop) backToTop.classList.toggle("show", y > 600);

    if (!sections.length) return; // sub-pages highlight their own link via the markup
    var current = sections[0];
    var probe = y + window.innerHeight * 0.35;
    // a section hidden in /admin has no box (offsetTop 0), so it must never count as the one on screen
    sections.forEach(function (s) { if (s.offsetParent !== null && s.offsetTop <= probe) current = s; });
    navLinks.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + current.id); });
    // The address follows the highlighted menu item (/ , /portfolio/, /team/ …) once the visitor is
    // moving around, never while an artwork is open in the viewer (that shows the artwork's own link).
    if (addressFollowsScroll && addressBeforeLb === null && addressBeforeVideo === null && URLS.SECTIONS.indexOf(current.id) !== -1) setAddress(URLS.sectionPath(current.id));
  }
  // Not on first paint: a /team/ page must not flash "/" before it has scrolled down to Team.
  var addressFollowsScroll = false;
  ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (t) {
    window.addEventListener(t, function () { addressFollowsScroll = true; }, { passive: true, once: true });
  });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  if (backToTop) backToTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

  /* ------------------------------------------------------------------
     Reveal on scroll + counters
     ------------------------------------------------------------------ */
  function animateCount(el) {
    var target = +el.dataset.count;
    var suffix = el.dataset.suffix || "";
    var start = null;
    var dur = 1400;
    function tick(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  var io = null;
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("in");
        $$(".stat-num[data-count]", en.target).forEach(function (n) { if (!n.dataset.done) { n.dataset.done = "1"; animateCount(n); } });
        io.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  }
  /* Watches every .reveal element not yet watched. Called again at the end so elements
     rendered later in this script (comparison sliders, credits) are picked up too. */
  function watchReveals() {
    $$(".reveal").forEach(function (el) {
      if (el.dataset.watched) return;
      el.dataset.watched = "1";
      if (io) io.observe(el);
      else { el.classList.add("in"); $$(".stat-num[data-count]", el).forEach(animateCount); }
    });
    revealVisible();
  }
  /* Belt-and-braces: anything already inside the viewport is revealed straight away,
     independent of IntersectionObserver timing. Also runs on every scroll. */
  function revealVisible() {
    var h = window.innerHeight;
    $$(".reveal:not(.in)").forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < h - 40 && r.bottom > 0) {
        el.classList.add("in");
        $$(".stat-num[data-count]", el).forEach(function (n) { if (!n.dataset.done) { n.dataset.done = "1"; animateCount(n); } });
      }
    });
  }
  watchReveals();
  window.addEventListener("scroll", revealVisible, { passive: true });
  window.addEventListener("load", revealVisible);

  /* ------------------------------------------------------------------
     Contact form — posts to EMAIL via FormSubmit.co (see sendForm)
     ------------------------------------------------------------------ */
  var form = $("#contactForm");
  var note = $("#formNote");
  if (form) form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("#cfName"), email = $("#cfEmail"), msg = $("#cfMessage");
    var ok = true;
    [name, email, msg].forEach(function (f) {
      var valid = f.value.trim() !== "" && (f.type !== "email" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value));
      f.parentElement.classList.toggle("invalid", !valid);
      if (!valid) ok = false;
    });
    if (!ok) {
      note.className = "form-note err";
      note.textContent = "Please fill in every field with a valid email address.";
      return;
    }
    var extra = [
      ["Studio", $("#cfStudio").value], ["Asset type", $("#cfType").value], ["Art style", $("#cfStyle").value],
      ["Asset count", $("#cfCount").value], ["Deadline", $("#cfDeadline").value]
    ].filter(function (f) { return f[1].trim(); }).map(function (f) { return f[0] + ": " + f[1].trim(); }).join("\n");
    var subjectText = "Project brief from " + name.value.trim() + ($("#cfStudio").value.trim() ? " (" + $("#cfStudio").value.trim() + ")" : "");
    var bodyText = (extra ? extra + "\n\n" : "") + msg.value.trim() + "\n\n— " + name.value.trim() + " (" + email.value.trim() + ")";
    var payload = {
      _subject: subjectText, name: name.value.trim(), email: email.value.trim(), studio: $("#cfStudio").value.trim(),
      assetType: $("#cfType").value, artStyle: $("#cfStyle").value, assetCount: $("#cfCount").value.trim(),
      deadline: $("#cfDeadline").value.trim(), message: msg.value.trim()
    };
    sendForm(form, note, payload, "brief_sent", "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subjectText) + "&body=" + encodeURIComponent(bodyText));
  });

  /* ------------------------------------------------------------------
     Site settings: analytics, availability pill, booking + deck buttons
     ------------------------------------------------------------------ */
  if (CFG.plausibleDomain) {
    var pa = document.createElement("script"); pa.defer = true; pa.setAttribute("data-domain", CFG.plausibleDomain);
    pa.src = "https://plausible.io/js/script.js"; document.head.appendChild(pa);
  }
  var pill = $("#availability");
  if (pill) {
    if (CFG.availability) { pill.hidden = false; $(".avail-text", pill).textContent = CFG.availability; if (CFG.availabilityNote) pill.title = CFG.availabilityNote; }
    else pill.hidden = true;
  }
  $$("[data-booking]").forEach(function (a) { if (CFG.bookingUrl) { a.href = normalizeUrl(CFG.bookingUrl); a.hidden = false; } else { a.hidden = true; } });
  $$("[data-deck]").forEach(function (a) {
    if (CFG.deckPdf) { a.href = CFG.deckPdf; a.addEventListener("click", function () { track("deck_downloaded"); }); } else { a.hidden = true; }
  });

  /* ------------------------------------------------------------------
     Client logo wall (text wordmarks until logos are supplied)
     ------------------------------------------------------------------ */
  var wall = $("#logoWall");
  if (wall && CLIENTS.length) {
    var logoItems = CLIENTS.map(function (c) {
      return '<li>' + (c.logo ? '<img src="' + c.logo + '" alt="' + esc(c.n) + '" loading="lazy" />' : '<span class="wordmark">' + esc(c.n) + '</span>') + '</li>';
    }).join("");
    // Scrolling ticker: duplicated once so translateX(-50%) loops seamlessly.
    wall.innerHTML = logoItems + logoItems;
  }

  /* ------------------------------------------------------------------
     Shared media helpers: YouTube, looping GIF/video, Sketchfab
     ------------------------------------------------------------------ */
  function isVideoFile(u) { return /\.(mp4|webm)(\?|#|$)/i.test(u || ""); }
  function isGif(u) { return /\.gif(\?|#|$)/i.test(u || ""); }
  function ytThumb(v) { return "https://img.youtube.com/vi/" + ytId(v) + "/hqdefault.jpg"; }
  function sketchfabId(v) { var m = String(v || "").match(/([0-9a-f]{32})/i); return m ? m[1] : ""; }
  /* Marmoset Viewer: shows an .mview file (uploaded in /admin) in box with Marmoset's official player,
     loaded only when a page actually has one. The player is kept on this site (js/vendor/marmoset.js, Marmoset allows
     redistribution unmodified) so it never waits on viewer.marmoset.co. */
  function mountMarmoset(box, url) {
    box.innerHTML = '<p class="bd-embed-note">Loading Marmoset viewer&hellip;</p>';
    var start = function () {
      if (!window.marmoset) { box.innerHTML = '<p class="bd-embed-note">The Marmoset viewer could not load.</p>'; return; }
      var viewer = new window.marmoset.WebViewer(box.clientWidth, box.clientHeight, url);
      box.innerHTML = ""; box.appendChild(viewer.domRoot); viewer.loadScene();
      window.addEventListener("resize", function () { viewer.resize(box.clientWidth, box.clientHeight); });
    };
    if (window.marmoset) { start(); return; }
    var ms = document.createElement("script");
    ms.src = "/js/vendor/marmoset.js";
    ms.onload = start; ms.onerror = start;
    document.head.appendChild(ms);
  }
  function loopMedia(u, alt, cls) {
    return isVideoFile(u)
      ? '<video class="' + cls + '" src="' + esc(u) + '" autoplay muted loop playsinline preload="metadata" aria-label="' + esc(alt) + '"></video>'
      : '<img class="' + cls + '" src="' + esc(u) + '" alt="' + esc(alt) + '" loading="lazy" />';
  }
  // Plays a YouTube video in the page's pop-up player (homepage); elsewhere opens YouTube.
  function openYouTube(v) {
    var m = $("#videoModal"), fr = $("#videoIframe"), id = ytId(v);
    if (!m || !fr) { window.open("https://www.youtube.com/watch?v=" + id, "_blank", "noopener"); return; }
    track("trailer_played", { video: id });
    fr.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0";
    m.classList.add("open"); m.setAttribute("aria-hidden", "false"); document.body.classList.add("no-scroll");
  }

  /* ------------------------------------------------------------------
     Sculpt-to-final cards (homepage). Each pair (/admin > Sculpt to Final) shows,
     in order of priority: a YouTube video (plays in the pop-up), a looping GIF or
     video file, or the before/after drag slider.
     ------------------------------------------------------------------ */
  var cmp = $("#compareGrid");
  if (cmp) {
    // Homepage shows the first 3 usable pairs only; reorder them in /admin to choose which.
    var pairsShown = PAIRS.filter(function (p) { return p && (p.youtube || p.video || (p.before && p.after)); }).slice(0, 3);
    cmp.innerHTML = pairsShown.map(function (pr, i) {
      var stage;
      if (pr.youtube) {
        stage = '<button type="button" class="compare-stage compare-media compare-yt" data-yt="' + esc(ytId(pr.youtube)) + '" aria-label="Play the ' + esc(pr.t) + ' video">' +
          '<img src="' + ytThumb(pr.youtube) + '" alt="" loading="lazy" /><span class="play-badge" aria-hidden="true">&#9654;</span></button>';
      } else if (pr.video) {
        stage = '<div class="compare-stage compare-media">' + loopMedia(pr.video, pr.t, "compare-loop") + '</div>';
      } else {
        stage = '<div class="compare-stage">' +
          '<img class="compare-after" ' + imgAttrs(pr.after, "(max-width: 600px) 100vw, 33vw") + ' alt="' + esc(pr.t) + ' final" loading="lazy" />' +
          '<img class="compare-before" ' + imgAttrs(pr.before, "(max-width: 600px) 100vw, 33vw") + ' alt="' + esc(pr.t) + ' sculpt" loading="lazy" style="clip-path: inset(0 50% 0 0)" />' +
          '<span class="compare-handle" style="left:50%" aria-hidden="true"></span>' +
          '<span class="compare-label compare-label--a">Sculpt</span><span class="compare-label compare-label--b">Final</span>' +
          '<input type="range" class="compare-range" min="0" max="100" value="50" aria-label="Compare sculpt and final for ' + esc(pr.t) + '" />' +
        '</div>';
      }
      return '<figure class="compare reveal" style="transition-delay:' + (i % 3) * 90 + 'ms">' + stage +
        '<figcaption><span>' + esc(pr.t) + '</span>' + (pr.id ? '<a href="' + pieceUrl(pr.id) + '">Details &rarr;</a>' : '') + '</figcaption>' +
      '</figure>';
    }).join("");
    cmp.addEventListener("click", function (e) {
      var b = e.target.closest(".compare-yt");
      if (b) openYouTube(b.dataset.yt);
    });
  }

  /* ------------------------------------------------------------------
     Production breakdowns (/admin > Breakdowns -> data/breakdowns.json)
     Homepage: tiles, 3 per row, each opening /breakdowns/<id>/.
     breakdown.html: one breakdown (any mix of Sketchfab / Marmoset 3D viewer,
     sculpt-to-final slider, YouTube, GIF/video, gallery, pipeline steps), or
     the list of all breakdowns when no id is given.
     ------------------------------------------------------------------ */
  var BREAKDOWNS = loadList("breakdowns", []).filter(function (b) { return b && b.t && b.id; });
  function bdCover(b) { return b.cover || b.after || (b.gallery && b.gallery[0]) || (b.youtube ? ytThumb(b.youtube) : "") || (b.video && !isVideoFile(b.video) ? b.video : "") || b.before || ""; }
  function bdBadges(b) {
    var t = [];
    if (b.sketchfab || b.marmoset) t.push("3D viewer");
    if (b.youtube || isVideoFile(b.video)) t.push("Video");
    if (isGif(b.video)) t.push("GIF");
    if (b.before && b.after) t.push("Sculpt → Final");
    return t;
  }
  function bdTile(b, i) {
    var c = bdCover(b), badges = bdBadges(b);
    return '<a class="style-tile bd-tile reveal" href="' + URLS.breakdownPath(b.id) + '" style="transition-delay:' + (i % 3) * 70 + 'ms" aria-label="Open the ' + esc(b.t) + ' breakdown">' +
      (c ? '<img ' + imgAttrs(c, "(max-width: 600px) 50vw, 33vw") + ' alt="" loading="lazy" />' : '') +
      '<span class="style-tile-label">' + esc(b.t) +
        (badges.length ? '<small class="bd-badges">' + badges.map(function (x) { return '<i>' + esc(x) + '</i>'; }).join("") + '</small>' : '') +
      '</span></a>';
  }
  var bdGrid = $("#breakdownGrid");
  if (bdGrid) {
    bdGrid.innerHTML = BREAKDOWNS.length ? BREAKDOWNS.slice(0, 6).map(bdTile).join("") : '<p class="portfolio-empty">Breakdowns coming soon.</p>';
    if (BREAKDOWNS.length > 6 && $("#breakdownMore")) $("#breakdownMore").hidden = false;
  }

  var bdPage = $("#breakdownPage");
  if (bdPage) {
    var bdId = PAGE_INFO.bd || decodeURIComponent((location.search.match(/[?&]id=([^&#]+)/) || [])[1] || "");
    var B = bdId ? BREAKDOWNS.filter(function (b) { return b.id === bdId; })[0] : null;
    setAddress(URLS.breakdownPath(B ? B.id : ""));
    var DEFAULT_STEPS = [
      { t: "Brief & Reference", d: "Concept art and reference gathered, style and quality target confirmed before any sculpting starts." },
      { t: "Blockout", d: "Fast proportion and silhouette pass to lock the read of the character early." },
      { t: "High-poly Sculpt", d: "Full anatomy, cloth and hard-surface detail." },
      { t: "Retopology & UVs", d: "Clean, animation-friendly topology and UV layouts packed for the target texel density." },
      { t: "Baking & Texturing", d: "Normal, AO and ID bakes, then textures matched to the art direction." },
      { t: "Final Polish", d: "Lighting, render setup and the final presentation pass." }
    ];
    if (!B) {
      // List of every breakdown
      bdPage.innerHTML =
        '<section class="page-hero page-hero--compact"><div class="container page-hero-inner"><div class="reveal">' +
          '<p class="eyebrow"><span class="eyebrow-dot"></span> <a href="' + URLS.sectionPath("breakdown") + '">&larr; Home</a> / Breakdowns</p>' +
          '<h1 class="page-title">Production <span class="accent">breakdowns</span></h1>' +
          '<p class="page-sub">' + (bdId ? 'That breakdown could not be found. Here are all of them.' : 'Sculpt to final, in detail, for selected characters.') + '</p>' +
        '</div></div></section>' +
        '<section class="section section--flush-top"><div class="container"><div class="style-grid">' +
          (BREAKDOWNS.length ? BREAKDOWNS.map(bdTile).join("") : '<p class="portfolio-empty">Breakdowns coming soon.</p>') +
        '</div></div></section>';
    } else {
      document.title = B.t + " Breakdown | Brothers Interactive";
      var n = 0, secs = [];
      var pad = function (k) { return (k < 10 ? "0" : "") + k; };
      var sec = function (label, titleHtml, sub, body) {
        n++;
        return '<section class="section' + (n % 2 ? '' : ' section--alt') + '"><div class="container">' +
          '<div class="section-head reveal"><p class="eyebrow">// ' + pad(n) + ' &middot; ' + esc(label) + '</p>' +
          '<h2 class="section-title">' + titleHtml + '</h2>' + (sub ? '<p class="section-sub">' + esc(sub) + '</p>' : '') + '</div>' +
          body + '</div></section>';
      };
      var sfId = sketchfabId(B.sketchfab);
      if (sfId || B.marmoset) {
        secs.push(sec("Interactive 3D", 'Explore it <span class="accent">in 3D</span>', "Drag to orbit, scroll to zoom. The real asset, not a render.",
          (sfId ? '<div class="bd-embed reveal"><iframe title="' + esc(B.t) + ' 3D model" src="https://sketchfab.com/models/' + sfId + '/embed?autostart=0&ui_theme=dark&dnt=1" allow="autoplay; fullscreen; xr-spatial-tracking" allowfullscreen loading="lazy"></iframe></div>' : '') +
          (B.marmoset ? '<div class="bd-embed reveal' + (sfId ? ' bd-embed--gap' : '') + '" id="bdMarmoset"><p class="bd-embed-note">Loading Marmoset viewer&hellip;</p></div>' : '')));
      }
      if (B.before && B.after) {
        secs.push(sec("Sculpt to final", 'Drag to see the <span class="accent">work underneath</span>', "High-poly sculpt on the left, textured game-ready asset on the right.",
          '<figure class="compare compare--large reveal"><div class="compare-stage">' +
            '<img class="compare-after" src="' + esc(B.after) + '" alt="' + esc(B.t) + ' final" loading="lazy" />' +
            '<img class="compare-before" src="' + esc(B.before) + '" alt="' + esc(B.t) + ' sculpt" loading="lazy" style="clip-path: inset(0 50% 0 0)" />' +
            '<span class="compare-handle" style="left:50%" aria-hidden="true"></span>' +
            '<span class="compare-label compare-label--a">Sculpt</span><span class="compare-label compare-label--b">Final</span>' +
            '<input type="range" class="compare-range" min="0" max="100" value="50" aria-label="Compare sculpt and final for ' + esc(B.t) + '" />' +
          '</div></figure>'));
      }
      if (B.youtube) {
        secs.push(sec("Video", 'Watch the <span class="accent">process</span>', "",
          '<div class="bd-embed reveal"><iframe title="' + esc(B.t) + ' video" src="https://www.youtube-nocookie.com/embed/' + esc(ytId(B.youtube)) + '?rel=0" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>'));
      }
      if (B.video) {
        secs.push(sec(isGif(B.video) ? "In motion" : "Turntable", 'In <span class="accent">motion</span>', "",
          '<div class="bd-media reveal">' + loopMedia(B.video, B.t + " in motion", "bd-loop") + '</div>'));
      }
      if (B.gallery && B.gallery.length) {
        secs.push(sec("Gallery", 'Final <span class="accent">renders</span>', "Click any image to see it full size.",
          '<div class="bd-gallery">' + B.gallery.map(function (u, i) {
            return '<a class="reveal" href="' + esc(u) + '" data-i="' + i + '" style="transition-delay:' + (i % 3) * 70 + 'ms"><img ' + imgAttrs(u, "(max-width: 600px) 50vw, 33vw") + ' alt="' + esc(B.t) + ' render ' + (i + 1) + '" loading="lazy" /></a>';
          }).join("") + '</div>'));
      }
      var steps = (B.steps && B.steps.length) ? B.steps : DEFAULT_STEPS;
      secs.push(sec("How this piece was made", 'Stage by <span class="accent">stage</span>', "The same pipeline behind every character we ship.",
        '<ol class="process-grid">' + steps.map(function (s, i) {
          return '<li class="process-step reveal"><span class="process-num">' + pad(i + 1) + '</span><h3>' + esc(s.t || "") + '</h3><p>' + esc(s.d || "") + '</p></li>';
        }).join("") + '</ol>'));

      var descHtml = String(B.desc || "").split(/\n\s*\n/).filter(Boolean).map(function (p) { return '<p class="page-sub bd-desc">' + esc(p.trim()) + '</p>'; }).join("");
      bdPage.innerHTML =
        '<section class="page-hero page-hero--compact"><div class="container page-hero-inner"><div class="reveal">' +
          '<p class="eyebrow"><span class="eyebrow-dot"></span> <a href="' + URLS.breakdownPath() + '">&larr; Breakdowns</a> / ' + esc(B.t) + '</p>' +
          '<h1 class="page-title">' + esc(B.t) + ' <span class="accent">Breakdown</span></h1>' +
          (B.sub ? '<p class="page-sub">' + esc(B.sub) + '</p>' : '') + descHtml +
          '<div class="hero-actions">' +
            (B.assetId ? '<a href="' + pieceUrl(B.assetId) + '" class="btn btn--primary">View full asset page</a>' : '') +
            '<a href="/contact" class="btn btn--ghost">Get a breakdown like this</a>' +
          '</div>' +
        '</div></div></section>' + secs.join("");

      // Gallery: open renders in a full-screen viewer (same look as the portfolio lightbox) instead of a new tab/download.
      if (B.gallery && B.gallery.length) {
        var gl = document.createElement("div");
        gl.className = "lightbox"; gl.setAttribute("aria-hidden", "true"); gl.setAttribute("role", "dialog"); gl.setAttribute("aria-label", "Image viewer");
        gl.innerHTML = '<button class="lightbox-close" aria-label="Close">&times;</button>' +
          (B.gallery.length > 1 ? '<button class="lightbox-nav lightbox-prev" aria-label="Previous">&lsaquo;</button><button class="lightbox-nav lightbox-next" aria-label="Next">&rsaquo;</button>' : '') +
          '<figure class="lightbox-figure"><img class="loaded" alt="" /><figcaption><span class="lightbox-title"></span></figcaption></figure>';
        document.body.appendChild(gl);
        var glImg = $("img", gl), glCap = $(".lightbox-title", gl), glPos = 0;
        var glShow = function (i) {
          glPos = (i + B.gallery.length) % B.gallery.length;
          glImg.src = B.gallery[glPos]; glImg.alt = B.t + " render " + (glPos + 1);
          glCap.textContent = B.t + (B.gallery.length > 1 ? "  ·  " + (glPos + 1) + " / " + B.gallery.length : "");
        };
        var glClose = function () { gl.classList.remove("open"); gl.setAttribute("aria-hidden", "true"); document.body.classList.remove("no-scroll"); };
        $(".bd-gallery", bdPage).addEventListener("click", function (e) {
          var a = e.target.closest("a"); if (!a) return;
          e.preventDefault();
          glShow(+a.dataset.i);
          gl.classList.add("open"); gl.setAttribute("aria-hidden", "false"); document.body.classList.add("no-scroll");
        });
        gl.addEventListener("click", function (e) {
          if (e.target === gl || e.target.closest(".lightbox-close")) glClose();
          else if (e.target.closest(".lightbox-prev")) glShow(glPos - 1);
          else if (e.target.closest(".lightbox-next")) glShow(glPos + 1);
        });
        document.addEventListener("keydown", function (e) {
          if (!gl.classList.contains("open")) return;
          if (e.key === "Escape") glClose();
          else if (e.key === "ArrowLeft") glShow(glPos - 1);
          else if (e.key === "ArrowRight") glShow(glPos + 1);
        });
      }

      // Marmoset Viewer: .mview file uploaded in /admin, rendered with Marmoset's official player.
      if (B.marmoset) {
        var mBox = $("#bdMarmoset");
        var startMarmoset = function () {
          if (!window.marmoset || !mBox) { if (mBox) mBox.innerHTML = '<p class="bd-embed-note">The Marmoset viewer could not load.</p>'; return; }
          var w = mBox.clientWidth, h = mBox.clientHeight;
          var viewer = new window.marmoset.WebViewer(w, h, B.marmoset);
          mBox.innerHTML = ""; mBox.appendChild(viewer.domRoot); viewer.loadScene();
          window.addEventListener("resize", function () { viewer.resize(mBox.clientWidth, mBox.clientHeight); });
        };
        var ms = document.createElement("script");
        ms.src = "/js/vendor/marmoset.js";
        ms.onload = startMarmoset; ms.onerror = startMarmoset;
        document.head.appendChild(ms);
      }
    }
  }

  /* ------------------------------------------------------------------
     Quote estimator (artist-days, from ESTIMATOR ranges in data.js)
     ------------------------------------------------------------------ */
  var est = $("#estimator");
  if (est && BI.ESTIMATOR) {
    var E = BI.ESTIMATOR;
    var typeSel = $("#estType");
    typeSel.innerHTML = Object.keys(E.types).map(function (k) { return '<option>' + esc(k) + '</option>'; }).join("");
    var runEstimate = function () {
      var t = E.types[typeSel.value] || {}; var style = $("#estStyle").value; var n = Math.max(1, +$("#estCount").value || 1);
      var rig = $("#estRig").checked; var variants = Math.max(0, +$("#estVariants").value || 0);
      var r = t[style] || t.realistic || [1, 2];
      var lo = r[0] * n, hi = r[1] * n;
      var isChar = /character|creature/i.test(typeSel.value);
      if (rig && isChar) { lo += E.rigging[0] * n; hi += E.rigging[1] * n; }
      if (variants) { lo += E.outfitVariant[0] * variants; hi += E.outfitVariant[1] * variants; }
      var par = Math.max(1, Math.min(E.parallelArtists || 1, n));
      var wlo = Math.max(1, Math.round(lo / par / 5)), whi = Math.max(wlo, Math.round(hi / par / 5));
      $("#estDays").textContent = lo + "–" + hi;
      $("#estWeeks").textContent = wlo + "–" + whi;
      $("#estPar").textContent = par;
      $("#estRigRow").style.display = isChar ? "" : "none";
    };
    est.addEventListener("input", runEstimate);
    est.addEventListener("submit", function (e) { e.preventDefault(); runEstimate(); track("estimate_run"); });
    runEstimate();
    var useBtn = $("#estUse");
    if (useBtn) useBtn.addEventListener("click", function () {
      var map = { realistic: "Realistic", stylized: "Stylized", handpainted: "Hand-painted" };
      if ($("#cfType")) $("#cfType").value = /prop/i.test(typeSel.value) ? "Props & weapons" : /creature/i.test(typeSel.value) ? "Creatures" : /hair/i.test(typeSel.value) ? "Hair & grooming" : "Characters";
      if ($("#cfStyle")) $("#cfStyle").value = map[$("#estStyle").value] || "";
      if ($("#cfCount")) $("#cfCount").value = $("#estCount").value + " × " + typeSel.value + ($("#estRig").checked ? ", rigged" : "");
      if ($("#cfMessage")) $("#cfMessage").value = "Estimator result: about " + $("#estDays").textContent + " artist-days (" + $("#estWeeks").textContent + " weeks with " + $("#estPar").textContent + " artists in parallel).\n\n";
      track("estimate_used");
      if (document.getElementById("contact")) goToSection("contact", true); else location.href = "/contact";   // never a "#" in the address
    });
  }

  /* ------------------------------------------------------------------
     Showreel: YouTube id when configured, otherwise a portfolio image reel
     ------------------------------------------------------------------ */
  var reelBtn = $("#showreelBtn");
  var reel = $("#reelModal");
  var reelTimer = null;
  function openReel() {
    if (CFG.showreelYouTubeId && $("#videoModal")) {
      track("trailer_played", { video: "showreel" });
      $("#videoIframe").src = "https://www.youtube-nocookie.com/embed/" + CFG.showreelYouTubeId + "?autoplay=1&rel=0";
      $("#videoModal").classList.add("open"); $("#videoModal").setAttribute("aria-hidden", "false"); document.body.classList.add("no-scroll");
      return;
    }
    if (!reel) return;
    var pool = PROJECTS.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 12);
    var idx = 0, img = $("#reelImg"), cap = $("#reelCap");
    var show = function () {
      var p = pool[idx % pool.length];
      img.classList.remove("kb"); void img.offsetWidth;
      img.src = p.i; img.alt = p.t; img.classList.add("kb");
      cap.textContent = p.t + " · " + CAT[p.c]; idx++;
    };
    show(); reelTimer = setInterval(show, 2800);
    reel.classList.add("open"); reel.setAttribute("aria-hidden", "false"); document.body.classList.add("no-scroll");
    track("trailer_played", { video: "image-reel" });
  }
  function closeReel() {
    if (!reel) return;
    clearInterval(reelTimer); reel.classList.remove("open"); reel.setAttribute("aria-hidden", "true"); document.body.classList.remove("no-scroll");
  }
  if (reelBtn) reelBtn.addEventListener("click", openReel);
  if (reel) {
    $("#reelClose").addEventListener("click", closeReel);
    reel.addEventListener("click", function (e) { if (e.target === reel) closeReel(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeReel(); });
  }

  /* ------------------------------------------------------------------
     Asset detail page: /portfolio/<category>/<name>/ (built by tools/build.js), or the old asset.html?id=XXXX
     ------------------------------------------------------------------ */
  var ap = $("#assetPage"), aidx = -1;
  if (ap && PROJECTS.length) {
    var aid = PAGE_INFO.asset || decodeURIComponent((location.search.match(/[?&]id=([^&#]+)/) || [])[1] || "");
    PROJECTS.forEach(function (x, i) { if (x.id === aid) aidx = i; });
    // An old link to a piece that has since been removed: say so, instead of showing some other piece
    if (aidx === -1) {
      document.title = "Artwork not found | Brothers Interactive";
      var noIndex = document.createElement("meta"); noIndex.name = "robots"; noIndex.content = "noindex"; document.head.appendChild(noIndex);
      ap.innerHTML = '<div class="container asset-missing"><h1 class="asset-title">Artwork not found</h1>' +
        '<p>This piece may have been moved or removed from the portfolio.</p>' +
        '<div class="hero-actions"><a class="btn btn--primary" href="/portfolio/">Browse the portfolio</a></div></div>';
      var relBox = $("#assetRelated"); if (relBox && relBox.closest("section")) relBox.closest("section").hidden = true;
    }
  }
  if (ap && aidx !== -1) {
    var P = PROJECTS[aidx];
    setAddress(pieceUrl(P.id));
    document.title = P.t + " | Brothers Interactive";
    $("#assetTitle").textContent = P.t; $("#assetCat").textContent = CAT[P.c] || "";
    $("#assetCat").href = URLS.categoryPath(URLS.catSlug(P.c));   // back to the homepage collage with this category's filter on
    var paras = (P.desc || "").split(/\n\n+/).filter(Boolean);
    $("#assetDesc").innerHTML = paras.length ? paras.map(function (t) { return '<p>' + esc(t).replace(/\n/g, '<br>') + '</p>'; }).join("") : '<p>Breakdown and technical details available on request.</p>';
    var all = [P.i].concat(P.imgs || []);
    var aMain = $("#assetMain");
    aMain.setAttribute("fetchpriority", "high");   // the main picture before the strip of views
    aMain.src = all[0]; aMain.alt = P.t;
    // Same size rule as the viewer: the largest fit inside 1500 x 750 (and the page width), so the lens and
    // its zoom levels behave the same on this page as in the viewer
    var fitAssetImg = function () {
      if (!aMain.naturalWidth) return;
      var boxW = Math.min(1500, $(".asset-media").clientWidth), boxH = Math.min(750, window.innerHeight * 0.8);
      var ratio = aMain.naturalWidth / aMain.naturalHeight, w = boxW, h = w / ratio;
      if (h > boxH) { h = boxH; w = h * ratio; }
      aMain.style.width = Math.floor(w) + "px"; aMain.style.height = Math.floor(h) + "px";
      $(".asset-main").classList.add("is-sized");   // drops the space held for the picture while it loaded
    };
    aMain.addEventListener("load", fitAssetImg);
    window.addEventListener("resize", fitAssetImg);
    // The size is known from the file's first bytes, long before it has finished downloading: fit right then, so
    // the page doesn't jump when the picture arrives
    (function waitForSize() { if (aMain.naturalWidth) fitAssetImg(); else if (!aMain.complete) requestAnimationFrame(waitForSize); })();
    attachLens(aMain);
    // the same lens buttons under the artwork page's picture
    var assetTools = document.createElement("div");
    assetTools.className = "lens-tools lens-tools--page";
    assetTools.innerHTML = lensToolButtons("all");
    $(".asset-main").insertAdjacentElement("afterend", assetTools);
    showLensMode();
    $("#assetThumbs").innerHTML = all.map(function (u, i) { return '<button class="asset-thumb' + (i ? '' : ' active') + '" data-full="' + esc(u) + '" aria-label="View ' + (i + 1) + '">' + stripImg(u, P.t + " view " + (i + 1)) + '</button>'; }).join("");
    loadStripAfter(aMain, $("#assetThumbs"));
    $("#assetThumbs").addEventListener("click", function (e) {
      var b = e.target.closest(".asset-thumb"); if (!b || b.classList.contains("active")) return;
      $$(".asset-thumb").forEach(function (x) { x.classList.toggle("active", x === b); });
      swapToFull(aMain, b.dataset.full, function () { return b.classList.contains("active"); });
    });
    // Tags are for the studio's own reference in /admin and are not shown to visitors
    var commissionBtn = $("#assetCommission");
    if (commissionBtn) commissionBtn.href = "/contact?ref=" + encodeURIComponent(P.id);
    // Marmoset viewer: a .mview file uploaded in /admin (Portfolio > 3D viewer: Marmoset file)
    var mview = $("#assetMview");
    if (mview && P.marmoset) { mview.hidden = false; mountMarmoset(mview, P.marmoset); }
    var view3d = $("#asset3d");
    if (view3d) {
      var sfAsset = sketchfabId(P.sketchfab);   // the /admin field takes a full Sketchfab link or just the ID
      if (sfAsset) { view3d.hidden = false; $("iframe", view3d).src = "https://sketchfab.com/models/" + sfAsset + "/embed?autostart=0&ui_theme=dark&dnt=1"; }
      else view3d.hidden = true;
    }
    /* Info boxes: Category (from the piece's category) and Project (picked in /admin) always; Software,
       Poly count, Textures and any extra boxes from /admin only when something is typed in them. */
    var projName = P.project || (P.c === "lost-in-random" ? "Lost in Random" : P.c === "mid-night-walk" ? "The Midnight Walk" : /fanart/i.test(P.t) ? "Fan art / studio piece" : "Studio work");
    var txt = function (v) { return String(Array.isArray(v) ? v.join(", ") : v == null ? "" : v).trim(); };
    var specs = [["Category", CAT[P.c] || ""], ["Project", projName], ["Software", txt(P.software)], ["Poly count", txt(P.polys)], ["Textures", txt(P.textures)]];
    (P.specs || []).forEach(function (s) { if (s) specs.push([txt(s.label), txt(s.value)]); });
    $("#assetSpecs").innerHTML = specs.filter(function (s) { return s[1]; })
      .map(function (s) { return '<li>' + (s[0] ? '<span>' + esc(s[0]) + '</span>' : '') + '<strong>' + esc(s[1]) + '</strong></li>'; }).join("");
    var prevP = PROJECTS[(aidx - 1 + PROJECTS.length) % PROJECTS.length], nextP = PROJECTS[(aidx + 1) % PROJECTS.length];
    $("#assetPrev").href = pieceUrl(prevP.id); $("#assetPrev").textContent = "← " + prevP.t;
    $("#assetNext").href = pieceUrl(nextP.id); $("#assetNext").textContent = nextP.t + " →";
    var rel = PROJECTS.filter(function (x) { return x.c === P.c && x.id !== P.id; }).slice(0, 4);
    $("#assetRelated").innerHTML = rel.map(function (x) {
      var ar = x.w && x.h ? ' style="aspect-ratio:' + x.w + '/' + x.h + '"' : '';
      return '<a class="work-card ripple-host" href="' + pieceUrl(x.id) + '"' + ar + '><img ' + imgAttrs(x.i, "(max-width: 600px) 50vw, 25vw") + ' alt="' + esc(x.t) + '" loading="lazy" /><div class="work-info"><span class="work-cat">' + esc(CAT[x.c]) + '</span><span class="work-title">' + esc(x.t) + '</span></div></a>';
    }).join("");
  }

  /* ------------------------------------------------------------------
     Contact form pre-fill when arriving from an asset page's
     "Commission similar work" link (contact.html?ref=<project id>)
     ------------------------------------------------------------------ */
  var refBanner = $("#cfRefBanner");
  if (refBanner && PROJECTS.length) {
    var refId = (location.search.match(/[?&]ref=([^&]+)/) || [])[1];
    var refP = null;
    if (refId) { refId = decodeURIComponent(refId); PROJECTS.forEach(function (x) { if (x.id === refId) refP = x; }); }
    if (refP) {
      var CAT_TYPE = {
        "realistic-humans": "Characters", "stylized-human": "Characters", "mid-night-walk": "Characters", "lost-in-random": "Characters", "modular-chr-skins": "Characters",
        "realistic-creatures": "Creatures", "stylized-creature": "Creatures",
        "realistic-hairs": "Hair & grooming", "props": "Props & weapons", "weapons": "Props & weapons"
      };
      var CAT_STYLE = {
        "realistic-humans": "Realistic", "realistic-creatures": "Realistic", "realistic-hairs": "Realistic",
        "stylized-human": "Stylized", "stylized-creature": "Stylized",
        "mid-night-walk": "Hand-painted", "lost-in-random": "Hand-painted"
      };
      $("#cfRefImg").src = refP.i; $("#cfRefImg").alt = refP.t;
      $("#cfRefTitle").textContent = refP.t;
      $("#cfRefCat").textContent = CAT[refP.c] || "";
      refBanner.hidden = false;
      var cfType = $("#cfType"), cfStyle = $("#cfStyle"), cfMessage = $("#cfMessage");
      if (cfType && CAT_TYPE[refP.c]) cfType.value = CAT_TYPE[refP.c];
      if (cfStyle && CAT_STYLE[refP.c]) cfStyle.value = CAT_STYLE[refP.c];
      if (cfMessage) cfMessage.value = 'Referencing your piece "' + refP.t + '" (' + (CAT[refP.c] || "") + ') — we\'re looking for something in a similar style.\n\n';
      $("#cfRefClose").addEventListener("click", function () { refBanner.hidden = true; });
    }
  }

  /* ------------------------------------------------------------------
     Credits + press page
     ------------------------------------------------------------------ */
  var creditsList = $("#creditsList");
  if (creditsList) {
    creditsList.innerHTML = GAMES.map(function (g) {
      return '<li class="credit-card reveal"><img src="' + g.i + '" alt="' + esc(g.t) + ' key art" loading="lazy" />' +
        '<div><span class="game-studio">' + esc(g.s || "") + '</span><h3>' + esc(g.t) + '</h3>' +
        '<p>Character and asset production support.</p>' +
        '<a href="https://www.youtube.com/watch?v=' + esc(ytId(g.yt)) + '" target="_blank" rel="noopener">Watch trailer &rarr;</a></div></li>';
    }).join("");
    var pl = $("#pressList");
    if (pl) pl.innerHTML = PRESS.length
      ? PRESS.map(function (p) { return '<li class="role"><div><strong>' + esc(p.t) + '</strong><span>' + esc(p.d || "") + '</span></div><p>' + esc(p.src || "") + '</p>' + (p.url ? '<a href="' + esc(normalizeUrl(p.url)) + '" target="_blank" rel="noopener">Read &rarr;</a>' : '') + '</li>'; }).join("")
      : '<li class="role role--empty">Press mentions, ArtStation features and awards will appear here once added via /admin.</li>';
  }

  /* ------------------------------------------------------------------
     Motion: image fade-in, ripples, 3D tilt, hero parallax, cursor glow
     ------------------------------------------------------------------ */
  var motionOK = !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var finePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;

  // images fade in as they finish loading (works for images added later too)
  function markLoaded(img) { img.classList.add("loaded"); }
  document.addEventListener("load", function (e) { if (e.target.tagName === "IMG") markLoaded(e.target); }, true);
  document.addEventListener("error", function (e) { if (e.target.tagName === "IMG") markLoaded(e.target); }, true);
  $$("img").forEach(function (img) { if (img.complete) markLoaded(img); });

  // ripple on click for buttons, chips and cards
  document.addEventListener("pointerdown", function (e) {
    if (!motionOK || !(e.target instanceof Element)) return;
    var host = e.target.closest(".btn, .filter-btn, .work-card, .game-card, .case-media, .theme-opt, .team-card, .value-card, .service-card, .blog-card, .credit-card");
    if (!host) return;
    host.classList.add("ripple-host");
    var r = host.getBoundingClientRect();
    var size = Math.max(r.width, r.height) * 2;
    var s = document.createElement("span");
    s.className = "ripple";
    s.style.cssText = "left:" + (e.clientX - r.left) + "px;top:" + (e.clientY - r.top) + "px;width:" + size + "px;height:" + size + "px;";
    host.appendChild(s);
    setTimeout(function () { s.remove(); }, 700);
  });

  // 3D tilt following the cursor
  if (motionOK && finePointer) {
    var tiltSel = ".work-card, .game-card, .service-card, .team-card, .value-card, .blog-card, .process-step, .credit-card";
    document.addEventListener("pointermove", function (e) {
      if (!(e.target instanceof Element)) return;
      var el = e.target.closest(tiltSel);
      if (!el || document.body.classList.contains("no-scroll")) return;
      var r = el.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      el.classList.add("tilt");
      el.style.transform = "perspective(900px) rotateX(" + (-py * 8).toFixed(2) + "deg) rotateY(" + (px * 10).toFixed(2) + "deg) translateY(-4px)";
    });
    document.addEventListener("pointerout", function (e) {
      if (!(e.target instanceof Element)) return;
      var el = e.target.closest(tiltSel);
      if (el && !el.contains(e.relatedTarget)) { el.style.transform = ""; el.classList.remove("tilt"); }
    });
  }

  // hero cards drift with the cursor
  var heroVisual = $(".hero-visual");
  if (heroVisual && motionOK && finePointer) {
    var heroCards = $$(".hero-card", heroVisual);
    document.addEventListener("pointermove", function (e) {
      var r = heroVisual.getBoundingClientRect();
      if (r.bottom < 0) return;
      var px = (e.clientX / window.innerWidth - 0.5), py = (e.clientY / window.innerHeight - 0.5);
      heroCards.forEach(function (c, i) {
        var depth = (i + 1) * 8;
        c.style.transform = "translate(" + (px * depth).toFixed(1) + "px," + (py * depth).toFixed(1) + "px)";
      });
    });
  }

  // soft cursor glow
  if (motionOK && finePointer) {
    var glow = document.createElement("div"); glow.className = "cursor-glow"; document.body.appendChild(glow);
    document.addEventListener("pointermove", function (e) { glow.style.left = e.clientX + "px"; glow.style.top = e.clientY + "px"; glow.classList.add("on"); });
    document.addEventListener("pointerleave", function () { glow.classList.remove("on"); });
  }

  // artist cursor: a paintbrush that follows the pointer, with a lagging ring and hover states
  if (motionOK && finePointer) {
    var cur = document.createElement("div");
    cur.className = "art-cursor";
    cur.innerHTML =
      '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">' +
        '<path d="M2 2c4 .4 8.5 3 10.5 7.5L8 14C3.5 12 1.2 7 2 2z" class="c-tip" transform="translate(-1 1)"/>' +
        '<path d="M11 11.5 27 27.5c1.4 1.4 1.4 3.2 0 4.4-1.2 1.2-3 1.2-4.4 0L6.8 16z" class="c-handle"/>' +
        '<path d="M11 11.5 14.5 15" class="c-band"/>' +
        '<circle cx="27.5" cy="28" r="1.6" class="c-dot"/>' +
      '</svg><span class="label"></span>';
    var ring = document.createElement("div");
    ring.className = "art-cursor-ring";
    document.body.appendChild(ring); document.body.appendChild(cur);
    document.body.classList.add("art-cursor-on");
    var mx = -100, my = -100, rx = -100, ry = -100, shown = false, ringRaf = 0;
    // The lagging ring eases toward the pointer and stops its frame loop once it has caught up,
    // so an idle page isn't redrawing 60 times a second; the next pointer move restarts it.
    function ringLoop() {
      rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
      ring.style.transform = "translate(" + rx + "px," + ry + "px) translate(-50%,-50%)";
      ringRaf = (Math.abs(mx - rx) + Math.abs(my - ry) > 0.3) ? requestAnimationFrame(ringLoop) : 0;
    }
    document.addEventListener("pointermove", function (e) {
      mx = e.clientX; my = e.clientY;
      cur.style.transform = "translate(" + (mx - 2) + "px," + (my - 2) + "px)";
      if (!shown) { shown = true; rx = mx; ry = my; cur.classList.add("on"); ring.classList.add("on"); }
      if (!ringRaf) ringRaf = requestAnimationFrame(ringLoop);
    });
    document.addEventListener("pointerover", function (e) {
      var t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("input:not([type=range]):not([type=checkbox]), textarea, select")) { cur.classList.add("hidden"); ring.classList.add("hidden"); return; }
      var state = "", label = "";
      if (t.closest(".compare-stage")) { state = "zoom"; label = "Drag"; }
      else if (t.closest(".work-card, .case-thumb, .asset-thumb, .style-samples a, .lightbox-figure img")) { state = "zoom"; label = "View"; }
      else if (t.closest(".game-card, .case-media, #showreelBtn")) { state = "zoom"; label = "Play"; }
      else if (t.closest("a, button, [role=button], label, summary, .theme-opt")) { state = "hover"; }
      cur.className = "art-cursor on" + (state ? " " + state : "");
      ring.className = "art-cursor-ring on" + (state ? " " + state : "");
      cur.querySelector(".label").textContent = label;
    });
    document.addEventListener("pointerdown", function () { cur.classList.add("down"); });
    document.addEventListener("pointerup", function () { cur.classList.remove("down"); });
    document.documentElement.addEventListener("mouseleave", function () { cur.classList.remove("on"); ring.classList.remove("on"); });
    document.documentElement.addEventListener("mouseenter", function () { cur.classList.add("on"); ring.classList.add("on"); });
  }

  /* ------------------------------------------------------------------
     Theme switcher — sets data-theme on <html>, remembers the choice
     ------------------------------------------------------------------ */
  var THEMES = ["midnight", "arctic", "ocean", "steel", "aurora", "desert"];
  var switcher = $("#themeSwitcher");
  var themeToggle = $("#themeToggle");
  var themeOpts = $$(".theme-opt");

  function applyTheme(name, persist) {
    if (THEMES.indexOf(name) === -1) name = "midnight";
    if (name === "midnight") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", name);
    themeOpts.forEach(function (b) {
      var on = b.dataset.theme === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", String(on));
    });
    if (persist) { try { localStorage.setItem("bi-theme", name); } catch (err) {} track("theme_changed", { theme: name }); }
  }
  function closeThemePanel() {
    switcher.classList.remove("open");
    themeToggle.setAttribute("aria-expanded", "false");
  }

  var saved = null;
  try { saved = localStorage.getItem("bi-theme"); } catch (err) {}
  // ?theme=ocean in the URL overrides the saved choice (handy for sharing a specific look)
  var fromUrl = (window.location.search.match(/[?&]theme=([a-z]+)/) || [])[1];
  if (fromUrl && THEMES.indexOf(fromUrl) !== -1) applyTheme(fromUrl, true);
  else applyTheme(saved || "midnight", false);

  themeToggle.addEventListener("click", function () {
    var open = switcher.classList.toggle("open");
    themeToggle.setAttribute("aria-expanded", String(open));
  });
  themeOpts.forEach(function (b) {
    b.addEventListener("click", function () { applyTheme(b.dataset.theme, true); closeThemePanel(); });
  });
  document.addEventListener("click", function (e) { if (!switcher.contains(e.target)) closeThemePanel(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeThemePanel(); });

  /* ------------------------------------------------------------------
     Job applications (homepage #careers section) — handled by a Google Form.
     The form link is set in /admin > Careers > "Section heading and text" > "Google Form link".
     Until it's set, the button is hidden and an "opening soon" note shows instead.
     ------------------------------------------------------------------ */
  var applyBtn = $("#applyFormBtn");
  if (applyBtn) {
    var formUrl = String((SECTION_TEXT.careers && SECTION_TEXT.careers.formUrl) || CFG.careersFormUrl || "").trim();
    if (/^https?:\/\//i.test(formUrl)) {
      applyBtn.href = formUrl;
      applyBtn.addEventListener("click", function () { track("application_form_opened"); });
    } else {
      applyBtn.hidden = true;
      $("#applyFormSoon").hidden = false;
    }
  }

  /* ------------------------------------------------------------------
     Hero visual — random portfolio pieces on every load, each card
     framed to that image's real aspect ratio (no cropping/cutting)
     ------------------------------------------------------------------ */
  var heroVisual = $(".hero-visual");
  if (heroVisual && PROJECTS.length) {
    var heroSlots = [
      { el: $(".hero-card--main", heroVisual), eager: true },
      { el: $(".hero-card--a", heroVisual), eager: false },
      { el: $(".hero-card--b", heroVisual), eager: false }
    ].filter(function (s) { return s.el; });

    var heroPool = PROJECTS.filter(function (p) { return p.i && p.w && p.h; })
      .sort(function () { return Math.random() - 0.5; });

    heroSlots.forEach(function (slot, i) {
      var p = heroPool[i % heroPool.length];
      if (!p) return;
      var img = $("img", slot.el), tag = $(".hero-card-tag", slot.el);
      if (img) { img.src = p.i; img.alt = p.t; img.loading = slot.eager ? "eager" : "lazy"; }
      if (tag) tag.textContent = CAT[p.c] || p.t;
      slot.el.style.aspectRatio = p.w + " / " + p.h;
    });

    /* Cluster the cards tightly regardless of each image's height: chain
       card A off the main card's real bottom, and card B off card A's,
       instead of relying on fixed percentages tuned for one aspect ratio.
       Desktop layout only — the mobile breakpoint uses its own square grid. */
    if (window.innerWidth > 900) {
      var mainEl = heroSlots[0] && heroSlots[0].el;
      var aEl = heroSlots[1] && heroSlots[1].el;
      var bEl = heroSlots[2] && heroSlots[2].el;
      if (mainEl) {
        var vTop = heroVisual.getBoundingClientRect().top;
        var mTop = mainEl.getBoundingClientRect().top - vTop;
        var mHeight = mainEl.getBoundingClientRect().height;
        var bottomMost = mTop + mHeight;

        if (aEl) {
          var aTop = mTop + mHeight * 0.4;
          aEl.style.top = aTop + "px";
          aEl.style.bottom = "auto";
          var aHeight = aEl.getBoundingClientRect().height;
          bottomMost = Math.max(bottomMost, aTop + aHeight);

          if (bEl) {
            var bTop = aTop + aHeight * 0.5;
            bEl.style.top = bTop + "px";
            bEl.style.bottom = "auto";
            bottomMost = Math.max(bottomMost, bTop + bEl.getBoundingClientRect().height);
          }
        } else if (bEl) {
          var bTopAlt = mTop + mHeight * 0.5;
          bEl.style.top = bTopAlt + "px";
          bEl.style.bottom = "auto";
          bottomMost = Math.max(bottomMost, bTopAlt + bEl.getBoundingClientRect().height);
        }

        heroVisual.style.minHeight = Math.ceil(bottomMost + 24) + "px";
      }
    }
  }

  /* ------------------------------------------------------------------
     Careers hero images — rendered from data/careers-hero.json (/admin > Careers Page Images).
     One image at a time, 10s each, soft cross-fade.
     ------------------------------------------------------------------ */
  var careersSlides = $("#careersSlides");
  var CAREERS_HERO = loadList("careers-hero", []).filter(function (x) { return x && x.img; });
  if (careersSlides && CAREERS_HERO.length) {
    careersSlides.innerHTML = CAREERS_HERO.map(function (x, i) {
      return '<div class="careers-slide' + (i ? "" : " is-active") + '"><img src="' + esc(x.img) + '" alt="' + esc(x.alt || "") + '" /></div>';
    }).join("");
  }
  if (careersSlides) {
    var cSlides = careersSlides.querySelectorAll(".careers-slide"), cIdx = 0;
    if (cSlides.length > 1 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInterval(function () {
        if (document.hidden) return; // background tab: don't queue fades that all replay at once on return
        cSlides[cIdx].classList.remove("is-active");
        cIdx = (cIdx + 1) % cSlides.length;
        cSlides[cIdx].classList.add("is-active");
      }, 10000);
    }
  }

  /* ------------------------------------------------------------------
     Team grid (homepage #team section) — rendered from data/team.json
     ------------------------------------------------------------------ */
  var teamGrid = $("#teamGrid");
  if (teamGrid && TEAM.length) {
    teamGrid.innerHTML = TEAM.map(function (m) {
      var photo = m.photo ? '<img src="' + m.photo + '" alt="' + esc(m.name) + '" loading="lazy" />' : "";
      var tags = (m.tags || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
      var links = (m.links || []).map(function (l) {
        var href = normalizeUrl(l.url);
        var external = /^https?:\/\//i.test(href);
        return '<a href="' + esc(href) + '"' + (external ? ' target="_blank" rel="noopener"' : "") + ">" + esc(l.label) + "</a>";
      }).join("");
      return (
        '<article class="team-card reveal">' +
          '<div class="team-photo" data-initials="' + esc(m.initials || "") + '">' + photo + '</div>' +
          '<div class="team-body">' +
            "<h3>" + esc(m.name) + "</h3>" +
            '<span class="team-role">' + esc(m.role || "") + "</span>" +
            "<p>" + esc(m.bio || "") + "</p>" +
            (tags ? '<ul class="team-tags">' + tags + "</ul>" : "") +
            (links ? '<div class="team-links">' + links + "</div>" : "") +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  /* ------------------------------------------------------------------
     Footer year + late reveal pass for elements rendered above
     ------------------------------------------------------------------ */
  $$("#year, .year").forEach(function (el) { el.textContent = new Date().getFullYear(); });
  watchReveals();

  /* ------------------------------------------------------------------
     Section links (nav "Careers", "Team", index.html#careers from other pages...):
     the page is built from data after load and images above keep loading, so a plain
     #hash jump lands in the wrong place. Scroll under the fixed header ourselves, then
     re-check a few times as the layout settles.
     ------------------------------------------------------------------ */
  // Only the LATEST jump may correct itself: every new nav click, or any manual scroll
  // (wheel, touch, keys, scrollbar drag), cancels the follow-up checks of earlier jumps.
  var sectionJob = 0;
  ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (t) {
    window.addEventListener(t, function (e) {
      if (t === "mousedown" && e.target.closest && e.target.closest('a[href*="#"]')) return; // the nav click itself
      sectionJob++;
    }, { passive: true });
  });
  function goToSection(id, smooth) {
    var target = id && document.getElementById(id);
    if (!target) return false;
    var job = ++sectionJob;
    var headerH = header ? header.offsetHeight : 0;
    var offBy = function () { return target.getBoundingClientRect().top - headerH; };
    var place = function (behavior) {
      window.scrollTo({ top: Math.max(0, offBy() + (window.scrollY || window.pageYOffset) + 1), behavior: behavior });
      if (behavior === "instant") onScroll();   // update the menu highlight now, don't wait for a scroll event
    };
    place(smooth ? "smooth" : "instant");
    // Images/3D above may still be loading and push the section down. Once the scroll has
    // come to rest, nudge it back into place — never mid-animation, never after a newer jump.
    var lastY = -1, checks = 0;
    (function settle() {
      if (job !== sectionJob || checks++ > 12) return;   // superseded, or ~4s passed
      var y = window.scrollY || window.pageYOffset;
      if (y === lastY && Math.abs(offBy()) > 4) place("instant");
      lastY = y;
      setTimeout(settle, 300);
    })();
    return true;
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href*="#"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var raw = a.getAttribute("href") || "";
    // a bare "#" is a placeholder (filled in later, or a hidden button): it must never put "/#" in the address
    if (raw === "#") { e.preventDefault(); return; }
    var url = new URL(raw, document.baseURI);
    var id = url.hash.slice(1);
    if (!id || !document.getElementById(id)) return;
    // "#main" (Skip to content) and other bare "#id" links mean this page; with <base href="/"> the browser
    // would otherwise load the homepage at "/#id"
    var samePage = raw.charAt(0) === "#";
    // The homepage and its section copies (/portfolio/, /team/ …) all hold the same sections, so a
    // "#team" link (which resolves to "/#team") is handled right here instead of loading a new page.
    var homeLike = !!document.getElementById("home");
    if (!samePage && url.pathname !== location.pathname && !(homeLike && url.pathname === "/")) return;
    e.preventDefault();
    goToSection(id, true);
    if (id === "main") { var mainEl = document.getElementById("main"); mainEl.setAttribute("tabindex", "-1"); mainEl.focus({ preventScroll: true }); }
    // The address shows the section as a real path (/portfolio/, Home = /), never "#section"
    if (homeLike && URLS.SECTIONS.indexOf(id) !== -1) setAddress(URLS.sectionPath(id));
  });
  // Where to land on arrival: a section page made by the build step (/team/), or an old "/#team" link
  var startId = PAGE_INFO.section || decodeURIComponent(location.hash.slice(1));
  if (startId && document.getElementById(startId)) {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    if (URLS.SECTIONS.indexOf(startId) !== -1 && !PAGE_INFO.cat && !PAGE_INFO.game) setAddress(URLS.sectionPath(startId));   // a category address stays as it is
    else if (location.hash) setAddress(location.pathname + location.search);   // drop the "#…"
    goToSection(startId, false);
    var jobAtStart = sectionJob;
    // re-align once everything has loaded — but only if the visitor hasn't clicked/scrolled elsewhere since
    window.addEventListener("load", function () { if (sectionJob === jobAtStart) goToSection(startId, false); });
  }
}

/* ------------------------------------------------------------------
   Loader: fetch every data file in parallel (instead of one blocking
   request after another), then run the site. "no-cache" makes the browser
   re-check each file with the server (a tiny 304 when unchanged), so /admin
   edits still show on the next refresh without re-downloading everything.
   ------------------------------------------------------------------ */
(function () {
  // (cases, roles and press are no longer on any page, so they are not fetched)
  var names = ["portfolio", "games", "posts", "testimonials", "clients", "team", "hero-showcase", "config", "hero", "breakdowns", "careers-hero"];
  if (document.getElementById("about")) names.push("about");
  if (document.getElementById("services") && window.BIURL) window.BIURL.TEXT_SECTIONS.forEach(function (id) { names.push("sections/" + id); });
  if (document.getElementById("contactForm")) names.push("sections/contact");
  if (document.querySelector(".quote-steps")) names.push("sections/getting-started");
  names.push("categories");
  var store = window.__BI_JSON = {};
  if (!window.fetch || !window.Promise) { siteMain(); return; }
  Promise.all(names.map(function (n) {
    return fetch("data/" + n + ".json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { store[n] = j; }, function () { store[n] = null; });
  })).then(function () { siteMain(); });
})();
