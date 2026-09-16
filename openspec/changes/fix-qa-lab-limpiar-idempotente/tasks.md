# Tasks: fix-qa-lab-limpiar-idempotente

## 1. Fix `limpiar()` idempotente

- [x] 1.1 `app/admin/qa-lab/page.tsx`: guarda de existencia en loop `removeVinculo` (`s.vinculos.some`).
- [x] 1.2 Ídem `removeUnidad` (`s.unidades`), `removeMicroSector` (`s.microSectores`), `removeMacroSector` (`s.macroSectores`).
- [x] 1.3 Ídem `removePersona` (`s.personas`), `removeTipoUnidad` (`s.tiposUnidad`), `removeMaestro` (`s.maestros[k]`).
- [x] 1.4 Comentario que documenta la regresión `5e9b689` y la semántica (ausente = limpio).

## 2. Validación

- [x] 2.1 `npx tsc --noEmit` → 0 errores.
- [x] 2.2 `npm run lint` sobre el archivo → 0 warnings.
- [x] 2.3 Re-correr aislados `poblado-idempotente` + `ciclo` + `poblamiento` → 6/6 verde.
- [x] 2.4 Revertir `next-env.d.ts` (ruido regenerado por el dev server).
