# BrokerNotes

AI-assisted, compliance-grade file notes for Australian mortgage brokers.
A **separate frontend and backend** in one monorepo: a **Next.js** web app (Tiptap editor) and a **NestJS** REST API, with **Prisma + Postgres (Neon)**.

> 🚧 Built phase by phase through pull requests. See [`SCRATCHPAD.md`](SCRATCHPAD.md) for progress, decisions and how AI was used. The full write-up comes in Phase 7.

## Architecture

```
broker-notes/
├─ apps/
│  ├─ web/   Next.js 15: UI only (Tiptap editor, pages, mobile layout). No database access.
│  └─ api/   NestJS 11 REST API: auth, notes, clients, CSV, Prisma → Postgres. Swagger at /docs.
└─ packages/
   └─ shared/  Zod schemas, API types (DTOs) and pure business logic used by both apps.
```

```
Browser ──► Next.js (apps/web) ──/api/* proxy──► NestJS (apps/api) ──► Postgres (Neon)
              │  server components call the API directly, forwarding the session cookie
              └─ middleware checks the session JWT (for routing only; the API authorises every request)
```

- **Auth:** the API issues a signed JWT in an **httpOnly** cookie (`bn_session`). The browser reaches the API through the web app's same-origin `/api` proxy, so the cookie is first-party and no CORS setup is needed.
- **One source of truth for validation:** the API validates every request with the **same Zod schemas** the web forms use (`packages/shared`).
- **Isolation:** every query is scoped to the signed-in broker. Another broker's ids return **404**.

## AI assist (free models only)

From any note, **AI assist** runs one structured analysis with a **free OpenRouter model**:

- a compliance-style **summary**
- **action items**, insertable as a checklist
- **key loan figures**, applied to the note's details on a click
- a **Best Interests (ASIC RG 273) check** that flags missing lender comparisons or reasons

Safeguards:

- **Privacy first:** TFNs, Medicare, card and bank numbers, phone numbers and emails are **removed on the server** before anything is sent. The panel shows what was removed.
- **Free only:** any model id not ending in `:free` is ignored. A payment-required response is refused.
- **Cost and abuse controls:** one request per analysis, results **cached** until the note changes, **20 analyses per broker per day**, and a per-minute burst limit.
- **Drafts, not edits:** results are labelled _AI-generated_ and nothing changes in the note until the broker clicks _Insert_ or _Apply_. Analysing doesn't change "last edited".
- **Tests never call the AI:** CI and E2E use a deterministic mock provider (`AI_PROVIDER=mock`).

## Getting started

Requirements: Node 20.9+ and a Postgres database (for example a free [Neon](https://neon.tech) project).

```bash
npm install

# 1. Configure both apps (AUTH_SECRET must be the same value in both)
cp apps/api/.env.example apps/api/.env   # DATABASE_URL, DIRECT_URL, AUTH_SECRET (+ OPENROUTER_API_KEY for AI)
cp apps/web/.env.example apps/web/.env   # API_URL, AUTH_SECRET

# 2. Create the database tables
npm run db:migrate

# 3. Run shared (watch) + API (:4000) + web (:3000) together
npm run dev
```

Open http://localhost:3000 for the app and http://localhost:4000/docs for the API docs.

## Scripts (from the repo root)

| Command                                 | What it does                                                               |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `npm run dev`                           | shared + API + web in watch mode                                           |
| `npm run build`                         | Build shared, then the API, then the web app                               |
| `npm run check`                         | Lint, typecheck, unit tests and format check across all workspaces         |
| `npm test`                              | Unit tests: shared (Vitest), web (Vitest), API (Jest)                      |
| `npm run test:int -w @broker-notes/api` | API integration tests over HTTP against a real Postgres                    |
| `npm run test:e2e`                      | Playwright end-to-end tests (desktop + mobile); starts the API and web app |

## Testing

| Layer             | Tooling                     | What it covers                                                                                          |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------------------------- |
| Shared logic      | Vitest                      | Filters, dates (Sydney time zone and daylight saving), money and LVR, CSV safety, templates, lock rules |
| Web               | Vitest                      | Route guard, session JWT verification, autosave timing, formatting                                      |
| API (unit)        | Jest                        | Password hashing                                                                                        |
| API (integration) | Jest + supertest + Postgres | Auth, rate limiting, broker isolation, full note lifecycle, finalise lock, CSV import and export        |
| End to end        | Playwright                  | Real browser flows on desktop and mobile across both apps                                               |

CI (GitHub Actions) runs all of these on every pull request, plus CodeQL, dependency review and npm audit.
