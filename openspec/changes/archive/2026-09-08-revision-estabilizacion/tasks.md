# Tasks — revision-estabilizacion

## 1. Test roto RA (Tarea 1.1)

- [x] 1.1 Confirmar diagnóstico: `npx vitest run test/store-reservas.test.ts` falla en línea 188 (`tardia` esperado false, recibido true) porque la fecha `2026-09-10` de `reservaBase` quedó a 2 días de hoy, dentro de `cancelacionTardiaDias: 2`
- [ ] 1.2 Corregir el test "cancelación anticipada sin penalización" con fecha dinámica +30 días y comentario de la regla de negocio (tardía ⟺ faltan ≤ `cancelacionTardiaDias` días); sin tocar `lib/store.ts` ni STORE_VERSION
- [ ] 1.3 Re-corrida del archivo completo verde (13/13)

## 2. Warnings lint en scripts/*.mjs (Tarea 1.2)

- [ ] 2.1 `backup-db.mjs`: quitar `readdirSync` sin uso, `/* global process */`, comentario en catch vacío del WAL checkpoint
- [ ] 2.2 `restore-db.mjs`: quitar `mkdirSync`/`statSync`/`writeFileSync` sin uso, `/* global process */`, disable inline turbo para `RESTORE_CONFIRM`
- [ ] 2.3 `check-headers.mjs`: quitar `hasNoEnforcement` sin uso, `/* global process */`, disable inline turbo para `CHECK_HEADERS_URL`, comentario en catch vacío de `headers()`
- [ ] 2.4 `security-recheck.mjs`: quitar `okFail`, `hasReadGuard`, `hasMatcher` sin uso, `/* global process */`, disable inline turbo para `CHECK_RECHECK_LIVE`
- [ ] 2.5 `seed-authz.mjs`: `/* global process */`
- [ ] 2.6 `npm run lint` reduce a 12 warnings (todos fuera del alcance de esta ventana: proxy.ts 8, e2e 1, .cjs 2, test/qa-roadmap 1) y 0 errores; scripts siguen funcionando (`npm run check:rechecks` y `npm run check:headers` corren OK)

## 3. Estabilidad PE (Tarea 1.3)

- [ ] 3.1 Correr `npx vitest run test/componentes/pe-panels.test.tsx --reporter=verbose` en repetidas corridas (≥5) y registrar resultado
- [ ] 3.2 Documentar hallazgo en design.md (estable vs flaky; si flaky: causa Radix Select/Dialog en jsdom)

## 4. Cierre integral (Tarea 1.4)

- [ ] 4.1 `npx tsc --noEmit` limpio
- [ ] 4.2 `npm test` suite completa verde (516/516)
- [ ] 4.3 `openspec validate --all` sin fallos
- [ ] 4.4 Actualizar 00-plan.md (bitácora + estado P1) y commit conventional español (acción del owner; el agente no commitea)
- [ ] 4.5 Archive del change con sincronización de specs mains (requiere tocar `openspec/specs/` — fuera de las superficies de edición autorizadas del agente; lo ejecuta el owner o se autoriza explícitamente)
