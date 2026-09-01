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
