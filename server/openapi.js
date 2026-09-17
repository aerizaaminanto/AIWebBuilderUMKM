/**
 * openapi.js — OpenAPI 3.0 spec for the backend API (TSK-01B), plus a small
 * static-file server for swagger-ui-dist so the spec is browsable at
 * /api/docs without adding a full web framework.
 */
import fs from 'node:fs'
import path from 'node:path'
import { getAbsoluteFSPath } from 'swagger-ui-dist'
import { isApiDocsEnabled, MAX_REQUEST_BODY_BYTES } from './security.js'

// Mirrors SKILL.md section 5 (JSON Schema Contract) / shared/schema.js.
const websiteStateSchema = {
  type: 'object',
  required: ['templateId', 'theme', 'meta', 'hero', 'about', 'services', 'contact'],
  properties: {
    templateId: { type: 'string', enum: ['template-services', 'template-fnb', 'template-retail'] },
    theme: {
      type: 'object',
      required: ['primaryColor', 'fontFamily'],
      properties: {
        primaryColor: { type: 'string', pattern: '^#([A-Fa-f0-9]{6})$', example: '#9a3412' },
        accentColor: { type: 'string', pattern: '^#([A-Fa-f0-9]{6})$', example: '#fb923c' },
        fontFamily: { type: 'string', enum: ['sans', 'serif', 'display'] },
      },
    },
    meta: {
      type: 'object',
      required: ['businessName', 'category', 'tagline'],
      properties: {
        businessName: { type: 'string' },
        category: { type: 'string' },
        tagline: { type: 'string' },
      },
    },
    hero: {
      type: 'object',
      required: ['title', 'subtitle', 'ctaText', 'ctaWhatsappMessage'],
      properties: {
        title: { type: 'string' },
        subtitle: { type: 'string' },
        ctaText: { type: 'string' },
        ctaWhatsappMessage: { type: 'string' },
      },
    },
    about: {
      type: 'object',
      required: ['story'],
      properties: {
        story: { type: 'string' },
        highlights: { type: 'array', items: { type: 'string' } },
      },
    },
    services: {
      type: 'array',
      minItems: 3,
      items: {
        type: 'object',
        required: ['name', 'description', 'priceEstimate'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          priceEstimate: { type: 'string' },
        },
      },
    },
    testimonials: {
      type: 'array',
      items: {
        type: 'object',
        required: ['customerName', 'review'],
        properties: {
          customerName: { type: 'string' },
          review: { type: 'string' },
        },
      },
    },
    contact: {
      type: 'object',
      required: ['whatsappNumber', 'address'],
      properties: {
        whatsappNumber: { type: 'string', example: '08123456789' },
        address: { type: 'string' },
        instagram: { type: 'string' },
      },
    },
  },
}

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'AI UMKM Website Builder — Backend API',
    version: '1.0.0',
    description:
      'Dev 1B (Backend & DevOps) API routes. Runs as Vite server middleware (server/index.js) inside `npm run dev` / `npm run preview` — there is no separate server process. Every endpoint replies 200 even on failure; check `ok` in the body.',
  },
  servers: [{ url: '/', description: 'Same origin as the Vite dev/preview server' }],
  tags: [{ name: 'website', description: 'AI generation & revision of the UMKMWebsiteState JSON' }],
  paths: {
    '/api/generate': {
      post: {
        tags: ['website'],
        summary: 'Generate a first website draft from a business description (US-05)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['input'],
                properties: {
                  input: { type: 'string', example: 'Warung Bakso Pak Slamet, jual bakso urat dan mie ayam pedas di Malang, wa 08123456789' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Always 200 — see `ok` to distinguish success/failure',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GenerateResult' },
                examples: {
                  success: { value: { ok: true, source: 'llm', data: { '...': 'UMKMWebsiteState' } } },
                  notConfigured: { value: { ok: false, error: 'not_configured' } },
                  llmFailed: { value: { ok: false, error: 'llm_failed', fallback: { '...': 'UMKMWebsiteState' } } },
                },
              },
            },
          },
          400: { description: 'Missing/empty `input`' },
          403: { description: 'Origin not in the ALLOWED_ORIGIN allowlist (#20)' },
          413: { description: `Request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes (#25)` },
        },
      },
    },
    '/api/revise': {
      post: {
        tags: ['website'],
        summary: 'Apply a chat-based revision to the current website state (US-07/US-08)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['current', 'message'],
                properties: {
                  current: { ...websiteStateSchema, description: 'The website JSON as it exists before this revision' },
                  message: { type: 'string', example: 'Ubah warna utama jadi cokelat tua klasik' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Always 200 — see `ok` to distinguish success/failure',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GenerateResult' },
              },
            },
          },
          400: { description: 'Missing `current` or `message`' },
          403: { description: 'Origin not in the ALLOWED_ORIGIN allowlist (#20)' },
          413: { description: `Request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes (#25)` },
        },
      },
    },
  },
  components: {
    schemas: {
      UMKMWebsiteState: websiteStateSchema,
      GenerateResult: {
        type: 'object',
        required: ['ok'],
        properties: {
          ok: { type: 'boolean' },
          source: { type: 'string', enum: ['llm'] },
          data: { ...websiteStateSchema, nullable: true },
          error: { type: 'string', enum: ['not_configured', 'llm_failed', 'bad_request', 'network', 'origin_not_allowed', 'payload_too_large'] },
          fallback: { ...websiteStateSchema, nullable: true },
        },
      },
    },
  },
}

const SWAGGER_UI_PATH = getAbsoluteFSPath()
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.map': 'application/json' }

/** Serves GET /api/openapi.json and the Swagger UI at GET /api/docs(/*). Returns true if it handled the request.
 * Off by default (issue #25 item 12) — the full API spec shouldn't be publicly
 * browsable the moment a deploy is live. Opt in locally with ENABLE_API_DOCS=true. */
export function serveApiDocs(req, res) {
  if (!isApiDocsEnabled()) return false
  if (req.method !== 'GET') return false

  if (req.url === '/api/openapi.json') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(openApiSpec))
    return true
  }

  if (!req.url.startsWith('/api/docs')) return false

  // Without the trailing slash, the browser resolves index.html's relative
  // asset links (./swagger-ui.css etc.) against /api/ instead of /api/docs/.
  if (req.url === '/api/docs') {
    res.statusCode = 302
    res.setHeader('Location', '/api/docs/')
    res.end()
    return true
  }

  let assetPath = req.url.replace(/^\/api\/docs\/?/, '') || 'index.html'
  assetPath = assetPath.split('?')[0]
  const filePath = path.join(SWAGGER_UI_PATH, assetPath)
  if (!filePath.startsWith(SWAGGER_UI_PATH)) {
    res.statusCode = 403
    res.end('Forbidden')
    return true
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false

  // swagger-ui-dist points at the Petstore demo by default, configured in
  // swagger-initializer.js (not inline in index.html) — rewrite it to our spec.
  if (assetPath === 'swagger-initializer.js') {
    const js = fs
      .readFileSync(filePath, 'utf-8')
      .replace('https://petstore.swagger.io/v2/swagger.json', '/api/openapi.json')
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/javascript')
    res.end(js)
    return true
  }

  res.statusCode = 200
  res.setHeader('Content-Type', CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream')
  res.end(fs.readFileSync(filePath))
  return true
}
