/**
 * vercelClient.js — TSK-06D (Dev 1B): raw Vercel Deployments API call for
 * US-11's "Static URL Publish" stretch goal. Server-only (uses the
 * un-prefixed VERCEL_TOKEN); never imported by src/ — the client only ever
 * sees the resulting public URL, never the token.
 *
 * Publishes a single self-contained HTML file (Tailwind via CDN, no build
 * step) as a new Vercel deployment, reusing the same `slug` the ZIP/HTML
 * export already derives from the business name as the Vercel project name
 * — republishing after a revision creates a new deployment under that same
 * project rather than a random one each time.
 */
const VERCEL_API = 'https://api.vercel.com'
const REQUEST_TIMEOUT_MS = 20000

/** Vercel project names only allow lowercase alphanumerics, `.`, `_`, `-`. buildStandaloneHtml's
 * slug already satisfies this, but re-sanitize defensively since the value crosses a network boundary. */
function sanitizeProjectName(name = '') {
  const clean = String(name).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return (clean || 'umkm-website').slice(0, 100)
}

export async function deployToVercel({ token, teamId, projectName, html }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const url = new URL(`${VERCEL_API}/v13/deployments`)
    if (teamId) url.searchParams.set('teamId', teamId)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: sanitizeProjectName(projectName),
        target: 'production',
        files: [{ file: 'index.html', data: html }],
        projectSettings: { framework: null },
      }),
      signal: controller.signal,
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: json?.error?.message || `Vercel HTTP ${res.status}` }
    }
    if (!json?.url) {
      return { ok: false, error: 'Vercel response missing url' }
    }
    return { ok: true, url: `https://${json.url}` }
  } catch (err) {
    const isAbort = err?.name === 'AbortError'
    return { ok: false, error: isAbort ? 'timeout' : (err?.message || String(err)) }
  } finally {
    clearTimeout(timer)
  }
}
