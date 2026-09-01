# bridge-craftwork-site

The launcher **and documentation site** for **bridge-craftwork.com** — a home
for the browser builds of the Bridge Craftwork command-line tools, and the
first documentation any of them have had.

Each tool is a Rust CLI that also compiles to WebAssembly. The browser build
exists for two reasons:

1. Someone who needs the tool once shouldn't have to install anything.
2. Someone who might want the CLI can try it first without downloading it.

So every tile offers the same four things: **Try in browser**, **Download CLI**,
**Docs**, and **View source**.

## How it fits together

This repo is a Cloudflare Worker with Static Assets. It serves the site from
`site/`, and routes each tool's path to that tool's own Cloudflare Pages
project:

```
bridge-craftwork.com/                → launcher (this repo)
bridge-craftwork.com/pbn-to-pdf/     → pbn-to-pdf.pages.dev
bridge-craftwork.com/dealer3/        → dealer3.pages.dev
bridge-craftwork.com/pdf-handouts/   → pdf-handouts.pages.dev
bridge-craftwork.com/bridge-solver/  → bridge-solver.pages.dev
bridge-craftwork.com/docs/<tool>/    → documentation (this repo)
```

The tools' code lives in their own repos and deploys itself. This repo owns the
site and the routing.

**Paths, not subdomains.** Subdomains on this domain are machines — `solver.`,
`ben.`, `dealer.` and the rest are live backend services running somewhere else
entirely. No tool gets one. See [PLAN.md](PLAN.md) for why that was decided the
other way first, and then reversed.

**Status: not built yet.** [PLAN.md](PLAN.md) carries the full project plan,
the current and target hosting layout, and the phase order.

## Licence

[Unlicense](LICENSE) — public domain, matching `pbn-to-pdf` and `dealer3`.
