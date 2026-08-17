## Context

El frontend actual (apps/web) usa mocks en `apps/web/data/` sembrados en `useState` por página, sin estado compartido ni persistencia. Las entidades de Inventario comparten dominio pero están aisladas por página. El dashboard de desarrollo ya lee del filesystem y requiere tracking del módulo `ST` (ver proposal.md - Why).

## Goals / Non-Goals

**Goals:**
- Un único store global que centralice todas las entidades del dominio y las persista en localStorage.
- Acciones CRUD por entidad como única vía de mutación (patrón repository).
- Validaciones de integridad al eliminar para preservar referencias entre entidades.
- Migración de las páginas de Inventario (TU, EF, ES), Comunidad (MP, VU) y Admin (MA, CF, AM) a lecturas/acciones del store, sin cambios de UI.

**Non-Goals:**
- Backend o API real: la persistencia es solo cliente (localStorage), no hay sincronización server.
- Auditoría de eventos (AM) fuera del alcance de esta tanda.

## Decisions

- **Store global Zustand + persist**: Zustand es ligero, sin boilerplate y con middleware `persist` nativo. Alternativa considerada: Context + useReducer, descartado por re-renders globales y falta de persistencia out-of-the-box; Redux Toolkit, descartado por peso innecesario.
- **Persistencia**: middleware `persist` con key `compass-store`, `version: 3` y función `migrate` (v<2 recibe los maestros de estructura/inventario fusionados desde el seed; v<3 migra `unidad.estado` (nombre) a `unidad.estadoId` (id del maestro de estados)). Uso de `partialize` para persistir solo las colecciones de datos.
- **Seed desde mocks**: los mocks de `data/` se importan en el store y se usan como estado inicial (`createJSONStorage(() => localStorage)` con guard de entorno para SSR). El `localStorage` ya persistido tiene prioridad sobre el seed.
- **Hidratación**: `persist` con `skipHydration: true` y rehidratación manual vía `useStoreRehydrated()` en cada página; el primer paint usa el seed y se reemplaza por lo persistido al hidratar.
- **Patrón repository**: el store expone `store.tiposUnidad`, `store.macroSectores`, `store.microSectores`, `store.unidades`, `store.estacionamientos` y acciones `save*`, `remove*`, `toggleActivo` por entidad. Las páginas llaman acciones; nunca mutan colecciones directo.
- **Validaciones al eliminar**: las acciones `remove*` verifican dependencias (unidades por `tipoUnidadId`, micro sectores por `macroSectorId`, unidades por `microSectorId`, vínculos de persona, historial de estacionamiento) y rechazan con un resultado `{ ok: false, error }` sin mutar el estado.
- **Entidades fuera del piloto**: personas, vínculos, maestros admin y configuración se incluyen en el store (estado + acciones CRUD) para completitud de la capa de datos, aunque las páginas no se migren en esta tanda.

## Risks / Trade-offs

- **localStorage como fuente de datos "producción"** → Es una capa transitoria hasta que exista backend; la versión + migrate permiten evolución sin romper datos.
- **Hidratación async en SSR** → `persist` usa `skipHydration: true` + `createJSONStorage` con guard de entorno; los client components rehidratan vía `useStoreRehydrated()` tras montar.
- **Cambios de UI no deseados al migrar** → El piloto conserva la UI; cualquier divergencia se corrige manteniendo el spec como referencia.
- **Mocks modificados manualmente** → El seed solo aplica la primera vez; una vez persistido, el localStorage manda. Esto es el comportamiento deseado de la capa.

## Migration Plan

1. Instalar `zustand` en `apps/web`.
2. Crear `apps/web/lib/store.ts` con seed, persist y acciones CRUD.
3. Migrar páginas piloto TU, EF, ES a lecturas/acciones del store.
4. Verificar compartición de estado entre módulos y persistencia tras recarga.
5. Rollback: revertir commits de migración de páginas; el store queda inerte si no se usa.

## Open Questions

- Ninguna: la persistencia en localStorage es una decisión explícita para esta fase (Fase 0), descrita en el spec como comportamiento del cliente.