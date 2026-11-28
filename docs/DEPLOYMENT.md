# Deploying BrokerNotes

Two services plus a database, all on free tiers:

| Piece                         | Host               | Notes                                                        |
| ----------------------------- | ------------------ | ------------------------------------------------------------ |
| **Web** (`apps/web`, Next.js) | **Vercel** (Hobby) | Sydney region (`syd1`); proxies `/api/*` to the API          |
| **API** (`apps/api`, NestJS)  | **Render** (Free)  | Singapore region; runs migrations on start; `/health` check  |
| **Database**                  | **Neon** (Free)    | Already in use for development; Singapore (`ap-southeast-1`) |

```
Browser ─► Vercel (Next.js) ─/api/* rewrite─► Render (NestJS) ─► Neon Postgres
```

Because the browser only ever talks to the Vercel domain, the session cookie is first-party. No CORS
or third-party cookie setup is needed.

## 0. Before you start

1. **Rotate the Neon password.** Neon console → _Roles_ → `neondb_owner` → _Reset password_. Copy the new
   **pooled** and **direct** connection strings.
2. **Generate one shared secret** for sessions (the API signs with it and the web middleware verifies with it):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

## 1. API on Render

1. Sign in to [render.com](https://render.com) with GitHub, then go to **New → Blueprint** and select this repo.
   Render reads [`render.yaml`](../render.yaml).
2. Enter the secret values when prompted:
   - `DATABASE_URL`: the Neon **pooled** string
   - `DIRECT_URL`: the Neon **direct** string
   - `AUTH_SECRET`: the secret from step 0
   - `WEB_ORIGIN`: your Vercel URL (you can fill this in after step 2, then redeploy)
   - `OPENROUTER_API_KEY`: optional; free models only
3. Deploy. When it's live, `https://<api>.onrender.com/health` returns `{"status":"ok"}` and
   `/docs` shows the API documentation.

## 2. Web on Vercel

1. Go to [vercel.com](https://vercel.com), choose **Add New → Project**, and import this repo.
2. Set the **Root Directory** to `apps/web`. The build settings come from
   [`apps/web/vercel.json`](../apps/web/vercel.json) (the monorepo install and the shared-package build).
3. Add the environment variables:
   - `API_URL`: `https://<api>.onrender.com`. The `/api` proxy is built from this value, so redeploy if it changes.
   - `AUTH_SECRET`: the **same** secret as on Render.
4. Deploy, then put the Vercel URL into Render's `WEB_ORIGIN`.

## 3. Demo data

Run once against the production database, from your machine with the production `DATABASE_URL`:

```bash
DATABASE_URL="<neon pooled url>" npm run db:seed
```

This creates the demo brokerage _Harbour Home Loans_ with three members: `demo@brokernotes.dev` (Admin),
`adviser@brokernotes.dev` and `casemanager@brokernotes.dev`, all with password `demo1234`. It also creates
clients, realistic notes and an audit trail. Set `SEED_PASSWORD` to choose a different password.

## 4. Keep the API warm (optional)

Render's free plan sleeps after 15 minutes idle, and the first request then takes about 50 seconds. Set the
repository variable **`API_HEALTH_URL`** (`https://<api>.onrender.com/health`) under GitHub → Settings →
Variables. The [`keep-warm`](../.github/workflows/keep-warm.yml) workflow will then ping it during
Australian business hours.

## Production settings worth knowing

| Setting                            | Where  | Why                                                                     |
| ---------------------------------- | ------ | ----------------------------------------------------------------------- |
| `NODE_ENV=production`              | Render | Secure (HTTPS-only) cookies, production logging                         |
| `TRUST_PROXY=2`                    | Render | Rate limits see the real client IP behind Render and the Vercel rewrite |
| `AUTH_RATE_LIMIT` (default 10/min) | Render | Login and register brute-force protection                               |
| `AI_BURST_LIMIT` (default 6/min)   | Render | AI requests; there's also a daily limit of 20 per broker                |
