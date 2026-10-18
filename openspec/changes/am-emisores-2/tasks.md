# Tasks: am-emisores-2

- [x] Revisar la rama/prompt y marcar la fila D3 **EN CURSO** en `openspec/SERIE-DEUDA-2/00-plan.md`
- [x] Verificar la ruta real de cada acción (`grep`/`find`): las tres carpetas candidatas existen y
      la acción de cada evento tiene handler en `PUT /api/ir/recursos/[id]`,
      `GET /api/co/documentos/[id]` y `PUT /api/pe/cierres-turno/[id]`
- [x] `IR_ASSET_REPAIR` en `app/api/ir/recursos/[id]/route.ts` (PUT, solo transición real a
      `reparacion`) + test de integración → `1ca7963`
- [x] `CO_DOC_DOWNLOAD` en `app/api/co/documentos/[id]/route.ts` (GET de detalle) + test de
      integración → `40a7cfb`
- [x] `PE_CIERRE_EDITADO` en `app/api/pe/cierres-turno/[id]/route.ts` (PUT) + test de integración →
      `736f59e`
- [x] Specs vivas revisadas: `IR-inventario-recursos`, `CO-comunicacion-vecinos` y
      `PE-personal-servicios` **ya exigen** las tres emisiones (el código estaba en mora) y
      `AM-auditoria-metricas` no declara emisores faltantes → **sin deltas** (`skip_specs: true`)
- [x] Gate: `npx tsc --noEmit` 0 · `npm run lint` 0 errores · `npm test` **1246/1246** en 120
      archivos con los pisos vigentes (global 93.67/84.56/93.77/93.67 · `lib` 97.77/90.57/99.1/97.77;
      sin re-baseline)
- [x] `openspec validate --all` 41 passed / 0 failed + `check-delta-coverage am-emisores-2`
      (1 ok · 1 info · 0 que romperían el archive)
- [x] Avance NSGC (`Data/NSGC/docs/avances/avance - 2026-10-18 07-35.md`) + fila/bitácora de
      `openspec/SERIE-DEUDA-2/00-plan.md`

## Nota de alcance (desvíos declarados)

1. **Sin delta de spec**: las tres capacidades ya describen la emisión como estado vigente (el código
   estaba en mora, igual que FI/GD en D2) y `AM-auditoria-metricas` no declara emisores faltantes. Un
   delta habría duplicado la prosa viva y agregado riesgo de archive.
2. **Rutas reales ≠ handlers dedicados**: las tres carpetas candidatas del prompt son correctas, pero
   las tres rutas son envoltorios genéricos (factory / put-merge) sin hook post-escritura, así que
   cada `route.ts` envuelve su handler y emite después. `lib/api/**` quedó intacto (fuera de alcance).
3. **Fuera de alcance (para el orquestador)**: las filas de deuda de los seis emisores en
   `openspec/BACKLOG-100.md`, el archive de `am-emisores-1`/`am-emisores-2` y el push.
