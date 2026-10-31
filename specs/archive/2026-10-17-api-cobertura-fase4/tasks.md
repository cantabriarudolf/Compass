# Tasks: api-cobertura-fase4 (SERIE-DEUDA-1 P4)

- [x] 1.1 Medir de verdad: `npm test` (con `--coverage` en el script) sobre la suite
      1131/1131 (2026-10-16, rama `serie/deuda-1`) → `app/api/**` **85.75/71.50/88.48/85.75**
      (1.101 statements sin cubrir de 7.726); ranking por carpeta en `design.md § D1`.
      Las 3 más bajas: `fondos-fi` 71.16%, `personas` 72.82%, `cobros-fi` 74.43%.
- [x] 1.2 Change openspec `api-cobertura-fase4`: proposal, design, tasks y delta `MODIFIED`
      del requirement "Gate de cobertura por área" en `DEV-qa-lab` (todos los escenarios
      vivos + el de la fase 3 + el nuevo); `check-delta-coverage` → 0 que romperían el archive.
- [ ] 1.3 Tests reales `app/api/fondos-fi` (`route.ts` GET/POST, `[id]/route.ts`
      GET_ONE/PUT/DELETE, `[id]/retirar/route.ts` POST; 401/403/404, 400 de validación
      y de reglas, 409 duplicado de nombre y movimientos imputados, camino feliz).
- [ ] 1.4 Tests reales `app/api/personas` (segunda capa: D1 foto/firma, GD período
      vigente, PE FKs laborales, MP condiciones especiales, RUT/email únicos, 403/404
      de rol/scope y ABAC residente en GET_ONE/PUT/DELETE).
- [ ] 1.5 Tests reales `app/api/cobros-fi` (`route.ts` GET/POST, `[id]/route.ts`
      GET_ONE/PUT/DELETE, `[id]/pagar/route.ts` y `[id]/mora/route.ts` POST).
- [ ] 1.6 Re-medir con la suite verde y re-baselinear el piso `app/api/**` en
      `vitest.config.ts` (medido − 1 pt, nunca baja) con la fecha y las carpetas cubiertas.
- [ ] 1.7 Gate: `npx tsc --noEmit` 0 (después de los tests) · `npm run lint` 0 ·
      `npm test` verde con los pisos nuevos · `openspec validate --all` sin fallos ·
      `check-delta-coverage` ok.
- [ ] 1.8 Avance NSGC (cobertura por carpeta antes/después, tests agregados, piso nuevo)
      + fila **P4 HECHA** en `00-plan.md` + entrada en la Bitácora.
- [ ] 1.9 Archive del change: lo hace el ARRANQUE de P5 con la CI verde **observada** del
      push de P4 (regla 5 de la serie: nunca se archiva sin CI verde observada).
