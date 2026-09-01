# bridge-craftwork-site

The landing page for **bridge-craftwork.com** — a launcher for the browser
builds of the Bridge Craftwork command-line tools.

Each tool is a Rust CLI that also compiles to WebAssembly. The browser build
exists for two reasons:

1. Someone who needs the tool once shouldn't have to install anything.
2. Someone who might want the CLI can try it first without downloading it.

So every tile on this page offers the same three things: **Try in browser**,
**Download CLI**, **View source**.

The tools themselves live on their own subdomains and deploy from their own
repos. This repo is only the launcher at the apex.

**Status: not built yet.** See [PLAN.md](PLAN.md) for the full project plan,
including the current/target hosting layout and the phase order.
