# Tasks: sg-jwt-maxage-verify

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~80 (1 new test file, 0 modified) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Verify config + create JWT expiry test + run full suite | Single PR | `npm test -- test/auth/session-maxage.test.ts` then `npm test` in `k0mp4ss_fe/apps/web` | Vitest unit tests (deterministic encode/decode) | Delete `test/auth/session-maxage.test.ts`; config unchanged |

## Phase 1: Configuration Verification

- [ ] 1.1 Read `lib/auth.config.ts` and verify `authConfig.session.maxAge === 86400` and `authConfig.session.updateAge === 3600` (design confirms already correct)
- [ ] 1.2 Confirm no changes needed to `lib/auth.config.ts` — config verification only

## Phase 2: JWT Expiry Test Creation (RED → GREEN)

- [ ] 2.1 Create test file `test/auth/session-maxage.test.ts` with imports: `vitest` (describe, it, expect), `@/lib/auth.config` (authConfig), `next-auth/jwt` (encode, decode)
- [ ] 2.2 Write RED test: `it("issues JWT with 24-hour expiry (exp - iat === 86400)", async () => { ... })` that calls `encode()` with `maxAge: authConfig.session.maxAge`, `decode()` the result, and asserts `exp - iat` within `86400 ± 2` — run to confirm failure (no test file exists yet)
- [ ] 2.3 Implement test logic (GREEN): the test itself is the implementation; ensure it passes by using `process.env.AUTH_SECRET` and salt `"authjs.session-token"` matching production config
- [ ] 2.4 Add TRIANGULATE case: clock-skew boundary at `86400 - 2` and `86400 + 2` both pass; confirm integer Unix timestamps

## Phase 3: Optional Sliding Refresh Test

- [ ] 3.1 Add second test case in same file: `it("refreshes token when used within updateAge (1h) of expiry", async () => { ... })`
- [ ] 3.2 Simulate near-expiry token: create token with `iat = now - 23h`, `exp = iat + 86400` (so `exp - now = 3600 = updateAge` boundary)
- [ ] 3.3 Verify refreshed token produced by `encode()` with fresh call has `new_exp - new_iat === 86400 ± 2`
- [ ] 3.4 Ensure both tests pass together in Vitest

## Phase 4: Full Regression Suite

- [ ] 4.1 Run `npm test` in `k0mp4ss_fe/apps/web` to verify zero regressions from session duration change
- [ ] 4.2 Confirm no existing tests fail due to 24-hour session assumption (design search found no tests assuming 30-day Auth.js session)
- [ ] 4.3 If any test fails, diagnose and update only that test (do not change production config)

## Phase 5: Verification & Handoff

- [ ] 5.1 Verify all acceptance criteria from proposal:
  - `authConfig.session.maxAge === 86400` ✓
  - `authConfig.session.updateAge === 3600` ✓
  - Vitest test `test/auth/session-maxage.test.ts` passes ✓
  - Full test suite (`npm test` in `k0mp4ss_fe/apps/web`) passes ✓
- [ ] 5.2 Confirm task completion for sdd-apply

(End of file)