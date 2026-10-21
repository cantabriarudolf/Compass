# Ventana V4 — `inventario/proyectos`: cablear `use-mt` y migrar la página

**ARRANQUE**: leé `openspec/SERIE-DEUDA-6/00-plan.md` completo. Marcá tu fila **EN CURSO**.

**Rama**: `noche/deuda-6`. Prohibido `git push`, `gh`, merge y PR.

## Alcance

`k0mp4ss_fe/apps/web/app/inventario/proyectos/page.tsx` (3 usos, TODOs en `:292` y `:321`). Rutas que
**ya existen**: `app/api/mt/garantias/verificar/route.ts` y `app/api/mt/trabajos/[id]/route.ts`.
`lib/api/use-mt.ts` hoy solo expone `useTrabajosMT` y `useProyectosMT` (CRUD).

## Pasos

1. **Leer el contrato real** de `verificarGarantiasMT` (`/api/mt/garantias/verificar`) y de
   `actualizarPagoTrabajoMT` (`PUT /api/mt/trabajos/[id]`): método, body, respuesta, errores. No
   inventes el shape.
2. **Exponer en `use-mt.ts`**: `verificarGarantias` y `actualizarPagoTrabajo`, con el patrón del repo
   (`postAccion`/`useCrudCollection` + `mutate`).
3. **Migrar la página**: reemplazá las dos acciones del store por el hook. Verificá que `useCompassStore`
   quede en 0 usos; si el CRUD de proyectos/trabajos ya viene de hooks, no lo toques.
4. **Paridad estricta**: mismos textos, mismos permisos, mismo flujo (el pago de trabajo y la
   verificación de garantías no deben cambiar de comportamiento).
5. **Tests**: un caso por acción (éxito + error) y el caso de la página que dispara por hook.
6. **Gate**: `npx tsc --noEmit` 0 · `npm run lint` 0 problemas · `npm test` verde.
7. Commit(s) por work-unit. Actualizá tu fila en el 00-plan.

## Retorno

Fila actualizada · commits · gates · payload exacto de cada ruta (`path:line`) · archivos tocados ·
`BLOQUEADO` si aplica. No pushees.
