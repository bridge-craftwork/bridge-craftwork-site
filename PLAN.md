# Project plan — bridge-craftwork.com

Give the Bridge Craftwork tools a proper home: a launcher **and documentation
site** at `bridge-craftwork.com`, with each tool's browser build mounted on a
path under it.

Today the browser builds are scattered across two domains and three hosting
shapes, and one of them sits on `bridge-classroom.org` — the domain deliberately
kept separate from all of this.

---

## Why here

1. **Reputation isolation.** The services were put on `bridge-craftwork.com` in
   the first place to keep `bridge-classroom.com` clean — that domain carries
   the recovery email's SPF/DKIM/DMARC and all the student-facing traffic, and
   it should not also be the domain answering API calls and serving tool
   traffic. The tools belong on the same side of that line as the services.
   (Note that `pbn-to-pdf.bridge-classroom.org` today is exactly the mixing the
   split exists to prevent.)
2. **Branding.** The GitHub org, the email and the Patreon are all
   *bridge-craftwork*. The web presence is the only part that isn't.
3. **Somewhere to document the tools.** Four CLIs with real releases and no
   documentation site between them. This is the natural home, and it is the
   reason the site is more than a grid of tiles.

Secondary, but real: the tools don't fit bridge-classroom's taxonomy. That hub
sorts by audience *within a teaching product* — "For students / Teacher
resources / Author tools" — and a general-purpose PBN→PDF converter is none of
those.

`bridge-classroom.com/.org` keeps linking here. Sibling, not replacement.

---

## Decisions made

| Decision | Choice | Why |
| --- | --- | --- |
| Domain | `bridge-craftwork.com` | Already the tooling domain; apex empty |
| **URL shape** | **Path per tool** — `bridge-craftwork.com/pbn-to-pdf/` | See below |
| Subdomains | **Reserved for machines** | Services only. No tool gets one. |
| Apex hosting | Worker with Static Assets + path router | Serves the site; proxies tool paths |
| Tool hosting | Unchanged — each repo's own Cloudflare Pages project | Repos stay independently deployable |
| Tile CTA | Try in browser · Download CLI · Docs · Source | The funnel is the point |

### Why paths, not a subdomain per tool

The subdomain scheme was the first choice and was **reversed** — the reasoning
is worth keeping, because it is easy to re-derive the wrong answer.

Services and wasm pages are already separate infrastructure. Verified
2026-08-31:

| | Services | Wasm pages |
| --- | --- | --- |
| Resolves to | `146.190.135.172` (droplet, all five) | Cloudflare anycast |
| Proxy | none — DNS-only, no `cf-ray` | proxied |
| TLS | Caddy's own per-host Let's Encrypt cert | Cloudflare-issued |
| Deploy | droplet, systemd/Docker | `wrangler pages deploy` from CI |

They share only the DNS zone. But a *flat subdomain namespace hides that* — a
reader can't tell `solver.` (a live API) from `bridge-solver.` (a static page),
and those two would have sat next to each other. A naming convention would have
documented the distinction; paths **remove** it. The website is the website;
subdomains are machines.

This also matters because the tools are the only thing users ever see. The
services are plumbing — nobody types `solver.bridge-craftwork.com`. The
user-visible surface should be the coherent one.

**And it turns out to be nearly free** (verified 2026-08-31): every tool already
builds with **relative asset URLs** — `base: './'` in all three Vite configs,
and hand-written relative `href`/`src` in pdf-handouts' HTML. So each tool works
at any path depth **with no build change at all**. The `base`-per-repo cost that
argued for subdomains does not exist.

Bonus: dealer3 sets `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` for its threaded wasm. Under paths
everything it loads is same-origin, so `require-corp` is satisfied without
adding CORP headers — strictly easier than it would have been across a subdomain
boundary.

---

## Current state

| Tool | Browser build lives at | Hosting | CLI releases |
| --- | --- | --- | --- |
| pbn-to-pdf | `pbn-to-pdf.bridge-classroom.org` | Cloudflare Pages | v0.18.0, 5 assets |
| pdf-handouts | `bridge-craftwork.github.io/pdf-handouts/` | **GitHub Pages** | v1.0.0, 4 assets |
| dealer3 | **`dealer.bridge-classroom.org`** | Cloudflare Pages | v1.0.0, 8 assets |
| bridge-solver | **`solver.bridge-classroom.org`** | Cloudflare Pages + Functions | v1.0.0, 12 assets |
| bridge-rulebot | *(wasm crate, no web UI)* | — | none |

> **Corrected 2026-09-01.** This table said dealer3 and bridge-solver had no
> custom domain. Both do, and both are live — listed on their Pages projects and
> serving. So **three** tools sit on `bridge-classroom.org`, not one, and the
> reputation-isolation gap is three times what Phase 4 was written for.
>
> Worse than the count: `dealer.` and `solver.` are the **same labels as the
> live droplet APIs** `dealer.bridge-craftwork.com` and
> `solver.bridge-craftwork.com`. A static wasm page and a production API now
> differ only by domain. That is the exact confusion "subdomains are machines,
> paths are pages" exists to prevent — and it is already here, one domain over.

## Target state

```
bridge-craftwork.com/                  → launcher (this repo)
bridge-craftwork.com/pbn-to-pdf/       → pbn-to-pdf.pages.dev
bridge-craftwork.com/dealer3/          → dealer3.pages.dev
bridge-craftwork.com/pdf-handouts/     → pdf-handouts.pages.dev
bridge-craftwork.com/bridge-solver/    → bridge-solver.pages.dev
bridge-craftwork.com/docs/<tool>/      → documentation (this repo)
```

Untouched: `solver.` `dealer.` `ben.` `tables.` `game-parser.` `livekit.` —
the running services. **Do not repurpose these.** Both `solver.` and `dealer.`
were probed on 2026-08-31 and are live (`/dd` returns a real result in 99ms;
`/deal` returns a serde error naming the field it wants), and both are hardcoded
production defaults in the Bridge-Classroom frontend (`ddsClient.js`,
`dealerClient.js`). A 404 at `/` means "no route at the root", not "nothing
there" — probe a real endpoint before concluding a host is free.

---

## Phase 1 — Stand up the site *(additive; breaks nothing)*

All new. No existing URL changes, so this can land and sit while the rest waits.

1. **`site/`** — static, no bundler.
   - `site/index.html` — launcher
   - `site/styles.css` — **copy** Bridge-Classroom's `docs/styles.css` (design
     tokens); don't fetch cross-domain
   - `site/favicon.svg` — **done**: a steel wrench, deliberately not the
     classroom's green spade. A placeholder by intent (see below).
2. **The apex is a Worker with Static Assets, not a Pages project.** It has to
   serve the site *and* route tool paths, which a Pages project can't do.
   Bridge-Classroom already uses this product (`wrangler.jsonc`,
   `assets.directory`) — copy that shape.
   ```jsonc
   {
     "name": "bridge-craftwork-site",
     "compatibility_date": "2026-08-31",
     "main": "src/index.js",
     "assets": { "directory": "./site", "binding": "ASSETS" }
   }
   ```
3. **`.github/workflows/deploy.yml`** — `npx wrangler deploy` against a
   pinned `wrangler` devDependency. Needs `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`. Account: `13691335358be0d5da6e79540083d975`
   (documented as non-credential in `bridge-solver/wrangler.jsonc`).

   **Not `cloudflare/wrangler-action`**, which this plan originally specified.
   Left unpinned it falls back to wrangler 3.90.0, which predates Workers
   Static Assets — Bridge-Classroom hit exactly that and moved to `npx
   wrangler`. Pinning the action's `wranglerVersion` would also work; matching
   the sibling repo is worth more than the action's convenience.

   The workflow **self-gates** on the secret's presence (`if: env.CF_API_TOKEN
   != ''`), so it can merge and sit harmlessly before Cloudflare is set up.
4. **Tiles point at the tools' CURRENT URLs.** Deliberate: the site is live and
   useful before any tool moves, and Phase 2 repoints one tile at a time. Each
   `Try in browser` link carries `data-tool` and `data-phase2` attributes naming
   its eventual path, so Phase 2 is a mechanical edit rather than a re-reading
   of this plan.

   **Three actions, not four, until Phase 5** (which also unblocks the
   fourth action). `Docs` is in the decision table
   above and belongs there, but there are no docs yet and a button that 404s is
   worse than one that is absent. The action row already wraps to a second line,
   so adding it later costs no layout work.
5. **Attach `bridge-craftwork.com` + `www`** as custom domains. Cloudflare's
   CNAME flattening handles the apex.

### Tile inventory

| Tile | One-liner | Download |
| --- | --- | --- |
| **PBN to PDF** | Turn a PBN file into printable hand diagrams, declarer's-plan worksheets and bidding sheets. | `pbn-to-pdf/releases/latest` |
| **PDF Handouts** | Merge PDFs and screenshots into a handout with custom headers and footers. | `pdf-handouts/releases/latest` |
| **dealer3** | Rust rebuild of the classic `dealer.exe` hand generator — runs its scripts, accepts its command line. | `dealer3/releases/latest` |
| **bridge-solver** | Fast double-dummy solver with par scoring, cardplay analysis and PBN processing. | `bridge-solver/releases/latest` |
| bridge-rulebot | Deterministic rule-based cardplay bot with teachable reason codes. | **no web UI, no releases** |

Point every Download at **`/releases/latest`**, never a pinned tag — the link
then never goes stale without a rebuild. `bridge-rulebot` gets a source-only
tile or none; don't fake a Try button.

---

## Phase 2 — Mount the tools on paths *(outward-facing)*

One tool at a time; after each, load it and repoint that tile.

**The router.** `src/index.js` in this repo: static assets for everything else,
and for a known tool prefix, proxy to that tool's `pages.dev` with the prefix
stripped.

```js
const TOOLS = {
  '/pbn-to-pdf':    'https://pbn-to-pdf.pages.dev',
  '/dealer3':       'https://dealer3.pages.dev',
  '/pdf-handouts':  'https://pdf-handouts.pages.dev',
  '/bridge-solver': 'https://bridge-solver.pages.dev',
}
```

Strip the prefix rather than nesting each tool's build output: `pages.dev` keeps
serving from its root, so each repo's `_headers` path rules (`/assets/*`,
`/index.html`) keep working untouched. **Preserve the origin's headers** —
construct the response so `_headers` survives the hop, or dealer3's COOP/COEP
and every `Cache-Control` rule silently vanish.

Redirect `/tool` → `/tool/` so relative asset URLs resolve against the right
base. This is the one thing that will break first if missed.

Per tool, in order — `pbn-to-pdf`, `dealer3`, `pdf-handouts`, `bridge-solver`:

1. Confirm the Pages project's `pages.dev` serves it.
2. Add the prefix to `TOOLS`, deploy, load `bridge-craftwork.com/<tool>/`.
3. Exercise it for real — render a PDF, generate a deal. A page that loads is
   not a page that works; the wasm fetch is the part that fails quietly.
4. Repoint that tile.

`bridge-solver` last: it carries Pages Functions (`/t` beacon, `/api/stats`), a
KV namespace and an Analytics Engine binding. Those must be re-checked through
the proxy — a Function that works on `pages.dev` can still break behind it.

---

## Phase 3 — Move pdf-handouts off GitHub Pages ✅ *done 2026-09-01*

Landed as three separate merges, in this order, because doing it in one would
have made the tool unreachable: a stub at the GitHub Pages address redirects to
`/pdf-handouts/`, which until step 2 proxied that same address.

1. `pdf-handouts.pages.dev` made real, GitHub Pages still serving the site
2. the Worker repointed at it — verified byte-identical before going on
3. GitHub Pages swapped to the stub

Two things bit on the way, both worth remembering. `CLOUDFLARE_ACCOUNT_ID` was
53 characters rather than 32 — Cloudflare reports that, a missing permission and
a wrong account identically, as `code: 7003`, so the workflow now runs `whoami`
and a shape check to tell them apart. And `jetli/wasm-pack-action` with
`version: latest` **fails open**: when its GitHub API lookup fails it silently
installs wasm-pack v0.9.1, whose `wasm-opt` cannot parse modern wasm. Pinned
now. **The other three tool repos still use the unpinned action.**


The only tool on a different hosting product, and the smallest migration: no
Vite, no bundler — `pages.yml` runs `wasm-pack` and uploads `web/` directly.

1. Add `wrangler.jsonc` with `"pages_build_output_dir": "web"`.
2. Replace the `upload-pages-artifact` + `deploy` jobs with a
   `wrangler pages deploy` step (copy from `dealer3`).
3. Leave a redirect stub at `bridge-craftwork.github.io/pdf-handouts/` — a
   `<meta http-equiv="refresh">` plus `<link rel="canonical">`. The README links
   it, and so may other people.

Its HTML is hand-written with relative URLs (`href="style.css"`, `src="app.js"`)
so it mounts on a path unchanged — but it has no build step to catch a mistake,
so check the wasm actually loads rather than assuming.

---

## Phase 4 — Retire the old URLs ✅ *done 2026-09-01*

**Three hosts, not one.** pbn-to-pdf was never a special case — the current-state
table above simply recorded dealer3 and bridge-solver wrongly. All three are
live on `bridge-classroom.org`, all three are linked from the hub, and none of
them may 404:

| Old host | Redirects to |
| --- | --- |
| `pbn-to-pdf.bridge-classroom.org` | `bridge-craftwork.com/pbn-to-pdf/` |
| `dealer.bridge-classroom.org` | `bridge-craftwork.com/dealer3/` |
| `solver.bridge-classroom.org` | `bridge-craftwork.com/bridge-solver/` |

**State on 2026-09-01: the zero-risk half is already in effect** for all three.
The custom domains are still attached, so Pages serves the identical build from
both hosts — verified byte-for-byte on pbn-to-pdf, same asset hash. Nothing is
broken; the old hosts are simply no longer canonical.

### What still points at them

- `Bridge-Classroom/docs/index.html` — three hub tiles, one per tool
- `Bridge-Classroom/docs/ingest/index.html` — a link to `solver.`
- `dealer3/web/src/components/PrintView.vue:124` —
  `const siteUrl = 'https://dealer.bridge-classroom.org'`, **printed onto the
  output**. That one argues the redirect must be permanent rather than
  temporary: it is already on paper in people's hands, and a reprint is not a
  redeploy.

### Superseded: detached, not redirected *(2026-09-01)*

The redirect rules were never created, and are not needed. **Nobody but the
author has used these tools** — they are close to brand new and were never
announced — so there are no bookmarks to protect and no reason to keep serving
anything on `bridge-classroom.org`. Detaching is strictly better than
redirecting: it closes the reputation gap completely rather than leaving traffic
terminating on the classroom domain, and it removes the `dealer.`/`solver.`
label collision with the live droplet APIs outright.

Done in this order, so nothing pointed at a host as it went away:

1. `dealer3`'s print footer stopped hard-coding its URL — it now derives it from
   `window.location`, because the same build serves from `pages.dev` and from
   `/dealer3/` and that URL ends up **on paper**. (Dealer3 #50)
2. The hub's three tiles and the ingest page's solver link were repointed to the
   new paths. (Bridge-Classroom #412)
3. All three custom domains detached from their Pages projects.

**Left to do: delete three DNS records.** Detaching removed the Pages binding
but not the records, so the hostnames still resolve and now answer **522** — a
Cloudflare error page with no origin behind it, which is worse than not
existing. Delete on the `bridge-classroom.org` zone:

    pbn-to-pdf.bridge-classroom.org
    dealer.bridge-classroom.org
    solver.bridge-classroom.org

Dashboard only. Nothing available can do it: the CI token is scoped to the
`bridge-craftwork.com` zone, and the local `wrangler` OAuth session cannot even
*read* this zone's DNS records — `dns_records` answers `10000`, as the rulesets
API did. Verify with `dig +short <host>` returning nothing, as a name that never
existed does.

### The alternative, and why it was not taken

A Pages Function (`functions/_middleware.js` in `pbn-to-pdf`) *could* do this in
code — unlike `_redirects`, a Function can read the Host header, so the
host-blindness objection does not apply to it. It was rejected on cost: root
middleware runs for **every** request to that project, including every asset
request proxied through `bridge-craftwork.com/pbn-to-pdf/`. That puts a Function
invocation on the hot path of a project that currently has none, to serve a
redirect for the one host that is being retired.


---

## Phase 5 — Documentation, for people *and* for assistants

The reason this is a site and not just a launcher. Four CLIs with real releases
and no documentation between them; each repo's README is the only reference.

Per tool at `/docs/<tool>/`: what it does, install (per platform, from the
release assets), the common invocations, and how the browser build differs from
the CLI. Source the first draft from each repo's README rather than writing
fresh — `pbn-to-pdf`'s in particular already has a full options table and worked
examples.

### The machine-readable half — issue #3

Phase 5 grew a second audience. Issue #2 found that dealer3's language reference
is **invisible to any assistant that does not run JavaScript**: `/dealer3/reference`
is 841 bytes, 28 characters of visible text, with the real ~25,000-character
reference existing only after hydration — while the 347-file `.dlr` corpus is
fully fetchable from `raw.githubusercontent.com`. That is the worst possible
split: a model pattern-matches hundreds of examples with no grammar and invents
syntax around the edges.

Issue #3 generalises that to all four tools, because **every tool here is a
document transform** and the same surface serves all of them. The contract is
stated in #3; the parts that land in THIS repo are:

- `/llms.txt` — the index, covering all four tools, linking to each tool's
  `reference.txt` and to the docs below. Tool-general from the start: it lives
  at the apex and is written once.
- `/robots.txt` with content signals, **all three yes**:

  ```
  User-agent: *
  Content-Signal: search=yes, ai-input=yes, ai-train=yes
  Allow: /
  ```

  `ai-train=yes` is consistent with the licensing rather than a new position —
  four of five repos are Unlicense, under which training is already permitted,
  so declining would be symbolic while the same content sits freely licensed on
  GitHub. Unset would not have been a refusal either: the policy says no signal
  "neither grants nor restricts".

  **One file governs all four tools**, because they are on paths — under the
  rejected subdomain scheme this would have been four files kept in sync by
  hand. Note Cloudflare already injects a *managed* Content Signals robots.txt
  at the zone level, so replacing it needs verifying after deploy.
- `/sitemap.xml`.
- Serving the house-style guide derived from the scenario corpus.

Each tool's own `reference.txt`, JS API, diagnostics and real 404s belong in
that tool's repo, per the rule at the top of CLAUDE.md. Decided in #3:
`reference.txt` lives at `/<tool>/reference.txt` next to the generator that
emits it — which is what makes a drift check possible — and the JS surface is
`window.<tool>` with uniform method names, since each tool also runs standalone
at its own `pages.dev`.

That has one consequence for this repo: `llms.txt` links across the repo
boundary, so it is only correct once a tool has shipped its mirror. It should
list the tools that have one and grow as the others land.

**These should be built together with the human docs, not before them** — the
index wants something to index. The docs here are static HTML with no hydration,
so unlike dealer3's reference they are agent-readable by construction.

### Blocked on

`Practice-Bidding-Scenarios` has no LICENSE (its issue #300). Its README states
an intent not to claim copyright, but that is not a grant. `llms.txt` should not
point assistants at that corpus until it carries one.

### Settled

The **services are not documented here** — see "Decided" above. That answers the
question this phase used to leave open. It also means `llms.txt` describes the
four browser tools only, and says nothing about `solver.`, `ben.`, `dealer.` or
`tables.`.

---

## Phase 6 — Repoint Bridge-Classroom and the docs

1. **The hub tile** — `docs/index.html` in `bridge-craftwork/Bridge-Classroom`,
   added by PR #411. Repoint the `href`. Then decide: leave it, or replace the
   tool tiles with **one** tile pointing at `bridge-craftwork.com` — arguably
   the whole point of building the launcher.
2. **Cross-link back** to bridge-classroom.com for the teaching product, so the
   two sites frame each other rather than compete.
3. **`Bridge-Classroom/CLAUDE.md`** — its services table lists every
   `bridge-craftwork.com` host. Add the tool **paths**, clearly separated from
   the service **subdomains**, and state the rule: subdomains are machines,
   paths are pages.
4. **`bridge-craftwork-platform`** (private) — `edge/Caddyfile` fronts the
   service hosts. The tool paths are Cloudflare Workers/Pages and **never** pass
   through Caddy or touch the droplet. Say so explicitly, or someone will go
   looking for a stanza that was never there.

---

## Decided

1. **Repo licence — Unlicense**, matching `pbn-to-pdf` and `dealer3`. `LICENSE`
   is in the repo.

2. **The services are NOT documented here.** Answers the Phase 5 question, and
   the answer is no — not "not yet, pending scope", but no on capacity grounds.
   `solver.`, `ben.`, `dealer.` and `tables.` are publicly reachable but
   deliberately **unadvertised**, and they will not scale well to worldwide
   attention: they are one DigitalOcean droplet behind a shared Caddy proxy.
   Documenting a public HTTP API is advertising it. Phase 5 covers the four
   browser tools only.

   Revisit only alongside a capacity plan — never on the grounds that the docs
   would be useful, because that was never the part in doubt.

4. **The bare apex is canonical**; `www` 301s to it, in the Worker rather than
   a zone Redirect Rule — both hostnames are custom domains on this Worker, so
   one hostname policy lives in one diff. It matches the `<link rel="canonical">`
   the page already declared.

3. **Favicon — a wrench**, at `site/favicon.svg`. Deliberately not the
   classroom's green spade, which would blur two products that are being
   separated on purpose. **Placeholder by intent**: it exists so the site never
   waits on a visual identity, and it is one self-contained file to replace when
   something more developed turns up. Don't treat it as a brand decision.

---

## Open questions

1. **Visual identity beyond the favicon.** Wanted eventually, blocking nothing.

---

## Acceptance checks

- [x] `curl -sI https://bridge-craftwork.com` → 200 *(live 2026-09-01)*
- [x] `www` 301s to the bare apex, path and query preserved
- [x] Each `/<tool>/` loads **and produces a real output file** — not just renders
      *(2026-09-01: dealer3 generated 20 deals, bridge-solver solved a board,
      pbn-to-pdf rendered a 154 KB PDF, pdf-handouts loaded its wasm)*
- [x] `/<tool>` (no trailing slash) redirects to `/<tool>/`
- [x] dealer3 still reports cross-origin isolation (`crossOriginIsolated === true`)
- [x] Every Download link resolves to a release with platform assets
      *(all 16 tool x platform combinations followed to a real 200, 2026-09-01)*
- [x] `pbn-to-pdf.bridge-classroom.org` still resolves — 200 or 301, never 404
- [x] `bridge-craftwork.github.io/pdf-handouts/` still resolves
- [x] bridge-solver's `/api/stats` works through the proxy
      *(its `/t` beacon needed a relative URL in that repo — an absolute `/t`
      resolved to the apex under the mount and 404'd silently. Fixed there,
      and the Worker's temporary route for it removed.)*
- [x] `solver.` and `dealer.` still answer — untouched, and NOT repurposed
      *(both 422 on an empty body in <110ms, 2026-09-01)*
- [x] The bridge-classroom hub tiles point somewhere live
      *(all three repointed to the new paths, plus the ingest page's solver
      link — Bridge-Classroom #412. What remains of Phase 6 is the choice
      between three tool tiles and one tile pointing at bridge-craftwork.com,
      and the CLAUDE.md/Caddyfile notes.)*

---

## Reference

- Cloudflare account: `13691335358be0d5da6e79540083d975`
- Local checkouts: `/Users/rick/Development/GitHub/{pbn-to-pdf,dealer3,pdf-handouts,bridge-solver}`
- Design tokens to copy: `Bridge-Classroom/docs/styles.css`
- Tile markup worth reading first: `Bridge-Classroom/docs/index.html` — the
  260px tile, the `.thumb` mock-preview convention, and the `tag-*` pills
- Worker-with-static-assets precedent: `Bridge-Classroom/wrangler.jsonc`
