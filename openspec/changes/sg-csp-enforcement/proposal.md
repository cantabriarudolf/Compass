# Proposal: sg-csp-enforcement

## Intent

Transition the Content-Security-Policy from `Report-Only` mode to active enforcement after a 7-day telemetry window with zero violations. Currently `proxy.ts:112` emits `Content-Security-Policy-Report-Only` with a per-request nonce and `'unsafe-inline' 'unsafe-eval'` allowances for Next.js/Turbopack compatibility. Report-Only does not block attacks; enforcement is required for production hardening.

## Scope

### In Scope
- Modify `proxy.ts` to conditionally emit `Content-Security-Policy` (enforcement) instead of `Content-Security-Policy-Report-Only` based on `CSP_ENFORCEMENT` environment variable
- Add `CSP_ENFORCEMENT` env var to `.env.example` (default `false` for safety)
- Document the 7-day telemetry requirement and violation review process in a runbook
- Verify `/api/csp-report` endpoint exists and logs violations correctly (already implemented)
- Keep nonce generation and `strict-dynamic` mitigation intact

### Out of Scope
- Removing `'unsafe-inline' 'unsafe-eval'` from `script-src` (requires Next.js 16+ nonces on all inline scripts — separate effort)
- Adding external CSP collector integration for production (future work)
- Modifying `style-src` or other directives beyond the enforcement toggle

## Capabilities

### New Capabilities
- `csp-enforcement-toggle`: Runtime switch between Report-Only and Enforcement modes via `CSP_ENFORCEMENT` env var

### Modified Capabilities
- `SG-hardening-despliegue`: The existing CSP requirement (D-i) will transition from "Report-Only mandatory" to "Enforcement after 7-day clean telemetry"

## Approach

1. Add `CSP_ENFORCEMENT` boolean env var (default `false`) in `.env.example`
2. Update `proxy.ts` to read `process.env.CSP_ENFORCEMENT === "true"` and select header name:
   - `true` → `Content-Security-Policy` (enforcement)
   - `false` → `Content-Security-Policy-Report-Only` (current behavior)
3. Keep nonce generation, `strict-dynamic`, and all existing directives unchanged
4. Run 7 days in staging/production with `CSP_ENFORCEMENT=false` + monitoring `/api/csp-report` logs
5. After 0 violations for 7 consecutive days, flip `CSP_ENFORCEMENT=true` in production env
6. Rollback: immediately set `CSP_ENFORCEMENT=false`

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `k0mp4ss_fe/apps/web/proxy.ts` | Modified | Conditional header name based on `CSP_ENFORCEMENT` |
| `k0mp4ss_fe/apps/web/.env.example` | Modified | Add `CSP_ENFORCEMENT=false` with documentation |
| `openspec/changes/sg-csp-enforcement/runbook.md` | New | 7-day telemetry procedure, violation review, rollback steps |
| `k0mp4ss_fe/apps/web/app/api/csp-report/route.ts` | Verify | Confirm existing endpoint logs violations correctly |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Enforcement breaks Next.js HMR or inline scripts in production | Medium | Default `false`; 7-day telemetry validates safety before flip; immediate rollback via env |
| Missed CSP violations in telemetry window | Low | `/api/csp-report` logs all violations; structured logging for alerting |
| Accidental enforcement enable in dev/staging | Low | Default `false` in `.env.example`; explicit opt-in required |

## Rollback Plan

Set `CSP_ENFORCEMENT=false` in production environment variables and redeploy (or hot-reload if platform supports). No code revert needed. The toggle is immediate on next request.

## Dependencies

- 7-day telemetry window with `CSP_ENFORCEMENT=false` in staging/production
- `/api/csp-report` endpoint verified and monitored
- Owner decision on production domain (affects HSTS preload, not CSP directly)

## Success Criteria

- [ ] `CSP_ENFORCEMENT` env var documented in `.env.example` with default `false`
- [ ] `proxy.ts` conditionally emits `Content-Security-Policy` (enforcement) when `CSP_ENFORCEMENT=true`
- [ ] `/api/csp-report` endpoint receives and logs violations during telemetry window
- [ ] 7 consecutive days with **zero** CSP violations logged in production/staging telemetry
- [ ] Enforcement enabled via `CSP_ENFORCEMENT=true` in production
- [ ] Rollback tested: setting `CSP_ENFORCEMENT=false` immediately restores Report-Only mode