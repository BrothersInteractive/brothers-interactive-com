/* =====================================================================
   Brothers Interactive — clean web addresses
   One place that decides every page's address, used by the website (window.BIURL)
   AND by tools/build.js, which creates a real page at each address on GitHub:

     /                                  homepage
     /portfolio/  /team/  /careers/ …   homepage, scrolled to that section
     /category/realistic-character/     one portfolio category
     /portfolio/realistic-character/lehri/   one artwork (shareable with clients)
     /breakdowns/  /breakdowns/orc-fanart/   breakdown list and one breakdown
     /games/wavetale/                   the Games section with that game's trailer open
   ===================================================================== */
(function (root) {
  "use strict";

  /* Portfolio categories as visitors see them. "match" lists the category keys stored on each
     piece (p.c / p.cats in data/portfolio.json) that belong under this slug. */
  var BROWSE_CATS = [
    { slug: "modular-chr-skins", label: "Modular CHR Skins", match: ["modular-chr-skins"] },
    { slug: "realistic-character", label: "Realistic CHR", match: ["realistic-humans"] },
    { slug: "realistic-creature", label: "Realistic Creature", match: ["realistic-creatures"] },
    { slug: "realistic-hair", label: "Realistic Hair Card", match: ["realistic-hairs"] },
    { slug: "stylized-character", label: "Stylized CHR", match: ["stylized-human"] },
    { slug: "stylized-creature", label: "Stylized Creature", match: ["stylized-creature"] },
    { slug: "props", label: "Props", match: ["props"] },
    { slug: "weapons", label: "Realistic Weapons", match: ["weapons"] },
    { slug: "midnight-walk", label: "Game - Midnight Walk", match: ["mid-night-walk"] },
    { slug: "lost-in-random", label: "Game - Lost in Random", match: ["lost-in-random"] }
  ];

  // Homepage sections that get their own address (/games/, /team/ …). "home" is the bare "/".
  var SECTIONS = ["home", "games", "testimonials", "about", "portfolio", "breakdown", "services", "faq", "team", "careers", "blog"];
  // Sections whose heading and text come from data/sections/<id>.json (About has its own data/about.json)
  var TEXT_SECTIONS = ["games", "testimonials", "portfolio", "breakdown", "services", "faq", "team", "careers", "blog"];

  function slugify(s) {
    return String(s || "").toLowerCase()
      .normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ").replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  /* Replace the list above with the one edited in /admin (data/categories.json: label, slug = web address
     name, optional key = the older code stored on pieces, optional tile picture). Changes the array in place,
     so code already holding BROWSE_CATS sees the new list. */
  function setCategories(items) {
    var list = (items || []).filter(function (c) { return c && c.label && (c.slug || c.key); }).map(function (c) {
      var slug = slugify(c.slug || c.key), key = String(c.key || "").trim() || slug;
      return { slug: slug, label: String(c.label), match: key === slug ? [slug] : [key, slug], tile: c.tile || "" };
    });
    if (!list.length) return;
    BROWSE_CATS.length = 0;
    list.forEach(function (c) { BROWSE_CATS.push(c); });
  }

  // Category key on a piece (e.g. "realistic-humans") -> the slug used in addresses ("realistic-character")
  function catSlug(key) {
    for (var i = 0; i < BROWSE_CATS.length; i++) if (BROWSE_CATS[i].match.indexOf(key) !== -1) return BROWSE_CATS[i].slug;
    return slugify(key) || "work";
  }

  /* Every piece's address, worked out from the whole list at once so two pieces with the same name in
     the same category still get different addresses (the second becomes "-2"). The name comes from the
     optional "Link name" field in /admin, else the title. Returns { id: "/portfolio/cat/name/" }. */
  function piecePaths(items) {
    var out = {}, used = {};
    (items || []).forEach(function (p) {
      if (!p || !p.id) return;
      var cat = catSlug(p.c), name = slugify(p.slug) || slugify(p.t) || slugify(p.id), key = cat + "/" + name, n = 1;
      while (used[key]) key = cat + "/" + name + "-" + (++n);
      used[key] = true;
      out[p.id] = "/portfolio/" + key + "/";
    });
    return out;
  }

  /* Every game's address, in the same order as the list: /games/wavetale/ (shareable with clients; opening it
     plays that trailer). Two games with the same name get "-2". */
  function gamePaths(items) {
    var used = {};
    return (items || []).map(function (g) {
      var name = slugify(g && g.t) || "game", key = name, n = 1;
      while (used[key]) key = name + "-" + (++n);
      used[key] = true;
      return "/games/" + key + "/";
    });
  }

  function categoryPath(slug) { return "/category/" + slug + "/"; }
  function sectionPath(id) { return id === "home" ? "/" : "/" + id + "/"; }
  function breakdownPath(id) { return id ? "/breakdowns/" + slugify(id) + "/" : "/breakdowns/"; }

  var api = {
    BROWSE_CATS: BROWSE_CATS, setCategories: setCategories, SECTIONS: SECTIONS, TEXT_SECTIONS: TEXT_SECTIONS, slugify: slugify, catSlug: catSlug, piecePaths: piecePaths, gamePaths: gamePaths,
    categoryPath: categoryPath, sectionPath: sectionPath, breakdownPath: breakdownPath
  };
  if (typeof module === "object" && module.exports) module.exports = api; else root.BIURL = api;
})(this);
