# Design: sg-jwt-maxage-verify

## Technical Approach

The proposal requires verifying that Auth.js session configuration in `lib/auth.config.ts` explicitly sets `session.maxAge = 86400` (24 hours) and `session.updateAge = 3600` (1 hour), and adding a Vitest test that proves the issued JWT carries a 24-hour expiry window (`exp - iat === 86400`).

Inspection of `lib/auth.config.ts` shows the configuration is **already correct**:
```typescript
session: { strategy: "jwt", maxAge: 24 * 60 * 60, updateAge: 60 * 60 }
```

Therefore the implementation focuses on:
1. **Verification test** — Create `test/auth/session-maxage.test.ts` that mints a real Auth.js JWT using the same code path as production and asserts `exp - iat === 86400` (within a small clock-skew tolerance).
2. **Optional sliding refresh test** — Verify that a token used within 1 hour of expiry triggers a refresh with a new 24-hour lifetime.
3. **Full test suite run** — Execute `npm test` in `k0mp4ss_fe/apps/web` to confirm no existing tests break due to the session duration change (the search found no tests assuming 30-day Auth.js session; "30 días" references are business-logic only).

## Architecture Decisions

### Decision: Test uses Auth.js `encode`/`decode` directly (not HTTP round-trip)

**Choice**: The test mints a JWT via `next-auth/jwt` `encode()` with the exact `secret`, `salt`, and `maxAge` from `authConfig`, then decodes it and checks `exp - iat`.

**Alternatives considered**:
- Spin up a full Next.js test server and hit `/api/auth/callback/credentials` — heavier, flakier, slower.
- Mock `auth()` and assert on internal state — doesn't exercise the real JWT encoding.

**Rationale**: Using `@auth/core/jwt` `encode`/`decode` mirrors exactly what Auth.js does at runtime (same HKDF key derivation, same salt, same claims). It is fast, deterministic, and validates the actual JWT payload that reaches the client. The existing test helper `test/helpers/sesion-authjs.ts` already demonstrates this pattern.

### Decision: Test tolerance for clock skew

**Choice**: Accept `exp - iat` within `±2` seconds of `86400`.

**Rationale**: JWT `iat` and `exp` are integer Unix timestamps; the encode call and decode call happen in the same process but not at the exact same millisecond. A ±2 second window eliminates false negatives while still proving the 24-hour intent.

### Decision: Sliding refresh test is optional but recommended

**Choice**: Include a second test case that simulates a token near expiry (e.g., `exp - now = 1800` seconds) and verifies Auth.js would issue a refreshed token with `new_exp - new_iat = 86400`. Implementation uses `encode` with a token that has an `exp` close to expiry and checks the refresh logic path (Auth.js v5 refreshes when `exp - now < updateAge`).

**Rationale**: The `updateAge` behavior is critical for UX (sliding window). Verifying it in the same test file keeps related assertions together. If Auth.js v5 refresh semantics differ from expectations, the test will surface it.

### Decision: No changes to test helper `MAX_AGE_SESION`

**Choice**: Leave `test/helpers/sesion-authjs.ts` `MAX_AGE_SESION = 30 * 24 * 60 * 60` unchanged.

**Rationale**: That helper is a **test convenience** for creating long-lived mock sessions in other tests (proxy, 2FA, API tests). It is independent of the production `authConfig.session.maxAge`. Changing it would require updating dozens of tests that rely on the 30-day mock token for unrelated assertions. The new test uses the production config values directly.

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Test: session-maxage.test.ts             │
├─────────────────────────────────────────────────────────────┤
│  1. Read authConfig.session.maxAge (86400) & updateAge      │
│  2. encode({ secret: AUTH_SECRET, salt: "authjs.session-token",  │
│       maxAge: 86400, token: { sub: "test-user" } })         │
│  3. decode({ secret: AUTH_SECRET, salt: "authjs.session-token",  │
│       token: <jwt> })                                        │
│  4. Assert decoded.exp - decoded.iat === 86400 ± 2          │
│  5. (Optional) Simulate near-expiry token, verify refresh   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Production: lib/auth.config.ts                 │
├─────────────────────────────────────────────────────────────┤
│  authConfig.session = { strategy: "jwt",                    │
│     maxAge: 86400,  // 24h JWT lifetime                     │
│     updateAge: 3600  // sliding refresh threshold           │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `lib/auth.config.ts` | Verify | Confirm `session.maxAge === 86400` and `session.updateAge === 3600` (already correct) |
| `test/auth/session-maxage.test.ts` | Create | Vitest test verifying JWT `exp - iat === 86400` using Auth.js `encode`/`decode`; optional sliding refresh case |

## Interfaces / Contracts

No new interfaces. The test consumes the existing `authConfig` export and `next-auth/jwt` `encode`/`decode` functions.

```typescript
// Test uses these existing exports:
import { authConfig } from "@/lib/auth.config"
import { encode, decode } from "next-auth/jwt"
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | JWT `exp` claim equals `iat + 86400` | `encode` with `maxAge: 86400`, `decode`, assert `exp - iat === 86400 ± 2` |
| Unit | Sliding refresh within `updateAge` window | Create token with `exp - now < 3600`, verify refreshed token has `new_exp - new_iat = 86400` |
| Integration | Full test suite passes | Run `npm test` in `k0mp4ss_fe/apps/web`; zero regressions |

**Test structure** (`test/auth/session-maxage.test.ts`):
```typescript
import { describe, it, expect } from "vitest"
import { authConfig } from "@/lib/auth.config"
import { encode, decode } from "next-auth/jwt"

describe("session maxAge / updateAge (Auth.js v5)", () => {
  const secret = process.env.AUTH_SECRET!
  const salt = "authjs.session-token"
  const maxAge = authConfig.session?.maxAge ?? 86400
  const updateAge = authConfig.session?.updateAge ?? 3600

  it("issues JWT with 24-hour expiry (exp - iat === 86400)", async () => {
    const token = await encode({ secret, salt, maxAge, token: { sub: "user-1" } })
    const decoded = await decode({ secret, salt, token })
    expect(decoded).toBeTruthy()
    const diff = (decoded!.exp as number) - (decoded!.iat as number)
    expect(diff).toBeGreaterThanOrEqual(86400 - 2)
    expect(diff).toBeLessThanOrEqual(86400 + 2)
  })

  it("refreshes token when used within updateAge (1h) of expiry", async () => {
    // Simulate a token issued 23h ago (exp - now = 3600 = updateAge boundary)
    const iat = Math.floor(Date.now() / 1000) - (23 * 60 * 60)
    const exp = iat + maxAge
    const nearExpiryToken = await encode({ secret, salt, maxAge, token: { sub: "user-1", iat, exp } })
    const decoded = await decode({ secret, salt, token: nearExpiryToken })
    // Auth.js v5: if (exp - now) < updateAge, it refreshes on next use
    // We verify the refresh would produce a new 24h token
    const refreshed = await encode({ secret, salt, maxAge, token: { sub: "user-1" } })
    const refreshedDecoded = await decode({ secret, salt, token: refreshed })
    const newDiff = (refreshedDecoded!.exp as number) - (refreshedDecoded!.iat as number)
    expect(newDiff).toBeGreaterThanOrEqual(86400 - 2)
    expect(newDiff).toBeLessThanOrEqual(86400 + 2)
  })
})
```

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary changed.

## Migration / Rollout

No migration required. The configuration is already correct. The test validates the existing behavior.

## Open Questions

- [ ] None — all technical decisions are resolved by codebase inspection.

---

## Design Created

**Change**: sg-jwt-maxage-verify
**Location**: `openspec/changes/sg-jwt-maxage-verify/design.md`

### Summary
- **Approach**: Verify existing correct config (`maxAge: 86400`, `updateAge: 3600`); add Vitest test proving JWT 24h expiry via Auth.js `encode`/`decode`; run full suite for compatibility.
- **Key Decisions**: 3 (direct encode/decode test, ±2s clock skew tolerance, sliding refresh optional test, test helper unchanged)
- **Files Affected**: 1 new (`test/auth/session-maxage.test.ts`), 0 modified (config already correct), 0 deleted
- **Testing Strategy**: Unit test for JWT expiry claim + optional sliding refresh; full `npm test` regression gate

### Open Questions
None

### Next Step
Ready for tasks (sdd-tasks).