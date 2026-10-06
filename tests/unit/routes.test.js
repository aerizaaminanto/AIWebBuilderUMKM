import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { registerApiRoutes } from '../../server/routes.js'
import * as vercelClient from '../../server/vercelClient.js'

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
function getHandler(apiKey = 'dummy-api-key', vercelConfig = undefined) {
  let handler
  registerApiRoutes({ middlewares: { use: (fn) => { handler = fn } } }, apiKey, vercelConfig)
  return handler
}

function sendBody(req, obj) {
  req.emit('data', Buffer.from(JSON.stringify(obj)))
  req.emit('end')
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

describe('/api/publish (US-11, TSK-06D)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Each test uses a distinct x-forwarded-for so security.js's in-memory
  // rate-limit bucket (keyed by client IP, module-level state that outlives
  // any one test) doesn't accumulate across requests and 429 a later test.
  function createPublishReq(fromIp) {
    const req = createReq('/api/publish')
    req.headers['x-forwarded-for'] = fromIp
    return req
  }

  it('reports not_configured when no vercelConfig/token is passed', async () => {
    const handler = getHandler('dummy-api-key')
    const req = createPublishReq('203.0.113.1')
    const res = createRes()
    await handler(req, res, () => {})
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.end.mock.calls[0][0])).toEqual({ ok: false, error: 'not_configured' })
  })

  it('rejects a missing html field with 400 once a token is configured', async () => {
    const handler = getHandler('dummy-api-key', { token: 'vercel-token' })
    const req = createPublishReq('203.0.113.2')
    const res = createRes()
    const done = handler(req, res, () => {})
    sendBody(req, { slug: 'my-shop' })
    await done
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.end.mock.calls[0][0])).toEqual({ ok: false, error: 'bad_request' })
  })

  it('returns the deployed URL nested under `data`, matching generate/revise\'s envelope', async () => {
    vi.spyOn(vercelClient, 'deployToVercel').mockResolvedValue({ ok: true, url: 'https://my-shop.vercel.app' })
    const handler = getHandler('dummy-api-key', { token: 'vercel-token', teamId: 'team_1' })
    const req = createPublishReq('203.0.113.3')
    const res = createRes()
    const done = handler(req, res, () => {})
    sendBody(req, { html: '<html></html>', slug: 'my-shop' })
    await done
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.end.mock.calls[0][0])).toEqual({ ok: true, data: { url: 'https://my-shop.vercel.app' } })
    expect(vercelClient.deployToVercel).toHaveBeenCalledWith({ token: 'vercel-token', teamId: 'team_1', projectName: 'my-shop', html: '<html></html>' })
  })

  it('surfaces a Vercel-side failure as publish_failed, not a fake success', async () => {
    vi.spyOn(vercelClient, 'deployToVercel').mockResolvedValue({ ok: false, error: 'Invalid token' })
    const handler = getHandler('dummy-api-key', { token: 'vercel-token' })
    const req = createPublishReq('203.0.113.4')
    const res = createRes()
    const done = handler(req, res, () => {})
    sendBody(req, { html: '<html></html>', slug: 'my-shop' })
    await done
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.end.mock.calls[0][0])).toEqual({ ok: false, error: 'publish_failed', detail: 'Invalid token' })
  })
})
