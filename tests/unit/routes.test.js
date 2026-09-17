import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { registerApiRoutes } from '../../server/routes.js'

function createReq(url, method = 'POST') {
  const req = new EventEmitter()
  req.url = url
  req.method = method
  req.headers = {}
  req.destroy = vi.fn()
  return req
}

function createRes() {
  const headers = {}
  return {
    statusCode: null,
    setHeader: (k, v) => { headers[k] = v },
    getHeader: (k) => headers[k],
    end: vi.fn(),
  }
}

/** Grabs the middleware fn registerApiRoutes wires up, without spinning up a real Vite server. */
function getHandler(apiKey = 'dummy-api-key') {
  let handler
  registerApiRoutes({ middlewares: { use: (fn) => { handler = fn } } }, apiKey)
  return handler
}

describe('registerApiRoutes hardening (issue #25)', () => {
  const originalAllowed = process.env.ALLOWED_ORIGIN

  afterEach(() => {
    if (originalAllowed === undefined) delete process.env.ALLOWED_ORIGIN
    else process.env.ALLOWED_ORIGIN = originalAllowed
  })

  it('sets security headers on every /api/generate and /api/revise response', async () => {
    process.env.ALLOWED_ORIGIN = 'https://umkm.example.com'
    const handler = getHandler()
    const req = createReq('/api/generate')
    req.headers.origin = 'https://evil.example.com' // rejected by #20's check, but headers must still apply
    const res = createRes()
    await handler(req, res, () => {})
    expect(res.getHeader('X-Content-Type-Options')).toBe('nosniff')
    expect(res.getHeader('Content-Security-Policy')).toBe("default-src 'none'")
    expect(res.statusCode).toBe(403)
  })

  it('rejects a request body over the size cap with 413, before it reaches JSON.parse', async () => {
    delete process.env.ALLOWED_ORIGIN
    const handler = getHandler()
    const req = createReq('/api/generate')
    const res = createRes()
    const done = handler(req, res, () => {})
    req.emit('data', Buffer.from('a'.repeat(200 * 1024)))
    req.emit('end')
    await done
    expect(res.statusCode).toBe(413)
    expect(JSON.parse(res.end.mock.calls[0][0])).toEqual({ ok: false, error: 'payload_too_large' })
  })

  it('still processes a normal-sized body (gets past the size cap to the existing bad_request check)', async () => {
    delete process.env.ALLOWED_ORIGIN
    const handler = getHandler()
    const req = createReq('/api/generate')
    const res = createRes()
    const done = handler(req, res, () => {})
    req.emit('data', Buffer.from(JSON.stringify({ input: '' })))
    req.emit('end')
    await done
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.end.mock.calls[0][0])).toEqual({ ok: false, error: 'bad_request' })
  })
})
