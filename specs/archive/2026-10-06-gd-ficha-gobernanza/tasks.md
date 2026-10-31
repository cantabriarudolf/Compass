# Tasks: GD Ficha de Gobernanza editable

- [x] 1. `FormularioGobernanza`: crear `components/comunidad/formulario-gobernanza.tsx`
      (cargo Select + fecha ISO + firma URL opcional, validación con
      `ExtensionGobernanzaSchema`, props espejo de `FormularioPersona`).
      (2026-10-06: verificado en `components/comunidad/formulario-gobernanza.tsx:19,34`; props reales
      `{ persona, onSave, onCancel }`, lee la ficha de `persona.datosGobernanza` — difiere del
      `design.md`, que la declaraba aparte)
- [x] 2. Perfil `[id]`: tab Gobernanza con crear/editar vía `Dialog`
      (estado vacío si no hay ficha; sin tocar otros tabs ni vínculos).
      (2026-10-06: verificado en `app/comunidad/personas/[id]/page.tsx:438,446-458,476,481-482`)
- [x] 3. Store: regla de coherencia en `savePersona` (depurar `datosGobernanza`
      si se quita rol `directiva` + evento `AD_DIRECTIVA_DESVINCULADA`).
      (2026-10-06: verificado en `lib/store.ts:1331-1336`. **Divergencia**: la misma poda está
      duplicada en `app/api/personas/route.ts:123-124` y `app/api/personas/[id]/route.ts:104-111`
      SIN emitir el evento, y el perfil guarda por API → la UI poda pero no audita. Anotado como
      follow-up en el avance `2026-10-06 19-35`)
- [x] 4. Tests: `describe("ficha de gobernanza")` en `test/store-directiva.test.ts`
      (acepta válida, rechaza cargo/firma D1, depura al quitar rol, preserva con rol).
      (2026-10-06: `test/store-directiva.test.ts:296-340`, 5 tests, 5/5 verde)
- [x] 5. Verificación: `npx vitest run test/store-directiva.test.ts` +
      `npx tsc --noEmit` en `k0mp4ss_fe/apps/web`, 0 errores.
      (2026-10-06: 19/19 en ese archivo; suite completa 860/860 en 90 archivos; `tsc` 0 errores;
      `eslint` 0 errores)
