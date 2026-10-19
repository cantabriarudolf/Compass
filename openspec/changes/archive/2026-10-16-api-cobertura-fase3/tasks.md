# Tasks: api-cobertura-fase3 (SERIE-DEUDA-1 P3)

- [x] 1.1 Medir de verdad: `npm test` (con `--coverage` en el script) sobre la suite
      1082/1082 (2026-10-16, rama `serie/deuda-1`) → `app/api/**` **83.69/68.70/86.99/83.69**
      (1.260 statements sin cubrir de 7.726); ranking por carpeta en `design.md § D1`.
      Las 3 más bajas: `qa-roadmap` 62.5%, `emisiones-gc` 66.89%, `vinculos` 69.2%.
- [x] 1.2 Change openspec `api-cobertura-fase3`: proposal, design, tasks y delta `MODIFIED`
      del requirement "Gate de cobertura por área" en `DEV-qa-lab` (4 escenarios vivos con
      sus nombres exactos + 1 nuevo); `check-delta-coverage` → 0 que romperían el archive.
- [x] 1.3 Tests reales `app/api/qa-roadmap` (404 guard prod, 401, 400 alcance no
      reconocido, 200 con alcance explícito y por defecto).
- [x] 1.4 Tests reales `app/api/emisiones-gc` (`route.ts` GET+POST y `[id]/route.ts`
      GET_ONE/PUT/DELETE; 401/403/404, 400 de validación y de reglas, 409 duplicado y
      cobros pagados, camino feliz en ambos modos).
- [x] 1.5 Tests reales `app/api/vinculos` (`route.ts` y `[id]/route.ts`; 401/403/404,
      persona inactiva/bloqueada, unidad inexistente, duplicado, exclusividad
      propietario/arrendatario, autosolape, cierre de tramo anterior, DELETE 409 por
      ControlPropiedad).
- [x] 1.6 Re-medir con la suite verde y re-baselinear el piso `app/api/**` en
      `vitest.config.ts` (medido − 1 pt, nunca baja) con la fecha y las carpetas cubiertas.
- [x] 1.7 Gate: `npx tsc --noEmit` 0 (después de los tests) · `npm run lint` 0 ·
      `npm test` verde con los pisos nuevos · `openspec validate --all` sin fallos ·
      `check-delta-coverage` ok.
- [x] 1.8 Avance NSGC (cobertura por carpeta antes/después, tests agregados, piso nuevo)
      + fila **P3 HECHA** en `00-plan.md` + entrada en la Bitácora.
- [ ] 1.9 Archive del change: lo hace el ARRANQUE de P4 con la CI verde **observada** del
      push de P3 (regla 5 de la serie: nunca se archiva sin CI verde observada).
