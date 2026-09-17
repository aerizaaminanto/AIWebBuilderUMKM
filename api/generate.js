/**
 * api/generate.js — Vercel Serverless Function counterpart to the
 * `/api/generate` route registered as Vite middleware in `server/routes.js`.
 *
 * Vercel's "Vite" framework preset only runs `vite build` and serves the
 * static `dist/` output — it never runs `vite dev`/`vite preview`, so the
 * `configureServer`/`configurePreviewServer` hooks in `server/index.js`
 * never fire in production. This file exists so the same endpoint works
 * once deployed there, reusing the exact same prompt/LLM/schema modules
 * (they're plain ESM with no Vite dependency). `server/routes.js` is left
 * untouched — `npm run dev`/`npm run preview` keep working exactly as before.
 */
import { buildInitialPrompt } from '../server/prompts.js'
import { getFallback } from '../shared/schema.js'
import { generateWithRetry } from '../server/geminiClient.js'
import { isOriginAllowed, applySecurityHeaders } from '../server/security.js'

export default async function handler(req, res) {
  applySecurityHeaders(res)

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'bad_request' })
  }

  if (!isOriginAllowed(req.headers.origin)) {
    return res.status(403).json({ ok: false, error: 'origin_not_allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY || ''
  if (!apiKey) {
    return res.status(200).json({ ok: false, error: 'not_configured' })
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const input = String(body?.input || '').trim()
  if (!input) return res.status(400).json({ ok: false, error: 'bad_request' })

  const result = await generateWithRetry(apiKey, buildInitialPrompt(input))
  if (result.ok) return res.status(200).json({ ok: true, data: result.data, source: 'llm' })
  return res.status(200).json({ ok: false, error: 'llm_failed', fallback: getFallback(input) })
}
