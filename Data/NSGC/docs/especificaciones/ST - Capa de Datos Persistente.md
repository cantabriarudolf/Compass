# ST - Capa de Datos Persistente

> La fuente de verdad de Compass es la base de datos (Prisma/SQLite en desarrollo, PostgreSQL/Neon en producción). Toda operación de escritura pasa por API Routes de Next.js App Router.

## 1. Arquitectura de datos

```
UI Component → SWR Hook (use-*.ts) → API Route (app/api/*/route.ts) → Prisma Client → BD
```

- **Fuente de verdad:** Prisma + Base de datos. Cada modelo tiene `comunidadId` para scoping multi-tenant.
- **API REST:** Endpoints en `app/api/{modulo}/route.ts` con operaciones GET/POST/PUT/DELETE.
- **Validación:** Zod en body de cada request.
- **Autorización:** `puedeContextual()` verifica permisos por rol, acción, recurso y contexto.
- **Scoping:** `comunidadId` se extrae de la membresía del JWT de sesión. Nunca viene del body ni query string.
- **Cliente:** Hooks basados en `swr` para lectura, con mutate optimista y revalidación en foco.
- **Store de UI (Zustand):** `lib/store-ui.ts` solo mantiene estado de interfaz (modales, filtros, vistas, sidebar, toasts). Sin datos de dominio.
- **Store LEGACY:** `lib/store.ts` está congelado en `STORE_VERSION=28`. Sus acciones de dominio están marcadas `@deprecated`. No usar en código nuevo.

## 2. Entidades cobertas

Todas las entidades persisten en Prisma. Ver `prisma/schema.prisma` para el modelo completo (70 modelos, multi-tenant).

Principales colecciones:
- **Inventario (TU/EF):** `TipoUnidad`, `MacroSector`, `MicroSector`, `Unidad`
- **Comunidad (MP/VU):** `Persona`, `VinculoUnidad`
- **Administración (MA):** Maestros administrativos y de estructura
- **Configuración (CF):** `ConfiguracionGlobal`
- **Finanzas (FI):** `FondoFI`, `EgresoFI`, `IngresoFI`, `EmisionGC`, `CobroFI`
- **Gobernanza (GD):** `ActaGD`, `PeriodoDirectiva`
- **Operativos:** PE, RA, CV, CO, GE, IR, IN, MT (ver schema.prisma)

## 3. Reglas de integridad al eliminar

> Estas reglas se ejecutan en el **servidor** (API Routes), no en el cliente.

Las acciones de eliminación validan dependencias en Prisma y rechazan la operación si existen vínculos:

- **Tipo de Unidad:** no se elimina si tiene unidades físicas vinculadas (`tipoUnidadId`).
- **Macro Sector:** no se elimina si tiene micro sectores asociados.
- **Micro Sector:** no se elimina si tiene unidades asociadas.
- **Unidad:** no se elimina si tiene vínculos de persona asociados.
- **Persona:** no se elimina si tiene vínculos de unidad asociados.
- **Maestros (MA):** validar que no estén en uso por unidades/tipos/vínculos/personas.

## 3b. Reglas de negocio al guardar vínculos (VU)

> Validación servidor-side en `app/api/vinculos/route.ts`.

- **Persona existente:** la persona vinculada debe existir en la comunidad.
- **Persona inactiva:** una persona con `estadoCuenta: "inactiva"` no puede vincularse.
- **Vínculo duplicado:** no puede existir más de un vínculo activo de la misma persona a la misma unidad.
- **Solapamiento de arriendos:** los contratos de arriendo no pueden solaparse en fechas.

## 4. Compartición entre módulos

La compartición se logra porque todas las páginas leen de la **misma fuente de verdad** (la base de datos) a través de los hooks SWR:

- Un tipo creado en TU está disponible inmediatamente en EF (revalidación SWR).
- Una unidad editada en EF se refleja en TU y VU (mismo mecanismo).
- Cada módulo expone sus endpoints REST independientes pero consultan la misma base de datos.

## 5. Sembrado y migraciones

- **Sembrado inicial:** Los mocks de `apps/web/data/` se migran a la base de datos mediante scripts de migración idempotentes (ver `scripts/migrate-*.ts`).
- **Versionado de schema:** Prisma maneja las migraciones de base de datos (`prisma/migrations/`).
- **Punto cero financiero:** El fixture histórico 2023-2024 (182 egresos + 44 ingresos) se migra a Prisma vía script idempotente.

## 6. Hidratación y renderizado SSR

- Las páginas que leen datos del servidor usan Server Components cuando es posible (Next.js 16 App Router).
- Para páginas cliente que usan SWR, mostrar skeleton mientras `isLoading` es true.
- Regla: nunca renderizar datos de dominio durante SSR desde localStorage (ya no existe como fuente de verdad).

## 7. Legacy (referencia histórica)

> **⚠️ DEPRECADO:** Esta arquitectura queda como referencia histórica. No usar en código nuevo.

- **Store Global (Zustand + persist):** Los datos de dominio vivían en `apps/web/lib/store.ts`, persistidos en localStorage con key `compass-store`.
- **Limitaciones:** Sin multi-usuario, sin respaldo centralizado, sin concurrencia, compliance deficiente con Ley 21.719.
- **Migración:** Ver serie `openspec/SERIE-BD-FUENTE-VERDAD/` para el plan de migración completo.
