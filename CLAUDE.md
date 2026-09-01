# Claude Code Notes — bridge-craftwork-site

## What this repo is

The launcher page for **bridge-craftwork.com**. Static HTML, no build step,
deployed to Cloudflare Pages. It links out to the browser (WebAssembly) builds
of the Bridge Craftwork CLI tools, which live in their own repos on their own
subdomains.

**Read [PLAN.md](PLAN.md) first** — it carries the full project plan, the
decisions already locked, and the phase order. The work has not started.

## Ground rules

- **This repo is the launcher only.** No tool is served from the apex. If a
  change would make a tool's code live here, it belongs in the tool's repo.
- **Static, no bundler.** `site/` deploys verbatim via
  `pages_build_output_dir`. Adding Vite is a decision, not a detail.
- **Copy design tokens, don't fetch them.** `styles.css` is copied from
  Bridge-Classroom, not linked cross-domain.
- **Download links point at `/releases/latest`**, never a pinned tag.

## Two different things share this domain

`bridge-craftwork.com` hosts **backend HTTP services** on subdomains —
`solver.`, `ben.`, `dealer.`, `tables.`, `game-parser.` — which run on a
DigitalOcean droplet behind a shared Caddy proxy (see the private
`bridge-craftwork-platform` repo, `edge/Caddyfile`).

The **browser tool builds** this site launches are Cloudflare Pages projects.
They do **not** pass through Caddy and do not touch the droplet.

⚠️ `solver.` and `dealer.` are **already taken by the live services** — both
verified answering on 2026-08-31, and both hardcoded as production defaults in
the Bridge-Classroom frontend (`ddsClient.js`, `dealerClient.js`). Do not
repurpose them. A 404 at `/` means "no route at the root", not "nothing there";
probe a real endpoint before concluding a host is free.

**Hostname convention:** a backend service is named for its *capability*
(`solver.`, `dealer.`); a browser build is named for its *repo*
(`bridge-solver.`, `dealer3.`). See PLAN.md.

## Git

- SSH, not HTTPS. Remote: `git@github.com:bridge-craftwork/bridge-craftwork-site.git`
- Org repos have no fork workflow — branch, PR, merge to `main`.

## Sibling checkouts

`/Users/rick/Development/GitHub/` — `pbn-to-pdf`, `dealer3`, `pdf-handouts`,
`bridge-solver`, `bridge-rulebot`, `Bridge-Classroom`,
`bridge-craftwork-platform`.
