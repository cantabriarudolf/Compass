# Proposal: sg-jwt-maxage-verify

## Intent

Verify and fix the Auth.js session configuration (`lib/auth.config.ts`) to match the 24-hour `maxAge` + 1-hour sliding `updateAge` implemented in SERIE-PRODUCCION-FASE2 P2. The NIGHT-AUDIT finding identified that while `tokenVersion` invalidation logic was added, the Auth.js config was not verified to have `session.maxAge = 24 * 60 * 60` (86400 seconds) and `session.updateAge = 60 * 60` (3600 seconds). If missing, sessions still default to 30 days despite the tokenVersion invalidation logic.

## Scope

### In Scope
- Read `lib/auth.config.ts` and verify `authConfig.session.maxAge` and `authConfig.session.updateAge`
- If missing or incorrect, update to `maxAge: 86400` (24h) and `updateAge: 3600` (1h)
- Add a Vitest test verifying JWT `exp` claim matches 24 hours from `iat` (test file: `test/auth/session-maxage.test.ts`)

### Out of Scope
- `tokenVersion` invalidation logic (already implemented in SERIE-PRODUCCION-FASE2 P2)
- 2FA / session invalidation flows (already done)
- Any other Auth.js configuration changes

## Capabilities

### New Capabilities
- `session-maxage-config`: Explicit 24h JWT session maxAge with 1h sliding refresh in Auth.js configuration

### Modified Capabilities
- `AU-autenticacion-sesion`: The session configuration requirement (§1) currently states "maxAge 30 días"; this changes to 24h maxAge with 1h sliding updateAge

## Approach

1. Inspect `lib/auth.config.ts` for `authConfig.session` object
2. If `session.maxAge` is not `86400` or `session.updateAge` is not `3600`, update them
3. Add a Vitest unit test in `test/auth/session-maxage.test.ts` that:
   - Creates a test session via Auth.js internals or mocks
   - Decodes the JWT and verifies `exp - iat === 86400` (24h)
   - Optionally verifies sliding refresh behavior (token refreshed within 1h of expiry gets new exp)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `lib/auth.config.ts` | Modified | Update `session.maxAge` and `session.updateAge` values |
| `test/auth/session-maxage.test.ts` | New | Vitest test verifying JWT expiry claims |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Config already correct but test fails due to Auth.js internals | Low | Test uses Auth.js test helpers or decodes actual issued JWT |
| Sliding refresh (`updateAge`) not working as expected | Medium | Verify with Auth.js v5 docs; test covers refresh behavior |
| Existing tests break due to session duration change | Low | Run full test suite; update any tests assuming 30d session |

## Rollback Plan

Revert `lib/auth.config.ts` to previous `maxAge`/`updateAge` values (or remove if they were absent, falling back to Auth.js defaults). Delete the test file `test/auth/session-maxage.test.ts`.

## Dependencies

- Auth.js v5 (next-auth@beta) — session configuration API
- Vitest test environment already configured in project

## Success Criteria

- [ ] `authConfig.session.maxAge === 86400` (24 * 60 * 60)
- [ ] `authConfig.session.updateAge === 3600` (60 * 60)
- [ ] Vitest test `test/auth/session-maxage.test.ts` passes
- [ ] Full test suite (`npm test` in `k0mp4ss_fe/apps/web`) passes