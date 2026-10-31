> **Este archivo ES tu prompt.** Ventana 5A de la serie SERIE-BD-FUENTE-VERDAD.
> Léelo completo (incluido `openspec/SERIE-BD-FUENTE-VERDAD/00-plan.md` de la serie) y ejecuta sus bloques en orden.

---

## Contexto común (válido para TODA la serie BD-FUENTE-VERDAD)

- **Estado previo**: Fases 0–4 ✅ HECHAS. Infra (factory CRUD, helper scoping, hook SWR) + MP/VU/maestros + GD/AD + FI/EF + operativos PE/RA/CV/CO/GE/IR/IN/MT migrados a persistencia servidora.
- **STORE_VERSION**: 28 en `apps/web/lib/store.ts`.
- **Tests baseline**: Fase 4 cerró con 774 passed + 14 skipped, 0 fallos. tsc 0 errores.
- **Monorepo**: `k0mp4ss_fe/` (app en `apps/web`, UI en `packages/ui`). Workdir para comandos: `cd k0mp4ss_fe/apps/web`.
- **Stack**: Next.js 16 App Router, TypeScript estricto, Prisma (SQLite dev / PostgreSQL prod), Auth.js credentials, Tailwind v4 + shadcn/ui, zustand persist.
- **Patrón API establecido**: `lib/api/crud-factory.ts` (factory REST con `delegado()`, scoping `comunidadId` desde sesión, validación Zod, idempotencia upsert) + `lib/api/with-comunidad-scope.ts` + `lib/api/use-crud-collection.ts` (hook SWR).
- **Authz**: `lib/authz.ts` con `puedeContextual()`.
- **Terminología**: "comunidad" (jamás "condominio").
- **Método del proyecto**: por cada cambio → openspec-propose → implementar con openspec-apply-change → validar → commitear (conventional español) → sincronizar specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de cualquier push.
- **Reglas permanentes**: dato de dominio solo vía API REST (no localStorage); mocks de `data/` son solo seed; secretos jamás en localStorage ni código; cada cambio de esquema del store = bump STORE_VERSION + migrate + test.
- **Verificación por ventana**: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores) && npm test (suite completa verde) + openspec validate --all` sin fallos.
- `next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
- No commitear `Untitled.md`. Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en `openspec/SERIE-BD-FUENTE-VERDAD/00-plan.md`.

---

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` (tree limpio) y `git status -sb` (sin "ahead": todo pusheado) y `git log --oneline -8`.
2. `openspec validate --all` → sin fallos.
3. `cd k0mp4ss_fe/apps/web && npm test` → suite completa verde.
4. Contrasta con `openspec/SERIE-BD-FUENTE-VERDAD/00-plan.md`:
   - Fila 4 (Operativos) HECHA y todo OK → marca tu fila (5A) EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero, anótalo en la Bitácora, y solo después empieza tu alcance.
   - PARCIAL o repo a medias → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

---

## Alcance de esta ventana (5A)

### Objetivo
Migrar los últimos módulos de dominio a API REST (RE, CF, CT, Notificaciones) y fundar la deprecación del store monolito creando `lib/store-ui.ts` y marcando @deprecated las acciones de dominio.

### 1. API routes para módulos restantes

Crear con el patrón de la factory (`lib/api/crud-factory.ts`) y `withComunidadScope`:

- `app/api/reportes-re/route.ts` — GET lista paginada, POST upsert
- `app/api/reportes-re/[id]/route.ts` — GET, PUT (merge parcial con `put-merge.ts` si aplica), DELETE
- `app/api/configuracion/route.ts` — GET (una sola config por comunidad, `comunidadId` @unique), PUT (update, no POST porque solo hay una)
- `app/api/certificados-ct/route.ts` — GET lista, POST upsert
- `app/api/certificados-ct/[id]/route.ts` — GET, PUT, DELETE
- `app/api/notificaciones/route.ts` — GET lista, POST upsert
- `app/api/notificaciones/[id]/route.ts` — GET, PUT (marcar como leída/atendida)

**Requisitos por endpoint:**
- `comunidadId` desde sesión (inescapable, nunca del body/query).
- Body validado con Zod (`lib/schemas.ts` tiene `ReporteRESchema`, `ConfiguracionGlobalSchema`, `CertificadoCTSchema`, `NotificacionSchema`).
- Authz: usar `puedeContextual()` con recursos `re`, `cf` (configuración), `ct`, `notificaciones`. Si no hay entrada en la matriz de authz para algún recurso, default a solo admin (precedente de Fase 3/4).
- Prisma query con `where: { comunidadId }`.
- Manejo de errores: 400 Zod, 401 auth, 403 authz, 404 not found, 409 P2002, 500 genérico.
- Idempotencia en POST (upsert por `id`).

**Nota especial — ConfiguracionGlobal:**
- No hay colección; es un singleton por comunidad. El GET debe devolver la config existente o 404 si no hay. El PUT debe hacer `upsert` (crea si no existe, update si existe). No expongas `comunidadId` en el body.

**Nota especial — Notificaciones:**
- El PUT `[id]` es para marcar como leída/atendida. Acepta `{ atendido: boolean }` o similar y hace `update` parcial.

### 2. Hooks de cliente

Crear en `lib/api/`:
- `use-reportes-re.ts` — wrapper `useCrudCollection` para reportes-re
- `use-configuracion.ts` — hook custom (singleton, no colección) que hace fetch a `/api/configuracion` y expone `updateConfig(config)`
- `use-certificados-ct.ts` — wrapper `useCrudCollection`
- `use-notificaciones.ts` — wrapper `useCrudCollection` con método extra `marcarLeida(id)`

### 3. Deprecación inicial del store monolito

**Paso A: Crear `lib/store-ui.ts`**

Nuevo store zustand que SOLO tenga estado de UI:

```typescript
interface Toast {
  id: string
  tipo: "success" | "error" | "warning" | "info"
  mensaje: string
  duracion?: number
}

interface UIState {
  // Modales
  modalAbierto: string | null
  modalData: unknown
  // Filtros
  filtrosActivos: Record<string, string>
  // Vista
  vistaSeleccionada: string
  // Sidebar
  sidebarExpandido: boolean
  // Toast notifications (transient)
  toasts: Toast[]
  // Acciones
  abrirModal: (id: string, data?: unknown) => void
  cerrarModal: () => void
  setFiltro: (clave: string, valor: string) => void
  limpiarFiltros: () => void
  setVista: (vista: string) => void
  toggleSidebar: () => void
  agregarToast: (toast: Omit<Toast, "id">) => void
  removerToast: (id: string) => void
}
```

Usar `persist` con key `compass-ui-store` y `UI_STORE_VERSION = 1`. Solo persistir: `sidebarExpandido`, `vistaSeleccionada`. Los toasts y modales NO se persisten.

**Paso B: Marcar @deprecated en `lib/store.ts`**

Agregar comentario JSDoc `@deprecated` a TODAS las acciones de dominio del store. Ejemplos:
- `savePersona`
- `removePersona`
- `saveVinculo`
- `removeVinculo`
- `saveActaGD`
- `removeActaGD`
- `aprobarActaGD`
- `savePeriodoDirectiva`
- `saveControlPropiedad`
- `saveFondoFI`
- `saveEgresoFI`
- `saveIngresoFI`
- etc. (todas las que escriben colecciones de dominio)

El comentario debe decir:
```typescript
/**
 * @deprecated Los datos de dominio ahora persisten en el servidor vía API REST.
 * Usar los hooks de `lib/api/use-*.ts` en código nuevo.
 * Esta acción queda como fallback legacy.
 */
```

NO borrar las acciones; solo marcarlas. La UI legacy puede seguir funcionando.

**Paso C: Eliminar/marcar migraciones de dominio del store**

Buscar las funciones `migrateV*` en `lib/store.ts` que transforman colecciones de dominio (ej. `migrarEstadoUnidades`, migraciones de personas, vínculos, etc.). Marcarlas como `@deprecated` o legacy. `STORE_VERSION` deja de migrar datos de dominio. Como `lib/store-ui.ts` tiene su propio `UI_STORE_VERSION`, el store monolito puede quedar congelado en v28.

### 4. Tests unitarios para las nuevas APIs

Crear tests en `test/api/`:
- `api-reportes-re.test.ts` — POST → assert en Prisma, GET lista, GET by id, PUT, DELETE, 401/403/404
- `api-configuracion.test.ts` — GET singleton, PUT update, 401/403
- `api-certificados-ct.test.ts` — CRUD completo + authz
- `api-notificaciones.test.ts` — CRUD + PUT marcar leída + authz

Cada test debe:
- Usar la API real (no solo el store).
- El assert verifica en Prisma que el dato existe (`prisma.modelo.findUnique`).
- Validar scoping: datos de comunidad A no visibles en comunidad B.

### 5. Commitear

Mensaje: `feat(api,store): Fase 5A BD-FUENTE-VERDAD — APIs RE/CF/CT/Notif + store-ui.ts + deprecación inicial store`

---

## Qué NO hacer en esta ventana

- NO migrar páginas de UI pura a `store-ui.ts` (eso es 5B).
- NO actualizar specs NSGC (eso es 5B).
- NO crear el script de verificación final (eso es 5B).
- NO archivar el change en openspec todavía.
- NO borrar acciones del store; solo marcar @deprecated.

---

## Criterios de aceptación

- [ ] `tsc` 0 errores.
- [ ] Tests verdes (unit).
- [ ] 7 API routes creadas y funcionando.
- [ ] 4 hooks de cliente creados.
- [ ] `lib/store-ui.ts` creado con persistencia ligera.
- [ ] Acciones de dominio en `lib/store.ts` marcadas `@deprecated`.
- [ ] Commitear.

---

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. **Ventana y estado**: HECHA / PARCIAL + motivo.
2. **Commits**: hash + subject. ¿Push sí/no?
3. **Specs creadas/modificadas + changes archivados**.
4. **Números**: STORE_VERSION, UI_STORE_VERSION, tests X/Y, tsc/eslint OK.
5. **Desviaciones vs el prompt**.
6. **Pendientes heredados a la ventana siguiente (5B)**.
7. **Última línea exacta**: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
