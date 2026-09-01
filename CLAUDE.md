# Claude Code Notes — bridge-craftwork-site

## What this repo is

The launcher **and documentation site** for **bridge-craftwork.com**. A Worker
with Static Assets: it serves the site from `site/`, and routes each tool's path
(`/pbn-to-pdf/`, `/dealer3/`, …) to that tool's own Cloudflare Pages project.

The tools' code lives in their own repos and deploys itself. This repo owns the
site and the routing.

**Read [PLAN.md](PLAN.md) first** — it carries the full project plan, the
decisions already locked, and the phase order. The work has not started.

## Ground rules

- **Tool code never lives here.** This repo owns the site, the docs and the
  router. A tool's build belongs in the tool's repo.
- **Static, no bundler.** `site/` is served by the `ASSETS` binding. Adding
  Vite is a decision, not a detail.
- **Preserve origin headers when proxying.** dealer3 needs COOP/COEP for its
  threaded wasm, and every repo's `_headers` carries cache rules. Drop them on
  the hop and things break quietly.
- **Redirect `/tool` → `/tool/`.** Every tool uses relative asset URLs, so a
  missing trailing slash resolves them against the wrong base.
- **Copy design tokens, don't fetch them.** `styles.css` is copied from
  Bridge-Classroom, not linked cross-domain.
- **Download links resolve `latest` at request time**, never a pinned tag. The
  Worker's `/download/<tool>` looks up the newest release, picks the asset for
  the visitor's platform and redirects to it — so the button downloads a file
  instead of opening a release page, and still never goes stale. There is no
  CLI build for phones, so the page disables the button there rather than
  offering something that cannot run.

## Two different things share this domain

`bridge-craftwork.com` hosts **backend HTTP services** on subdomains —
`solver.`, `ben.`, `dealer.`, `tables.`, `game-parser.` — which run on a
DigitalOcean droplet behind a shared Caddy proxy (see the private
`bridge-craftwork-platform` repo, `edge/Caddyfile`).

The **browser tool builds** are Cloudflare Pages projects, mounted on **paths**
under the apex. They do **not** pass through Caddy and do not touch the droplet.

**The rule: subdomains are machines, paths are pages.** No tool gets a
subdomain. That is what keeps a static page from sitting next to a live API with
nothing but the name to tell them apart.

The services are **deliberately undocumented** — publicly reachable but
unadvertised, and not sized for the attention a documentation page would bring
(one droplet, one shared proxy). The docs in Phase 5 cover the four browser
tools only. Don't help by writing up an API here.

⚠️ `solver.` and `dealer.` are **live services** — both verified answering on
2026-08-31, and both hardcoded as production defaults in the Bridge-Classroom
frontend (`ddsClient.js`, `dealerClient.js`). Do not repurpose them. A 404 at
`/` means "no route at the root", not "nothing there"; probe a real endpoint
before concluding a host is free.

## Why the domain split exists

`bridge-classroom.com` carries the recovery email's SPF/DKIM/DMARC and the
student-facing traffic. Keeping tools and API endpoints off it is deliberate —
reputation isolation, not just branding. Don't undo it by parking something
here on a bridge-classroom host because it was convenient.

## Licence

Unlicense (public domain), matching `pbn-to-pdf` and `dealer3`.

## Git

- SSH, not HTTPS. Remote: `git@github.com:bridge-craftwork/bridge-craftwork-site.git`
- Org repos have no fork workflow — branch, PR, merge to `main`.

## Sibling checkouts

`/Users/rick/Development/GitHub/` — `pbn-to-pdf`, `dealer3`, `pdf-handouts`,
`bridge-solver`, `bridge-rulebot`, `Bridge-Classroom`,
`bridge-craftwork-platform`.
