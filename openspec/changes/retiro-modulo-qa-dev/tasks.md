# Tasks — `retiro-modulo-qa-dev`

## 1. Superficies retiradas

- [x] 1.1 Pantallas `app/admin/{qa-lab,qa-dashboard,dev-dashboard,mantenimiento}`, `app/admin/_qa-dev-guard.tsx` y `lib/qa-dev-acceso.ts` fuera del árbol.
- [x] 1.2 Rutas API `app/api/{qa-estado,qa-roadmap,qa-lab,dev-dashboard}` y `lib/dev-dashboard.ts` fuera del árbol.
- [x] 1.3 Helpers: `lib/store-backup.ts` y `lib/store-diff.ts` retirados; `lib/qa-lab-helpers.ts` reducido a `esCobroTest` (consumidor de producción).

## 2. UI y navegación

- [x] 2.1 Sección «Desarrollo AI» del sidebar (con sus 4 entradas) y `SIDEBAR_GROUPS` actualizado.
- [x] 2.2 `/admin/permisos` sin enlace al Laboratorio; el texto de membresías faltantes queda gramatical.

## 3. Candados y comentarios

- [x] 3.1 `scripts/audit-desvios.mjs`: entrada `recurso: "qa-lab"` eliminada.
- [x] 3.2 `scripts/audit-store.mjs`: las 3 excepciones del módulo eliminadas (allowlist vacía) y `BACKLOG-100.md` con `archivos=0` y la fila del store actualizada.
- [x] 3.3 `scripts/security-recheck.mjs`: chequeos re-apuntados a `POST /api/backup` y `POST /api/admin/seed-authz`; sin perder la propiedad de seguridad.
- [x] 3.4 Comentarios obsoletos corregidos en `lib/qa-estado.ts`, `lib/seed-authz.ts`, `app/api/admin/seed-authz/route.ts` y `vitest.config.ts`.

## 4. Tests y e2e

- [x] 4.1 `test/qa-dev-retiro.test.ts` en verde (incluye los casos PRESERVE de `esCobroTest` y del reporter).
- [x] 4.2 Tests reparados: `test/api/route-guard-smoke.test.ts`, `test/auth/proxy.test.ts`, `test/auth/ingresar-page.test.tsx`, `test/security-rechecks.test.ts`, `test/store-integracion-nsgc.test.ts`.
- [x] 4.3 `e2e/crud/permisos.spec.ts`: fallback de seed por `POST /api/admin/seed-authz`.
- [x] 4.4 `e2e/flujo/poblamiento.spec.ts`: sin navegación al Laboratorio; quedan los casos que crean datos por API.

## 5. Gates

- [x] 5.1 `npx vitest run test/qa-dev-retiro.test.ts` en verde.
- [x] 5.2 `npx tsc --noEmit` sin errores.
- [x] 5.3 `npm run audit:desvios` y `npm run audit:store` en verde.
- [x] 5.4 `npx vitest run` completo en verde.
- [x] 5.5 `node openspec/scripts/check-delta-coverage.mjs` sin problemas (3 changes, 0 que romperían el archive).

## 6. Fuera de este change

- [ ] 6.1 F22 (retiro del store legacy): cancelado como unidad; `lib/store.ts` no se toca.
- [ ] 6.2 Re-alojar los requirements de infraestructura de pruebas que hoy viven en `DEV-qa-lab` (ratchet de cobertura, `e2e:higiene`, convención `TEST-*`, corrida única, consentimiento en el setup): cambio aparte, antes de archivar si el owner quiere conservar el contrato escrito.
- [ ] 6.3 Actualizar `e2e/auth/roles-accesos.spec.ts` y `e2e/auth/roles-menu.spec.ts`, que todavía esperan el grupo «Desarrollo AI».
