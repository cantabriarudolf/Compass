# Design — revision-estabilizacion

## Contexto

Ventana P1 de SERIE-REVISION. Sin cambios de comportamiento de producto: 1 test alineado al spec, tooling CLI limpio, verificación de estabilidad de un test componente.

## Decisión 1 — el bug está en el test, no en el store

Diagnóstico (2026-09-08):

- `lib/store.ts` `cancelarReservaRA`: `tardia = ventanaTardia !== undefined && diasRestantes <= ventanaTardia`, con `ventanaTardia = elemento.cancelacionTardiaDias`. Correcto.
- Spec vigente (`openspec/specs/RA-reservas-amenities/spec.md`, Requirement "Cancelación de reservas..."): "cuando faltan ≤ `cancelacionTardiaDias` días para la reserva, MUST marcarla como tardía"; escenario "Cancelación anticipada sin cargo": "holgura mayor a la ventana de tardía" → `tardia:false`.
- El test fallido hereda de `reservaBase` la fecha hardcodeada `2026-09-10`. Con elemento de ventana 2 días, ese fixture fue "anticipado" solo hasta el 2026-09-06; desde entonces `diasRestantes <= 2` → `tardia:true`. El fixture envejeció; el store y el spec coinciden.

**Fix elegido:** en el test "cancelación anticipada", fecha dinámica `hoy + 30 días` (holgura 15× la ventana) + comentario de la regla de negocio. No se toca el store (cero riesgo de regresión de dominio) ni `STORE_VERSION` (queda en 27; no hay cambio de esquema del store → sin migrate ni test nuevo de migración).

**Alternativa descartada:** hacer `reservaBase` con fecha dinámica por defecto. Se descarta por alcance mínimo: ningún otro test del archivo depende del valor de `tardia` con la fecha default, y cambiar el default tocaría silenciosamente 10+ casos. Se deja registrado el riesgo de fixture envejecido en la bitácora de la serie para P4 (deuda técnica: fechas hardcodeadas en tests).

## Decisión 2 — estrategia de lint en scripts/*.mjs (31 warnings → 0)

Los `.mjs` de `scripts/` son herramientas CLI (backup/restore de BD, chequeos de seguridad, seed) fuera del bundle Next.js. Estrategia mínima diff, sin migrar imports:

- `no-undef` (`process`): `/* global process */` al inicio de cada script en vez de `import process from "node:process"` — mismo efecto para ESLint, cero cambio semántico de módulo.
- `turbo/no-undeclared-env-vars`: disable inline por línea con justificación. Razón: las env vars (`CHECK_HEADERS_URL`, `RESTORE_CONFIRM`, `CHECK_RECHECK_LIVE`) son parámetros de invocación manual de CLI, no dependencias de tareas turbo; declararlas en `turbo.json` global (fuera del alcance de esta ventana) acoplaría el pipeline de build a parámetros de tooling local. Si P4 decide lo contrario, se revierte el disable y se declaran.
- `no-unused-vars`: eliminación real de código muerto, verificada por grep de usos:
  - `backup-db.mjs`: `readdirSync` (import).
  - `restore-db.mjs`: `mkdirSync`, `statSync`, `writeFileSync` (imports).
  - `security-recheck.mjs`: función `okFail`, variables `hasReadGuard`, `hasMatcher`.
  - `check-headers.mjs`: variable `hasNoEnforcement`.
- `no-empty`: los catches vacíos son intencionales (best-effort: WAL checkpoint, `headers()` opcional). La regla `no-empty` ignora bloques que contienen comentarios → se documenta el porqué dentro del bloque, sin cambiar lógica.

Resultado esperado: 43 → 12 warnings (0 errores). Los 12 restantes quedan fuera del alcance de esta ventana y se heredan: `proxy.ts` (8 — código de seguridad, se revisa en P2/P3), `e2e/crud/punto-cero.spec.ts` (1), `scripts/fix-rut-seeds.cjs` (2 — `.cjs` fuera de `scripts/*.mjs`), `test/qa-roadmap.test.ts` (1).

## Tarea 1.3 — hallazgo estabilidad PE

Corridas ejecutadas (2026-09-08, vitest run --reporter=verbose, jsdom):

- Corrida 1: 7/7 pass (36.3s).
- Corrida 2: 7/7 pass (31.1s).
- Corrida 3: 7/7 pass (33.3s).
- Corrida 4: 7/7 pass (33.1s).
- Corrida 5: 7/7 pass (32.0s).

**Conclusión:** estable en 5/5 corridas consecutivas (35/35 tests). El flaky histórico `pointer-events: none` (fallos intermitentes al interactuar con Radix Select/Dialog en jsdom) no se reprodujo. Hipótesis de estabilización: los tests ya no dependen de eventos pointer nativos sobre elementos con `pointer-events: none` (patrón conocido de Testing Library + Radix en jsdom). No se requiere intervención; se re-verificará en P5 (ventana de flakiness). Registro completo en el reporte de la ventana.

## Verificación

```bash
cd k0mp4ss_fe/apps/web
npx vitest run test/store-reservas.test.ts          # 13/13
npx vitest run test/componentes/pe-panels.test.tsx --reporter=verbose  # 5 corridas
npx tsc --noEmit                                    # limpio
npm run lint                                        # 12 warnings, 0 errores
npm test                                            # 516/516
openspec validate --all                             # sin fallos
npm run check:rechecks && npm run check:headers     # scripts operativos
```
