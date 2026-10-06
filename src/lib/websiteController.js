/**
 * websiteController.js — TSK-01B/02B (Dev 1B): client-side entry point to the
 * backend API routes (see server/index.js). Normalizes both
 * network and "not configured" failures into one shape so callers only need
 * to branch on `ok`, and never talk to Gemini directly (no key in the client
 * bundle).
 */
const REQUEST_TIMEOUT_MS = 20000

async function postJson(url, body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    let json
    try {
      json = await res.json()
    } catch (err) {
      return { ok: false, error: 'network', detail: err?.message || String(err), fallback: null, }
    }
  
    if (json && typeof json === 'object') {
      if (json.ok === true) {
        return { ok: true, data: json.data ?? null }
      }
      return {ok: false, error: json.error ?? 'unknown', detail: json.detail, fallback: json.fallback ?? null, }
    }
    return {ok: false, error: 'invalid_response', detail: 'Response was not a JSON object', fallback: null, }
  } catch(err) {
    const isAbort = err?.name === 'AbortError'
    return {
      ok: false,
      error: isAbort ? 'timeout' : 'network',
      detail: err?.message || String(err),
      fallback: null,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Generate a fresh website draft from a business description (US-05).
 * `onStep`, if given, fires once right before the network call starts
 * (issue #13) — the one genuinely async phase of the 4-phase onboarding
 * progress (App.jsx's "AI menyusun konten"); everything before it
 * (category/template detection) is already synchronous by the time this is
 * called, so there's nothing else worth signaling.
 */
export async function generateWebsite(input, { onStep } = {}) {
  onStep?.('composing')
  const json = await postJson('/api/generate', { input })
  return json
}

/** Request a chat-based revision against the current website state (US-07/US-08). See generateWebsite for `onStep`. */
export async function reviseWebsite(current, message, history = [], { onStep } = {}) {
  onStep?.('composing')
  const json = await postJson('/api/revise', { current, message, history })
  return json
}

/**
 * One-click static publish (US-11, Could-Have stretch goal / TSK-06D).
 * `html`/`slug` are the same standalone export `buildStandaloneHtml` already
 * produces for the ZIP/HTML download (src/lib/exportWebsite.js) — the
 * backend is a thin, token-holding proxy to the Vercel Deployments API, not
 * a second HTML templating engine, so there's exactly one place the
 * exported markup is built. Returns `{ ok: false, error: 'not_configured' }`
 * when the backend has no VERCEL_TOKEN, same shape as generate/revise.
 */
export async function publishWebsite(html, slug) {
  return postJson('/api/publish', { html, slug })
}
