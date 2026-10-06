import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { deployToVercel } from '../../server/vercelClient.js'

function vercelHttpResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('deployToVercel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a https:// URL built from the Vercel response hostname on success', async () => {
    fetch.mockResolvedValueOnce(vercelHttpResponse({ id: 'dpl_1', url: 'warung-kopi-abc123.vercel.app' }))

    const result = await deployToVercel({ token: 'fake-token', projectName: 'Warung Kopi!', html: '<html></html>' })

    expect(result).toEqual({ ok: true, url: 'https://warung-kopi-abc123.vercel.app' })
  })

  it('sends the Authorization header, sanitized project name, and inline index.html file', async () => {
    fetch.mockResolvedValueOnce(vercelHttpResponse({ id: 'dpl_1', url: 'x.vercel.app' }))

    await deployToVercel({ token: 'fake-token', projectName: 'Warung Kopi!', html: '<html>hi</html>' })

    const [url, init] = fetch.mock.calls[0]
    expect(String(url)).toContain('https://api.vercel.com/v13/deployments')
    expect(init.headers.Authorization).toBe('Bearer fake-token')
    const body = JSON.parse(init.body)
    expect(body.name).toBe('warung-kopi') // non a-z0-9._- chars collapsed to '-', leading/trailing '-' trimmed
    expect(body.files).toEqual([{ file: 'index.html', data: '<html>hi</html>' }])
    expect(body.target).toBe('production')
  })

  it('appends teamId as a query param when provided', async () => {
    fetch.mockResolvedValueOnce(vercelHttpResponse({ id: 'dpl_1', url: 'x.vercel.app' }))

    await deployToVercel({ token: 't', teamId: 'team_123', projectName: 'shop', html: '<html></html>' })

    const [url] = fetch.mock.calls[0]
    expect(String(url)).toContain('teamId=team_123')
  })

  it('surfaces the Vercel error message on a non-2xx response', async () => {
    fetch.mockResolvedValueOnce(vercelHttpResponse({ error: { message: 'Invalid token' } }, 403))

    const result = await deployToVercel({ token: 'bad', projectName: 'shop', html: '<html></html>' })

    expect(result).toEqual({ ok: false, error: 'Invalid token' })
  })

  it('treats a network-level rejection as a failure', async () => {
    fetch.mockRejectedValueOnce(new TypeError('fetch failed'))

    const result = await deployToVercel({ token: 't', projectName: 'shop', html: '<html></html>' })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('fetch failed')
  })

  it('falls back to a generic "umkm-website" project name when projectName sanitizes to empty', async () => {
    fetch.mockResolvedValueOnce(vercelHttpResponse({ id: 'dpl_1', url: 'x.vercel.app' }))

    await deployToVercel({ token: 't', projectName: '!!!', html: '<html></html>' })

    const [, init] = fetch.mock.calls[0]
    expect(JSON.parse(init.body).name).toBe('umkm-website')
  })
})
