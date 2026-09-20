# Proposal: Store Split Fase 2 — Slices hoja sin escrituras cruzadas

## Contexto

Fase 1 completada (`eff32c3`): 9 helpers extraídos a `lib/store/helpers.ts`.
El store monolito sigue con ~5007 líneas. El spike (`archive/2026-09-20-revision-integraal/spike-store-split.md`)
identificó 7 slices hoja sin escrituras cruzadas.

## Objetivo

Extraer slices como factories zustand `(set, get) => ({...})` que se combinan en
`lib/store.ts` con spread. Cada slice es independiente: su estado + sus acciones.

## Slices objetivo (orden de riesgo creciente)

| # | Slice | Estado | Acciones | Líneas aprox |
| --- | --- | --- | --- | --- |
| 1 | **IR** — Inventario y Recursos | `activosIR`, `solicitudesInsumoIR`, `entregasEPP` | 9 | ~350 |
| 2 | **MT** — Mantenimiento y Proyectos | `trabajosMT`, `proyectosMT` | 6 | ~350 |
| 3 | **AD** — Gestión Administrativa | `controlesPropiedades`, `actasGD` | 5 | ~400 |
| 4 | **PI/D3** — Portal Inmobiliario | `publicacionesPortal`, `leadsPortal`, `notificaciones` | 6 | ~350 |
| 5 | **CO** — Comunicación Vecinos | `plantillasCO`, `enviosCO`, `mensajesBuzonCO`, `documentosCO` | 8 | ~700 |
| 6 | **GE** — Gestión de Solicitudes | `solicitudesGE` | 4 | ~200 |
| 7 | **CV** — Visor de Mensajes | `avisosCV`, `plantillasCV` | 5 | ~320 |

## Patrón de extracción

```typescript
// lib/store/slices/ir-slice.ts
export interface IRSlic {
  activosIR: RecursoIR[]
  solicitudesInsumoIR: SolicitudInsumoIR[]
  entregasEPP: EntregaEPP[]
  saveRecursoIR: (r: RecursoIR) => StoreResult
  // ... resto de acciones
}

export const irSlice: StateCreator<CompassStore, [], [], IRSlic> = (set, get) => ({
  activosIR: [],
  solicitudesInsumoIR: [],
  entregasEPP: [],
  saveRecursoIR: (recurso) => {
    // ... implementación
  },
  // ...
})
```

Y en `lib/store.ts`:

```typescript
import { irSlice } from "./slices/ir-slice"

export const useCompassStore = create<CompassStore>()(
  persist(
    (...a) => ({
      ...nucleoSlice(...a),
      ...irSlice(...a),
      ...mtSlice(...a),
      // ...
    }),
    { /* persist config */ }
  )
)
```

## No-alcance

- Slices con escrituras cruzadas (PE→MT, GD→CV, etc.) — Fase 3.
- Cambio de persistencia (localStorage) — se mantiene.
- Cambio de STORE_VERSION — solo si cambia el schema de persistencia.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Acción lee estado de otro slice (`get().activosIR` desde IN) | Permitido: lecturas cruzadas no rompen el split. |
| Acción escribe en estado de otro slice | Detectado en spike; esos slices van a Fase 3. |
| `set()` partido corrompe persistencia | Backup de localStorage antes de cada slice. Tests de migración v27. |
| Tipos TypeScript rotos | `StateCreator<CompassStore, [], [], SliceType>` con tipos explícitos. |

## Verificación por slice

1. Tests unit del dominio (ej: `test/store-ir.test.ts`)
2. tsc 0 errores
3. Suite store completa verde
4. e2e CRUD del dominio verde
5. Migración v27 con backup real

## Esfuerzo estimado

2–3 ventanas (1 slice por ventana, o 2 slices pequeños por ventana).
