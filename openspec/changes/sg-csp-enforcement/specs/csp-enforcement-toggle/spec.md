# csp-enforcement-toggle Specification

## Purpose
Runtime switch between Content-Security-Policy Report-Only mode and active Enforcement mode via the `CSP_ENFORCEMENT` environment variable. This capability enables a safe 7-day telemetry window in Report-Only before flipping to enforcement in production.

## Requirements

### Requirement: CSP header selection via CSP_ENFORCEMENT env var
The system SHALL read `process.env.CSP_ENFORCEMENT` at runtime in `proxy.ts` and emit exactly one CSP header per response:
- When `CSP_ENFORCEMENT === "true"` → emit `Content-Security-Policy` (enforcement header)
- When `CSP_ENFORCEMENT === "false"` or unset → emit `Content-Security-Policy-Report-Only` (current behavior)

The system SHALL NOT emit both headers simultaneously. The header name selection SHALL be the only behavioral difference between modes; all CSP directives, nonce generation, and `strict-dynamic` mitigation SHALL remain identical.

#### Scenario: Enforcement mode emits Content-Security-Policy header
- GIVEN `CSP_ENFORCEMENT=true` is set in the environment
- WHEN a request is processed through `proxy.ts`
- THEN the response contains header `content-security-policy` with the full CSP directive string
- AND the response does NOT contain header `content-security-policy-report-only`

#### Scenario: Report-Only mode emits Content-Security-Policy-Report-Only header
- GIVEN `CSP_ENFORCEMENT=false` or `CSP_ENFORCEMENT` is unset in the environment
- WHEN a request is processed through `proxy.ts`
- THEN the response contains header `content-security-policy-report-only` with the full CSP directive string
- AND the response does NOT contain header `content-security-policy`

#### Scenario: Default behavior is Report-Only when env var absent
- GIVEN no `CSP_ENFORCEMENT` variable is defined in the environment
- WHEN a request is processed through `proxy.ts`
- THEN the response contains header `content-security-policy-report-only`
- AND this matches the pre-change default behavior

### Requirement: CSP_ENFORCEMENT documented in .env.example with default false
The system SHALL include `CSP_ENFORCEMENT=false` in `k0mp4ss_fe/apps/web/.env.example` with a comment explaining:
- It controls CSP enforcement vs report-only mode
- Default is `false` (Report-Only) for safety
- Set to `true` only after 7-day clean telemetry window
- Immediate rollback by setting back to `false`

#### Scenario: .env.example contains CSP_ENFORCEMENT with documentation
- GIVEN a developer reads `k0mp4ss_fe/apps/web/.env.example`
- WHEN they look for CSP configuration
- THEN they find `CSP_ENFORCEMENT=false` with explanatory comment about the 7-day telemetry window and rollback procedure

### Requirement: Nonce generation and strict-dynamic unchanged in both modes
The system SHALL generate a unique per-request nonce using Web Crypto (`crypto.randomUUID()` or `crypto.getRandomValues()`) and expose it via `x-nonce` / `x-csp-nonce` headers in both Report-Only and Enforcement modes. The `script-src` directive SHALL include `'nonce-{value}'` and `'strict-dynamic'` in both modes. The presence of `'unsafe-inline'` and `'unsafe-eval'` in `script-src` SHALL remain unchanged (required for Next.js/Turbopack compatibility in this window).

#### Scenario: Nonce present and unique per request in enforcement mode
- GIVEN `CSP_ENFORCEMENT=true`
- WHEN two consecutive requests are made to any route
- THEN each response contains a different nonce value in `script-src 'nonce-{value}'`
- AND both responses expose the nonce via `x-nonce` / `x-csp-nonce` headers

#### Scenario: Nonce present and unique per request in report-only mode
- GIVEN `CSP_ENFORCEMENT=false`
- WHEN two consecutive requests are made to any route
- THEN each response contains a different nonce value in `script-src 'nonce-{value}'`
- AND both responses expose the nonce via `x-nonce` / `x-csp-nonce` headers

### Requirement: 7-day telemetry window with zero violations before enforcement flip
The system SHALL support a 7-day telemetry period in production/staging with `CSP_ENFORCEMENT=false` where all CSP violations are logged via the existing `/api/csp-report` endpoint. The enforcement flip (`CSP_ENFORCEMENT=true`) SHALL only occur after 7 consecutive days with zero violations logged.

#### Scenario: Violations logged during telemetry window
- GIVEN `CSP_ENFORCEMENT=false` in production/staging
- WHEN a page load triggers a CSP violation (e.g., inline script without nonce)
- THEN `/api/csp-report` receives the violation report and logs it structured
- AND the violation includes `document-uri`, `violated-directive`, `blocked-uri`, and timestamp

#### Scenario: Zero violations for 7 consecutive days enables enforcement
- GIVEN `CSP_ENFORCEMENT=false` has been running for 7+ consecutive days
- WHEN the `/api/csp-report` logs show zero violations for all 7 days
- THEN the team MAY set `CSP_ENFORCEMENT=true` in production environment
- AND the next deployment or hot-reload activates enforcement mode

### Requirement: Immediate rollback via CSP_ENFORCEMENT=false
The system SHALL support immediate rollback from enforcement to report-only by setting `CSP_ENFORCEMENT=false` in the environment. No code change or redeploy SHALL be required; the toggle takes effect on the next request processed by `proxy.ts`.

#### Scenario: Rollback restores report-only immediately
- GIVEN `CSP_ENFORCEMENT=true` is active in production
- WHEN the environment variable is changed to `CSP_ENFORCEMENT=false` (via platform env var update or redeploy)
- THEN the very next response emits `content-security-policy-report-only` instead of `content-security-policy`
- AND all CSP directives, nonce generation, and strict-dynamic remain identical

#### Scenario: Rollback does not require code change
- GIVEN enforcement is active and an issue is detected
- WHEN the operator sets `CSP_ENFORCEMENT=false`
- THEN no git revert, no code change, and no build step is required
- AND the behavior change is immediate on next request