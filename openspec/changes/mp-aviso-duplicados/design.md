# Design: mp-aviso-duplicados — aviso D5 no bloqueante en formularios

## Context
Ver `proposal.md` Why. D5 establece repetidos permitidos en TU/EF/MP pero exige aviso advisory. El store `k0mp4ss_fe/apps/web/lib/store.ts` hoy permite duplicados sin advertir; las páginas `app/inventario/tipos/page.tsx`, `app/inventario/estructura/page.tsx` y `components/comunidad/formulario-persona.tsx` hacen `save*` directo sin detectar duplicados. Prisma ya documentó D5 como no-constraint en `design.md` de `bd-prisma-fundamento`. No hay `STORE_VERSION` nuevo; el aviso es puramente UI y no debe bloquear el dominio (el store sigue aceptando repetidos si se llama directo). La implementación debe ser confirmación no bloqueo, con comparación case-insensitive trim y exclusión del propio id en edición.

## Goals / Non-Goals
**Goals:**
- Aviso advisory con confirmación para duplicados por nombre/etiqueta (TU/EF) y nombreCompleto (MP), permitiendo continuar si se confirma.
- Detección a nivel de formulario, no en store; `save*` del store sigue permitiendo repetidos.
- UX consistente: `window.confirm` con mensaje que cita D5, cancel aborta, confirmar persiste.

**Non-Goals:**
- No añadir `@@unique` en Prisma ni validación bloqueante en `lib/store.ts`.
- No bump `STORE_VERSION` ni migrate.
- No cambiar lógica de negocio de duplicados cross-comunidad (D5) — solo aviso intra-store actual (single comunidad en localStorage).

## Decisions
- **TU – tipos/page.tsx**: en `handleSave`, antes de `saveTipoUnidad`, obtener `nombreTrim = (formData.get("nombre") as string).trim().toLowerCase()`, buscar `data.some(t => t.id !== (editingItem?.id ?? "") && t.nombre.trim().toLowerCase() === nombreTrim)`. Si existe y `!window.confirm("Ya existe un tipo de unidad con ese nombre. ¿Deseas continuar? (D5: repetidos permitidos, es solo un aviso)")` entonces `return`. Alternativa de diálogo custom se descarta por simplicidad; `window.confirm` cumple requisito advisory y es testeable via `window.confirm` mock en RTL.
- **EF – estructura/page.tsx**: para macro, en `handleSaveMacro` antes de `saveMacroSector` comparar `nombre` y `etiqueta` trim lower: `macroSectores.some(m => m.id !== editingMacro?.id && m.nombre.trim().toLowerCase() === nombreTrim && m.etiqueta.trim().toLowerCase() === etiquetaTrim)` — si true, confirm "Ya existe un macro sector con ese nombre/etiqueta…". Para micro, en `handleSaveMicro` comparar `nombre`+`etiqueta` contra `microSectores.filter(m => m.macroSectorId === selectedMacro)` (o global si `selectedMacro` es "todos" no debería crear, pero igual). Mensaje específico micro. Alternativa de comparar solo nombre se descarta porque spec dice nombre/etiqueta.
- **MP – formulario-persona.tsx**: en `handleSubmit` antes de `onSave`, construir `nombreCompletoTrim = `${nombres} ${apellidos}`.trim().toLowerCase()`, obtener `personas` del store via `useCompassStore.getState().personas` o `useCompassStore(s => s.personas)` y verificar `some(p => p.id !== (persona?.id ?? "") && p.nombreCompleto.trim().toLowerCase() === nombreCompletoTrim)`. Si true y `!window.confirm("Ya existe una persona con ese nombre completo. ¿Deseas continuar? (D5)")` aborta. Se usa `useCompassStore.getState()` para evitar prop drilling, consistente con otros formularios que ya leen maestros via hook. Alternativa de pasar lista desde página se descarta para minimizar cambios.
- **Store intacto**: no se toca `lib/store.ts`. Tests de store existentes que crean duplicados directamente seguirán pasando, demostrando que el aviso es solo formulario.
- **Testabilidad**: el aviso es verificable en tests RTL via `window.confirm = vi.fn(() => true/false)` y `jest.spyOn`. No se añade test store nuevo; el requisito se verifica manualmente y via UI probes.

## Risks / Trade-offs
- [window.confirm bloquea thread y es feo en UI] → Mitigación: cumple requisito funcional; futuro puede migrar a Dialog advisory sin cambiar lógica.
- [Case-insensitive puede colisionar con tildes] → Mitigación: se usa `toLowerCase().trim()` simple, alineado con spec que no exige normalización avanzada.
- [Comparar micro solo dentro del mismo macro vs global] → Mitigación: spec dice "nombre/etiqueta en microSectores" — se implementa filtrado por `macroSectorId` si está seleccionado, sino global; documentar decisión.
- [Bypass via store directo] → No es riesgo, es intencional D5.

## Migration Plan
1. Editar 3 archivos UI con lógica `confirm` antes de `save*`.
2. Validar `tsc`, `lint`, `npm test` verde (ningún test bloquea duplicados, así que siguen pasando).
3. `openspec validate --all` y commit.

## Open Questions
- Ninguna. D5 ya decidió permitidos; el aviso es solo confirmación.
