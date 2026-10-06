# Tasks: sg-csp-enforcement

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~140-180 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Implement CSP enforcement toggle in proxy.ts, add env var to .env.example, create runbook.md, verify csp-report endpoint | PR 1 | `npm run test:unit -- k0mp4ss_fe/apps/web/proxy.ts` `npm run test:integration -- csp` `npm run test:e2e -- csp-telemetry` | Start dev server with `CSP_ENFORCEMENT=true`/`false`, verify headers via curl/Playwright | Revert proxy.ts header logic, remove CSP_ENFORCEMENT from .env.example, delete runbook.md |

## Phase 1: proxy.ts Conditional Header Toggle (CSP_ENFORCEMENT env var)

- [ ] 1.1 Read `k0mp4ss_fe/apps/web/proxy.ts` to locate the CSP header emission at line ~112
- [ ] 1.2 Add `CSP_ENFORCEMENT` environment variable read at request time in the middleware handler (before header emission)
- [ ] 1.3 Implement conditional header name selection:
    - When `process.env.CSP_ENFORCEMENT === "true"` → `Content-Security-Policy`
    - When `process.env.CSP_ENFORCEMENT === "false"` or unset → `Content-Security-Policy-Report-Only`
- [ ] 1.4 Ensure `cspEnforce(nonce)` directive string generation remains unchanged (same function, same output)
- [ ] 1.5 Ensure `generarNonce()` nonce generation and `x-nonce`/`x-csp-nonce` header exposure remain unchanged
- [ ] 1.6 Verify the change compiles: `npm run typecheck` in `k0mp4ss_fe/apps/web`

## Phase 2: .env.example Add CSP_ENFORCEMENT=false with Documentation

- [ ] 2.1 Read `k0mp4ss_fe/apps/web/.env.example` to find appropriate placement (near security/hardening variables)
- [ ] 2.2 Add `CSP_ENFORCEMENT=false` with explanatory comment documenting:
    - Controls CSP enforcement vs report-only mode
    - Default is `false` (Report-Only) for safety
    - Set to `true` only after 7-day clean telemetry window
    - Immediate rollback by setting back to `false`
- [ ] 2.3 Verify `.env.example` syntax is valid (no parse errors)

## Phase 3: runbook.md (7-Day Telemetry Procedure, Violation Review, Rollback)

- [ ] 3.1 Create `openspec/changes/sg-csp-enforcement/runbook.md` with the following sections:
    - **Overview**: Purpose of the runbook, link to change proposal/design
    - **Prerequisites**: Access to production/staging env vars, log aggregation (Grafana Loki/Datadog/CloudWatch), `/api/csp-report` endpoint verified
    - **Phase 1: Deploy Report-Only (Default)**: Steps to deploy with `CSP_ENFORCEMENT=false`, verify behavior unchanged
    - **Phase 2: 7-Day Telemetry Window**: Daily checklist for monitoring `/api/csp-report` logs, structured query for violations, zero-violations criterion, clock reset on any violation
    - **Phase 3: Enforcement Flip**: Criteria check (7 consecutive zero-violation days), set `CSP_ENFORCEMENT=true` in production env, verify next request emits enforcement header
    - **Phase 4: Post-Flip Monitoring**: Continued monitoring, alerting on violations in enforcement mode
    - **Rollback Procedure**: Trigger conditions, immediate action (set `CSP_ENFORCEMENT=false`), verification steps, no code change/redeploy needed
    - **Violation Review Process**: How to triage violations from logs, common false positives (Next.js HMR, inline scripts), when to investigate vs when to extend telemetry
    - **Contact/Escalation**: Owner contacts, on-call rotation if applicable

## Phase 4: Verify `/api/csp-report/route.ts` Exists and Works

- [ ] 4.1 Read `k0mp4ss_fe/apps/web/app/api/csp-report/route.ts` to confirm existing implementation
- [ ] 4.2 Verify the endpoint:
    - Accepts POST with CSP violation report JSON
    - Extracts standard CSP fields: `document-uri`, `violated-directive`, `blocked-uri`, `effective-directive`
    - Sanitizes input (logs only standard CSP fields, not full body)
    - Logs via `logger.warn({ csp: safe }, "[csp-report] violation")` structured JSON
    - Returns 204 No Content
    - Has GET health check returning `{ ok: true, note: ... }`
- [ ] 4.3 Run integration test to verify endpoint receives and logs violations: `npm run test:integration -- csp-report`
- [ ] 4.4 Confirm no code changes needed (verification only)

## Phase 5: Testing (Unit, Integration, E2E Simulation)

- [ ] 5.1 **Unit: `generarNonce()` uniqueness** — Write Vitest test in `test/proxy.nonce.test.ts`:
    - Call `generarNonce()` twice, assert values are different
    - Mock `crypto.randomUUID` and `crypto.getRandomValues` for deterministic testing
    - Verify base64url encoding (no `+`, `/`, `=`, `-`)
- [ ] 5.2 **Unit: `cspEnforce(nonce)` directive string** — Write Vitest test in `test/proxy.csp.test.ts`:
    - Snapshot test with fixed nonce
    - Verify all 13 directives present
    - Verify nonce interpolated correctly in `script-src`
    - Verify `'strict-dynamic'`, `'unsafe-inline'`, `'unsafe-eval'` present
- [ ] 5.3 **Unit: Header selection logic** — Write Vitest test in `test/proxy.header-selection.test.ts`:
    - Mock `process.env.CSP_ENFORCEMENT = "true"`, invoke handler, assert `Content-Security-Policy` header present, `Content-Security-Policy-Report-Only` absent
    - Mock `process.env.CSP_ENFORCEMENT = "false"`, invoke handler, assert `Content-Security-Policy-Report-Only` header present, `Content-Security-Policy` absent
    - Mock unset `CSP_ENFORCEMENT`, invoke handler, assert Report-Only header (default behavior)
- [ ] 5.4 **Integration: Report-Only mode** — Write Playwright test in `e2e/csp-report-only.spec.ts`:
    - Set `CSP_ENFORCEMENT=false` in test env
    - Navigate to `/`, assert response header `content-security-policy-report-only` present
    - Assert `content-security-policy` header absent
    - Assert `x-nonce` and `x-csp-nonce` headers present
- [ ] 5.5 **Integration: Enforcement mode** — Write Playwright test in `e2e/csp-enforcement.spec.ts`:
    - Set `CSP_ENFORCEMENT=true` in test env
    - Navigate to `/`, assert response header `content-security-policy` present
    - Assert `content-security-policy-report-only` header absent
    - Assert `x-nonce` and `x-csp-nonce` headers present
- [ ] 5.6 **Integration: Nonce uniqueness per request in both modes** — Write Playwright test:
    - Make two consecutive requests in Report-Only mode, assert different nonce values in both `x-nonce` and `x-csp-nonce`
    - Make two consecutive requests in Enforcement mode, assert different nonce values
- [ ] 5.7 **Integration: `/api/csp-report` receives and logs violation** — Write Playwright test in `e2e/csp-report-endpoint.spec.ts`:
    - Inject inline script without nonce in page
    - Verify POST to `/api/csp-report` returns 204
    - Verify structured log entry appears (check test logger output or mock logger)
- [ ] 5.8 **E2E: Rollback simulation** — Write Playwright test in `e2e/csp-rollback.spec.ts`:
    - Start with `CSP_ENFORCEMENT=true`, verify enforcement header
    - Change env to `CSP_ENFORCEMENT=false` (simulate via test fixture or page reload with modified env)
    - Verify next request has Report-Only header
    - Assert all CSP directives, nonce, strict-dynamic identical
- [ ] 5.9 **E2E: 7-day telemetry simulation (staging)** — Document manual procedure in runbook; automated simulation via test fixture that:
    - Runs with `CSP_ENFORCEMENT=false` for N requests
    - Injects known violations, verifies they are logged
    - Verifies zero-violation detection logic
- [ ] 5.10 Run full test suite: `npm run test` in `k0mp4ss_fe/apps/web` and verify all pass

## Phase 6: Final Verification and Cleanup

- [ ] 6.1 Run typecheck: `npm run typecheck` in `k0mp4ss_fe/apps/web`
- [ ] 6.2 Run lint: `npm run lint` in `k0mp4ss_fe/apps/web`
- [ ] 6.3 Run build: `npm run build` in `k0mp4ss_fe/apps/web` (verify no regressions)
- [ ] 6.4 Verify all test commands pass:
    - `npm run test:unit`
    - `npm run test:integration`
    - `npm run test:e2e`
- [ ] 6.5 Confirm runbook.md is readable and complete
- [ ] 6.6 Update `openspec/changes/sg-csp-enforcement/proposal.md` success criteria checkboxes if all met

---

### Threat Matrix Coverage (from design.md)

The design explicitly marks the Threat Matrix as N/A for this change (pure edge-middleware header toggle with env var configuration). No threat-matrix-specific RED tests required.

### Specification Scenario Coverage

| Spec | Scenario | Test Task |
|------|----------|-----------|
| csp-enforcement-toggle | Enforcement mode emits Content-Security-Policy | 5.5 |
| csp-enforcement-toggle | Report-Only mode emits Content-Security-Policy-Report-Only | 5.4 |
| csp-enforcement-toggle | Default behavior is Report-Only when env var absent | 5.3 (unset case) |
| csp-enforcement-toggle | .env.example contains CSP_ENFORCEMENT with documentation | 2.2 |
| csp-enforcement-toggle | Nonce present and unique per request in enforcement mode | 5.6 |
| csp-enforcement-toggle | Nonce present and unique per request in report-only mode | 5.6 |
| csp-enforcement-toggle | Violations logged during telemetry window | 5.7 |
| csp-enforcement-toggle | Zero violations for 7 consecutive days enables enforcement | 5.9 (simulated) |
| csp-enforcement-toggle | Rollback restores report-only immediately | 5.8 |
| csp-enforcement-toggle | Rollback does not require code change | 5.8 |
| SG-hardening-despliegue | CSP report-only presente con nonce por request (default) | 5.4 |
| SG-hardening-despliegue | CSP enforcement presente con nonce por request (tras telemetría limpia) | 5.5 |
| SG-hardening-despliegue | Orígenes auditados cubren visor y fonts (inalterado) | 5.2 (directive snapshot) |
| SG-hardening-despliegue | Telemetría 7 días cero violaciones antes de enforcement | 3.1 (runbook), 5.9 |
| SG-hardening-despliegue | Rollback inmediato a report-only | 5.8 |
| SG-hardening-despliegue | Enforcement no forzado sin telemetría limpia | 3.1 (runbook gate) |