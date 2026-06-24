# Deployment

This is a monorepo:

| Part | Folder | Host |
|---|---|---|
| Backend (Express API) | `backend/` | **Railway** (Docker, from GitHub) |
| Frontend (React/Vite) | `frontend/` | **Vercel** (static build) |
| Database (Postgres) | `database/` | **Supabase** (already provisioned + migrated) |

> The database schema (migrations `001`–`004`) is already applied to your
> Supabase project, with RLS enabled deny-all on every table. You do **not** need
> to run migrations to deploy.

---

## 1. Push to GitHub

Railway deploys the repo you connect it to, so the code has to be on GitHub.

```bash
cd ai-automation-platform
git init -b main          # already done if `git status` works
git add -A
git commit -m "Initial commit"
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.env` files are git-ignored — only `.env.example` is committed. Verify with
`git status` that no real secrets are staged before pushing.

---

## 2. Backend → Railway

In the Railway project connected to your GitHub repo:

1. **Service → Settings → Root Directory: `backend`**  ← critical for a monorepo.
   Railway then auto-detects `backend/Dockerfile` and `backend/railway.json`
   (healthcheck `/api/health`, restart-on-failure).
2. **Do NOT set `PORT`** — Railway injects it; the app reads `process.env.PORT`.
3. **Variables** — add these (Settings → Variables):

   **Required:**
   ```
   NODE_ENV=production
   DATABASE_URL=<Supabase: Settings → Database → Connection string (URI)>
   DATABASE_SSL=true
   JWT_SECRET=<run: openssl rand -hex 32>
   FRONTEND_URL=https://<your-vercel-domain>   # fill in after step 3
   PUBLIC_BASE_URL=https://<your-railway-domain>
   COOKIE_SAMESITE=none                          # see "Cookies" below
   ```

   **Optional integrations** (the app boots without these; each feature stays
   off until its key is added — you'll see a startup warning for each):
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_STARTER=price_...
   STRIPE_PRICE_PRO=price_...
   STRIPE_PRICE_ENTERPRISE=price_...
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   PAYROLL_ENCRYPTION_KEY=<openssl rand -hex 32>
   PAYROLL_SIGNING_SECRET=<openssl rand -hex 32>
   ADMIN_NOTIFY_WEBHOOK_URL=                      # optional Slack/Zapier hook
   ```
4. **Networking → Generate Domain** to get your `https://<...>.up.railway.app`
   URL. Put it in `PUBLIC_BASE_URL` (and as `VITE_API_URL` on Vercel, next).
5. Railway redeploys on every push to `main` automatically.

---

## 3. Frontend → Vercel

1. **New Project → import the same repo → Root Directory: `frontend`.**
   Framework preset: Vite. Build `npm run build`, output `dist` (auto-detected).
2. **Environment Variable:** `VITE_API_URL = https://<your-railway-domain>`
3. Edit `frontend/vercel.json` → replace `YOUR-BACKEND-DOMAIN` in the
   `Content-Security-Policy` `connect-src` with your Railway domain, e.g.
   `connect-src 'self' https://your-app.up.railway.app`. Commit + push.
4. Deploy → you get `https://<your-app>.vercel.app`.
5. Back on Railway, set `FRONTEND_URL` to this Vercel URL and redeploy (this
   makes CORS + auth cookies accept the frontend origin).

---

## 4. Cookies across two domains (important)

`*.vercel.app` and `*.up.railway.app` are **different sites**, so the default
`SameSite=Strict` auth cookies won't be sent from the frontend to the backend.
Two options:

- **Quick:** set `COOKIE_SAMESITE=none` on Railway (cookies require HTTPS, which
  both hosts provide). Login then works cross-site.
- **More secure (recommended later):** put both behind one custom domain —
  `app.yourdomain.com` (Vercel) + `api.yourdomain.com` (Railway) — and use
  `COOKIE_SAMESITE=lax`. Update `FRONTEND_URL`, `VITE_API_URL`, the CSP, and the
  Stripe/Twilio webhook URLs accordingly.

---

## 5. Create your admin login

Once `DATABASE_URL` is set on Railway, run a one-off command in the service
(Railway → your service → ⋯ → "Run a command"), or locally with the prod
`DATABASE_URL` exported:

```bash
node scripts/create-admin.js you@email.com "a-strong-password" "Your Name"
```

Then log in at `https://<your-vercel-domain>/login`.

---

## 6. Webhooks (after the backend is live)

- **Stripe** → add endpoint `https://<railway-domain>/api/webhooks/stripe`,
  events: `customer.subscription.created/updated/deleted`,
  `invoice.payment_succeeded`, `invoice.payment_failed`. Copy the signing secret
  into `STRIPE_WEBHOOK_SECRET`.
- **Twilio** → phone number Voice webhook
  `https://<railway-domain>/api/webhooks/twilio/voice` (POST) and status callback
  `/api/webhooks/twilio/status`. `PUBLIC_BASE_URL` must match exactly or signature
  validation fails.

---

## 7. Future database migrations

The current schema is already live. For new migrations later (`005_*.sql`, …),
apply them with **one** of:

- `DATABASE_URL=<prod> npm run migrate` from your machine, or
- the GitHub Actions workflow (`.github/workflows/ci.yml` runs migrations on push
  to `main` if you add a `DATABASE_URL` repo secret), or
- the Supabase SQL editor / MCP.

Railway does **not** run migrations on deploy (the backend image doesn't include
the `database/` folder), so the app never blocks a deploy on a migration.
