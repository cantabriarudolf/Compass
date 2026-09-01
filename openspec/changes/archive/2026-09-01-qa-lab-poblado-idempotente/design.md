## Context

Ver `proposal.md` — Why y What Changes. El guard actual en `runFase` aborta con `setMsg("Existen datos TEST-*...")`. El owner decidió auto limpiar+poblar via confirmación (descartado upsert por IDs, alto riesgo sobre `lib/store.ts`). Existe patrón Dialog en `@workspace/ui` (exports/detalles en qa-lab). `limpiar()` y `runFase("todo")` ya son funciones puras del componente; reutilizarlas evita duplicar lógica de purga inversa. La segunda corrida completa tarda 35–60s; e2e requiere timeouts generosos y clicks quirúrgicos (evaluate fallback).

## Goals / Non-Goals

**Goals:**
- Hacer idempotente el botón "Poblar todo de una vez" cuando hay TEST-* via dialog de confirmación y orquestación `limpiar()` → `runFase("todo")`.
- Mantener comportamiento intacto cuando no hay TEST-* (sin dialog).
- Dar cobertura e2e de ambos caminos (confirmar y cancelar) más no-regresión de `e2e/flujo/ciclo.spec.ts`.

**Non-Goals:**
- Upsert por IDs TEST-* en `lib/store.ts` (explícitamente descartado, no tocar store ni `STORE_VERSION`).
- Cambios en `lib/store.ts`, `STORE_VERSION`, modelo Prisma o APIs.
- Refactors de QA Lab más allá del guard/dialog.

## Decisions

- **Dialog de `@workspace/ui` con `DialogTitle`/`DialogDescription` + `DialogFooter` + `Button`**: coherente con el existente "Ver JSON técnico" y guía shadcn del proyecto. Alternativa `AlertDialog` descartada por consistencia visual ya instalada.
- **Estado local `confirmOpen` + `pendingFase` con orquestación asíncrona**: al confirmar se hace `setConfirmOpen(false)`, luego `await limpiar()` esperando el mensaje "TEST-* limpio correctamente" implicito en su `setMsg`, y finalmente `await runFase("todo")`. Alternativa de un `useEffect` encadenado descartada por complejidad; reutilizar funciones existentes es menor riesgo.
- **No extraer `limpiar` a hook externo**: mantener el call-site dentro del componente evita tocar firmas y mantiene el orden inverso de purga ya testeado.
- **e2e con helpers `clickPoblar`/`clickBorrar` via `evaluate` fallback y `test.setTimeout(300_000)`**: replica el patrón de `SERIE-CRUD-E2E` y `ciclo.spec.ts` para evitar flakes por "settle" bloqueado del hilo durante poblamiento.

## Risks / Trade-offs

- **Doble poblamiento secuencial en e2e (70–120s)** → mitigación: timeouts 120s por espera, 300s por test, y asserts scoping a `[id^="mod-"]` como en `ciclo.spec.ts`.
- **Race si el usuario spamea clicks mientras corre `limpiar()`** → mitigación: `loading` disabled en botones (ya existente) y `confirmOpen` cierre inmediato impide re-entry.
- **Mensaje guard ya no aparece como toast** → mitigación: el dialog muestra el texto "Existen datos TEST-*" en `DialogDescription`, cubierto por e2e que afirma su visibilidad.
- **No tocar `lib/store.ts` deja la purga existente como fuente de verdad** → si la purga falla el e2e lo detecta via 22/22 != ok.

## Migration Plan

- Deploy sin migración ni feature flag; cambio UI puro. Rollback: revert commit del dialog y volver al guard bloqueante. No requiere bump de `STORE_VERSION` ni cambios en backups.

## Open Questions

- Ninguna — decisiones cerradas en `openspec/SERIE-FRONTERA/00-plan.md` y `BACKLOG-100.md §C2`.
