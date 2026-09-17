import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isOriginAllowed, applySecurityHeaders, isApiDocsEnabled, MAX_REQUEST_BODY_BYTES } from '../../server/security.js'

describe('isOriginAllowed (issue #20 — CORS/origin allowlist)', () => {
  const originalEnv = process.env.ALLOWED_ORIGIN

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ALLOWED_ORIGIN
    else process.env.ALLOWED_ORIGIN = originalEnv
  })

  describe('when ALLOWED_ORIGIN is not configured', () => {
    beforeEach(() => { delete process.env.ALLOWED_ORIGIN })

    it('allows any origin (dev convenience)', () => {
      expect(isOriginAllowed('https://evil.example.com')).toBe(true)
      expect(isOriginAllowed(undefined)).toBe(true)
    })
  })

  describe('when ALLOWED_ORIGIN is configured', () => {
    beforeEach(() => { process.env.ALLOWED_ORIGIN = 'https://umkm-builder.vercel.app, https://umkm.example.com' })

    it('allows an origin on the allowlist', () => {
      expect(isOriginAllowed('https://umkm-builder.vercel.app')).toBe(true)
      expect(isOriginAllowed('https://umkm.example.com')).toBe(true)
    })

    it('rejects an origin not on the allowlist', () => {
      expect(isOriginAllowed('https://evil.example.com')).toBe(false)
    })

    it('allows requests with no Origin header (curl, server-to-server, same-origin GET)', () => {
      expect(isOriginAllowed(undefined)).toBe(true)
      expect(isOriginAllowed('')).toBe(true)
    })
  })
})

describe('applySecurityHeaders (issue #25 item 11)', () => {
  it('sets the basic hardening headers', () => {
    const headers = {}
    const res = { setHeader: (k, v) => { headers[k] = v } }
    applySecurityHeaders(res)
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Referrer-Policy']).toBe('no-referrer')
    expect(headers['Content-Security-Policy']).toBe("default-src 'none'")
    expect(headers['Strict-Transport-Security']).toContain('max-age=')
  })
})

describe('isApiDocsEnabled (issue #25 item 12)', () => {
  const originalEnv = process.env.ENABLE_API_DOCS

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ENABLE_API_DOCS
    else process.env.ENABLE_API_DOCS = originalEnv
  })

  it('is disabled by default', () => {
    delete process.env.ENABLE_API_DOCS
    expect(isApiDocsEnabled()).toBe(false)
  })

  it('is enabled only when explicitly set to the string "true"', () => {
    process.env.ENABLE_API_DOCS = 'true'
    expect(isApiDocsEnabled()).toBe(true)
    process.env.ENABLE_API_DOCS = '1'
    expect(isApiDocsEnabled()).toBe(false)
  })
})

describe('MAX_REQUEST_BODY_BYTES (issue #25 item 7)', () => {
  it('is a sane positive cap, not accidentally 0/undefined', () => {
    expect(MAX_REQUEST_BODY_BYTES).toBeGreaterThan(1024)
  })
})
