# Ventana V3 — `finanzas/multas`: cablear `use-in` y migrar la página

**ARRANQUE**: leé `openspec/SERIE-DEUDA-6/00-plan.md` completo. Marcá tu fila **EN CURSO**.

**Rama**: `noche/deuda-6`. Prohibido `git push`, `gh`, merge y PR.

## Alcance

`k0mp4ss_fe/apps/web/app/finanzas/multas/page.tsx` (7 usos). La auditoría determinó que las rutas de
acción **ya existen**: `app/api/in/infracciones/[id]/aplicar|desestimar|apelar/route.ts`. Falta
exponerlas en `lib/api/use-in.ts` (hoy solo tiene `useTiposInfraccionIN` y `useInfraccionesIN`).

## Pasos

1. **Leer el contrato real** de las 3 rutas antes de cablearlas: leé cada `route.ts` completo (método,
   payload esperado, respuesta, errores) y `app/api/in/infracciones/_acciones.ts` si es compartido.
   No inventes el shape del body.
2. **Exponer en `use-in.ts`** `aplicar`, `desestimar` y `apelar` siguiendo el patrón ya usado en
   `lib/api/use-liquidaciones.ts` (`postAccion` + `useCrudCollection`, y `mutate` de SWR para refrescar).
   Tipo de retorno: `StoreResult` (o el que use el patrón vigente).
3. **Migrar la página**: reemplazá las acciones del store por las del hook. `mensajesBuzonCO` ya tiene
   hook (`use-co.ts`) → migralo también. Dejá comentario solo donde quede una excepción real.
4. **Paridad estricta**: los textos de confirmación, los toasts, los permisos y el flujo (aplicar
   materializa el `cargoFI`) deben quedar idénticos. Un cambio de comportamiento observable → **BLOQUEADO**.
5. **Tests**: cubrí el hook con un caso por acción (éxito + error del servidor) y el caso de la página
   que dispara la acción por el hook. Verificá que no quede ninguna llamada al store en la página
   (`grep -n "useCompassStore" <archivo>` → 0).
6. **Gate**: `npx tsc --noEmit` 0 · `npm run lint` 0 problemas · `npm test` verde.
7. Commit(s) por work-unit. Actualizá tu fila en el 00-plan.

## Retorno

Fila actualizada · commits · gates · payload exacto de cada ruta (`path:line`) · archivos tocados ·
`BLOQUEADO` si aplica. No pushees.
