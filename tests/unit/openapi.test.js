import { describe, it, expect, afterEach } from 'vitest'
import { serveApiDocs } from '../../server/openapi.js'

function createRes() {
  const headers = {}
  return {
    statusCode: null,
    setHeader: (k, v) => { headers[k] = v },
    getHeader: (k) => headers[k],
    end: () => {},
  }
}

describe('serveApiDocs gate (issue #25 item 12)', () => {
  const originalEnv = process.env.ENABLE_API_DOCS

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ENABLE_API_DOCS
    else process.env.ENABLE_API_DOCS = originalEnv
  })

  it('does not handle /api/docs when ENABLE_API_DOCS is unset', () => {
    delete process.env.ENABLE_API_DOCS
    const res = createRes()
    const handled = serveApiDocs({ method: 'GET', url: '/api/docs' }, res)
    expect(handled).toBe(false)
    expect(res.statusCode).toBe(null)
  })

  it('does not handle /api/openapi.json when ENABLE_API_DOCS is unset', () => {
    delete process.env.ENABLE_API_DOCS
    const res = createRes()
    const handled = serveApiDocs({ method: 'GET', url: '/api/openapi.json' }, res)
    expect(handled).toBe(false)
  })

  it('handles /api/docs (redirect to trailing slash) once ENABLE_API_DOCS=true', () => {
    process.env.ENABLE_API_DOCS = 'true'
    const res = createRes()
    const handled = serveApiDocs({ method: 'GET', url: '/api/docs' }, res)
    expect(handled).toBe(true)
    expect(res.statusCode).toBe(302)
    expect(res.getHeader('Location')).toBe('/api/docs/')
  })
})
