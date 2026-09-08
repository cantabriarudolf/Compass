> **Este archivo ES tu prompt.** Ventana 1 de la serie revision.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie revision)

Project: Compass (Next.js 16 + TypeScript + Prisma + SQLite + Auth.js + Zustand persist).
Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change
→ validar → commitear (conventional español) → sincronizar specs mains y archivar con
openspec-archive-change → skill nsgc-prepush antes de cualquier push.
Reglas permanentes: dato de dominio solo vía acciones del store (repository + StoreResult);
mocks de data/ son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en
localStorage ni código; cada cambio de esquema del store = bump STORE_VERSION + migrate + test.
Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores)
&& npm test (suite completa verde) + openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
No commitear Untitled.md. Si tu contexto se agota: cierra la tarea en curso + commit + deja
el estado exacto en openspec/SERIE-REVISION/00-plan.md.

Estado previo: STORE_VERSION = 27, tests 515/516 pasan (1 roto en RA), e2e 86/88 pasan,
build limpio, tsc limpio, lint 43 warnings (0 errores), último commit 7108e1c.

## Alcance de esta ventana (P1 — Estabilización Express)

Objetivo: poner todo verde y limpio antes de que la serie avance a revisiones profundas.

### Tarea 1.1 — Arreglar test roto

- Archivo: `test/store-reservas.test.ts` línea 188
- Falla: `cancelación anticipada sin penalización` espera `cancelacion?.tardia === false` pero recibe `true`
- Investigar la lógica de cancelación en `lib/store.ts` (buscar `cancelarReservaRA` o similar)
- Determinar si el bug está en el test (expect malo) o en el store (lógica de `tardia`)
- Corregir con el criterio correcto de "cancelación anticipada" vs "tardía"
- Documentar la regla de negocio en un comentario si no está clara

### Tarea 1.2 — Limpiar warnings de lint

- `cd k0mp4ss_fe/apps/web && npm run lint` muestra 43 warnings
- Mayormente: `no-unused-vars` en scripts `.mjs` (`okFail`, `hasReadGuard`, `hasMatcher`, `rest`)
- Mayormente: `no-undef` en scripts `.mjs` (`process` no definido — agregar `/* global process */` o cambiar a `import process from 'node:process'`)
- Mayormente: `turbo/no-undeclared-env-vars` en scripts `.mjs`
- NOTA: los scripts `.mjs` no son parte del bundle Next.js, son herramientas CLI. Si turbo lint no aplica, considerar si deben ignorarse o arreglarse.
- Criterio: eliminar warnings que sean riesgo real o ruido; no introducir regresiones.

### Tarea 1.3 — Verificar estabilidad de tests PE

- En corridas anteriores, `test/componentes/pe-panels.test.tsx` fallaba con `pointer-events: none`
- En la última corrida no fallaron (¿se estabilizaron solos o fue casualidad?)
- Correr `npm test` con `--reporter=verbose` enfocado en pe-panels para confirmar estabilidad
- Si siguen fallando: investigar si es un problema de timing con Radix Select/Dialog en jsdom
- Documentar hallazgo

### Tarea 1.4 — Propuesta openspec (si aplica)

- Si alguna corrección toca store (bump STORE_VERSION) o schemas, crear change openspec
- Si solo son tests y scripts, puede ser change `revision-estabilizacion` o similar
- Seguir flujo: propose → apply → archive

## Verificación obligatoria antes de reportar

```bash
cd k0mp4ss_fe/apps/web
npx tsc --noEmit
npm run lint
npm test  # debe decir 516/516 o X/Y donde X=Y y X>=516
```

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado (HECHA/PARCIAL + motivo).
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION, tests X/Y, tsc/eslint OK.
5. Desviaciones vs el prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
