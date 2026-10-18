# Tasks: am-emisores-1

- [ ] Marcar la fila D2 **EN CURSO** en `openspec/SERIE-DEUDA-2/00-plan.md`
- [ ] `CF_UPDATE_PARAM` en `app/api/configuracion/route.ts` (PUT, solo por delta de los 4 parámetros
      legales, con old/new) + test de integración
- [ ] `FI_INGRESO_REGISTRADO` en `app/api/ingresos-fi/route.ts` (POST) + test de integración
- [ ] `GD_PERIODO_REGISTRADO` en `app/api/periodos-directiva/route.ts` (POST) + test de integración
- [ ] Deltas de spec (`ST-capa-datos-persistente`, `CF-configuracion-global`) + `design.md`
- [ ] Gate: `npx tsc --noEmit` 0 · `npm run lint` 0 · `npm test` verde con los pisos vigentes
- [ ] `openspec validate --all` sin fallos + `check-delta-coverage am-emisores-1` (0 que romperían el
      archive)
- [ ] Avance NSGC + fila/bitácora de `openspec/SERIE-DEUDA-2/00-plan.md`
