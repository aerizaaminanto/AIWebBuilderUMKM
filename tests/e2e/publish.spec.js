import { test, expect } from '@playwright/test'
import { mockGenerateSuccess, WARUNG_KOPI_DRAFT } from './fixtures.js'

// US-11 / TSK-06D: One-click static publish to Vercel (Could-Have stretch
// goal). /api/publish is mocked here the same way /api/generate and
// /api/revise are (fixtures.js) — the real endpoint needs a VERCEL_TOKEN
// this test environment doesn't have, and the point of these tests is the
// frontend's handling of each response shape, not a live Vercel deploy.

async function mockPublish(page, body) {
  await page.route('**/api/publish', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  )
}

async function generateDraft(page) {
  await mockGenerateSuccess(page, WARUNG_KOPI_DRAFT)
  await page.goto('/')
  await page.getByPlaceholder('Minta perubahan pada website...').fill(
    'Warung Kopi Sejahtera, jual kopi tubruk dan roti bakar di Surabaya, target anak muda nugas, wa 08123456789'
  )
  await page.getByTitle('Kirim revisi').click()
  await expect(page.getByRole('button', { name: 'Publish' })).toBeEnabled()
}

test('Publish button stays disabled until a draft exists', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled()
})

test('a not_configured backend shows a graceful "belum dikonfigurasi" warning, not a fake success', async ({ page }) => {
  await generateDraft(page)
  await mockPublish(page, { ok: false, error: 'not_configured' })

  await page.getByRole('button', { name: 'Publish' }).click()

  const toast = page.getByRole('status').filter({ hasText: 'belum dikonfigurasi' })
  await expect(toast).toBeVisible()
  await expect(toast).not.toHaveClass(/bg-emerald-600/)
})

test('a successful publish shows the live URL and opens it in a new tab', async ({ page, context }) => {
  await generateDraft(page)
  await mockPublish(page, { ok: true, data: { url: 'https://warung-kopi-sejahtera.vercel.app' } })
  // context-wide (not page-scoped) so it also catches the request from the
  // new tab handlePublish opens via window.open — a real network hit to a
  // domain that doesn't exist would otherwise make this flaky.
  await context.route('https://warung-kopi-sejahtera.vercel.app/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>ok</body></html>' })
  )

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Publish' }).click(),
  ])
  await popup.waitForLoadState('domcontentloaded')
  expect(popup.url()).toBe('https://warung-kopi-sejahtera.vercel.app/')

  const toast = page.getByRole('status').filter({ hasText: 'https://warung-kopi-sejahtera.vercel.app' })
  await expect(toast).toBeVisible()
  await expect(toast).toHaveClass(/bg-emerald-600/)
})

test('a publish_failed backend response shows an error toast, not a silent no-op', async ({ page }) => {
  await generateDraft(page)
  await mockPublish(page, { ok: false, error: 'publish_failed', detail: 'Invalid token' })

  await page.getByRole('button', { name: 'Publish' }).click()

  const toast = page.getByRole('status').filter({ hasText: 'Gagal publish' })
  await expect(toast).toBeVisible()
  await expect(toast).toHaveClass(/bg-rose-600/)
})
