# Runbook: CSP Enforcement Toggle (sg-csp-enforcement)

## Overview

This runbook documents the operational procedure for safely enabling Content-Security-Policy (CSP) enforcement in production after a 7-day telemetry window in Report-Only mode.

**Change reference**: `sg-csp-enforcement`
**Design**: `openspec/changes/sg-csp-enforcement/design.md`
**Proposal**: `openspec/changes/sg-csp-enforcement/proposal.md`

The toggle is controlled exclusively by the `CSP_ENFORCEMENT` environment variable:
- `CSP_ENFORCEMENT=false` (default) → `Content-Security-Policy-Report-Only` header
- `CSP_ENFORCEMENT=true` → `Content-Security-Policy` header (enforcement)

All CSP directives, nonce generation (`generarNonce()`), and `strict-dynamic` mitigation remain **identical** in both modes. The header name selection is the only behavioral difference.

---

## Prerequisites

- **Environment variable access**: Ability to modify `CSP_ENFORCEMENT` in production/staging environment (platform dashboard, Kubernetes configmap, Vercel/Netlify env vars, etc.)
- **Log aggregation**: Access to structured logs from `/api/csp-report` endpoint (Grafana Loki, Datadog, CloudWatch, or equivalent)
- **Verified endpoint**: `/api/csp-report` must be confirmed working (GET health check returns `{ ok: true }`, POST returns 204 and logs structured violations)
- **Rollback authority**: Team member with permission to change production env vars must be available during flip and post-flip monitoring

---

## Phase 1: Deploy Report-Only (Default)

1. **Deploy the change** with `CSP_ENFORCEMENT=false` (default in `.env.example` and code)
2. **Verify behavior unchanged**:
   - `curl -I https://<domain>/` → response contains `content-security-policy-report-only` header
   - Response does **not** contain `content-security-policy` header
   - Response contains `x-nonce` and `x-csp-nonce` headers with unique values per request
   - `script-src` directive contains `'nonce-<value>' 'strict-dynamic'`
3. **Confirm `/api/csp-report` is receiving traffic**:
   - `GET /api/csp-report` → returns `{ ok: true, note: "CSP report sink..." }`
   - Trigger a test violation (e.g., inject inline script without nonce in browser console) → verify POST to `/api/csp-report` returns 204 and structured log appears in log aggregation

**Gate**: Do not proceed to Phase 2 until all verification steps pass.

---

## Phase 2: 7-Day Telemetry Window

**Objective**: Run in Report-Only mode for 7 consecutive days with **zero CSP violations** logged.

### Daily Checklist (repeat for 7 days)

| Day | Action | Owner | Status |
|-----|--------|-------|--------|
| 1-7 | Query logs for `[csp-report] violation` entries in last 24h | On-call | ☐ |
| 1-7 | Count unique violations (group by `violated-directive` + `blocked-uri`) | On-call | ☐ |
| 1-7 | Document any violations found (even if expected/false-positive) | On-call | ☐ |
| 1-7 | If **any** violation found → **reset clock to Day 0**, investigate, document | On-call | ☐ |

### Structured Log Query

```logql
# Grafana Loki example
{job="compass-web"} |= "[csp-report] violation"
  | json
  | violated_directive != ""
  | count by (violated_directive, blocked_uri) over 24h
```

### Zero-Violations Criterion

- **Strict**: 7 consecutive calendar days with **zero** structured log entries matching `[csp-report] violation`
- **Clock reset**: Any violation (including expected false positives like Next.js HMR) resets the counter to Day 0
- **Documentation**: Record each day's result in the checklist above

### Common False Positives (document but do not block)

| Pattern | Likely Cause | Action |
|---------|--------------|--------|
| `violated-directive: script-src`, `blocked-uri: inline` | Next.js HMR / Turbopack inline scripts | Document, continue telemetry |
| `violated-directive: script-src-elem`, `blocked-uri: 'self'` | Next.js chunk loading timing | Document, continue telemetry |
| `violated-directive: style-src`, `blocked-uri: inline` | Emotion/styled-components or Next.js CSS-in-JS | Document, continue telemetry |
| `blocked-uri: blob:` | Web Worker / blob URL scripts | Document, continue telemetry |

**Decision rule**: If violations are **only** from known false-positive categories above for all 7 days, the team **may** proceed to Phase 3. Any violation outside these categories requires investigation and clock reset.

---

## Phase 3: Enforcement Flip

### Pre-Flip Criteria (ALL must be met)

- [ ] 7 consecutive days with zero violations logged (Phase 2 complete)
- [ ] All violations during window were documented false positives (Next.js HMR, etc.)
- [ ] Team consensus to proceed
- [ ] On-call engineer available for 2 hours post-flip

### Flip Procedure

1. **Set `CSP_ENFORCEMENT=true`** in production environment variables (platform dashboard)
2. **No code deploy needed** — the change takes effect on the **next request** processed by `proxy.ts` (edge middleware hot-reloads on env var change in most platforms; if not, a rolling restart suffices)
3. **Verify immediately**:
   - `curl -I https://<domain>/` → response contains `content-security-policy` header
   - Response does **not** contain `content-security-policy-report-only` header
   - `x-nonce` / `x-csp-nonce` headers present and unique per request
   - `script-src` still contains `'nonce-<value>' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https:`

---

## Phase 4: Post-Flip Monitoring

### Ongoing (first 48 hours, then weekly)

- Monitor `/api/csp-report` logs for **any** violations in enforcement mode
- In enforcement mode, violations mean **blocked resources** (user-visible breakage)
- Alert threshold: **> 0 violations/hour** → investigate immediately

### If Issues Arise → Immediate Rollback

See **Rollback Procedure** below.

---

## Rollback Procedure

### Trigger Conditions

- Any production functionality broken (blank pages, failed loads, console errors)
- Unexpected CSP violations in enforcement mode (not seen during telemetry)
- Team decision to revert for any reason

### Immediate Action

1. **Set `CSP_ENFORCEMENT=false`** in production environment variables
2. **No code change, no git revert, no build required**
3. **Effect**: Next request emits `Content-Security-Policy-Report-Only` header

### Verification Steps

1. `curl -I https://<domain>/` → confirms `content-security-policy-report-only` header present
2. `content-security-policy` header absent
3. All CSP directives, nonce generation, `strict-dynamic` identical to pre-flip
4. Functionality restored (user reports clear)

### Post-Rollback

- Document root cause in incident tracker
- Extend telemetry window by 7 more days from rollback date
- Do not re-attempt flip until new 7-day zero-violations window completes

---

## Violation Review Process

### Triage Steps (when violation appears in logs)

1. **Extract fields**: `document-uri`, `violated-directive`, `blocked-uri`, `effective-directive`
2. **Classify**:
   - **Known false positive** (Next.js HMR, inline styles, blob workers) → document, continue
   - **Legitimate violation** (missing nonce on inline script, unauthorized external resource) → investigate
3. **Investigate legitimate violations**:
   - Reproduce in staging with same `document-uri`
   - Identify source component/page
   - Fix: add nonce, move script to external file, or add trusted origin to CSP directive
4. **Decision**:
   - Fix deployed → reset telemetry clock to Day 0
   - False positive confirmed → document, continue telemetry (no clock reset if truly benign)

### When to Extend Telemetry vs Investigate

| Situation | Action |
|-----------|--------|
| Only known false positives for 7 days | Proceed to flip (Phase 3) |
| New violation pattern appears | Investigate immediately, reset clock if legitimate |
| Violation rate > 0 but all false positives | Document pattern, consider CSP directive adjustment, reset clock |
| Legitimate violation in enforcement mode | **Immediate rollback**, fix, new 7-day window |

---

## Contact / Escalation

| Role | Contact | Responsibility |
|------|---------|----------------|
| Platform Owner | [Owner] | Env var changes, production access |
| On-Call Engineer | [Rotation] | Daily log review, flip/rollback execution |
| Security Reviewer | [Reviewer] | Violation classification, false positive sign-off |

**Escalation path**: On-call → Platform Owner → Security Reviewer

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `CSP_ENFORCEMENT=false` | Report-Only mode (default, safe) |
| `CSP_ENFORCEMENT=true` | Enforcement mode (after 7-day clean telemetry) |
| `GET /api/csp-report` | Health check |
| `POST /api/csp-report` | Receives browser CSP violation reports |
| Log query: `[csp-report] violation` | Find all violations in log aggregation |

---

## Change History

| Date | Version | Change |
|------|---------|--------|
| 2026-10-05 | 1.0 | Initial runbook for sg-csp-enforcement |