# Design: sg-csp-enforcement

## Technical Approach

Implement a runtime toggle in `proxy.ts` that reads `process.env.CSP_ENFORCEMENT === "true"` to select between two CSP header names:
- **Enforcement mode** (`CSP_ENFORCEMENT=true`): emits `Content-Security-Policy`
- **Report-Only mode** (`CSP_ENFORCEMENT=false` or unset): emits `Content-Security-Policy-Report-Only` (current behavior)

All CSP directives, nonce generation via Web Crypto (`crypto.randomUUID`/`getRandomValues`), `strict-dynamic` mitigation, and the existing `/api/csp-report` telemetry endpoint remain **identical** in both modes. The toggle is the only behavioral difference.

This design follows the proposal's phased approach: 7-day telemetry window in Report-Only (`CSP_ENFORCEMENT=false`) with zero violations logged via `/api/csp-report`, then flip to enforcement via env var. Rollback is immediate by setting `CSP_ENFORCEMENT=false` — no code change, no redeploy required (takes effect on next request).

Maps to specs:
- `csp-enforcement-toggle` spec: Requirements for header selection, env var documentation, nonce/strict-dynamic preservation, 7-day telemetry, immediate rollback
- `SG-hardening-despliegue` delta: Modified D-i requirement with 7-day zero-violations criterion and explicit rollback scenarios

## Architecture Decisions

### Decision: Conditional header name in proxy.ts

**Choice**: Read `process.env.CSP_ENFORCEMENT` at request time in `proxy.ts` and conditionally set either `Content-Security-Policy` or `Content-Security-Policy-Report-Only` header. Keep the CSP directive string generation (`cspEnforce(nonce)`) unchanged.

**Alternatives considered**:
- Two separate CSP builder functions (one per mode) — rejected: duplicates directive logic, violates "identical directives" requirement
- Build-time feature flag via Next.js config — rejected: requires rebuild/deploy for toggle, defeats "immediate rollback" requirement
- Middleware-level toggle — rejected: `proxy.ts` is already the edge middleware; adding another layer adds complexity without benefit

**Rationale**: The edge middleware (`proxy.ts`) runs on every request and already generates the nonce and CSP string. Adding a single `if` for header name selection is minimal, zero-overhead, and satisfies the spec requirement that "the header name selection SHALL be the only behavioral difference between modes."

### Decision: Default CSP_ENFORCEMENT=false in .env.example

**Choice**: Add `CSP_ENFORCEMENT=false` with explanatory comment to `.env.example`. The default is Report-Only for safety.

**Alternatives considered**:
- No default in `.env.example` (require explicit opt-in) — rejected: developers won't know the variable exists; undocumented behavior
- Default `true` — rejected: defeats the safety purpose; breaks Next.js HMR/inline scripts in dev immediately

**Rationale**: The 7-day telemetry window requires starting in Report-Only. Default `false` ensures new environments (dev, staging, CI) start safe. The comment documents the 7-day criterion and rollback procedure, making the variable self-documenting.

### Decision: Preserve existing nonce generation and strict-dynamic unchanged

**Choice**: The `generarNonce()` function and `cspEnforce(nonce)` directive builder remain exactly as-is. Both modes use per-request nonce via Web Crypto, expose it via `x-nonce`/`x-csp-nonce` headers, and include `'nonce-{value}' 'strict-dynamic'` in `script-src`.

**Alternatives considered**:
- Different nonce strategies per mode — rejected: spec explicitly requires "nonce generation and strict-dynamic unchanged in both modes"
- Remove `'unsafe-inline' 'unsafe-eval'` in enforcement mode — rejected: out of scope per proposal; requires Next.js 16+ nonce coverage on all inline scripts (separate effort)

**Rationale**: The nonce + `strict-dynamic` mitigation is the primary XSS defense. Changing it between modes would invalidate the telemetry window (violations in Report-Only wouldn't predict enforcement behavior). Keeping it identical ensures the 7-day zero-violations criterion is meaningful.

### Decision: Structured logging in /api/csp-report for alerting

**Choice**: Keep the existing `/api/csp-report/route.ts` implementation which extracts standard CSP violation fields (`document-uri`, `violated-directive`, `blocked-uri`, `effective-directive`) and logs them via `logger.warn({ csp: safe }, "[csp-report] violation")`. This structured JSON log enables log-based alerting (e.g., Grafana Loki, Datadog, CloudWatch) for the 7-day monitoring window.

**Alternatives considered**:
- Add external collector integration (Sentry, custom endpoint) — rejected: out of scope per proposal; future work
- Log full request body — rejected: security risk (log injection, PII exposure); current sanitization is correct

**Rationale**: The existing implementation already satisfies the spec requirement for structured logging with standard CSP fields. No code change needed — only operational verification that logs appear and are queryable during the telemetry window.

### Decision: 7-day zero-violations criterion as operational gate

**Choice**: Enforcement flip (`CSP_ENFORCEMENT=true`) is gated by an operational process: 7 consecutive days with zero violations in `/api/csp-report` logs. This is not enforced in code; it's a runbook procedure.

**Alternatives considered**:
- Code-enforced gate (e.g., read log count from DB) — rejected: adds complexity, couples middleware to log storage, defeats "no code change for rollback"
- Shorter window (1-3 days) — rejected: Next.js HMR/inline scripts may produce intermittent violations; 7 days captures weekly patterns

**Rationale**: The spec explicitly requires "7 consecutive days with zero violations logged" as a human-gated criterion. This keeps the toggle purely env-driven (instant rollback) while ensuring sufficient confidence before enforcement.

## Data Flow

```text
Request (any route)
       │
       ▼
┌──────────────────┐
│  proxy.ts (edge) │
│  1. generarNonce() ──► unique nonce per request
│  2. cspEnforce(nonce) ──► full CSP directive string
│  3. Read CSP_ENFORCEMENT env var
│  4. IF "true" → header = "Content-Security-Policy"
│     ELSE      → header = "Content-Security-Policy-Report-Only"
│  5. Set header on response
│  6. Set x-nonce / x-csp-nonce on response
└────────┬─────────┘
         │
         ▼
Response with CSP header + nonce headers
         │
         ▼
┌──────────────────────────────────────────┐
│  Browser enforces (enforcement) or       │
│  reports only (report-only)              │
│                                          │
│  On violation → POST /api/csp-report     │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│  /api/csp-report/route.ts                │
│  1. Parse JSON body                      │
│  2. Extract csp-report fields            │
│  3. Sanitize to safe object              │
│  4. logger.warn({ csp: safe }, ...)      │
│  5. Return 204                           │
└──────────────────────────────────────────┘
                   │
                   ▼
         Structured log entry
         (queryable for 7-day window)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `k0mp4ss_fe/apps/web/proxy.ts` | Modify | Add `CSP_ENFORCEMENT` env var read; conditional header name selection (line ~112); keep `cspEnforce()` and `generarNonce()` unchanged |
| `k0mp4ss_fe/apps/web/.env.example` | Modify | Add `CSP_ENFORCEMENT=false` with comment documenting 7-day telemetry window and rollback procedure |
| `openspec/changes/sg-csp-enforcement/runbook.md` | Create | Document 7-day telemetry procedure, violation review steps, enforcement flip criteria, and rollback instructions |
| `k0mp4ss_fe/apps/web/app/api/csp-report/route.ts` | Verify | Confirm existing endpoint logs violations correctly (no code change expected) |

## Interfaces / Contracts

### Environment Variable

```bash
# .env.example (and production env)
CSP_ENFORCEMENT=false  # Set to "true" only after 7-day clean telemetry
```

- Type: string (`"true"` | `"false"` | unset)
- Default: `"false"` (Report-Only)
- Read at: request time in `proxy.ts` (edge runtime)
- Hot-reload: immediate on next request (no rebuild)

### CSP Header Contract

| Mode | Header Name | Directive String | Nonce | strict-dynamic |
|------|-------------|------------------|-------|----------------|
| Report-Only | `Content-Security-Policy-Report-Only` | Identical | Per-request | Yes |
| Enforcement | `Content-Security-Policy` | Identical | Per-request | Yes |

**Directive string** (from `cspEnforce(nonce)`):
```
default-src 'self';
script-src 'self' 'nonce-{nonce}' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https:;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com;
font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com;
img-src 'self' data: blob: https:;
connect-src 'self';
frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com;
media-src 'self' https: data: blob:;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
report-uri /api/csp-report
```

### CSP Violation Report (logged by /api/csp-report)

```typescript
{
  "document-uri": string,
  "violated-directive": string,
  "blocked-uri": string,
  "effective-directive": string
}
```
Logged via `logger.warn({ csp: safe }, "[csp-report] violation")` — structured JSON for log aggregation/alerting.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `generarNonce()` produces unique values per call | Vitest: call twice, assert inequality; mock `crypto.randomUUID` and `getRandomValues` |
| Unit | `cspEnforce(nonce)` returns expected directive string with nonce | Vitest: snapshot test with fixed nonce; verify all directives present |
| Unit | Header selection logic in `proxy.ts` | Vitest: mock `process.env.CSP_ENFORCEMENT`, invoke handler, assert response header name |
| Integration | Report-Only mode emits `Content-Security-Policy-Report-Only` | Playwright: set `CSP_ENFORCEMENT=false`, navigate to `/`, assert header present, `Content-Security-Policy` absent |
| Integration | Enforcement mode emits `Content-Security-Policy` | Playwright: set `CSP_ENFORCEMENT=true`, navigate to `/`, assert header present, `Content-Security-Policy-Report-Only` absent |
| Integration | Nonce exposed via `x-nonce`/`x-csp-nonce` in both modes | Playwright: two consecutive requests, assert different nonce values in both headers |
| Integration | `/api/csp-report` receives and logs violation | Playwright: inject inline script without nonce, POST to `/api/csp-report`, assert 204 and log entry |
| E2E | 7-day telemetry simulation (staging) | Manual: deploy with `CSP_ENFORCEMENT=false`, monitor logs for 7 days, verify zero violations |
| E2E | Rollback: `CSP_ENFORCEMENT=false` restores Report-Only immediately | Playwright: set `CSP_ENFORCEMENT=true`, verify enforcement header; change to `false`, verify next request has Report-Only header |

**Note**: Unit tests for `proxy.ts` require mocking Next.js edge runtime (`NextRequest`, `NextResponse`, `NextAuth`). Focus unit tests on pure functions (`generarNonce`, `cspEnforce`); integration/E2E tests cover the middleware behavior.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. This change is a pure edge-middleware header toggle with env var configuration.

## Migration / Rollout

### Phase 1: Code Deploy (Report-Only Default)
1. Merge this change (default `CSP_ENFORCEMENT=false` in code and `.env.example`)
2. Deploy to staging and production — behavior unchanged (Report-Only)

### Phase 2: 7-Day Telemetry Window
3. Verify `/api/csp-report` logs are flowing in staging/production
4. Monitor structured logs for 7 consecutive days
5. **Gate**: Zero violations for 7 days → proceed; any violation → reset clock, investigate

### Phase 3: Enforcement Flip
6. Set `CSP_ENFORCEMENT=true` in production environment variables (platform dashboard)
7. Next request (or hot-reload) activates enforcement — no code deploy needed

### Phase 4: Post-Flip Monitoring
8. Continue monitoring `/api/csp-report` (still receives violations in enforcement mode)
9. If issues arise → immediate rollback: set `CSP_ENFORCEMENT=false`

### Rollback Procedure (Runbook)
- **Trigger**: Any production issue (broken functionality, false-positive blocks, HMR failure)
- **Action**: Set `CSP_ENFORCEMENT=false` in production env vars
- **Effect**: Next request emits `Content-Security-Policy-Report-Only`
- **No code change, no git revert, no build required**

## Open Questions

- [ ] **Production domain decision**: The `PUBLIC_DOMAIN` env var is still unset (owner decision). CSP `frame-src`/`img-src` use wildcards (`https:`) which works but is less strict. When domain is known, should we tighten `https:` to explicit domain? (Out of scope for this change — tracked in `SG-hardening-despliegue`)
- [ ] **Log alerting setup**: The structured logs exist but no alerting rule is defined. Should we add a Grafana/Datadog alert for "CSP violation count > 0" during telemetry? (Operational task, not code)
- [ ] **Staging vs production telemetry**: Spec says "production/staging". Should the 7-day window run in staging first, then production? Or production directly? (Operational decision — recommend staging first)

## Design Created

**Change**: sg-csp-enforcement
**Location**: `openspec/changes/sg-csp-enforcement/design.md`

### Summary
- **Approach**: Runtime header-name toggle in `proxy.ts` via `CSP_ENFORCEMENT` env var; all CSP directives, nonce generation, and telemetry unchanged
- **Key Decisions**: 4 architecture decisions documented (conditional header, default false, nonce preservation, structured logging)
- **Files Affected**: 1 new (runbook.md), 2 modified (proxy.ts, .env.example), 1 verified (csp-report route)
- **Testing Strategy**: Unit (nonce, directive builder, header selection), Integration (both modes, nonce exposure, report endpoint), E2E (telemetry window, rollback)

### Open Questions
- Production domain tightening (deferred)
- Log alerting setup (operational)
- Staging vs production telemetry order (operational)

### Next Step
Ready for tasks (sdd-tasks).