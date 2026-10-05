# Content editor (/admin)

`/admin` is a private page for editing the site's content without touching code:
The left menu follows the homepage from top to bottom: Home (headline, 3D model on the podium,
client logos), Games, Testimonials, About, Portfolio (section text, categories, pieces, projects),
Breakdown (breakdowns and Sculpt to Final), Services (cards, Why Choose Us, FAQ), Team, Careers (text,
Join Us form link, images), Blog, and under a line, Settings (email, address, social links, header pill).
Each section starts with its "Section heading and text" (data/sections/<section>.json).

A new category or project appears in the Portfolio form's dropdowns about two minutes after saving
(the build fills them in); reload /admin to see it.

The editor is **Sveltia CMS** (loaded by `admin/index.html`, configured by `admin/config.yml`).

## Logging in

1. Open https://brothersinteractive.com/admin/
2. Click **Sign In Using Access Token** and paste the admin key (a GitHub fine-grained
   personal access token, see below). The browser remembers it.
   Don't use "Sign In with GitHub": it needs a login helper this site doesn't have.

**Making a key** (new computer, lost key, or the old one was exposed):
GitHub → profile picture → **Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token**. Name it `Website admin`, Expiration **No expiration**,
Repository access **Only select repositories → brothers-interactive-com**, Permissions
**Contents: Read and write**. Copy it once, keep it private, and delete any old key you no longer use.

## Saving

**Save** writes the change straight to the `main` branch on GitHub. GitHub Pages republishes the
site within 1–2 minutes; press Ctrl + F5 on the site to see it. Every save is a Git commit, so any
mistake can be rolled back from the GitHub history.

## Adding a new portfolio piece

Portfolio → Portfolio Pieces → **Add Piece** at the bottom of the list. Fill in Title, Category,
optional "Also show in", Project, optional Software / Poly count / Textures / Extra info boxes (empty
ones are hidden on the site), a unique **ID** (no spaces, e.g. `orc-warrior-01`), Main Image (1500-2500 px,
JPG or WebP), optional Additional Images, Description, and optional Tags (for reference only, not shown).
Drag the piece to the top of the list to show it first, then **Save**.

About two minutes later the piece has its own shareable address, e.g.
`https://brothersinteractive.com/portfolio/realistic-character/lehri/` (category + title). Opening the
piece on the site shows that address in the address bar.

**3D views (optional):** paste a Sketchfab link, or upload a Marmoset `.mview` file (Toolbag: File >
Export > Marmoset Viewer, ideally under 20 MB). Either appears under the picture on the details page.

## Good to know

- Upload images as JPG or WebP, about 1600 px wide (PNG only for transparent cut-outs).
  File names in lowercase with dashes, no spaces. 3D models as compressed .glb.
- New portfolio images have no small thumbnail copy yet, so the site uses the full image instead.
  Nothing breaks, it's just a little heavier.
- Editing files on a computer instead (code or design changes)? First open GitHub Desktop and click
  **Fetch origin**, then **Pull origin**, so edits made here in /admin are not overwritten.
- On localhost, Sveltia offers **Work with Local Repository** (Chrome/Edge): pick the project folder to
  edit the local files directly, with no login.
