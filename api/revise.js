/**
 * api/revise.js — Vercel Serverless Function counterpart to the
 * `/api/revise` route registered as Vite middleware in `server/routes.js`.
 * See api/generate.js for why this file exists.
 */
import { buildRevisionPrompt } from '../server/prompts.js'
import { generateWithRetry } from '../server/geminiClient.js'
import { normalizeHistory } from '../server/routes.js'
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

  const apiKey = process.env.GEMINI_API_KEY || ''
  if (!apiKey) {
    return res.status(200).json({ ok: false, error: 'not_configured' })
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const current = body?.current
  const message = String(body?.message || '').trim()
  if (!current || !message) return res.status(400).json({ ok: false, error: 'bad_request' })

  const history = normalizeHistory(body?.history)
  const result = await generateWithRetry(apiKey, buildRevisionPrompt(current, message, history))
  if (result.ok) return res.status(200).json({ ok: true, data: result.data, source: 'llm' })
  return res.status(200).json({ ok: false, error: 'llm_failed' })
}
