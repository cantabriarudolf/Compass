# Design: api-cobertura-fase3

## D1 — Las 3 carpetas se eligen de la medición vigente, no del histórico

Medición 2026-10-16 (suite 1082/1082, 108 archivos, `coverage/coverage-summary.json`
agregado por carpeta de primer nivel de `app/api/**`):

| # | Carpeta | % stmt (antes) | Sin cubrir / total | Test previo |
|---|---|---|---|---|
| 1 | `app/api/qa-roadmap` | 62.50 | 9 / 24 | ninguno directo (sólo guard 404/401 vía smoke) |
| 2 | `app/api/emisiones-gc` | 66.89 | 98 / 296 | ninguno directo; POST y PUT enteros sin cubrir |
| 3 | `app/api/vinculos` | 69.20 | 85 / 276 | `test/api/vinculos.test.ts` (sólo colección y algunos guards) |

`app/api/**` antes: **83.69 / 68.70 / 86.99 / 83.69**.

## D2 — Molde: handlers exportados, Prisma real, único mock `next/headers`

Mismo molde que las fases 1 y 2 (`test/api/egresos-fi.test.ts`, `test/api/qa-estado.test.ts`):

- `@vitest-environment node` + `vi.mock("next/headers")` con estado `vi.hoisted` para la
  cookie: `auth()` resuelve la sesión como en runtime.
- Sesión mintida con `test/helpers/sesion-authjs.ts` (cookie JWE real de Auth.js).
- Prisma contra la BD de test (paridad CI), sin `vi.mock` de Prisma ni de `lib/authz`:
  las guardias 401 (sin cookie), 403 (rol sin permiso) y 404 (scope de otra comunidad)
  se ejercitan de verdad.
- Los handlers se importan de su `route.ts` y se invocan con `NextRequest` y
  `{ params: Promise.resolve({ id }) }` (Next 16).
- Todos los datos sembrados usan prefijos únicos (`egc3-`, `vu3-`, `qar-`) y `afterAll`
  borra por `comunidadId`: la BD compartida queda como estaba.

## D3 — Decisiones por carpeta

1. **`qa-roadmap`**: un sólo handler GET con guard de entorno
   (`isWriteApiEnabled()` → 404), 401, validación de `alcance` contra
   `ALCANCES_ROADMAP` (400) y camino feliz (`getQaRoadmapData`). El `catch` → 500 no se
   fuerza con un mock de `@/lib/qa-estado` (violaría la regla del único mock); queda
   como los pocos statements sin cubrir de la carpeta.
2. **`emisiones-gc`**: `POST` es la ruta de negocio más densa (validación Zod, duplicado
   por período → 409, fondo GC activo ausente → 400, sin unidades elegibles → 400,
   unidad sin responsable de cobro → 400, modo variable sin gasto total → 400, y la
   transacción que crea la emisión + sus cobros con aporte a fondo de reserva). Se
   prueban ambos modos (fijo por tarifa, variable por prorrateo) y los dos caminos de
   DELETE (409 si algún cobro tiene pagos, 200 borrando cobros + emisión).
3. **`vinculos`**: la ruta tiene reglas de dominio propias (bloqueo duro D6 de persona
   inactiva/bloqueada, duplicado activo, exclusividad de titularidad/arriendo,
   anti-autosolapamiento, cierre automático del tramo anterior). Se ejercitan todas,
   incluidas las dos ramas de conflicto (propietario y arrendatario) y la de
   autosolape con `cerrarAnterior: false`, más el DELETE protegido por
   `ControlPropiedad`.

## D4 — Ratchet: piso nuevo = medido − 1 pt, nunca baja

Con la suite verde de la fase 3 se re-mide `app/api/**` y el piso pasa de 82/67/85/82 al
nuevo valor (medido − 1 pt entero por métrica, con la fecha de medición en el comentario
de `vitest.config.ts`). Global y `lib/**` no se tocan en esta fase.

## Rollback

`git revert` de los commits de la fase 3: los tests nuevos desaparecen y el piso vuelve
a 82/67/85/82. Sin migración de datos ni cambio de contrato de API.
