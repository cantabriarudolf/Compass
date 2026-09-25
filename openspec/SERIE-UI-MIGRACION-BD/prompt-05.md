> **Este archivo ES tu prompt.** Ventana P5 de la serie `SERIE-UI-MIGRACION-BD`.
> Abrí este archivo, leelo completo, y ejecuta cada bloque en orden.

---

## Estado del repo al iniciar P5

**Commits previos de la serie:**
- P1: `d4f8d13` — Dashboard + Admin
- P2: `cd56d02` + `da40ab8` + `b691dfe` — Comunidad
- P3: `17605dc` — Operaciones
- P4: `<hash de P4>` — Inventario

**Base de datos poblada:** `prisma/dev.db` tiene datos de seed.

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

### Infracciones (IN)
- `useTiposInfraccionIN()` → `{ items, isLoading, create, update, remove }` — `/api/in/tipos`
- `useInfraccionesIN()` → `{ items, isLoading, create, update, remove }` — `/api/in/infracciones`

### Personal y Servicios (PE)
- `useBitacoraVisitasPE()` → `{ items, isLoading, create, update, remove }`
- `useEncomiendasPE()` → `{ items, isLoading, create, update, remove }`
- `useIngresosContratistasPE()` → `{ items, isLoading, create, update, remove }`
- `useProveedoresPE()` → `{ items, isLoading, create, update, remove }`
- `useMantencionesPE()` → `{ items, isLoading, create, update, remove }`
- `useVisitasTecnicasPE()` → `{ items, isLoading, create, update, remove }`
- `useCierresTurnoPE()` → `{ items, isLoading, create, update, remove }`
- `useProyeccionesPE()` → `{ items, isLoading, create, update, remove }`

**NOTA:** Las liquidaciones PL y adelantos PL **NO tienen hooks dedicados todavía**. Están dentro del store legacy. Para `finanzas/remuneraciones/page.tsx`, dejar fallback con `// TODO`.

### Personas (MP)
- `usePersonas()` → `{ personas, isLoading }` — `/api/personas`
- `useVinculos()` → `{ vinculos, isLoading }` — `/api/vinculos`

### Maestros
- `useMaestros<T>("afps")` → `{ data, isLoading }` — `/api/maestros/afps`
- `useMaestros<T>("previsiones-salud")` → `{ data, isLoading }`
- `useMaestros<T>("jornadas")` → `{ data, isLoading }`
- `useMaestros<T>("asignaciones-familiar")` → `{ data, isLoading }`

---

## Alcance: 4 páginas

### 1. `app/finanzas/multas/page.tsx`

**Usos actuales del store:**
- `useCompassStore(s => s.tiposInfraccionIN)` → `useTiposInfraccionIN().items`
- `useCompassStore(s => s.infraccionesIN)` → `useInfraccionesIN().items`
- `useCompassStore(s => s.personas)` → `usePersonas().personas`
- `useCompassStore(s => s.unidades)` → `useUnidades().items`
- `useCompassStore(s => s.saveTipoInfraccionIN)` → `useTiposInfraccionIN().create/update`
- `useCompassStore(s => s.saveInfraccionIN)` → `useInfraccionesIN().create/update`
- `useCompassStore(s => s.removeTipoInfraccionIN)` → `useTiposInfraccionIN().remove`
- `useCompassStore(s => s.removeInfraccionIN)` → `useInfraccionesIN().remove`
- Acciones complejas (`apelarInfraccionIN`, `comentarInfraccionIN`, `respaldarInfraccionIN`, `aplicarInfraccionIN`, `desestimarInfraccionIN`) → mapear a `update(id, { ... })` si es posible, o dejar TODO.

### 2. `app/finanzas/remuneraciones/page.tsx` ⚠️ No tiene hooks PL

**Usos actuales del store:**
- `useCompassStore(s => s.liquidacionesPL)` → **NO HAY HOOK.** Dejar TODO.
- `useCompassStore(s => s.adelantosPL)` → **NO HAY HOOK.** Dejar TODO.
- `useCompassStore(s => s.personas)` → `usePersonas().personas`
- `useCompassStore(s => s.generarLiquidacionPL)` → **NO HAY HOOK.** Dejar TODO.
- `useCompassStore(s => s.confirmarLiquidacionPL)` → **NO HAY HOOK.** Dejar TODO.
- `useCompassStore(s => s.removeLiquidacionPL)` → **NO HAY HOOK.** Dejar TODO.
- `useCompassStore(s => s.saveAdelantoPL)` → **NO HAY HOOK.** Dejar TODO.

**Decisión:** Esta página queda como **excepción documentada**. No migrar liquidaciones ni adelantos porque no hay hooks/API para PL. Solo migrar la lectura de `personas` si se usa para selects.

### 3. `app/personas/personal/page.tsx`

**Usos actuales del store:**
- `useCompassStore(s => s.personas)` → `usePersonas().personas`
- `useCompassStore(s => s.trabajosMT)` → `useTrabajosMT().items`
- Acciones de personal (`registrarHoraExtraPE`, `registrarEvaluacionPE`, `iniciarTurnoPE`, etc.) → **NO TIENEN HOOKS DIRECTOS.** Mapear a `update` si es posible, o dejar TODO.

**Decisión:** Migrar lecturas (`personas`, `trabajosMT`). Las acciones complejas de personal quedan como TODO.

### 4. `app/personas/residentes/page.tsx`

**Usos actuales del store:**
- `useCompassStore(s => s.personas)` → `usePersonas().personas`
- `useCompassStore(s => s.vinculos)` → `useVinculos().vinculos`

**Esta página es simple.** Solo lee personas y vinculos para filtrar residentes.

---

## Patrón de migración

```typescript
// ANTES
import { useCompassStore, useStoreRehydrated } from "@/lib/store"
useStoreRehydrated()
const hasHydrated = useCompassStore(s => s.hasHydrated)
const items = useCompassStore(s => s.items)

// DESPUÉS
import { useItems } from "@/lib/api/use-items"
const { items, isLoading } = useItems()
```

---

## Criterios de aceptación

- [ ] `tsc --noEmit` 0 errores nuevos
- [ ] `cd k0mp4ss_fe/apps/web && npx vitest run test/api/` → 151/151 pass
- [ ] `finanzas/remuneraciones` documentada como excepción (sin hooks PL)
- [ ] Commitear: `git add -A && git commit -m "feat(ui): P5 migración Finanzas restantes + Personas a hooks SWR/BD"`
- [ ] Actualizar `openspec/SERIE-UI-MIGRACION-BD/00-plan.md`: marcar P5 como HECHA

---

## Reporte final

```
BITACORA_ENTRY: P5 — Finanzas restantes + Personas migrados a hooks SWR (N/4 páginas), commit <hash>, tests X/Y.
Excepciones: <páginas que quedaron sin migrar y por qué>
```
