# ST - Capa de Datos Persistente

> **ESTADO: EN MIGRACIÓN** — Este documento fue actualizado en enero 2025 para reflejar el nuevo paradigma de persistencia servidora. La arquitectura legacy de localStorage queda documentada como referencia histórica en §Legacy.

Este módulo define la capa de datos de Compass. La **fuente de verdad** es la base de datos (Prisma/SQLite en desarrollo, PostgreSQL/Neon en producción). Toda operación de escritura pasa por API Routes de Next.js App Router, validada por Zod, autorizada por `authz`, y persistida en Prisma.

## 1. Arquitectura (Nueva — 2025)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│     UI      │────▶│  SWR Hook   │────▶│  API Route  │────▶│   Prisma    │
│  (páginas)  │◀────│  (cliente)  │◀────│  (servidor) │◀────│   (SQLite/  │
└─────────────┘     └─────────────┘     └─────────────┘     │   PostgreSQL)│
                                                            └─────────────┘
```

- **Fuente de verdad:** Prisma + Base de datos. Cada modelo tiene `comunidadId` para scoping multi-tenant.
- **API REST:** Endpoints en `app/api/{modulo}/route.ts` con operaciones GET/POST/PUT/DELETE.
- **Validación:** Zod en body de cada request.
- **Autorización:** `puedeContextual()` verifica permisos por rol, acción, recurso y contexto.
- **Scoping:** `comunidadId` se extrae de la membresía del JWT de sesión. Nunca viene del body ni query string.
- **Cliente:** Hooks basados en `swr` para lectura, con mutate optimista y revalidación en foco.
- **Store de UI (Zustand):** `lib/store-ui.ts` solo mantiene estado de interfaz (modales, filtros, vistas). Sin datos de dominio.

## 1b. Arquitectura Legacy (Pre-2025)

> **⚠️ DEPRECADO:** Esta arquitectura queda como referencia histórica. No usar en código nuevo.

- **Store Global (Zustand + persist):** Los datos de dominio vivían en `apps/web/lib/store.ts`, persistidos en localStorage con key `compass-store`.
- **Limitaciones:** Sin multi-usuario, sin respaldo centralizado, sin concurrencia, compliance deficiente con Ley 21.719.
- **Migración:** Ver serie `openspec/SERIE-BD-FUENTE-VERDAD/` para el plan de migración completo.

## 2. Entidades Cobertas

Todas las entidades persisten en Prisma. Ver `prisma/schema.prisma` para el modelo completo (70 modelos, multi-tenant).

Principales colecciones:
- **Inventario (TU/EF):** `TipoUnidad`, `MacroSector`, `MicroSector`, `Unidad`
- **Comunidad (MP/VU):** `Persona`, `VinculoUnidad`
- **Administración (MA):** Maestros administrativos y de estructura
- **Configuración (CF):** `ConfiguracionGlobal`
- **Finanzas (FI):** `FondoFI`, `EgresoFI`, `IngresoFI`, `EmisionGC`, `CobroFI`
- **Gobernanza (GD):** `ActaGD`, `PeriodoDirectiva`
- **Operativos:** PE, RA, CV, CO, GE, IR, IN, MT (ver schema.prisma)

## 3. Reglas de Integridad al Eliminar

> Estas reglas se ejecutan en el **servidor** (API Routes), no en el cliente.

Las acciones de eliminación validan dependencias en Prisma y rechazan la operación si existen vínculos:

- **Tipo de Unidad:** no se elimina si tiene unidades físicas vinculadas (`tipoUnidadId`).
- **Macro Sector:** no se elimina si tiene micro sectores asociados.
- **Micro Sector:** no se elimina si tiene unidades asociadas.
- **Unidad:** no se elimina si tiene vínculos de persona asociados.
- **Persona:** no se elimina si tiene vínculos de unidad asociados.
- **Maestros (MA):** validar que no estén en uso por unidades/tipos/vínculos/personas.

## 3b. Reglas de Negocio al Guardar Vínculos (VU)

> Validación servidor-side en `app/api/vinculos/route.ts`.

- **Persona existente:** la persona vinculada debe existir en la comunidad.
- **Persona inactiva:** una persona con `estadoCuenta: "inactiva"` no puede vincularse.
- **Vínculo duplicado:** no puede existir más de un vínculo activo de la misma persona a la misma unidad.
- **Solapamiento de arriendos:** los contratos de arriendo no pueden solaparse en fechas.

## 4. Compartición entre Módulos

La compartición se logra porque todas las páginas leen de la **misma fuente de verdad** (la base de datos) a través de los hooks SWR:

- Un tipo creado en TU está disponible inmediatamente en EF (revalidación SWR).
- Una unidad editada en EF se refleja en TU y VU (mismo mecanismo).
- Cada módulo expone sus endpoints REST independientes pero consultan la misma base de datos.

## 5. Sembrado y Migraciones

- **Sembrado inicial:** Los mocks de `apps/web/data/` se migran a la base de datos mediante scripts de migración idempotentes (ver `scripts/migrate-*.ts`).
- **Versionado de schema:** Prisma maneja las migraciones de base de datos (`prisma/migrations/`).
- **Punto cero financiero:** El fixture histórico 2023-2024 (182 egresos + 44 ingresos) se migra a Prisma vía script idempotente.

## 6. Hidratación y Renderizado SSR

- Las páginas que leen datos del servidor usan Server Components cuando es posible (Next.js 16 App Router).
- Para páginas cliente que usan SWR, mostrar skeleton mientras `isLoading` es true.
- Regla: nunca renderizar datos de dominio durante SSR desde localStorage (ya no existe como fuente de verdad).

## 2. Entidades Cobertas

- **Inventario (TU/EF):** tipos de unidad, macro sectores, micro sectores y unidades físicas (desde v8 los estacionamientos son unidades físicas con `tipoUnidadId: tipo-es-1` y microsectores `est-*` en EF; no hay colección separada `estacionamientos`).
- **Comunidad (MP/VU):** personas y vínculos de unidad.
- **Administración (MA):** maestros administrativos (AFP, bancos, previsión, feriados, etc.) y maestros de estructura, inventario y vínculos (estados de ocupación con `hex` de color, categorías macro, categorías micro, categorías de unidad y estados inmobiliarios — `ubicacionesEstacionamiento` fue absorbido como microsectores de EF en v8).
- **Configuración (CF):** parámetros globales de la comunidad.

## 3. Reglas de Integridad al Eliminar

Las acciones de eliminación validan dependencias y rechazan la operación si existen vínculos:

- **Tipo de Unidad:** no se elimina si tiene unidades físicas vinculadas (`tipoUnidadId`).
- **Macro Sector:** no se elimina si tiene micro sectores asociados.
- **Micro Sector:** no se elimina si tiene unidades asociadas.
- **Unidad:** no se elimina si tiene vínculos de persona asociados (desde v8 también cubre unidades-estacionamiento `u-E-*`; la validación legacy "unidad con estacionamientos" se subsume aquí).
- **Persona:** no se elimina si tiene vínculos de unidad asociados.
- **Maestros (MA):** `removeMaestro` valida que `estadosOcupacion`, `categoriasUnidad`, `categoriasMacro/Micro`, `estadosInmobiliarios`, `condicionesEspeciales` no estén en uso por unidades/tipos/vínculos/personas.
- **Nota v7 legacy:** la regla "Estacionamiento no se elimina si tiene asignación activa" aplicaba a la colección `estacionamientos` eliminada en v8; ahora aplica como "Unidad-estacionamiento no se elimina si tiene vínculos (VU)".

## 3b. Reglas de Negocio al Guardar Vínculos (VU)

`saveVinculo` valida antes de persistir y devuelve el error si se incumple alguna regla:

- **Persona existente:** la persona vinculada debe existir en el Maestro de Personas.
- **Persona inactiva:** una persona con `estadoCuenta: "inactiva"` no puede vincularse a una unidad.
- **Vínculo duplicado:** no puede existir más de un vínculo activo (sin `fechaFin`) de la misma persona a la misma unidad.
- **Solapamiento de arriendos:** los contratos de arriendo (`rol: "arrendatario"`) en la misma unidad no pueden solaparse en sus rangos de fechas (`fechaInicio`-`fechaFin`, siendo `fechaFin` ausente un rango abierto).

## 4. Compartición entre Módulos

Al existir una única instancia de estado por entidad, las modificaciones hechas en un módulo se reflejan en los demás:

- Un tipo creado en TU aparece en los formularios de EF (incluye unidades-estacionamiento `u-E-*` filtradas por `tipo-es-1`).
- Una unidad editada en EF se refleja en TU (conteo de unidades vinculadas) y en VU (vínculos).
- Desde v8, EF es el único dueño del inventario físico; ES se consulta como vista filtrada de `unidades` por categoría `Estacionamiento`.

## 5. Sembrado y Versiones

- En la primera carga (sin estado persistido), el store se siembra desde los mocks de `apps/web/data/` (`data/inventario/estructura.ts` incluye desde v8 los 83 estacionamientos como unidades `u-E-*`).
- Una vez persistido, el localStorage manda por sobre el seed.
- La versión del esquema (`compass-store` v8) habilita migraciones ordenadas de datos sin romper al usuario. El `migrate` v8 fusiona `categoriasMacro`/`macroSectores`/`microSectores`/`unidades` por id y limpia `estacionamientos`/`ubicacionesEstacionamiento` legacy.

## 6. Hidratación y Renderizado SSR

Para evitar errores de hidratación de React (mismatch entre el HTML del servidor y el primer render del cliente):

- El persist usa `skipHydration: true`; la rehidratación se dispara solo en el cliente mediante `useStoreRehydrated()` (useEffect).
- Toda página que renderiza datos del store muestra un esqueleto (skeleton) mientras `hasHydrated` es `false` y monta el contenido real solo tras la hidratación.
- Regla obligatoria para páginas nuevas: incluir `useStoreRehydrated()`, el guard `hasHydrated` y el skeleton, siguiendo el patrón de las páginas existentes (TU, EF, MP, VU, MA, CF, AM — ES absorbido en EF).