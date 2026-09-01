/**
 * bridge-craftwork.com — the apex Worker.
 *
 * Phase 1 (now): every request is a static asset from `site/`. Cloudflare
 * matches assets before invoking this Worker, so in practice this handler only
 * sees requests that matched nothing, and hands them back to ASSETS for a 404.
 *
 * Phase 2 (next): the tool-path router lands here — a known prefix like
 * `/dealer3/` proxies to that tool's own Pages project with the prefix
 * stripped, so each repo's `_headers` path rules keep working untouched.
 *
 * Two things will break first when that arrives, both quietly:
 *
 *   1. `/tool` must redirect to `/tool/`. Every tool builds with relative asset
 *      URLs, so without the trailing slash they resolve against the wrong base.
 *   2. The origin's response headers must survive the hop. dealer3 needs its
 *      COOP/COEP for threaded wasm, and every repo's `_headers` carries cache
 *      rules. Construct the response so they are preserved, not rebuilt.
 */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request)
  },
}
