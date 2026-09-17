/**
 * server/index.js — TSK-01B (Dev 1B): backend entry point.
 *
 * Vite has no production server of its own, so this backend ships as Vite
 * server middleware: it runs inside the same Node process as `vite dev` /
 * `vite preview`, giving the project a real API layer (POST /api/generate,
 * /api/revise, plus GET /api/docs for Swagger UI) without a separate
 * backend process. Everything backend-specific lives under this directory
 * (server/) and shared/ — nothing here is imported by src/ (the frontend),
 * and src/ is never imported from here except for the shared JSON contract.
 *
 * Why a server route instead of calling Gemini from the browser: the API
 * key must stay server-side. `GEMINI_API_KEY` (no VITE_ prefix) is never
 * exposed to the client bundle; only this Node-side code reads it.
 */
import { registerApiRoutes } from './routes.js'
import { serveApiDocs } from './openapi.js'
import { isApiDocsEnabled } from './security.js'

function registerServer(server, apiKey) {
  server.middlewares.use((req, res, next) => {
    if (serveApiDocs(req, res)) return
    next()
  })
  registerApiRoutes(server, apiKey)
}

/** Vite plugin: wires the API + docs routes into both `vite dev` and `vite preview`. */
export default function backendApiPlugin(env) {
  const apiKey = env.GEMINI_API_KEY || ''
  if (!apiKey) {
    console.warn('[server] GEMINI_API_KEY not set — /api/generate and /api/revise will report not_configured, and the app falls back to offline/local simulation.')
  }
  if (!isApiDocsEnabled()) {
    console.warn('[server] /api/docs disabled by default (issue #25) — export ENABLE_API_DOCS=true in your shell if you need Swagger UI locally.')
  }
  return {
    name: 'umkm-backend-api',
    configureServer(server) { registerServer(server, apiKey) },
    configurePreviewServer(server) { registerServer(server, apiKey) },
  }
}
