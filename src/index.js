/**
 * bridge-craftwork.com — the apex Worker.
 *
 * Today it does three things: canonicalises the hostname, resolves platform
 * download links, and serves the static site. Cloudflare matches assets before
 * invoking this Worker, so a request that reaches the fall-through matched no
 * asset and is handed back to ASSETS for a 404.
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

const APEX = 'bridge-craftwork.com'

// Tool path segment -> the prefix its release assets share. The prefix is what
// separates a tool's binary from the other things in the same release:
// bridge-solver ships `solver-diag-*` alongside `bridge-solver-*`, and matching
// on the platform alone would hand someone the diagnostic tool by mistake.
const BINARY_PREFIX = {
  'bridge-solver': 'bridge-solver-',
  dealer3: 'dealer-',
  'pbn-to-pdf': 'pbn-to-pdf-',
  'pdf-handouts': 'pdf-handouts-',
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
 * The latest release, cached for an hour. Resolving `latest` per request is
 * what keeps every download link current without pinning a tag anywhere —
 * the rule in CLAUDE.md — while still landing on an actual file.
 */
async function latestRelease(repo, ctx) {
  const url = `https://api.github.com/repos/bridge-craftwork/${repo}/releases/latest`
  const cache = caches.default
  const key = new Request(url)

  let hit = await cache.match(key)
  if (!hit) {
    const res = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        // GitHub rejects API requests that do not identify themselves.
        'user-agent': 'bridge-craftwork-site (+https://bridge-craftwork.com)',
      },
    })
    if (!res.ok) return null
    hit = new Response(res.body, res)
    hit.headers.set('cache-control', 'public, max-age=3600')
    ctx.waitUntil(cache.put(key, hit.clone()))
  }
  try {
    return await hit.json()
  } catch {
    return null
  }
}

/** Prefer an archive: a bare binary downloads as an untrusted executable. */
function pickAsset(assets, prefix, platform) {
  const rank = (n) =>
    n.endsWith('.tar.gz') || n.endsWith('.zip') ? 0 : n.endsWith('.exe') ? 1 : 2

  return (
    assets
      .filter((a) => a.name.startsWith(prefix) && a.name.includes(platform))
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.length - b.name.length)[0] || null
  )
}

/**
 * `/download/<tool>` — hand back the right file for the visitor's platform
 * instead of dropping them on a release page to read asset names. Every failure
 * path falls back to that page rather than erroring: a download that needs one
 * extra click still works, and this must never be the thing that is broken.
 */
async function download(request, url, ctx) {
  const tool = url.pathname.slice('/download/'.length).replace(/\/+$/, '')
  const prefix = BINARY_PREFIX[tool]
  if (!prefix) return Response.redirect('https://github.com/bridge-craftwork', 302)

  const releasePage = `https://github.com/bridge-craftwork/${tool}/releases/latest`

  let platform = url.searchParams.get('platform')
  if (!PLATFORMS.has(platform)) platform = platformFromHeaders(request)
  if (!platform) return Response.redirect(releasePage, 302)

  const release = await latestRelease(tool, ctx)
  const asset = release && pickAsset(release.assets || [], prefix, platform)
  return Response.redirect(asset ? asset.browser_download_url : releasePage, 302)
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

    return env.ASSETS.fetch(request)
  },
}
