> **Este archivo ES tu prompt.** Ventana P4 de la serie `SERIE-UI-MIGRACION-BD`.
> Abrí este archivo, leelo completo, y ejecuta cada bloque en orden.

---

## Estado del repo al iniciar P4

**Commits previos de la serie:**
- P1: `d4f8d13` — Dashboard + Admin migrados
- Seed: `68c07f2` — dev.db poblada con mocks (55 personas, 166 unidades, 51 vínculos, etc.)
- P2: `cd56d02` + `da40ab8` + `b691dfe` — Comunidad migrada
- P3: `17605dc` — Operaciones migradas

**Base de datos poblada:** `prisma/dev.db` tiene datos de seed. Si está vacía, corré:
```bash
cd k0mp4ss_fe/apps/web && npx tsx scripts/seed-db-from-mocks.ts
```

**Verificación inicial:**
```bash
cd k0mp4ss_fe/apps/web && npx tsx -e "
import { prisma } from './lib/prisma';
async function main() {
  console.log('personas:', await prisma.persona.count());
  console.log('unidades:', await prisma.unidad.count());
}
main();
"
```

---

## Hooks disponibles (YA EXISTEN, no crear)

### Inventario y Recursos (IR)
- `useRecursosIR()` → `{ items, isLoading, create, update, remove }` — endpoint `/api/ir/recursos`
- `useSolicitudesInsumoIR()` → `{ items, isLoading, create, update, remove }` — endpoint `/api/ir/solicitudes-insumo`
- `useEntregasEPP()` → `{ items, isLoading, create, update, remove }` — endpoint `/api/ir/entregas-epp`

### Mantenimiento y Proyectos (MT)
- `useTrabajosMT()` → `{ items, isLoading, create, update, remove }` — endpoint `/api/mt/trabajos`
- `useProyectosMT()` → `{ items, isLoading, create, update, remove }` — endpoint `/api/mt/proyectos`

### Estructura Física (EF)
- `useTiposUnidad()` → `{ items, isLoading, create, update, remove }` — `/api/tipos-unidad`
- `useMacroSectores()` → `{ items, isLoading, create, update, remove }` — `/api/macro-sectores`
- `useMicroSectores()` → `{ items, isLoading, create, update, remove }` — `/api/micro-sectores`
- `useUnidades()` → `{ items, isLoading, create, update, remove }` — `/api/unidades`

### Personas y Maestros
- `usePersonas()` → `{ personas, isLoading }` — `/api/personas`
- `useMaestros<T>("unidades-medida")` → `{ data, isLoading }` — `/api/maestros/unidades-medida`
- `useVinculos()` → `{ vinculos, isLoading }` — `/api/vinculos`

### Contrato CrudCollection
```typescript
interface CrudCollection<T> {
  items: T[]
  isLoading: boolean
  error: Error | null
  create: (item: T) => Promise<StoreResult>
  update: (id: string, item: Partial<T>) => Promise<StoreResult>
  remove: (id: string) => Promise<StoreResult>
}
```

---

## Alcance: 4 páginas de Inventario

### 1. `app/inventario/estructura/page.tsx`

**Usos actuales del store:**
```bash
grep -n "useCompassStore" app/inventario/estructura/page.tsx
```

**Migrar:**
- `useCompassStore(s => s.unidades)` → `useUnidades().items`
- `useCompassStore(s => s.macroSectores)` → `useMacroSectores().items`
- `useCompassStore(s => s.microSectores)` → `useMicroSectores().items`
- `useCompassStore(s => s.saveUnidad)` → `useUnidades().create/update`
- `useCompassStore(s => s.removeUnidad)` → `useUnidades().remove`
- `hasHydrated` → `isLoading` combinado

### 2. `app/inventario/tipos/page.tsx`

**Migrar:**
- `useCompassStore(s => s.tiposUnidad)` → `useTiposUnidad().items`
- `useCompassStore(s => s.saveTipoUnidad)` → `useTiposUnidad().create/update`
- `useCompassStore(s => s.removeTipoUnidad)` → `useTiposUnidad().remove`
- `hasHydrated` → `isLoading`

### 3. `app/inventario/recursos/page.tsx` ⚠️ Compleja

**Usos actuales del store (muchos):**
- `useCompassStore(s => s.activosIR)` → `useRecursosIR().items`
- `useCompassStore(s => s.solicitudesInsumoIR)` → `useSolicitudesInsumoIR().items`
- `useCompassStore(s => s.entregasEPP)` → `useEntregasEPP().items`
- `useCompassStore(s => s.personas)` → `usePersonas().personas`
- `useCompassStore(s => s.unidades)` → `useUnidades().items`
- `useCompassStore(s => s.microSectores)` → `useMicroSectores().items`
- `useCompassStore(s => s.maestros.unidadesMedida)` → `useMaestros("unidades-medida").data`
- `useCompassStore.getState().saveRecursoIR(payload)` → `useRecursosIR().create(payload)`
- `useCompassStore.getState().saveSolicitudInsumoIR(...)` → `useSolicitudesInsumoIR().create(...)`
- `useCompassStore.getState().cambiarEstadoRecursoIR(id, estado)` → `useRecursosIR().update(id, { estadoActivo: estado })`
- `useCompassStore.getState().entregarSolicitudInsumoIR(id)` → **NO TIENE HOOK DIRECTO.** Usar `useSolicitudesInsumoIR().update(id, { estado: "entregado" })` o dejar TODO.
- `useCompassStore.getState().resolverComodinIR(...)` → **NO TIENE HOOK DIRECTO.** Dejar TODO con `// TODO: migrar resolverComodinIR a API`.
- `useCompassStore.getState().devolverAccesoIR(id)` → `useRecursosIR().update(id, { asignacionActual: null })`
- `useCompassStore.getState().asignarAccesoIR(id, personaId)` → `useRecursosIR().update(id, { asignacionActual: { personaId } })`
- `useCompassStore.getState().registrarEntregaEPP(...)` → `useEntregasEPP().create(...)`

**Para acciones complejas sin equivalente directo:** dejar fallback al store con `// TODO: migrar acción X a API en futura fase`.

### 4. `app/inventario/proyectos/page.tsx`

**Migrar:**
- `useCompassStore(s => s.trabajosMT)` → `useTrabajosMT().items`
- `useCompassStore(s => s.proyectosMT)` → `useProyectosMT().items`
- `useCompassStore(s => s.saveTrabajoMT)` → `useTrabajosMT().create/update`
- `useCompassStore(s => s.saveProyectoMT)` → `useProyectosMT().create/update`
- `useCompassStore(s => s.removeTrabajoMT)` → `useTrabajosMT().remove`
- `useCompassStore(s => s.removeProyectoMT)` → `useProyectosMT().remove`
- `hasHydrated` → `isLoading`

---

## Patrón de migración (estándar de la serie)

```typescript
// ANTES
import { useCompassStore, useStoreRehydrated } from "@/lib/store"
useStoreRehydrated()
const hasHydrated = useCompassStore(s => s.hasHydrated)
const items = useCompassStore(s => s.items)
const save = useCompassStore(s => s.saveItems)

// DESPUÉS
import { useItems } from "@/lib/api/use-items"
const { items, isLoading, create, update, remove } = useItems()
```

**Reglas:**
1. `hasHydrated` → `isLoading` del hook (o combinación de varios `isLoading`)
2. Skeletons: `if (isLoading) return <Skeleton />`
3. Acciones `saveXxx(payload)` → `create(payload)` o `update(id, payload)`
4. Acciones `removeXxx(id)` → `remove(id)`
5. **NO tocar** estado de UI puro (modales, filtros, tabs)

---

## Acciones SIN hook equivalente (dejar TODO)

Si encontrás una acción del store que no tiene equivalente en los hooks listados arriba:

1. Intentar mapearla a `update(id, { campo: valor })` si es solo un cambio de campo.
2. Si requiere lógica compleja (ej. `resolverComodinIR` que crea un recurso nuevo + actualiza la solicitud), dejar el fallback al store:
```typescript
// TODO: migrar resolverComodinIR a API REST
const resolverComodin = useCompassStore.getState().resolverComodinIR
```
3. Documentar en el reporte final qué acciones quedaron como TODO.

---

## Criterios de aceptación

- [ ] `tsc --noEmit` 0 errores nuevos (pueden haber errores preexistentes)
- [ ] `cd k0mp4ss_fe/apps/web && npx vitest run test/api/` → 151/151 pass
- [ ] `grep -n "useCompassStore" app/inventario/*/page.tsx` solo muestra TODOs documentados
- [ ] Commitear: `git add -A && git commit -m "feat(ui): P4 migración Inventario a hooks SWR/BD"`
- [ ] Actualizar `openspec/SERIE-UI-MIGRACION-BD/00-plan.md`: marcar P4 como HECHA

---

## Reporte final (copiar al terminar)

```
BITACORA_ENTRY: P4 — Inventario migrado a hooks SWR (N/4 páginas), commit <hash>, tests X/Y.
Desviaciones: <acciones que quedaron como TODO>
```
