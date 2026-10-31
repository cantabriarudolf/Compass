# Proposal: Store Split Fase 1 — Helpers puros a lib/store/helpers.ts

## Contexto
El store monolito (`lib/store.ts`) llegó a ~5007 líneas. El spike de arquitectura
(`revision-integraal/spike-store-split.md`) identificó 9 helpers transversales que
podían extraerse sin riesgo.

## Qué se hizo
- **Fase 1 (2026-09-19)**: 9 helpers puros movidos de `lib/store.ts` a
  `lib/store/helpers.ts` con re-exports intactos:
  `upsert`, `nombrePersona`, `refUnidad`, `resolverVariablesCO`, `rolDestinatarioCO`,
  `siguienteCodigoIR`, `siguienteFolioRA`, `siguienteFolioFE`, `getDeudaVigenteFI`.
- Cero cambio de comportamiento. tsc 0 errores, 32/32 tests store verdes.
- Commit: `eff32c3`.

## Qué falta
- Fase 2: slices hoja sin escrituras cruzadas (CV, GE, IR, MT, AD, PI/D3, CO).
- Fase 3: slices con acoplamientos (PE-PL-CT-RE, RA+IN, FI/GC+GD+núcleo+migrate).
- Ver `spike-store-split.md` en `archive/2026-09-20-revision-integraal/` para el mapa
  completo de dominios, acoplamientos peligrosos y plan de 3 fases.

## Estado
✅ COMPLETO — Fase 1 implementada, verificada y commiteada. Fases 2/3 pendientes de
   calendarización por el owner.
