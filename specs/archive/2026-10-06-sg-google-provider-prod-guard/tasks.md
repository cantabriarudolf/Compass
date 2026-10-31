# Tasks: sg-google-provider-prod-guard

## Phase 1: Validation Implementation in `lib/auth.ts`

- [ ] **1.1** Add fail-fast validation block after imports (after `import { validarPassword } from "@/lib/password-policy"`), before `export class CredencialesInvalidas`
  - [ ] Check `process.env.NODE_ENV === 'production'`
  - [ ] Throw descriptive `Error` if `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing/empty
  - [ ] Message: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production. Set them in your environment or disable the Google provider."
  - [ ] Add JSDoc comment explaining the validation purpose and dev fallback behavior
  - **File**: `k0mp4ss_fe/apps/web/lib/auth.ts`
  - **Lines**: ~15 lines added (validation block + JSDoc)

- [ ] **1.2** Verify the validation runs at module load (before `NextAuth()` call)
  - [ ] Confirm placement is after all imports, before any export/class declaration
  - [ ] Ensure no other code depends on the validation having run

## Phase 2: `.env.example` Documentation Update

- [ ] **2.1** Replace existing commented Google OAuth lines with documented block
  - [ ] Remove old lines:
    ```bash
    # Google SSO (OAuth 2.0) — opcional. Requiere credenciales de Google Cloud Console.
    # GOOGLE_CLIENT_ID=
    # GOOGLE_CLIENT_SECRET=
    ```
  - [ ] Add new block:
    ```bash
    # Google SSO (OAuth 2.0) — opcional en dev, REQUERIDO en producción.
    # Requiere credenciales de Google Cloud Console (APIs & Services > Credentials).
    # En producción, la app NO arrancará sin estas variables.
    GOOGLE_CLIENT_ID=
    GOOGLE_CLIENT_SECRET=
    ```
  - **File**: `k0mp4ss_fe/apps/web/.env.example`
  - **Lines**: ~15 lines modified (replaces 3 commented lines with 5 documented lines)

- [ ] **2.2** Verify `SMTP_PASSWORD` and `CLAVE_ELIMINACION_MAESTRO` documentation remains unchanged

## Phase 3: Vitest Unit Test in `test/lib/auth.prod-guard.test.ts`

- [ ] **3.1** Create test file with 5 test cases using dynamic import + `vi.resetModules()`
  - [ ] Import: `describe, it, expect, vi, beforeEach, afterEach` from `vitest`
  - [ ] Store original env vars in `beforeEach`: `NODE_ENV`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - [ ] Restore original env vars in `afterEach`
  - [ ] Call `vi.resetModules()` in `beforeEach` for fresh module evaluation per test
  - **File**: `k0mp4ss_fe/apps/web/test/lib/auth.prod-guard.test.ts` (NEW)
  - **Lines**: ~100 lines

- [ ] **3.2** Implement 5 test cases:
  - [ ] **TC1**: `throws in production when GOOGLE_CLIENT_ID is missing`
    - `NODE_ENV=production`, `GOOGLE_CLIENT_ID=''`, `GOOGLE_CLIENT_SECRET='secret'`
    - Expect import to reject with required error message
  - [ ] **TC2**: `throws in production when GOOGLE_CLIENT_SECRET is missing`
    - `NODE_ENV=production`, `GOOGLE_CLIENT_ID='id'`, `GOOGLE_CLIENT_SECRET=''`
    - Expect import to reject with required error message
  - [ ] **TC3**: `does not throw in production when both are present`
    - `NODE_ENV=production`, both vars set to valid values
    - Expect import to resolve successfully
  - [ ] **TC4**: `does not throw in development when both are missing`
    - `NODE_ENV=development`, both vars empty
    - Expect import to resolve successfully
  - [ ] **TC5**: `does not throw in test when both are missing`
    - `NODE_ENV=test`, both vars empty
    - Expect import to resolve successfully (Vitest default env)

## Phase 4: Verification

- [ ] **4.1** Run TypeScript type check
  - Command: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit`
  - Must pass with zero errors

- [ ] **4.2** Run Vitest unit tests (including new test)
  - Command: `cd k0mp4ss_fe/apps/web && npm test`
  - Must pass all tests (existing + 5 new)

- [ ] **4.3** Run ESLint
  - Command: `cd k0mp4ss_fe/apps/web && npm run lint`
  - Must pass with zero errors/warnings

- [ ] **4.4** Manual verification: production build with and without vars
  - [ ] `cd k0mp4ss_fe/apps/web && NODE_ENV=production GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= npm run build` → should fail with expected error
  - [ ] `cd k0mp4ss_fe/apps/web && NODE_ENV=production GOOGLE_CLIENT_ID=test GOOGLE_CLIENT_SECRET=test npm run build` → should succeed

---

## Review Workload Forecast

| Metric | Estimate |
|--------|----------|
| **Files touched** | 3 (1 new, 2 modified) |
| **Lines added** | ~165 total (50 auth.ts + 15 .env.example + 100 test) |
| **Lines modified** | ~3 (.env.example replacement) |
| **Total diff** | ~168 lines |
| **400-line budget risk** | **Low** — well under 400 lines |
| **Chained PRs needed** | **No** — single PR, single review |
| **Review complexity** | Low — straightforward validation logic, well-scoped test |

### Delivery Strategy
- **Strategy**: `ask-on-risk` (default)
- **Rationale**: Change is small, self-contained, and low-risk. Single PR with standard review is sufficient. No chained PRs, no judgment-day review needed.

---

## Summary Envelope

| Field | Value |
|-------|-------|
| **Change ID** | sg-google-provider-prod-guard |
| **Phases** | 4 (Implementation, Docs, Test, Verification) |
| **Total Tasks** | 9 leaf tasks |
| **Estimated Effort** | ~2-3 hours |
| **Risk Level** | Low |
| **PR Strategy** | Single PR |
| **Ready for Apply** | Yes |

---

*Generated by sdd-tasks — tasks.md is the single source of truth for implementation work.*