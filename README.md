# AI Automation Platform — Admin Dashboard & Backend

Secure single-admin SaaS platform for managing small-business clients: Stripe
billing, Twilio phone automation with Claude-powered call analysis, an
AI-assisted website builder, an ADP/Gusto payroll bridge, and a support queue —
all behind an audited admin dashboard.

```
backend/    Express API (auth, admin routes, webhooks, services, tests)
frontend/   React (Vite) admin dashboard
database/   PostgreSQL migrations
```

## Quick start (local)

Requirements: Node 20+, and either Docker or a local/Supabase Postgres.

```bash
# 1. Install everything
npm install            # root tooling (concurrently)
npm run install-all    # backend + frontend

# 2. Configure
cp backend/.env.example backend/.env
# fill in at minimum: DATABASE_URL, JWT_SECRET (openssl rand -hex 32)

# 3. Database (pick one)
docker compose up -d db && npm run migrate     # bundled Postgres
npm run migrate                                # or your own DATABASE_URL

# 4. Create your admin login + sample data
npm run create-admin -- you@example.com "a-long-password-here" "Your Name"
npm run seed           # optional: 3 demo clients with calls/payments/tickets

# 5. Run both apps
npm run dev            # backend :3000, frontend :5173 (proxied /api)
```

Or run the whole backend stack in Docker: `docker compose up` (migrations run
automatically on boot).

## Bringing in customers (the public funnel)

The app's root path (`/`) is a public marketing landing page (brand: **Switchboard**)
— hero, features, a 3-tier pricing section, and a "get started" form. It is the
top of the funnel:

1. A prospect submits the form → `POST /api/public/leads` (unauthenticated,
   strictly rate-limited, honeypot-protected) stores a **lead**.
2. New leads surface on the dashboard ("New leads to follow up") and on the
   **Leads** page.
3. You click **Convert** on a lead → it creates a client and drops you on that
   client's page, where you **Create checkout link** (see below) to get them
   paying. Or **Dismiss** to clear it.

The admin dashboard lives under `/dashboard`, `/clients`, `/leads`, etc. (auth
required); the landing page and `/login` are the only public routes.

## Getting paid (the revenue path)

This is the loop that turns the dashboard into income:

1. **One-time:** in the Stripe Dashboard create a Product with three recurring
   prices (starter / pro / enterprise). Put the Price IDs in `backend/.env` as
   `STRIPE_PRICE_STARTER` / `_PRO` / `_ENTERPRISE`, and register the webhook
   (`/api/webhooks/stripe`) per the Webhook setup section below.
2. **Onboard a client:** Clients page → **+ Add client** (business name + email).
3. **Send a checkout link:** open the client → Subscription panel → pick a tier
   → **Create checkout link** → Copy and send it to them (or **Open** to test).
   The first link lazily creates their Stripe customer.
4. **They pay** on Stripe's hosted page. Stripe fires
   `customer.subscription.created` + `invoice.payment_succeeded`; the webhook
   records the subscription, the payment, and syncs the client's tier — no
   manual entry.
5. **Self-service:** once they're a customer, **Billing portal** opens Stripe's
   hosted portal so they manage their card / cancel. Failed payments mark the
   subscription `past_due`, log the failure, and notify you (`ADMIN_NOTIFY_WEBHOOK_URL`).

No card data ever touches this server — Checkout and the billing portal are
Stripe-hosted. Until the Price IDs are set, onboarding still works; only
checkout-link creation returns a clear "no price configured" 400.

## Tests

```bash
npm test               # 40 tests: auth/CSRF, token rotation, Claude service,
                       # Stripe webhooks, payroll validation, billing/checkout,
                       # public lead capture
```

External APIs (Stripe, Twilio, Claude, ADP/Gusto) are mocked — tests run with
no network and no real database.

## Architecture decisions & fixes over the original spec

The original brief had a few traps; here is what was changed and why:

| Area | Issue in the spec | What this build does |
|---|---|---|
| Stripe webhooks | A global JSON body parser breaks Stripe signature verification | `express.raw()` is mounted for `/api/webhooks/stripe` *before* the JSON parser; signatures verify against the raw body |
| Login rate limit | 100 req/min on `/login` permits ~144k guesses/day | 10 attempts per 15 min per IP, generic 401s (no user enumeration), timing-equalized bcrypt compares |
| JWT storage | Spec said both "httpOnly cookie" and "Authorization header from JS" — contradictory | httpOnly cookies (`SameSite=Strict`) + double-submit CSRF token; `Bearer` still accepted for programmatic clients |
| Token blacklist | Blacklisting access tokens needs shared state and still leaves a window | 15-minute access tokens + rotating refresh tokens stored hashed; replaying a revoked token revokes the whole session family |
| Schema | `TIMESTAMP` (no tz), no NOT NULLs, no uniques, no indexes, free-text enums | `TIMESTAMPTZ`, CHECK constraints, unique `stripe_*`/`twilio_call_sid` (webhook retries are idempotent), FK `ON DELETE` rules, indexes on every hot path, `INET` for IPs |
| Payment history | Required in the UI but missing from the schema | `payments` table fed by `invoice.payment_succeeded/failed`, with failure reasons |
| Admin identity | `audit_logs.admin_user_id` referenced nothing; admin lived in env vars | `admin_users` table (bootstrap via `create-admin` script), `refresh_tokens` table |
| Billing fields | `billing_cycle_day` / `next_billing_date` drift from Stripe | Mirrors Stripe's `current_period_start/end` + `cancel_at_period_end`; Stripe stays the source of truth |
| Payroll validation | "Use Claude to validate payroll" — an LLM alone must not gate money movement | Deterministic rules (hours caps, minimum wage, totals reconciliation) are the gate; Claude is an advisory second pass that can add errors but never override the rules. PII is stripped before anything reaches the model |
| Payroll credentials | Nothing specified | AES-256-GCM field-level encryption (`PAYROLL_ENCRYPTION_KEY`), HMAC-signed outbound submissions, per-sync audit rows |
| Claude integration | Free-text JSON parsing | Structured outputs (`output_config.format` with JSON schemas) — responses are schema-guaranteed JSON. Transcripts are wrapped as untrusted data with prompt-injection instructions. Every call is logged to `ai_api_logs` with token usage and latency |
| Model strategy | As requested | `claude-sonnet-4-6` default everywhere; `claude-fable-5` for call analysis + payroll review, toggleable via `CLAUDE_ENABLE_COMPLEX_MODEL=false` with zero code changes |
| Twilio | No signature handling detail | `twilio.validateRequest` on every webhook (enforced in production); AI analysis runs *after* the webhook response so Twilio is never kept waiting |
| Logging | — | Pino with secret redaction (cookies, auth headers, password/token fields), request IDs on every error response, optional daily rotation via `LOG_DIR` (7 days kept) |

## Security model

- **Secrets**: env vars only; `.env` is git-ignored; logs redact credentials.
- **Transport**: HTTPS redirect in production (`trust proxy` aware); helmet
  headers on the API; CSP + frame/sniff protections on the frontend
  (`frontend/vercel.json` — set your backend domain in `connect-src`).
- **Auth**: bcrypt(12) password hashes, short-lived JWT access tokens,
  rotated refresh tokens with reuse detection, login rate limiting.
- **CSRF**: SameSite=Strict cookies + double-submit token header.
- **Input**: zod validation on every route (params/query/body), parameterized
  SQL everywhere, LIKE-wildcard escaping on search, allowlisted dynamic
  UPDATE columns.
- **AI calls**: control characters stripped, length caps, PII redaction,
  injection-resistant prompts, structured-output schemas.
- **Audit**: every admin action (including viewing the audit log) is written
  to `audit_logs` with admin id, IP, and user agent.
- **Isolation**: every nested resource query is scoped by `client_id` — a
  ticket or call id from another client 404s.
- **At rest**: Supabase encrypts disks by default; payroll credentials get an
  extra application-level AES-256-GCM layer.
- **Data API lockdown**: Row-Level Security is enabled deny-all on every table
  (migration `002`). The Express backend connects as the `postgres` role and
  bypasses RLS, so it keeps full access — but Supabase's auto-exposed REST API
  (anon key) can read/write nothing. Client data is only ever reachable through
  the audited backend.

## Webhook setup

- **Stripe** → endpoint `https://<backend>/api/webhooks/stripe`, events:
  `customer.subscription.created/updated/deleted`,
  `invoice.payment_succeeded`, `invoice.payment_failed`.
  Local testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
- **Twilio** → phone number Voice webhook `https://<backend>/api/webhooks/twilio/voice`
  (POST) and status callback `/api/webhooks/twilio/status`. `PUBLIC_BASE_URL`
  must exactly match the configured URL or signature validation fails.
  Map each client's number via `clients.twilio_phone_number`.

## Deployment

- **Frontend → Vercel**: project root `frontend/`, build `npm run build`,
  output `dist/`. Set `VITE_API_URL` to the backend origin and replace
  `YOUR-BACKEND-DOMAIN` in `vercel.json`'s CSP.
- **Backend → Railway / Fly / VPS**: `backend/Dockerfile` included. Set every
  production env var (the config module fails fast if one is missing).
- **Database → Supabase**: use the connection string with `DATABASE_SSL=true`;
  Supabase handles encrypted storage and automated backups (enable PITR for
  point-in-time recovery). The schema (migrations `001`–`003`) has already been
  applied to the live project, with RLS enabled deny-all on every table and the
  `set_updated_at` function's `search_path` pinned (both confirmed clean by
  Supabase's security advisor). Migrations are tracked in `schema_migrations`,
  so a later `npm run migrate` is a no-op against this database.
- **CI/CD**: `.github/workflows/ci.yml` runs the console.log check, backend
  tests, and frontend build on every push/PR; on `main` it runs migrations
  against `secrets.DATABASE_URL` and then fires your deploy hooks
  (commented placeholders included).

**Cookie caveat (important):** auth cookies default to `SameSite=Strict`,
which requires the frontend and backend to be same-site. Use subdomains of one
custom domain (`app.yourdomain.com` + `api.yourdomain.com`). If you must run
on `*.vercel.app` + `*.railway.app`, set `COOKIE_SAMESITE=none` (cookies then
require HTTPS) — but the custom-domain setup is the better security posture.

## Known integration stubs

- **ADP/Gusto**: the fetch/normalize layer is wired for the documented API
  shapes but has only been exercised against mock data
  (`PAYROLL_USE_MOCK=true`, the default outside production). ADP additionally
  requires mTLS certificates in production. Verify the field mappings in
  `backend/src/services/payroll.service.js` against current provider docs
  before going live.
- **Phone AI**: current flow is record → transcribe → Claude analysis
  (voicemail-style). Real-time conversational answering is the natural
  upgrade via Twilio ConversationRelay/Media Streams feeding Claude.
- **DNS/domain automation**: publishing sets the live URL and audit trail;
  registrar/DNS API integration (e.g. Cloudflare) plugs into the publish
  endpoint in `backend/src/api/admin.routes.js`.
