# Tasks: GD Ficha de Gobernanza editable

- [ ] 1. `FormularioGobernanza`: crear `components/comunidad/formulario-gobernanza.tsx`
      (cargo Select + fecha ISO + firma URL opcional, validación con
      `ExtensionGobernanzaSchema`, props espejo de `FormularioPersona`).
- [ ] 2. Perfil `[id]`: tab Gobernanza con crear/editar vía `Dialog`
      (estado vacío si no hay ficha; sin tocar otros tabs ni vínculos).
- [ ] 3. Store: regla de coherencia en `savePersona` (depurar `datosGobernanza`
      si se quita rol `directiva` + evento `AD_DIRECTIVA_DESVINCULADA`).
- [ ] 4. Tests: `describe("ficha de gobernanza")` en `test/store-directiva.test.ts`
      (acepta válida, rechaza cargo/firma D1, depura al quitar rol, preserva con rol).
- [ ] 5. Verificación: `npx vitest run test/store-directiva.test.ts` +
      `npx tsc --noEmit` en `k0mp4ss_fe/apps/web`, 0 errores.
