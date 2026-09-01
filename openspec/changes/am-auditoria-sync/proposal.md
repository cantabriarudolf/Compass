# Proposal: am-auditoria-sync — Sincronización de eventos de auditoría a BD

## Why

Los eventos de auditoría hoy viven solo en localStorage (zustand persist). Se pierden al limpiar storage, no son compartidos entre dispositivos ni consultables server-side, y `/admin/logs` no puede paginar/filtrar desde BD. Para que auditoría sea fuente de verdad multi-tenant y `/admin/logs` migre a BD (P3), se necesita ingesta idempotente y consulta paginada server-side.

## What Changes

- **POST /api/auditoria/sync**: ingesta batch (máx ~500 eventos) con `upsert` idempotente por `id`, scoped por `comunidadId` derivado de la membresía del usuario autenticado (patrón `app/api/admin/usuarios/route.ts`: `auth()` → usuario → membresía → 401/403). Sin `delete`/`update`. Respuesta `{ ok, recibidos, persistidos }`.
- **GET /api/auditoria**: listado paginado desde BD ordenado `timestamp` desc, scoping por comunidad del usuario, filtros opcionales `categoria`, `tipoAccion`, `q` (búsqueda en descripcion/tipoAccion/referenciaId) + paginación `page`/`pageSize` → `{ total, page, pageSize, eventos }`.
- **Cliente sync con debounce**: módulo `lib/auditoria-sync.ts` → `iniciarSyncAuditoria()` suscribe a `useCompassStore` (detecta cambios en `eventos` por length/último id), acumula delta no persistido (Set de ids enviados en memoria), y a los 2s del último cambio hace POST del delta. Error silencioso + reintento en próximo cambio. No reintenta en loop si 401. Se invoca una vez en el layout cliente raíz. No muta `lib/store.ts`.
- Sin cambios en `/admin/logs` (P3) ni en el modelo Prisma (tabla `EventoAuditoria` ya existe en `schema.prisma:248`).

## Capabilities

### New Capabilities

- (ninguna nueva — se extiende AM-auditoria-metricas)

### Modified Capabilities

- `AM-auditoria-metricas`: ADDED requirement "Sincronización de eventos a la capa de datos" (ingesta batch idempotente + consulta paginada con filtros server-side, scoped por comunidad, inmutable sin delete/update).

## Impact

- Nuevas rutas `app/api/auditoria/sync/route.ts` y `app/api/auditoria/route.ts` (Next.js route handlers).
- Nuevo módulo cliente `lib/auditoria-sync.ts`.
- Hook en `app/layout.tsx` (client wrapper) para `iniciarSyncAuditoria()`.
- Tests API con Prisma real (`test/api-auditoria-sync.test.ts`).
- Sin migración Prisma (validado con `npx prisma validate` / equivalente; tabla ya existe).
