# Design: sg-google-provider-prod-guard

## Technical Approach

Add a fail-fast validation block in `lib/auth.ts` that runs at module load time (before `NextAuth()` is invoked). The validation checks `process.env.NODE_ENV === 'production'` and throws a descriptive `Error` if either `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing or empty. This ensures production deployments fail loudly at build/startup instead of failing silently at OAuth callback time. Development environments (`NODE_ENV !== 'production'`) retain the current fallback-to-empty-string behavior to allow local development without Google credentials.

The `.env.example` file is updated to document both variables as required in production with clear comments explaining their purpose and source (Google Cloud Console).

A Vitest unit test validates the three scenarios: production without credentials throws, production with credentials passes, and development without credentials passes.

## Architecture Decisions

### Decision: Validation Placement — Module Load in `lib/auth.ts` Before `NextAuth()`

**Choice**: Place validation at the top level of `lib/auth.ts`, after imports but before the `NextAuth({ ... })` call.

**Alternatives considered**:
- Inside a custom provider callback — rejected: would only trigger on actual OAuth attempt, not at startup
- In `lib/auth.config.ts` — rejected: config is shared with edge runtime; `process.env` access differs
- In a separate `lib/google-guard.ts` module — rejected: adds indirection for a single validation

**Rationale**: Module-load validation in `lib/auth.ts` guarantees the check runs before any Auth.js initialization. The error surfaces in build logs and console immediately, matching the fail-fast intent. It runs in the same module that uses the credentials, so the blast radius is obvious.

### Decision: Environment Detection — `process.env.NODE_ENV === 'production'`

**Choice**: Use exact string equality check against `'production'`.

**Alternatives considered**:
- `process.env.NODE_ENV !== 'development'` — rejected: too broad, would catch `test`, `staging`, etc.
- Custom `APP_ENV` variable — rejected: adds a new variable; Next.js already sets `NODE_ENV` reliably

**Rationale**: Next.js sets `NODE_ENV=production` automatically for `next build` and `next start`. This is the standard signal used across the ecosystem. Vitest runs with `NODE_ENV=test` by default, so CI tests are unaffected unless explicitly overridden.

### Decision: Error Type — Descriptive `Error` Thrown at Module Load

**Choice**: Throw a plain `Error` with a clear message listing both required variables and the remediation.

**Alternatives considered**:
- Custom error class — rejected: overkill for a startup guard; plain `Error` is caught by Next.js startup and logged identically
- `console.error` + `process.exit(1)` — rejected: bypasses Next.js error handling; less visible in Vercel/container logs

**Rationale**: A thrown `Error` at module load is caught by Next.js during initialization. It appears in build output, `next start` logs, and container stdout — exactly where operators look. The message explicitly names both variables and tells the operator what to do.

### Decision: `.env.example` Documentation Style

**Choice**: Add a comment block explaining the variable purpose, source (Google Cloud Console), and the production requirement, followed by empty value lines.

**Alternatives considered**:
- Commented-out lines (current style) — rejected: easy to miss; doesn't convey requirement strength
- Inline comments on each line — rejected: less readable for multi-line context

**Rationale**: The comment block stands out and is consistent with the existing `SMTP_PASSWORD` / `CLAVE_ELIMINACION_MAESTRO` documentation pattern in the same file.

## Data Flow

```
Build/Startup (NODE_ENV=production)
       │
       ▼
import lib/auth.ts
       │
       ▼
[Module Load] ──→ Validate GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET
       │                    │
       │         ┌──────────┴──────────┐
       │         ▼                     ▼
       │    Missing/Empty          Both Present
       │         │                     │
       ▼         ▼                     ▼
Throw Error   OK                    NextAuth() init
(App fails)                          (App starts)
```

Development flow (`NODE_ENV !== 'production'`):
```
import lib/auth.ts
       │
       ▼
[Module Load] ──→ Skip validation (NODE_ENV !== 'production')
       │
       ▼
NextAuth() init with "" fallbacks ──→ App starts
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `k0mp4ss_fe/apps/web/lib/auth.ts` | Modify | Add validation block after imports (line ~15), before `NextAuth()` call. Check `process.env.NODE_ENV === 'production'` and throw `Error` if `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing/empty. |
| `k0mp4ss_fe/apps/web/.env.example` | Modify | Replace the two commented Google lines with a documented block: comment explaining purpose/source/requirement, then `GOOGLE_CLIENT_ID=` and `GOOGLE_CLIENT_SECRET=` on separate lines. |
| `k0mp4ss_fe/apps/web/test/lib/auth.prod-guard.test.ts` | Create | Vitest unit test mocking `process.env.NODE_ENV` and the two Google env vars. Three test cases: prod missing → throws, prod present → no throw, dev missing → no throw. |

### Exact `lib/auth.ts` Modification

Insert after imports (after line 15 `import { validarPassword } from "@/lib/password-policy"`) and before `export class CredencialesInvalidas`:

```typescript
/**
 * Fail-fast validation for Google OAuth provider in production.
 * Runs at module load before NextAuth() initializes.
 * In development (NODE_ENV !== 'production'), empty-string fallback is allowed
 * so local dev works without Google Cloud credentials.
 */
if (process.env.NODE_ENV === 'production') {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production. ' +
      'Set them in your environment or disable the Google provider.'
    )
  }
}
```

### Exact `.env.example` Modification

Replace lines at end of file:
```bash
# Google SSO (OAuth 2.0) — opcional. Requiere credenciales de Google Cloud Console.
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
```

With:
```bash
# Google SSO (OAuth 2.0) — opcional en dev, REQUERIDO en producción.
# Requiere credenciales de Google Cloud Console (APIs & Services > Credentials).
# En producción, la app NO arrancará sin estas variables.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## Interfaces / Contracts

No new public interfaces. The change is internal to module initialization.

The error contract for operators:
- **When**: Build (`next build`) or startup (`next start`) in production
- **What**: `Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production. Set them in your environment or disable the Google provider.`
- **Action**: Set both environment variables in the production environment (Vercel, Docker, etc.) or remove the Google provider from `lib/auth.ts` if not using Google SSO.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Validation logic: prod without creds throws, prod with creds passes, dev without creds passes | Vitest test in `test/lib/auth.prod-guard.test.ts`. Mock `process.env.NODE_ENV` and `process.env.GOOGLE_CLIENT_ID/SECRET` per case. Use dynamic `import()` to re-load module under different env. |
| Integration | N/A — no API routes or DB interactions changed | Covered by unit test |
| E2E | N/A — startup behavior not exercised in Playwright (requires separate process) | Manual verification: `NODE_ENV=production npm run build` with/without vars |

### Unit Test Structure (`test/lib/auth.prod-guard.test.ts`)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Google provider prod guard', () => {
  const originalEnv = process.env.NODE_ENV
  const originalClientId = process.env.GOOGLE_CLIENT_ID
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    process.env.GOOGLE_CLIENT_ID = originalClientId
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret
  })

  it('throws in production when GOOGLE_CLIENT_ID is missing', async () => {
    process.env.NODE_ENV = 'production'
    process.env.GOOGLE_CLIENT_ID = ''
    process.env.GOOGLE_CLIENT_SECRET = 'secret'
    await expect(import('@/lib/auth')).rejects.toThrow(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production'
    )
  })

  it('throws in production when GOOGLE_CLIENT_SECRET is missing', async () => {
    process.env.NODE_ENV = 'production'
    process.env.GOOGLE_CLIENT_ID = 'id'
    process.env.GOOGLE_CLIENT_SECRET = ''
    await expect(import('@/lib/auth')).rejects.toThrow(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production'
    )
  })

  it('does not throw in production when both are present', async () => {
    process.env.NODE_ENV = 'production'
    process.env.GOOGLE_CLIENT_ID = 'abc.apps.googleusercontent.com'
    process.env.GOOGLE_CLIENT_SECRET = 'secret123'
    await expect(import('@/lib/auth')).resolves.toBeDefined()
  })

  it('does not throw in development when both are missing', async () => {
    process.env.NODE_ENV = 'development'
    process.env.GOOGLE_CLIENT_ID = ''
    process.env.GOOGLE_CLIENT_SECRET = ''
    await expect(import('@/lib/auth')).resolves.toBeDefined()
  })

  it('does not throw in test when both are missing', async () => {
    process.env.NODE_ENV = 'test'
    process.env.GOOGLE_CLIENT_ID = ''
    process.env.GOOGLE_CLIENT_SECRET = ''
    await expect(import('@/lib/auth')).resolves.toBeDefined()
  })
})
```

Note: `vi.resetModules()` ensures fresh module evaluation per test case with the mocked env.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration required. This is a guard that activates only in production environments missing the variables.

**Rollout sequence**:
1. Deploy the change to staging/preview with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set → verify startup succeeds
2. Deploy to production with vars set → verify startup succeeds
3. If any production environment lacks the vars, the deploy will fail at build/startup (intentional — operator must add vars)

## Open Questions

- [ ] None — design is complete and ready for task breakdown.

---

## Design Created

**Change**: sg-google-provider-prod-guard
**Location**: `openspec/changes/sg-google-provider-prod-guard/design.md`

### Summary
- **Approach**: Module-load validation in `lib/auth.ts` before `NextAuth()`; throws descriptive `Error` in production when Google OAuth credentials are missing; dev retains fallback.
- **Key Decisions**: 4 decisions documented (validation placement, env detection, error type, .env.example style)
- **Files Affected**: 1 new (test), 2 modified (auth.ts, .env.example)
- **Testing Strategy**: Vitest unit test with 5 cases covering prod/dev/test environments and missing/present credentials

### Open Questions
None

### Next Step
Ready for tasks (sdd-tasks).