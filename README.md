# AI Web Builder UMKM

## Overview
<p style="text-align: justify;">
  UMKM (Micro, Small, and Medium Enterprises) are productive businesses operated by individuals, groups, households, or small-scale business entities. To simplify the digitization process for UMKM, we offer a flexible and user-friendly web creation solution through AI Web Builder UMKM. This platform features a chat panel and a live preview specifically designed for entrepreneurs. Through a prompt-based system, users can describe their business to create a company website instantly. Without requiring any coding skills, the web design can be downloaded directly in a ZIP format for practical and efficient site management. 
</p>

## Stack
- Vite 8 + `@vitejs/plugin-react`
- Node.js (Express.js)
- React 19 (JS, no TypeScript)
- Tailwind CSS v4 via `@tailwindcss/vite` — no `tailwind.config.js` needed, see `src/index.css:1` and `vite.config.js:1`

## Prerequisites
- Node.js >= 18 (tested on 24.18.0)
- npm 11

## Setup
Clone the repository
```bash
git clone https://github.com/aerizaaminanto/AIWebBuilderUMKM
```
Direct to the project directory
```bash
cd AIWebBuilderUMKM
```
Install the `npm package`
```bash
npm install
```
Run the web
```bash
npm run dev      # http://localhost:3000
```

## Environment Variables
Set these in `.env` (local) or your deploy target's env settings (Vercel dashboard → Project → Settings → Environment Variables). None are required to run the app — each missing/unset var just disables that one feature (`not_configured` response, `AI tidak merespons` / offline fallback, or a disabled UI control) rather than breaking the build.

| Variable | Required for | Notes |
|---|---|---|
| `GEMINI_API_KEY` | AI generation & chat revision (US-05/07/08) | Server-only, never sent to the client. Free tier is capped at 20 requests/day. |
| `VERCEL_TOKEN` | One-click Publish (US-11, stretch goal) | Vercel → Account Settings → Tokens → Create. Scope it to the team/project you want deploys to land in. |
| `VERCEL_TEAM_ID` | Publish, only if the token belongs to a team account | Vercel → Team Settings → General → Team ID. Omit for a personal account token. |
| `ALLOWED_ORIGIN` | CORS lockdown before going live | Comma-separated origins, e.g. `https://your-demo.vercel.app`. Unset = any Origin is accepted (dev default). |
| `ENABLE_API_DOCS` | Swagger UI at `/api/docs` | Off by default so the API spec isn't publicly browsable. Set to `true` locally if you need it. |

**Deploying this app to Vercel:** push to GitHub, then `vercel` import the repo (Framework Preset: Vite — it auto-detects `api/*.js` as Serverless Functions). Add `GEMINI_API_KEY` (and `VERCEL_TOKEN`/`VERCEL_TEAM_ID` if you want the Publish button live) under Project Settings → Environment Variables, then redeploy.

## Testing
| Command | Description |
|---------|-------------|
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | E2E tests (Playwright, desktop + mobile emulation); writes an HTML report to `playwright-report/` |
| `npm run test:e2e:report` | Open the HTML report from the last E2E run |

Test cases, latest results, and the issues each test covers are documented in [doc/TEST_REPORT.md](doc/TEST_REPORT.md).

## Project Member
- Aldiansyah Anugrah Ramadhan
- Achmad Eriza Aminanto
- Ninditya Salma Nurul Aini
