# Project plan — bridge-craftwork.com

Give the Bridge Craftwork CLI tools a proper home. Today their browser builds
are scattered across two domains and three hosting shapes; `bridge-craftwork.com`
is registered, sits on Cloudflare, serves five subdomains — and has nothing at
the apex.

---

## Why here, and not on bridge-classroom

Three reasons, in the order they actually matter:

1. **`bridge-craftwork.com` is already the tooling domain.** `solver.`, `ben.`,
   `dealer.`, `tables.` and `game-parser.` all run there behind one shared Caddy
   proxy. The zone is live and load-bearing; the apex is the only empty part of
   it. This is filling in a hole, not standing up a new domain.

2. **The tools don't fit the classroom's taxonomy.** bridge-classroom.com's hub
   sorts by audience *within a teaching product* — "For students / Teacher
   resources / Author tools". A general-purpose PBN→PDF converter is none of
   those. (It was filed under Teacher Tools on 2026-08-31 and is visibly the odd
   tile: everything else there is tied to lessons, classes or students.)

3. **The landing page has a different job.** bridge-classroom's tiles sell a
   teaching product. These tiles run a funnel: browser build → CLI download.
   Different call to action, different tile.

`bridge-classroom.com/.org` keeps linking here. This is a sibling, not a
replacement.

---

## Decisions already made

| Decision | Choice | Why |
| --- | --- | --- |
| Domain | `bridge-craftwork.com` | Already the tooling domain; apex empty |
| URL shape | **Subdomain per tool** — `pbn-to-pdf.bridge-craftwork.com` | Matches the five existing service hosts; needs no Vite `base` change in any tool repo; each repo keeps its independent deploy |
| Apex | Launcher only | No tool is served from the apex |
| Hosting | Cloudflare Pages | 3 of the 4 tool repos already use it |
| Tile CTA | Try in browser · Download CLI · View source | The funnel is the point |

**Rejected: path per tool** (`bridge-craftwork.com/pbn-to-pdf/`). Same-origin
would let tools share settings — the argument Bridge-Classroom's
`build-site.sh` makes for co-locating game-analysis — but these tools are
self-contained file-in/file-out converters that share no identity or state, so
the benefit is theoretical while the cost (a `base` change plus a route per
repo, across four repos) is real.

---

## Current state

| Tool | Browser build lives at | Hosting | CLI releases |
| --- | --- | --- | --- |
| pbn-to-pdf | `pbn-to-pdf.bridge-classroom.org` | Cloudflare Pages | v0.18.0, 5 assets |
| pdf-handouts | `bridge-craftwork.github.io/pdf-handouts/` | **GitHub Pages** | v1.0.0, 4 assets |
| dealer3 | *(built, no custom domain)* | Cloudflare Pages | v1.0.0, 8 assets |
| bridge-solver | *(built, no custom domain)* | Cloudflare Pages + Functions | v1.0.0, 12 assets |
| bridge-rulebot | *(wasm crate, no web UI)* | — | none |

Four tools, two domains, three hosting shapes, one `github.io` URL.

## Target state

```
bridge-craftwork.com                 → this repo (launcher)
pbn-to-pdf.bridge-craftwork.com      → pbn-to-pdf/web
dealer3.bridge-craftwork.com         → dealer3/web
pdf-handouts.bridge-craftwork.com    → pdf-handouts/web
bridge-solver.bridge-craftwork.com   → bridge-solver/web
```

Unchanged and untouched: `solver.`, `ben.`, `dealer.`, `tables.`,
`game-parser.`, `livekit.` — the running backend services.

---

## Hostname convention — collision resolved

**Verified live on 2026-08-31.** `solver.` and `dealer.` were checked directly,
not assumed. A 404 at `/` means only "no route at the root"; the real endpoints
answer:

```
POST solver.bridge-craftwork.com/dd    → 200 in 99ms
                                          {"ddtricks":"dcccddcccd00000V000V","cached":false}
POST dealer.bridge-craftwork.com/deal  → 422, serde naming the field it wants (`script`)
```

Both are also hardcoded as production defaults in the shipped Bridge-Classroom
frontend — `ddsClient.js` (`VITE_SOLVER_URL ||` that host, with
`.env.production` deliberately leaving the override unset) and
`dealerClient.js`. Repurposing either would point the live `.com`/`.org` site at
a static page: the solver would degrade quietly (DD is best-effort, `null` on
failure), the deal generator would visibly break the hub tile.

**So the two kinds of host get two kinds of name:**

| Kind | Naming | Examples |
| --- | --- | --- |
| Backend HTTP service (droplet, behind Caddy) | the **capability** | `solver.` `dealer.` `ben.` `tables.` `game-parser.` |
| Browser build of a CLI (Cloudflare Pages) | the **repo name** | `pbn-to-pdf.` `dealer3.` `bridge-solver.` `pdf-handouts.` |

This scales to the next tool without another collision, and the hostname alone
tells you which kind of thing you are looking at — worth having when an API and
a browser build of the *same* algorithm sit on adjacent hostnames.

Applied: the bridge-solver web build gets **`bridge-solver.bridge-craftwork.com`**,
not `solver.`. Nothing is deployed yet, so this is still cheap to change —
but change it before Phase 2, not after.

---

## Phase 1 — Stand up the launcher *(additive; breaks nothing)*

Everything here is new. No existing URL changes, so this phase can land and sit
indefinitely while the rest waits.

1. **Site source in `site/`**, deployed as-is. No build step: it's a static page.
   - `site/index.html` — the launcher
   - `site/styles.css` — copy Bridge-Classroom's `docs/styles.css` (design
     tokens). **Copy it, don't fetch it cross-domain.**
   - `site/favicon.svg` — needs its own mark. Bridge-Classroom's green spade is
     that product's identity; craftwork wants its own. Open question.
2. **`wrangler.jsonc`** at the repo root:
   ```jsonc
   {
     "name": "bridge-craftwork-site",
     "compatibility_date": "2026-08-31",
     "pages_build_output_dir": "site"
   }
   ```
3. **`.github/workflows/pages.yml`** — copy the shape from `pbn-to-pdf`'s
   (`wrangler-action` → `pages deploy`), minus the wasm build steps. Needs repo
   secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
   - Account ID is `13691335358be0d5da6e79540083d975` (documented as
     non-credential in `bridge-solver/wrangler.jsonc`).
4. **Tiles pointing at the tools' CURRENT URLs.** Deliberate: the launcher goes
   live and is useful before any tool URL moves. Phase 2 then repoints tiles one
   at a time, and a mistake is a one-line revert instead of a dead link.
5. **Attach the apex**: `bridge-craftwork.com` + `www` as Pages custom domains.
   Cloudflare's CNAME flattening handles the apex.

### Tile inventory

| Tile | One-liner | Try | Download |
| --- | --- | --- | --- |
| **PBN to PDF** | Turn a PBN file into printable hand diagrams, declarer's-plan worksheets and bidding sheets. | live | `pbn-to-pdf/releases/latest` |
| **PDF Handouts** | Merge PDFs and screenshots into a handout with custom headers and footers. | live | `pdf-handouts/releases/latest` |
| **dealer3** | Rust rebuild of the classic `dealer.exe` hand generator — runs its scripts, accepts its command line. | needs domain | `dealer3/releases/latest` |
| **bridge-solver** | Fast double-dummy solver with par scoring, cardplay analysis and PBN processing. | needs domain | `bridge-solver/releases/latest` |
| bridge-rulebot | Deterministic rule-based cardplay bot with teachable reason codes. | **no web UI** | no releases |

Point every Download at **`/releases/latest`**, never a pinned tag — the link
then never goes stale without a rebuild.

`bridge-rulebot` has a wasm crate but no browser front-end and no releases. Omit
it, or give it a "source only" tile. Don't fake a Try button.

---

## Phase 2 — Attach the subdomains *(outward-facing)*

One tool at a time. After each: load the new host, then repoint that tile.

**Gotcha, and it contradicts the obvious guess:** Pages custom domains are
**dashboard/API state, not `wrangler.jsonc` config** — wrangler will not create
them from the file. `pbn-to-pdf/wrangler.jsonc` says so explicitly in a comment.
So each attachment is two steps:

```sh
# 1. attach the domain to the Pages project
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/pages/projects/$PROJECT/domains" \
     -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
     --data '{"name":"pbn-to-pdf.bridge-craftwork.com"}'
# 2. DNS: CNAME <host> -> <project>.pages.dev, proxied
```

Then record the hostname in that repo's `wrangler.jsonc` header comment, the way
`pbn-to-pdf` already does — the config file is where someone will look.

Order: `pbn-to-pdf` first (proves the pattern on a project that already has a
working custom domain), then `dealer3`, then `bridge-solver`
(on `bridge-solver.`, per the hostname convention above).

`bridge-solver` carries Pages Functions, a KV namespace and an Analytics Engine
binding. Adding a custom domain doesn't touch those, but its `/t` beacon and
`/api/stats` should be re-checked on the new host before the old one goes.

---

## Phase 3 — Move pdf-handouts off GitHub Pages

The only tool on a different hosting product, and the smallest migration of the
four: no Vite, no bundler. `pages.yml` runs `wasm-pack` and uploads `web/`
straight to GitHub Pages.

1. Add `wrangler.jsonc` with `"pages_build_output_dir": "web"`.
2. Replace the `upload-pages-artifact` + `deploy` jobs with a
   `wrangler pages deploy` step (copy from `dealer3`).
3. Attach `pdf-handouts.bridge-craftwork.com`.
4. Leave a redirect stub at `bridge-craftwork.github.io/pdf-handouts/` — a
   `<meta http-equiv="refresh">` plus a `<link rel="canonical">`. The README
   links that URL, and so may other people.

---

## Phase 4 — Retire the old URLs *(don't just delete them)*

**`pbn-to-pdf.bridge-classroom.org` is live AND linked from the
bridge-classroom.com/.org hub** (shipped 2026-08-31, PR #411). It must not
404.

- **Minimum, zero risk:** leave it attached to the Pages project as a second
  custom domain. Pages serves the same site from both hosts. Nothing breaks;
  the URL is just no longer canonical.
- **Better:** a Cloudflare **Redirect Rule** on the `bridge-classroom.org` zone
  — `pbn-to-pdf.bridge-classroom.org/*` → `https://pbn-to-pdf.bridge-craftwork.com/$1`,
  301. Do this only after the new host is confirmed serving. (Pages `_redirects`
  is the wrong tool here — it is path-based; cross-host belongs in a zone rule.)

---

## Phase 5 — Repoint Bridge-Classroom and the docs

1. **The hub tile** — `docs/index.html` in `bridge-craftwork/Bridge-Classroom`,
   the `PBN to PDF` tile added by PR #411. Change the `href` to the new host.
   While there, reconsider its placement: a general-purpose converter under
   "Teacher Tools" was always a stretch. Options: leave it, or replace the four
   tool tiles with **one** tile pointing at `bridge-craftwork.com` — which is
   arguably the whole point of building this launcher.
2. **Cross-link back**: the craftwork launcher should point at
   bridge-classroom.com for the teaching product, so the two sites frame each
   other rather than competing.
3. **`Bridge-Classroom/CLAUDE.md`** — its services table lists every
   `bridge-craftwork.com` host. Add the new tool subdomains, clearly separated
   from the backend services (a browser build and an HTTP API on adjacent
   hostnames will otherwise be confused).
4. **`bridge-craftwork-platform`** (private) — `edge/Caddyfile` fronts the
   service hosts. The tool subdomains are Cloudflare Pages and **do not** pass
   through Caddy or touch the droplet. Note that explicitly, or someone will go
   looking for a stanza that was never there.

---

## Open questions

1. **Favicon / visual identity.** Reusing the classroom's green spade would
   blur two products that are deliberately being separated.
2. **Repo licence.** `pbn-to-pdf` and `dealer3` are Unlicense. This repo has no
   `LICENSE` yet.
3. **Does the launcher describe the services too?** `solver.`, `ben.`, `dealer.`
   and `tables.` are real public HTTP APIs with no documentation page anywhere.
   A "Services" section would be genuinely useful — but it is scope beyond the
   four browser tools, so decide before it creeps in.
4. **`www` or bare apex** as canonical, and a redirect from the other.

---

## Acceptance checks

- [ ] `curl -sI https://bridge-craftwork.com` → 200 (currently: no apex DNS record at all)
- [ ] Every tile's **Try** link loads the tool and renders a real output file
- [ ] Every **Download** link resolves to a release with platform assets attached
- [ ] `pbn-to-pdf.bridge-classroom.org` still resolves (200 or 301 — never 404)
- [ ] The bridge-classroom hub tile points at the new host and is not dead
- [ ] `bridge-craftwork.github.io/pdf-handouts/` still resolves
- [ ] bridge-solver's `/api/stats` works on the new host
- [ ] `solver.` and `dealer.` still answer — untouched, and NOT repurposed

---

## Reference

- Cloudflare account: `13691335358be0d5da6e79540083d975`
- Local checkouts: `/Users/rick/Development/GitHub/{pbn-to-pdf,dealer3,pdf-handouts,bridge-solver}`
- Design tokens to copy: `Bridge-Classroom/docs/styles.css`
- Tile markup worth reading first: `Bridge-Classroom/docs/index.html` — the
  260px tile, `.thumb` mock-preview convention, and `tag-*` pills
