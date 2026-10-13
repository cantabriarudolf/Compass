# Serie NOCHE-2 — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila EN CURSO
> y actualizarla antes del push final. La Bitácora es el registro durable de la serie.
> **Esta serie corre de noche sin el owner**: en modo delegado, el chat orquestador lanza una
> ventana a la vez ("corré la serie noche-2") y nadie participa hasta la mañana.

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | `qlab-purga-bulk`: endpoint bulk de purga TEST + re-endurecer las 2 limpiezas de cola | HECHA | d080434 |
| P2 | Helper compartido `e2e/helpers/form-dialog.ts` + migrar el patrón re-submit de los CRUD specs | pendiente | — |
| P3 | Higiene chica: `tsc` en `unit-pg`, npm local vs CI, script `e2e:fresh` documentado | pendiente | — |
| P4 | Triage de los 6 changes activos viejos (cerrar/archivar o estado explícito) | pendiente | — |
| P5 | Cierre de la serie: gates completos, push, CI de la rama, bitácora y deuda restante | pendiente | — |

MÁXIMO: 5 ventanas. **Post-serie (otra noche)**: `SERIE-NOCHE-3` = cobertura real
(`lib/store.ts` 1.202 statements + `app/api/**` 2.114 statements sin cubrir).

## Reglas duras de la serie (válidas en TODAS las ventanas)
1. **Rama de trabajo `noche/serie-noche-2`** creada desde `main` en la P1. **Prohibido pushear
   a `main`**, prohibido mergear: el owner revisa y mergea a la mañana.
2. **Un commit por work-unit**, estilo convencional en español, sin pedir confirmación.
3. **`nsgc-prepush` obligatorio antes de cada push** (avance en `Data/NSGC/docs/avances/`,
   manual de módulo si cambia comportamiento, Trazabilidad si cambia un estado).
4. **Nunca tocar `k0mp4ss_fe/apps/web/prisma/dev.db`** ni `Data/NSGC/backups/`. Para e2e se usan
   bases descartables (`prisma/perf*.db`, ya cubiertas por `*.db` en `.gitignore`).
5. **Nunca secretos** en código, docs ni commits.
6. **Gate por ventana**: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm test` (967 tests,
   pisos por área), `openspec validate --all`, `node openspec/scripts/check-delta-coverage.mjs`
   y la e2e dirigida de esa ventana con paridad CI.
7. **Si un gate falla dos veces**: marcar la ventana **BLOQUEADO** en la tabla + Bitácora con la
   evidencia exacta, `git commit` de lo que quede sano (o revertir lo roto) y SEGUIR con la
   próxima ventana. Nunca quedarse reintentando ni pedir intervención: se documenta y se sigue.
8. **Si el contexto se agota**: cerrar la tarea en curso, commitear, actualizar esta Bitácora
   con el estado exacto y avisar en una línea.

## Base de hechos (arranque de la serie)
- CI verde completo en el run `38330292787` (HEAD `ba40be2`): unit, unit-pg, e2e, e2e-rate-limit
  y deploy. 967/967 tests con pisos por área (global 82/72/87/82 · `lib/**` 86/78/94/86 ·
  `app/api/**` 78/63/82/78).
- Node: `.nvmrc` = `24`, `engines.node` = `>=24`, local **24.21.0** (npm 11.19.0).
  Para comandos: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.
- Deuda viva: `openspec/BACKLOG-100.md` (sección "CI verde + deuda de cobertura" y
  "Deuda e2e destapada al reactivar la lane") + avance
  `Data/NSGC/docs/avances/avance - 2026-10-12 14-15.md` + memoria Engram (obs. 150).
- Regla operativa de la lane e2e: base fresca
  (`npx prisma migrate deploy --schema=prisma/schema.sqlite.prisma` + `npm run e2e:reseed-base`)
  y **nunca** correr `E2E_RATE_LIMIT=1 … rate-limit.spec.ts` antes de la lane: bloquea la clave
  IP 15 minutos y aborta `auth.setup`.
- Comando e2e con paridad CI (ejemplo real usado en la sesión anterior):
  `CI=1 DATABASE_URL=file:./perfN.db AUTH_SECRET=ci-e2e-secret-no-produccion NEXT_PUBLIC_APP_ENV=development GOOGLE_CLIENT_ID=ci-dummy GOOGLE_CLIENT_SECRET=ci-dummy npx playwright test <specs> --reporter=list`

## Bitácora
- [2026-10-13] P1 HECHA: `qlab-purga-bulk` — endpoint `POST /api/qa-lab/purga-test` (guard 404/401/403, solo TEST + procedencia, idempotente) y `limpiar()` con el bucle como fallback; limpiezas de cola de `poblado-idempotente` y `ciclo` estrictas otra vez (120 s). Gates: tsc 0 · 981/981 · validate 41/0 · delta coverage ok · e2e paridad CI 14/14 sin flaky sobre `perf-noche.db` (commits aa4fd3b, f2a7179, d080434).
- [2026-10-13] P1 (detalle): medición ad-hoc sobre poblamiento completo (44 filas/25 colecciones): antes ≈63 requests de purga y 59.011 ms (dev) / >120 s CI → después 1 request y 3.917 ms wall (916 ms server-side). PUSH de la rama NO realizado en esta ventana: instrucción de proyecto vigente "NO hacer push (el orquestador lo decide)". Pendiente P5: en build de producción `isWriteApiEnabled()` es falso (NODE_ENV=production) y el cliente cae al fallback (3.1 s local) — verificar en el runner de GitHub que las limpiezas estrictas caben en 120 s.
