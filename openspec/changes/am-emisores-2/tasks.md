# Tasks: am-emisores-2

- [x] Revisar la rama/prompt y marcar la fila D3 **EN CURSO** en `openspec/SERIE-DEUDA-2/00-plan.md`
- [x] Verificar la ruta real de cada acción (`grep`/`find`): las tres carpetas candidatas existen y
      la acción de cada evento tiene handler en `PUT /api/ir/recursos/[id]`,
      `GET /api/co/documentos/[id]` y `PUT /api/pe/cierres-turno/[id]`
- [x] `IR_ASSET_REPAIR` en `app/api/ir/recursos/[id]/route.ts` (PUT, solo transición real a
      `reparacion`) + test de integración → `PENDIENTE`
- [x] `CO_DOC_DOWNLOAD` en `app/api/co/documentos/[id]/route.ts` (GET de detalle) + test de
      integración → `PENDIENTE`
- [x] `PE_CIERRE_EDITADO` en `app/api/pe/cierres-turno/[id]/route.ts` (PUT) + test de integración →
      `PENDIENTE`
- [ ] Gate: `npx tsc --noEmit` 0 · `npm run lint` 0 errores · `npm test` con los pisos vigentes
- [ ] `openspec validate --all` sin fallos + `check-delta-coverage am-emisores-2`
- [ ] Avance NSGC (`Data/NSGC/docs/avances/`) + fila/bitácora de `openspec/SERIE-DEUDA-2/00-plan.md`
