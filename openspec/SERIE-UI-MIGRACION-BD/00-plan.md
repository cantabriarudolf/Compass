# Serie UI-Migración-BD — Plan y Estado Canónico

> **Objetivo:** Migrar todas las páginas de UI que aún usan `useCompassStore` (store legacy) para que usen los hooks SWR (`lib/api/use-*.ts`) que leen/escriben en la base de datos vía API REST.
>
> **Contexto:** La serie `SERIE-BD-FUENTE-VERDAD` (commits `bbfba14` a `0164873`) creó la infraestructura completa: 107 API routes, ~30 hooks SWR, tests 151/151 pasando. El store legacy (`lib/store.ts`) está marcado `@deprecated` con `STORE_VERSION = 28` congelado. Pero **28 páginas de la app aún leen/escriben datos de dominio desde el store** en lugar de usar los hooks.
>
> **MÁXIMO: 6 ventanas.** Post-serie: las páginas que queden sin migrar se documentan como excepciones.
>
> **Base de hechos:**
> - APIs disponibles: `app/api/*/` (107 route.ts)
> - Hooks disponibles: `lib/api/use-*.ts` (~30 hooks)
> - Store legacy: `lib/store.ts` (8.600 líneas, @deprecated)
> - Store UI puro: `lib/store-ui.ts` (estado de interfaz)
> - Tests de API: `test/api/*.test.ts` (151 pasando)
> - Specs NSGC: `Data/NSGC/docs/especificaciones/*.md` (23 módulos, bloque "Datos" ya actualizado)

---

## Roadmap

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | Dashboard + Admin base (configuración, métricas, reportería, gestión, logs) | EN CURSO (ventana P1 aceptada) | — |
| P2 | Comunidad restante (ficha persona, portal, visor, certificados, comunicación) | pendiente | — |
| P3 | Operaciones (bitácora, paquetería, accesos, proveedores, reservas, solicitudes) | pendiente | — |
| P4 | Inventario (estructura, tipos, recursos, proyectos) | pendiente | — |
| P5 | Finanzas restantes (multas, remuneraciones) + Personas (personal, residentes) | pendiente | — |
| P6 | Visor-mensajes + QA-Lab + Mantenimiento + Dev-dashboard + cierre | pendiente | — |

---

## Páginas a migrar (por módulo)

### P1 — Dashboard + Admin base
- `app/dashboard/page.tsx`
- `app/admin/configuracion/page.tsx` → `useConfiguracion`
- `app/admin/metricas/page.tsx`
- `app/admin/reporteria/page.tsx` → `useReportesRE`
- `app/admin/gestion/page.tsx` → `useControlesPropiedad`
- `app/admin/logs/page.tsx` → ya lee `/api/auditoria`, verificar si usa store para algo más

### P2 — Comunidad restante
- `app/comunidad/personas/[id]/page.tsx` → `usePersonas`, `useVinculos` (ya parcial)
- `app/comunidad/portal/page.tsx`
- `app/comunidad/visor/page.tsx` → `useCV`
- `app/comunidad/certificados/page.tsx` → `useCertificadosCT`
- `app/comunidad/comunicacion/page.tsx` → `useCO`

### P3 — Operaciones
- `app/operaciones/bitacora/page.tsx` → `usePE`
- `app/operaciones/paqueteria/page.tsx` → `usePE`
- `app/operaciones/accesos/page.tsx`
- `app/operaciones/proveedores/page.tsx` → `usePE`
- `app/operaciones/reservas/page.tsx` → `useRA`
- `app/operaciones/solicitudes/page.tsx` → `useGE`

### P4 — Inventario
- `app/inventario/estructura/page.tsx` → `useUnidades`, `useMacroSectores`, etc.
- `app/inventario/tipos/page.tsx` → `useTiposUnidad`
- `app/inventario/recursos/page.tsx` → `useIR`
- `app/inventario/proyectos/page.tsx` → `useMT`

### P5 — Finanzas restantes + Personas
- `app/finanzas/multas/page.tsx` → `useIN`
- `app/finanzas/remuneraciones/page.tsx` → `usePE` (liquidaciones/adélantos)
- `app/personas/personal/page.tsx` → `usePE`
- `app/personas/residentes/page.tsx` → `usePersonas`

### P6 — Visor-mensajes + QA/Dev + Cierre
- `app/visor-mensajes/page.tsx` → `useCV`
- `app/admin/qa-lab/page.tsx`
- `app/admin/mantenimiento/page.tsx`
- `app/admin/dev-dashboard/page.tsx`
- Cierre: verificar que ninguna página nueva use store, actualizar bitácora, archivar serie.

---

## Bitácora

- [2026-09-25] P1 HECHA: Dashboard + Admin base migrados a hooks SWR (6/6 páginas: dashboard, configuracion, metricas, reporteria, gestion, logs verificado), commit 8b8dffa, tests 795 pass.

(cada ventana añade antes del push: `- [fecha] P<n> HECHA: resumen (commit hash)`)

---

## Reglas de migración (aplican a todas las ventanas)

1. **Reemplazar `useCompassStore` por hooks SWR:** Buscar todos los `useCompassStore((s) => s.xxx)` que accedan a datos de dominio y reemplazarlos por el hook correspondiente (`usePersonas()`, `usePE()`, etc.).
2. **Reemplazar acciones del store:** `saveXxx`, `removeXxx`, `toggleXxx` → usar las funciones `create`, `update`, `remove` expuestas por el hook SWR.
3. **Mantener `useStoreRehydrated` solo si es necesario:** Si la página ya no lee del store persistido, `hasHydrated` puede eliminarse. Skeletons de carga se manejan con `isLoading` del hook SWR.
4. **NO tocar estado de UI puro:** Modales, filtros, selecciones que no sean datos de dominio pueden seguir en `useCompassStore` o migrarse a `lib/store-ui.ts`.
5. **Preservar authz:** Los permisos se siguen evaluando con `puedeContextual()`; los hooks SWR respetan los 403 del servidor.
6. **Tests:** Cada página migrada debe seguir funcionando (tsc 0, tests e2e si existen).
7. **Commitear por ventana:** Un commit por ventana o varios commits pequeños dentro de la ventana; al final hacer push.

---

## Dependencias cruzadas

- Las páginas de **P1 (Dashboard)** pueden leer datos de módulos que se migran en P2-P5. Si un dato no está disponible vía hook todavía, dejar el fallback al store con un `// TODO: migrar a useXxx cuando esté disponible`.
- La página **QA-Lab (P6)** puede necesitar datos de TODOS los módulos. Si excede el alcance, se documenta como excepción.

---

## Post-serie

1. Verificar que `grep -r "useCompassStore" app/ --include="*.tsx"` solo encuentre usos en:
   - Páginas documentadas como excepciones
   - Estado de UI puro (modales, filtros)
   - `lib/store-ui.ts` (si aplica)
2. `lib/store.ts` puede reducirse (quitar las acciones que ya nadie usa) o dejarse como legacy documentado.
3. Archivar esta serie en openspec.
