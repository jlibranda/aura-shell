# Production Authentication (Epic 6 · Slice 6M0.1)

## What this slice is

Production credentials-based authentication for the protected `(app)` route group
(`/people`, `/people/hire`, `/people/[employeeId]`, and the rest of the app shell).
It replaces the *absence* of a production identity — the platform previously
failed closed in production with `DEVELOPMENT_SESSION_UNAVAILABLE` — with a real,
server-verified session. It does not touch Runtime Hire, the Trusted Submission
Gateway, durable reads, immutable audit, idempotency, or the transactional outbox;
those remain exactly as Slice 6M1 left them.

## Architecture decision: why hand-rolled credentials, not NextAuth/Auth.js

No authentication library was installed prior to this slice (`package.json` had
no `next-auth`, `@auth/core`, `bcrypt`, `argon2`, `jose`, or `iron-session`), and
no external identity provider or email-sending service exists in this codebase.
Credentials (email/password) is the only sign-in method implementable end-to-end
without provisioning a new external account — magic-link needs an email service,
Google/OIDC needs an external OAuth app and client secret, neither of which this
session had any way to create.

Given that, a small, hand-rolled implementation (Node's built-in `crypto.scrypt`
for password hashing, a database-backed session with only a token hash stored)
was chosen over adding NextAuth as a dependency, matching this codebase's
existing philosophy (see the shell's own README: dependencies were deliberately
kept minimal, with the command palette, overlays, and theming hand-rolled rather
than pulling in heavier libraries). `bcrypt`/`argon2` were avoided specifically
because their native bindings risk breaking Vercel's serverless bundling;
`crypto.scrypt` is an OWASP-endorsed KDF with zero extra dependencies.

## Identity model

Three new Prisma models (migration `20260724010000_production_authentication`):

- **`User`** — the login identity (email, password hash + salt, status).
  Deliberately separate from `Employee`, which the schema already documents as
  HR record data, not authentication data.
- **`TenantMembership`** — which tenant a `User` may access and with which
  roles (`roles: String[]`, the same flat shape `TrustedRequestContext.roles`
  already carries — no separate `RoleAssignment` table, since roles have no
  independent lifecycle here).
- **`Session`** — a server-verified session. Only a *hash* of the session
  token is stored (`tokenHash`), never the token itself, so a database read
  alone can never produce a usable session. `tenantId` is the tenant this
  session was authenticated into, resolved server-side at login time — never
  taken from the browser.

## Request flow

```
Browser request
  → middleware.ts (Edge): correlation ID + a coarse, production-only check —
    does a session cookie exist at all? No cookie → redirect to /login.
    This is cheap and not authoritative; it never queries the database.
  → resolveRequestContext() (src/platform/auth/resolve-request-context.ts):
    the single entry point every protected loader, server action, and the
    Trusted Submission Gateway's authenticate() callback all call.
      - Outside production: returns the existing development adapter
        (getDevelopmentRequestContext()), unchanged, fails closed outside dev.
      - In production: resolveProductionRequestContext() looks up the
        session by its token hash, checks expiry, re-checks the user is
        still active, resolves the tenant membership for that session's
        tenant, and derives roles/permissions from that row. Any failure
        returns undefined, and resolveRequestContext() redirects to /login.
  → Loaders/actions proceed with a verified TrustedRequestContext exactly as
    before; requirePeoplePermission()/AuthorizationError still gate specific
    reads, and pages catch AuthorizationError to render a controlled 403
    (src/components/shared/access-denied.tsx) instead of a raw exception.
```

## Required environment variables

No new variables were introduced. The three canonical ones from Slice 6M1 are reused:

| Variable | Used for |
| --- | --- |
| `DATABASE_URL` | Postgres connection (Users/TenantMemberships/Sessions live in the same database as everything else). |
| `NEXTAUTH_SECRET` | HMAC key for hashing session tokens before they're stored (`src/platform/auth/session-token.ts`). Must be at least 32 characters (enforced by `src/platform/env.ts`). |
| `APP_URL` | Already validated by 6M1; not directly consumed by this slice, but kept canonical rather than introducing a second "site URL" variable. |

Cookie behavior in production: `httpOnly`, `Secure`, `SameSite=Lax`, 12-hour
expiry (`src/platform/auth/session-cookie.ts`).

## Vercel deployment checklist

1. **Environment variables** (Project Settings → Environment Variables, Production):
   `DATABASE_URL`, `NEXTAUTH_SECRET` (32+ random characters — generate with
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`),
   `APP_URL` (the deployment's public URL, e.g. `https://aura.example.com`).
2. **Database**: a reachable Postgres instance Vercel's serverless functions can
   connect to (e.g. Vercel Postgres, Neon, Supabase, or Railway). Run migrations
   against it before or during deploy: `npx prisma migrate deploy`.
3. **Bootstrap the first administrator** — run once, from a machine with
   `DATABASE_URL` pointed at the production database (a local shell, a CI job,
   or `vercel env pull` + local run — never commit the password anywhere):
   ```
   BOOTSTRAP_ADMIN_EMAIL=admin@yourcompany.com \
   BOOTSTRAP_ADMIN_PASSWORD='a-real-generated-password' \
   BOOTSTRAP_ADMIN_TENANT_ID=your-tenant-id \
   npm run admin:bootstrap
   ```
   The tenant row must already exist (`prisma.tenant`) before bootstrapping a
   membership into it. This script never runs automatically — it is not wired
   into `build` or any deploy hook, matching "do not run the fake development
   seed automatically in production" for the mirror-image case.
4. **Redeploy** after setting environment variables — Vercel does not
   hot-reload env vars into already-running functions.
5. **Runtime compatibility**: `middleware.ts` runs on the Edge runtime (Web
   Crypto only, no `node:crypto` — verified during this slice, see the
   correlation-ID split in `src/platform/observability/correlation-header.ts`
   for why). Everything else — Route Handlers, Server Actions, Server
   Components — runs on Vercel's Node.js serverless runtime, where
   `node:crypto`'s `scrypt`/`timingSafeEqual`/`createHmac` are fully available.

## What was NOT verified

This slice was implemented and verified against a local Postgres instance
under `next build` + `next start` (true production mode) in this session's
sandbox. **It was not deployed to Vercel**, and no claim is made that it has
been verified live on Vercel — only that the runtime APIs it depends on
(`node:crypto` outside middleware, Web Crypto inside middleware, HTTP-only
cookies via `next/headers`) are all APIs Vercel's documented runtimes support.
