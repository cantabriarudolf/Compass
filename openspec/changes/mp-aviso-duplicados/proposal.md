# Proposal: mp-aviso-duplicados — C-extra-1 aviso UI duplicados D5 (TU/EF/MP)

## Why
La decisión D5 del consolidado `2026-08-24-b` establece que repetidos por nombre/etiqueta en maestros TU/EF y por nombreCompleto en MP están PERMITIDOS (no bloqueo), pero la plataforma debe advertir al operador para evitar duplicados accidentales. El consolidado §1/§3 y VAL-007/D5 exigen materializar D5 como requisito de aviso UI Advisory al guardar, sin cambiar la semántica del store (el `save*` sigue permitiendo duplicados). Actualmente los formularios de TU (`/inventario/tipos`), EF (`/inventario/estructura` macro/micro) y MP (`/comunidad/personas` via `FormularioPersona`) guardan sin advertir, incumpliendo D5. Se requiere aviso a nivel de formulario con confirmación no bloqueante.

## What Changes
- **No breaking** del store: `lib/store.ts` `saveTipoUnidad`, `saveMacroSector`, `saveMicroSector`, `savePersona` mantienen su semántica (permiten repetidos, D5). No se añade `@@unique` en Prisma ni validación bloqueante en el store.
- UI: formularios detectan duplicado existente en el store y piden confirmación advisory antes de guardar. Repetidos PERMITIDOS: el aviso es confirmación, no bloqueo; si el usuario confirma, el guardado procede.
  - TU: `app/inventario/tipos/page.tsx` — al guardar `TipoUnidad.nombre` (case-insensitive trim) si otro `tiposUnidad` con mismo `nombre` existe (excluyendo `editingItem.id` en edición), muestra confirmación "Ya existe un tipo de unidad con ese nombre. ¿Deseas continuar? (D5: repetidos permitidos)".
  - EF: `app/inventario/estructura/page.tsx` — `saveMacroSector` compara `nombre`+`etiqueta` contra `macroSectores` (mismo criterio), y `saveMicroSector` similar contra `microSectores` filtrados por `macroSectorId` (o global según implementación), con mensajes específicos "Ya existe un macro/micro sector con ese nombre/etiqueta".
  - MP: `components/comunidad/formulario-persona.tsx` — al guardar `Persona.nombreCompleto` (nombres+apellidos trim) contra `personas` existentes (excluyendo `persona.id` en edición), con confirmación "Ya existe una persona con ese nombre completo. ¿Deseas continuar? (D5)".
- Materialización UX: el aviso usa `window.confirm` (o diálogo advisory equivalente) con texto que cita D5 y permite continuar. No se bloquea el guardado si el usuario acepta. Si cancela, se aborta y muestra estado sin mutar.
- Deltas de spec: `RG-reglas-generales` MODIFIED — añade requisito "Aviso de duplicados D5 (no bloqueo) en TU/EF/MP" con escenarios por módulo y confirmación.
- No se modifica `STORE_VERSION` (permanece 26) ni se añade migrate; D5 ya está documentada en BD como no-constraint.

## Capabilities
### New Capabilities
<!-- none -->

### Modified Capabilities
- `RG-reglas-generales`: Reglas transversales — materializa D5 como requisito de aviso UI Advisory al guardar duplicados por nombre/etiqueta en TU/EF y por nombreCompleto en MP, con confirmación no bloqueante a nivel de formulario.

## Impact
- `k0mp4ss_fe/apps/web/app/inventario/tipos/page.tsx` (aviso TU)
- `k0mp4ss_fe/apps/web/app/inventario/estructura/page.tsx` (aviso EF macro/micro)
- `k0mp4ss_fe/apps/web/components/comunidad/formulario-persona.tsx` (aviso MP)
- `openspec/specs/RG-reglas-generales/spec.md` (evolución al archivar)
- Sin cambios en `lib/store.ts`, `prisma/schema.prisma`, `lib/schemas.ts` ni `STORE_VERSION`.
- Verificaciones: `tsc --noEmit`, `eslint`, `npm test` verde, `openspec validate --all` sin fallos, manual probes confirmando aviso+confirmación permite duplicados.
