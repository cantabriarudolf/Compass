# Design: api-cobertura-fase4

## D1 — Las 3 carpetas se eligen de la medición vigente, no del histórico

Medición 2026-10-16 (suite 1131/1131, 111 archivos, `coverage/coverage-summary.json`
agregado por carpeta de primer nivel de `app/api/**`):

| # | Carpeta | % stmt (antes) | Sin cubrir / total | Test previo |
|---|---|---|---|---|
| 1 | `app/api/fondos-fi` | 71.16 | 92 / 319 | ninguno directo en `[id]` ni `[id]/retirar` |
| 2 | `app/api/personas` | 72.82 | 112 / 412 | `test/api/personas.test.ts` (camino principal) |
| 3 | `app/api/cobros-fi` | 74.43 | 90 / 352 | ninguno directo en `[id]`, `pagar` ni `mora` |

`app/api/**` antes: **85.75 / 71.50 / 88.48 / 85.75**.

## D2 — Molde: handlers exportados, Prisma real, único mock `next/headers`

Mismo molde que las fases 1, 2 y 3 (`test/api/emisiones-gc.test.ts`,
`test/api/qa-roadmap.test.ts`):

- `@vitest-environment node` + `vi.mock("next/headers")` con estado `vi.hoisted` para la
  cookie: `auth()` resuelve la sesión como en runtime.
- Sesión mintida con `test/helpers/sesion-authjs.ts` (cookie JWE real de Auth.js).
- Prisma contra la BD de test (paridad CI), sin `vi.mock` de Prisma ni de `lib/authz`:
  las guardias 401 (sin cookie), 403 (rol sin permiso) y 404 (scope de otra comunidad)
  se ejercitan de verdad.
- Los handlers se importan de su `route.ts` y se invocan con `NextRequest` y
  `{ params: Promise.resolve({ id }) }` (Next 16).
- Todos los datos sembrados usan prefijos únicos (`ffi4-`, `mp4-`, `cfi4-`) y `afterAll`
  borra por `comunidadId`: la BD compartida queda como estaba.

## D3 — Decisiones por carpeta

1. **`fondos-fi`**: `[id]/route.ts` no se importaba en la suite (todo su PUT sin
   cubrir) y `[id]/retirar` es la ruta de negocio más densa (guards de fondo
   inactivo, monto, descripción, acta publicada obligatoria para el fondo de
   reserva y saldo insuficiente → 400; camino feliz creando el egreso
   `uso_de_fondo` + evento `FI_FUND_WITHDRAWN`). El DELETE se prueba en sus dos
   ramas: con movimientos imputados → 409 (guard `beforeDelete`) y sin ellos → 200.
2. **`personas`**: la carpeta ya tenía `personas.test.ts`; se agrega la segunda
   capa de validaciones de negocio del handler (`validarYLimpiarPersona`): D1
   media-por-referencia (foto y firma `data:` → 400), GD herencia del período
   directiva vigente, PE FKs laborales contra los maestros MA (400 y 200), MP
   condiciones especiales (400 y 200), RUT/email únicos, 404 de scope en POST y
   GET_ONE, y los 403 por rol/ABAC residente que faltaban.
3. **`cobros-fi`**: `route.ts` (GET con `?periodo`/`?unidadId`, ABAC residente con y
   sin `personaId`, 403 por rol) y `[id]/route.ts` (GET_ONE scoped, ABAC de
   unidades propias → 403, DELETE 409 con pagos). `pagar` (ajuste con justificación
   mínima, saldo ya cubierto) y `mora` (idempotencia diaria, sin vencimiento,
   tasa inválida, cobro pagado) se prueban completos contra Prisma real.

## D4 — Ratchet: piso nuevo = medido − 1 pt, nunca baja

Con la suite verde de la fase 4 se re-mide `app/api/**` y el piso pasa de
84/70/87/84 al nuevo valor (medido − 1 pt entero por métrica, con la fecha de
medición en el comentario de `vitest.config.ts`). Global y `lib/**` no se tocan en
esta fase.

## Rollback

`git revert` de los commits de la fase 4: los tests nuevos desaparecen y el piso
vuelve a 84/70/87/84. Sin migración de datos ni cambio de contrato de API.
