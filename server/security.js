/**
 * security.js — Dev 1B: shared hardening for /api/generate and /api/revise
 * (issues #20, #25). Both entry points call into this — the Vite dev/preview
 * middleware (routes.js) and the Vercel Serverless Functions
 * (api/generate.js, api/revise.js) — so policy can't drift between them.
 *
 * ALLOWED_ORIGIN/ENABLE_API_DOCS are read from process.env directly, which
 * Vercel populates at runtime (the actual Demo Day deploy target, see
 * api/generate.js) but Vite's dev/preview server does not auto-populate
 * from a local .env file (only the explicit loadEnv() object passed into
 * backendApiPlugin does, which is why GEMINI_API_KEY is threaded through
 * that instead). For local `npm run dev`/`preview` testing, export these in
 * the shell rather than only setting them in `.env`.
 */
let warned = false

/** Reject the request body before it's fully buffered/parsed once it grows
 * past this — the actual UMKMWebsiteState payloads involved are a few KB at
 * most (see server/prompts.js's own truncation), so this is generous
 * headroom against memory-exhaustion from an arbitrarily large body. */
export const MAX_REQUEST_BODY_BYTES = 100 * 1024

function getAllowedOrigins() {
  return String(process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

/**
 * A request with no Origin header (same-origin navigation, curl,
 * server-to-server calls) is always allowed — CORS only constrains
 * browsers, and volumetric abuse from any source is rate limiting's job
 * (#8), not this check's. This only blocks what the issue targets: a page
 * on another origin driving a "simple" (no-preflight, e.g.
 * `Content-Type: text/plain`) cross-origin request against these
 * Gemini-backed endpoints to burn quota.
 */
export function isOriginAllowed(origin) {
  const allowed = getAllowedOrigins()
  if (allowed.length === 0) {
    if (!warned) {
      warned = true
      console.warn('[server] ALLOWED_ORIGIN not set — /api/generate and /api/revise accept requests from any Origin. Set ALLOWED_ORIGIN (comma-separated) before going live.')
    }
    return true
  }
  return !origin || allowed.includes(origin)
}

/** Basic response hardening (issue #25 item 11) — no `helmet` dependency
 * needed for 2 JSON-only endpoints. Scoped to /api/generate and /api/revise
 * only, not /api/docs, since Swagger UI needs its own inline scripts/styles
 * that this CSP would otherwise block. */
export function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Content-Security-Policy', "default-src 'none'")
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
}

/** Whether GET /api/docs (Swagger UI) should be served at all (issue #25
 * item 12) — off by default so the API spec isn't publicly browsable the
 * moment a deploy is live; opt in locally with ENABLE_API_DOCS=true. */
export function isApiDocsEnabled() {
  return process.env.ENABLE_API_DOCS === 'true'
}

// Issue #8: the shared GEMINI_API_KEY free tier is capped at 20
// requests/day (tests/e2e/fixtures.js:9 — the team has already hit this
// testing manually), and every failed call retries once
// (geminiClient.js MAX_ATTEMPTS = 2), so one client rapid-clicking/
// refreshing can burn the day's whole budget before the real demo starts.
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 5
const rateLimitBuckets = new Map()

function getClientKey(req) {
  const forwarded = req.headers?.['x-forwarded-for']
  if (forwarded) return String(forwarded).split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

/**
 * Simple in-memory fixed-window counter, keyed by client IP — enough for
 * demo scale (no Redis). Known limitation: on Vercel each invocation may
 * land on a different container instance, so this is best-effort there
 * (still effective for the common case of one warm container serving a
 * live demo's sequential requests); it's fully reliable on the single
 * long-lived Node process behind `npm run dev`/`preview`.
 */
export function isRateLimited(req) {
  const key = getClientKey(req)
  const now = Date.now()
  const bucket = rateLimitBuckets.get(key)
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { count: 1, windowStart: now })
    return false
  }
  bucket.count += 1
  return bucket.count > RATE_LIMIT_MAX_REQUESTS
}

export function rateLimitRetryAfterSeconds() {
  return Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
}
