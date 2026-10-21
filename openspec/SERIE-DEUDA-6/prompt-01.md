# Ventana V1 — `comunidad/certificados`: lectura legacy → hooks SWR

**ARRANQUE (obligatorio, en este orden)**: leé `openspec/SERIE-DEUDA-6/00-plan.md` completo y
`openspec/BACKLOG-100.md` §"Deuda viva verificada (2026-10-21)" → §"Store legacy: mapa de migración".
Marcá tu fila **EN CURSO** en el 00-plan antes de tocar código.

**Rama**: `noche/deuda-6`. Prohibido `git push`, `gh`, merge y PR.

## Alcance

`k0mp4ss_fe/apps/web/app/comunidad/certificados/page.tsx` (4 usos, veredicto **MIGRABLE YA**):
solo lectura sobre `liquidacionesPL` y `cobrosFI` del store legacy.

## Pasos

1. **Crear el change** `ui-legacy-store-fase1` si no existe: `openspec/changes/ui-legacy-store-fase1/`
   con `proposal.md` que declare el alcance de la serie completa (V1–V5) y justifique `skip_specs: true`
   (paridad de comportamiento; sin cambio de contrato observable), más `tasks.md` con las 5 ventanas.
2. **Verificar shapes antes de reemplazar**: compará los campos que la página usa de
   `liquidacionesPL`/`cobrosFI` contra `LiquidacionPL`/`CobroFI` de `lib/schemas.ts` y contra lo que
   devuelven `useLiquidaciones()` (`liquidaciones`) y `useCobrosFI()` (`items`). Si un campo que la
   página necesita no está en el tipo del hook → **BLOQUEADO** con la lista exacta de campos faltantes.
3. Reemplazá las dos lecturas del store por los hooks. Eliminá el comentario "Lecturas legacy
   restantes" y el import de `useCompassStore` **solo si queda sin uso** (verificá con grep en el
   archivo). Si `hasHydrated`/`useStoreRehydrated` sigue controlando un estado de carga real, reemplazalo
   por los flags `isLoading` de los hooks; si no, quitá el gate.
4. **Paridad estricta**: mismos textos, mismas columnas, mismo orden, mismos permisos. No cambies
   comportamiento visible.
5. **Tests**: si existe test de la página, actualizá sus mocks al nuevo origen de datos. Agregá un caso
   que pruebe que la tabla se alimenta del hook (no del store) y que el estado de carga funciona.
6. **Gate**: `npx tsc --noEmit` 0 · `npm run lint` 0 problemas · `npm test` verde con los pisos.
7. Commit(s) por work-unit en español. Actualizá tu fila en el 00-plan con el commit.

## Retorno

Fila actualizada · commits · salidas exactas de los gates · archivos tocados · evidencia del shape
verificado (`path:line`) · `BLOQUEADO` si aplica. No pushees.
