/**
 * api/publish.js — Vercel Serverless Function counterpart to the
 * `/api/publish` route registered as Vite middleware in `server/routes.js`.
 * See api/generate.js for why this file exists separately from routes.js
 * (Vercel's Vite preset never runs the Vite dev/preview server in prod).
 */
import { deployToVercel } from '../server/vercelClient.js'
import { isOriginAllowed, applySecurityHeaders, isRateLimited, rateLimitRetryAfterSeconds } from '../server/security.js'

export default async function handler(req, res) {
  applySecurityHeaders(res)

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'bad_request' })
  }

  if (!isOriginAllowed(req.headers.origin)) {
    return res.status(403).json({ ok: false, error: 'origin_not_allowed' })
  }

  if (isRateLimited(req)) {
    res.setHeader('Retry-After', String(rateLimitRetryAfterSeconds()))
    return res.status(429).json({ ok: false, error: 'rate_limited' })
  }

  const token = process.env.VERCEL_TOKEN || ''
  if (!token) {
    return res.status(200).json({ ok: false, error: 'not_configured' })
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const html = String(body?.html || '')
  const slug = String(body?.slug || 'umkm-website')
  if (!html) return res.status(400).json({ ok: false, error: 'bad_request' })

  const result = await deployToVercel({ token, teamId: process.env.VERCEL_TEAM_ID || '', projectName: slug, html })
  if (result.ok) return res.status(200).json({ ok: true, data: { url: result.url } })
  return res.status(200).json({ ok: false, error: 'publish_failed', detail: result.error })
}
