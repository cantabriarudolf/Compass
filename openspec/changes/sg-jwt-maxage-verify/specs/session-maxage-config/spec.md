# session-maxage-config Specification

## Purpose

Explicit 24-hour JWT session maxAge with 1-hour sliding refresh in Auth.js configuration. This capability ensures session tokens expire after 24 hours of issuance and are refreshed within 1 hour of expiry to provide a sliding window extension.

## Requirements

### Requirement: Auth.js session maxAge configuration

The system SHALL configure Auth.js `authConfig.session.maxAge` to `86400` seconds (24 hours) in `lib/auth.config.ts`.

#### Scenario: JWT token issued with 24-hour expiry

- GIVEN Auth.js configuration has `session.maxAge = 86400`
- WHEN a user successfully authenticates and a session JWT is issued
- THEN the JWT `exp` claim SHALL equal `iat + 86400` (24 hours from issuance)
- AND the JWT `exp - iat` SHALL equal `86400`

#### Scenario: Session expires after 24 hours of inactivity

- GIVEN a valid session JWT with `exp = iat + 86400`
- WHEN 24 hours have elapsed since `iat` without a refresh
- THEN the session SHALL be considered expired by Auth.js
- AND subsequent requests with this token SHALL receive 401 / redirect to sign-in

### Requirement: Auth.js session updateAge sliding refresh configuration

The system SHALL configure Auth.js `authConfig.session.updateAge` to `3600` seconds (1 hour) in `lib/auth.config.ts`.

#### Scenario: Token refreshed within 1 hour of expiry gets new expiry

- GIVEN a session JWT with `exp = iat + 86400` (24h lifetime)
- WHEN the token is used to refresh within 3600 seconds (1 hour) before `exp`
- THEN Auth.js SHALL issue a new JWT with `new_exp = new_iat + 86400`
- AND the new token's lifetime SHALL be another full 24 hours from refresh time

#### Scenario: Token NOT refreshed when used more than 1 hour before expiry

- GIVEN a session JWT with `exp = iat + 86400`
- WHEN the token is used more than 3600 seconds before `exp`
- THEN Auth.js SHALL NOT issue a new token (no refresh)
- AND the original token SHALL continue to be valid until its original `exp`

#### Scenario: Token used after expiry is rejected

- GIVEN a session JWT where current time > `exp`
- WHEN the token is presented for authentication
- THEN Auth.js SHALL reject the token
- AND the user SHALL be redirected to sign-in (or receive 401 for API routes)

### Requirement: Test verifying JWT expiry claims

The system SHALL provide a Vitest test at `test/auth/session-maxage.test.ts` that verifies the JWT `exp` claim matches 24 hours from `iat`.

#### Scenario: Test decodes issued JWT and verifies 24-hour expiry

- GIVEN a test session is created via Auth.js internals or test helpers
- WHEN the issued JWT is decoded
- THEN `exp - iat` SHALL equal `86400` (within a small tolerance for clock skew)
- AND the test SHALL pass in the project's Vitest suite

#### Scenario: Test verifies sliding refresh behavior (optional but recommended)

- GIVEN a test session JWT near expiry (within 1 hour)
- WHEN the token is refreshed via Auth.js refresh flow
- THEN the new JWT SHALL have `new_exp - new_iat = 86400`
- AND the test SHALL pass in the project's Vitest suite

### Requirement: Full test suite compatibility

The system SHALL ensure the full test suite passes with the 24-hour session configuration (no tests assuming 30-day session).

#### Scenario: All existing tests pass with 24-hour session

- GIVEN the session configuration is changed to 24h maxAge / 1h updateAge
- WHEN the full test suite is executed (`npm test` in `k0mp4ss_fe/apps/web`)
- THEN all tests SHALL pass
- AND no test SHALL fail due to session duration assumptions

(End of file)