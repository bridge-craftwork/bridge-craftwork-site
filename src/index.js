/**
 * bridge-craftwork.com — the apex Worker.
 *
 * Today it does three things: canonicalises the hostname, resolves platform
 * download links, and serves the static site. Cloudflare matches assets before
 * invoking this Worker, so a request that reaches the fall-through matched no
 * asset and is handed back to ASSETS for a 404.
 *
 * Phase 2: a known tool prefix like `/dealer3/` proxies to that tool's own
 * project with the prefix stripped. See TOOLS and proxyTool below — the
 * trailing-slash redirect and header preservation both live there, and both
 * fail quietly rather than loudly when they are wrong.
 */

const APEX = 'bridge-craftwork.com'

// How each tool's release assets are named, as a function of the platform —
// and, for the one tool that needs it, the release version.
//
// The name is CONSTRUCTED and handed to GitHub's own
// `releases/latest/download/<name>` redirect. Nothing calls the GitHub API:
// unauthenticated API calls are rate limited per IP, and a Worker's
// subrequests leave from Cloudflare addresses shared with everyone else's, so
// that lookup gets refused much of the time. `latest` is still resolved by
// GitHub rather than pinned here.
//
// An archive rather than the bare binary throughout — a bare executable
// downloads as an untrusted file and will not run without extra steps. This is
// also why bridge-solver's `solver-diag-*` can never be picked by accident:
// the name is built, not searched for.
const TOOLS = {
  'bridge-solver': {
    name: (p) => `bridge-solver-${p}${p.startsWith('windows') ? '.zip' : '.tar.gz'}`,
  },
  dealer3: {
    name: (p) => `dealer-${p}${p.startsWith('windows') ? '.exe.zip' : '.tar.gz'}`,
  },
  'pbn-to-pdf': {
    name: (p) => `pbn-to-pdf-${p}${p.startsWith('windows') ? '.zip' : '.tar.gz'}`,
  },

  // The odd one out: pdf-handouts puts the release version in its asset names
  // (`pdf-handouts-1.0.0-macos-aarch64.zip`), so the name cannot be built from
  // the platform alone. The version comes from the release page's own redirect
  // rather than the API. If that repo ever drops the version to match the
  // other three, delete `needsVersion` and the lookup goes with it.
  'pdf-handouts': {
    needsVersion: true,
    name: (p, v) => `pdf-handouts-${v}-${p}${p.startsWith('linux') ? '.tar.gz' : '.zip'}`,
  },
}

// The platform triples every one of the four repos builds. Asset names embed
// exactly these, which is what makes the match reliable rather than a guess.
const PLATFORMS = new Set([
  'linux-x86_64',
  'macos-aarch64',
  'macos-x86_64',
  'windows-x86_64',
])

/**
 * Best-effort platform from request headers, for visitors whose browser ran no
 * JavaScript. The page sends a `?platform=` when it can do better — notably on
 * macOS, where the architecture is not in the User-Agent at all.
 */
function platformFromHeaders(request) {
  const hint = request.headers.get('sec-ch-ua-platform') || ''
  const ua = request.headers.get('user-agent') || ''
  const arch = (request.headers.get('sec-ch-ua-arch') || '').replace(/"/g, '')

  // Phones and tablets first: there is no CLI build for them, and Android
  // would otherwise fall straight into the Linux branch below. An iPad in
  // desktop mode is indistinguishable from a Mac by headers alone — the page's
  // own check catches that one, since it can read maxTouchPoints.
  if (/iPhone|iPod|iPad|Android/i.test(ua)) return null
  if (request.headers.get('sec-ch-ua-mobile') === '?1') return null

  let os = null
  if (/macOS/i.test(hint) || /Mac OS X|Macintosh/i.test(ua)) os = 'macos'
  else if (/Windows/i.test(hint) || /Windows/i.test(ua)) os = 'windows'
  else if (/Linux|Android|CrOS/i.test(hint) || /Linux|CrOS/i.test(ua)) os = 'linux'
  if (!os) return null

  if (os === 'macos') {
    // The UA never carries Mac architecture, and Safari reports "MacIntel" on
    // Apple Silicon too. Apple Silicon is the safer default in 2026: an Intel
    // Mac is the rarer case, and the tile's "other platforms" link is the way
    // back. Chromium sends sec-ch-ua-arch, so prefer it when it is there.
    if (arch === 'x86') return 'macos-x86_64'
    return 'macos-aarch64'
  }
  return `${os}-x86_64`
}

/**
 * The newest release's tag, cached for an hour.
 *
 * This asks github.com, NOT api.github.com: `/releases/latest` answers with a
 * redirect to `/releases/tag/<tag>`, and the plain site is not subject to the
 * API's unauthenticated per-IP rate limit — which a Worker would otherwise hit
 * constantly, since its subrequests share Cloudflare's egress addresses.
 */
async function latestTag(repo, ctx) {
  const url = `https://github.com/bridge-craftwork/${repo}/releases/latest`
  const cache = caches.default
  const key = new Request(url)

  let hit = await cache.match(key)
  if (!hit) {
    const res = await fetch(url, { redirect: 'manual' })
    const tag = (res.headers.get('location') || '').match(/\/releases\/tag\/([^/?#]+)/)
    if (!tag) return null
    hit = new Response(tag[1], { headers: { 'cache-control': 'public, max-age=3600' } })
    ctx.waitUntil(cache.put(key, hit.clone()))
  }
  return (await hit.text()).trim()
}

/**
 * `/download/<tool>` — hand back the right file for the visitor's platform
 * instead of dropping them on a release page to read asset names. Every failure
 * path falls back to that page rather than erroring: a download that needs one
 * extra click still works, and this must never be the thing that is broken.
 */
async function download(request, url, ctx) {
  const tool = url.pathname.slice('/download/'.length).replace(/\/+$/, '')
  const spec = TOOLS[tool]
  if (!spec) return Response.redirect('https://github.com/bridge-craftwork', 302)

  const releasePage = `https://github.com/bridge-craftwork/${tool}/releases/latest`

  let platform = url.searchParams.get('platform')
  if (!PLATFORMS.has(platform)) platform = platformFromHeaders(request)
  if (!platform) return Response.redirect(releasePage, 302)

  let version = null
  if (spec.needsVersion) {
    const tag = await latestTag(tool, ctx)
    if (!tag) return Response.redirect(releasePage, 302)
    version = tag.replace(/^v/, '')
  }

  return Response.redirect(`${releasePage}/download/${spec.name(platform, version)}`, 302)
}

// Phase 2 — each tool's browser build, mounted on a path here and served from
// its own project. The prefix is stripped and the remainder appended to the
// base, so each origin keeps serving from ITS root and every repo's `_headers`
// path rules (`/assets/*`, `/index.html`) keep working untouched.
//
// Keyed by path prefix; TOOLS above is keyed by repo name and is about release
// assets. Two different things, deliberately not merged.
const TOOL_ORIGINS = {
  '/pbn-to-pdf': 'https://pbn-to-pdf.pages.dev',
  '/dealer3': 'https://dealer3.pages.dev',
  '/bridge-solver': 'https://bridge-solver.pages.dev',
  '/pdf-handouts': 'https://pdf-handouts.pages.dev',
}

// Paths a mounted tool requests from the SITE ROOT rather than from its own
// mount, because the tool built them absolute. Under a path mount these land on
// the apex and 404 — silently, since the tool keeps working and only the
// feature behind them stops.
//
// bridge-solver's telemetry beacon is the one case: `web/src/lib/telemetry.js`
// has `const ENDPOINT = '/t'`. The durable fix is a relative `./t` in that
// repo; until then this keeps the mounted tool whole, and routing is what this
// repo is for. Anything added here is a workaround, not a pattern to grow.
const TOOL_ROOT_PATHS = {
  '/t': '/bridge-solver',
}

/** Exact segment match, so `/dealer3-notes` never routes to `/dealer3`. */
function matchTool(pathname) {
  for (const prefix of Object.keys(TOOL_ORIGINS)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return prefix
  }
  return null
}

async function proxyTool(request, url, prefix, innerPath) {
  const base = TOOL_ORIGINS[prefix]

  if (innerPath === undefined) {
    // `/tool` -> `/tool/`. Every tool builds with relative asset URLs, so
    // without the trailing slash they resolve against the wrong base and the
    // page loads with nothing in it. First thing to break if it is missed.
    if (url.pathname === prefix) {
      url.pathname = prefix + '/'
      return Response.redirect(url.toString(), 301)
    }
    innerPath = url.pathname.slice(prefix.length)
  }

  const target = new URL(base + innerPath)
  target.search = url.search

  const upstream = await fetch(new Request(target, request), { redirect: 'manual' })

  // A redirect from the origin points into the origin's own path space. Left
  // alone it would bounce the visitor onto pages.dev and straight out of this
  // site, so map it back into ours.
  const location = upstream.headers.get('location')
  if (location) {
    const abs = new URL(location, target)
    const baseUrl = new URL(base)
    if (abs.origin === baseUrl.origin) {
      const basePath = baseUrl.pathname.replace(/\/+$/, '')
      const inner =
        basePath && abs.pathname.startsWith(basePath)
          ? abs.pathname.slice(basePath.length)
          : abs.pathname
      const headers = new Headers(upstream.headers)
      headers.set('location', prefix + (inner || '/') + abs.search)
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      })
    }
  }

  // Returned as-is so the ORIGIN'S headers survive the hop: dealer3's
  // COOP/COEP for its threaded wasm, and every repo's `_headers` cache rules.
  // Rebuilding the response here would drop them, silently.
  return upstream
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // The bare apex is canonical; www redirects to it. Both hostnames are
    // custom domains on this Worker, so this belongs here rather than in a
    // zone Redirect Rule — one hostname policy, in the same diff as the rest.
    // It matches the <link rel="canonical"> the page already declares.
    // Read the Host header rather than url.hostname: in production they agree,
    // but `wrangler dev` builds request.url from the local connection, which
    // would make this branch untestable before it shipped.
    const host = (request.headers.get('host') || url.hostname).split(':')[0]
    if (host === `www.${APEX}`) {
      url.hostname = APEX
      url.port = ''
      url.protocol = 'https:'
      return Response.redirect(url.toString(), 301)
    }

    if (url.pathname.startsWith('/download/')) return download(request, url, ctx)

    const rooted = TOOL_ROOT_PATHS[url.pathname]
    if (rooted) return proxyTool(request, url, rooted, url.pathname)

    const tool = matchTool(url.pathname)
    if (tool) return proxyTool(request, url, tool)

    return env.ASSETS.fetch(request)
  },
}
