# Tasks: am-emisores-1

- [x] Marcar la fila D2 **EN CURSO** en `openspec/SERIE-DEUDA-2/00-plan.md`
- [x] `CF_UPDATE_PARAM` en `app/api/configuracion/route.ts` (PUT, solo por delta de los 4 parámetros
      legales, con old/new) + test de integración → `823c245`
- [x] `FI_INGRESO_REGISTRADO` en `app/api/ingresos-fi/route.ts` (POST) + test de integración → `87dc021`
- [x] `GD_PERIODO_REGISTRADO` en `app/api/periodos-directiva/route.ts` (POST) + test de integración → `11039bf`
- [x] Deltas de spec (`ST-capa-datos-persistente`, `CF-configuracion-global`) + `design.md` → `aca0ba1`
- [x] Gate: `npx tsc --noEmit` 0 · `npm run lint` 0 errores · `npm test` **1230/1230** en 117 archivos
      con los pisos vigentes (cobertura global 93.71/84.77/93.28/93.71 · `lib` 97.77/90.63/99.10/97.77;
      sin re-baseline)
- [x] `openspec validate --all` 41 passed / 0 failed + `check-delta-coverage am-emisores-1`
      (3 ok · 0 que romperían el archive)
- [x] Avance NSGC (`Data/NSGC/docs/avances/avance - 2026-10-17 23-56.md`) + fila/bitácora de
      `openspec/SERIE-DEUDA-2/00-plan.md`

## Nota de alcance (desvíos declarados)

1. **Blocker de lint del lens en `app/api/periodos-directiva/route.ts`**: el
   `JSON.parse(JSON.stringify(roster))` del archivado de nómina (línea ~171, código preexistente)
   disparaba "`$CALL` without try/catch — throws on invalid input". Se envolvió en `try/catch` con
   re-throw y log: mismo comportamiento, sin cambio de contrato.
2. **Sin delta en `FI-finanzas-morosidad` ni `GD-gestion-directiva`**: sus specs vivas ya describen
   el POST con el evento como estado vigente (el código estaba en mora), así que no hay prosa que
   modificar. Tampoco en `AM-auditoria-metricas` (no declara emisores faltantes).
3. **Fuera de alcance (para el orquestador)**: la fila de deuda `CF_UPDATE_PARAM sin emisor` de
   `openspec/BACKLOG-100.md:277` queda por retirar, y el manual GD no menciona
   `GD_PERIODO_REGISTRADO` (los manuales no están en los archivos de esta ventana).
