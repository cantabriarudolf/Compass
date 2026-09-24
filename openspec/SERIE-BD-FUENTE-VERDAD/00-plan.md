# SERIE-BD-FUENTE-VERDAD — Plan de Migración: localStorage → Base de Datos

> **Estado:** Plan completo listo para ejecución  
> **Creado:** 2025-01-13  
> **Dependencia crítica:** Cambiar la fuente de verdad de la aplicación de `localStorage` (zustand persist) a Prisma/SQLite(dev) → PostgreSQL/Neon(prod).

---

## 1. Diagnóstico: ¿Por qué todo quedó en el navegador?

### La evidencia

La especificación maestra `Data/NSGC/docs/especificaciones/ST - Capa de Datos Persistente.md` contiene la instrucción errónea que consolidó el arquitectura cliente-only:

> *"Es la Fase 0 de la estrategia de datos: mientras no exista backend, la persistencia vive en el navegador (localStorage)."*
>
> *"Store Global (Zustand + persist): Todos los conjuntos de entidades viven en `apps/web/lib/store.ts`"*
>
> *"Persistencia: Middleware `persist` sobre localStorage con key `compass-store`"*

**Todos los módulos NSGC (23 specs) referencian ST como su capa de datos:**

```
AD, AM, AU, CF, CO, CT, CV, EF, FI, GD, GE, IN, IR, MA, MP, MT, PE, PL, RA, RE, ST, VU
```

Cada uno tiene el mismo bloque:
> 🔌 **Datos:** este módulo persiste en la capa de datos (ST) — ver [ST - Capa de Datos Persistente](<ST - Capa de Datos Persistente.md>).

### El gap de Prisma

Prisma **sí existe** (`prisma/schema.prisma`, 70 modelos, `comunidadId` en todos, multi-tenant), pero fue construido como "esqueleto futuro". La UI nunca fue instruida a leer/escribir desde el servidor. Los únicos endpoints que usan Prisma son:

- `POST /api/auditoria/sync` — espejo batch de eventos
- `POST /api/fi/sync` — espejo batch de ingresos FI
- Auth (usuarios, membresías, rate limit, 2FA)

### El gap de las pruebas

Las 48 pruebas unitarias (`test/*.test.ts`) y 43 e2e (`e2e/*.spec.ts`) están mayoritariamente testeando **el store de zustand**, no la persistencia en base de datos. Ejemplos:

- `store-integracion-nsgc.test.ts` — testea merges del store
- `store-migracion-seed.test.ts` — testea seeding en localStorage
- `store-fase-a.test.ts` — testea acciones del store
- `fi-sync-cliente.test.ts` — testea el cliente del sync (no la DB)

**Ninguna prueba verifica que al hacer `savePersona()` la persona quede realmente en SQLite/PostgreSQL.**

---

## 2. Corrección de instrucciones erróneas

### Archivos que DEBEN actualizarse antes/durante la serie

| Archivo | Qué cambiar |
|---|---|
| `Data/NSGC/docs/especificaciones/ST - Capa de Datos Persistente.md` | Reescribir completamente. La persistencia vive en **Prisma/Servidor**, no en localStorage. localStorage es solo caché offline opcional. |
| Todos los specs de módulo (23 archivos) | Cambiar el bloque "🔌 Datos" para que referencie la API REST correspondiente, no ST-localStorage. |
| `openspec/changes/archive/2026-08-16-ST-capa-datos-persistente/specs/ST-capa-datos-persistente/spec.md` | Archivado, pero documentar en nota que fue superado por esta serie. |

### Nueva regla de arquitectura (a inyectar en todos los specs)

> **Fuente de verdad:** La base de datos (Prisma/SQLite dev → PostgreSQL/Neon prod) es la única fuente de verdad. Cada operación de escritura DEBE pasar por una API Route de Next.js App Router que valide (zod), autorice (authz) y persista (Prisma). El store de zustand se reduce a estado de UI (modales, filtros, selecciones) y caché offline transitoria.

---

## 3. Estrategia de ejecución

### Fases

| Fase | Qué se hace | Modelo recomendado | Complejidad |
|---|---|---|---|
| **0** | Infra: factory API + hook cliente + `PeriodoDirectiva` en Prisma — ✅ `bbfba14` | Kimi (contexto largo) | Media |
| **1** | MP + Maestros: personas, vínculos, maestros admin — ✅ HECHA | Kimi (grafo de dependencias) | Alta |
| **2** | GD + AD: actas, períodos, controles de propiedad | Muse Spark 1.3 | Media |
| **3** | FI + EF: fondos, egresos, ingresos, estructura física | Muse Spark 1.3 | Alta |
| **4** | Operativos: PE, RA, CV, CO, GE, IR, IN, MT | Muse Spark 1.3 | Alta |
| **5** | Reportería + Config + Certificados + deprecación store | Kimi (contexto largo) | Media |

### Por qué Kimi para Fase 0-1 y 5

- **Fase 0-1**: Necesita entender el grafo completo de `store.ts` (8.600 líneas), `schema.prisma` (70 modelos) y cómo se relacionan personas/vínculos con todo el resto. Muse Spark 1.3 tiene menos contexto.
- **Fase 5**: Deprecación del store monolito requiere entender todo el archivo.

### Por qué Muse Spark 1.3 para Fases 2-4

- Cada módulo es autocontenido (2-4 modelos Prisma + 1-2 APIs + 1-2 hooks + tests).
- La cuota es generosa.
- Se puede paralelizar vía gentle-ai subagentes.

---

## 4. Prompts copiables

> **Instrucciones de uso:**
> 1. Abrí una ventana de chat nueva.
> 2. Copiá el prompt correspondiente a la fase.
> 3. Pegalo y ejecutalo.
> 4. Al terminar, commiteá y actualizá este plan marcando la fase como DONE.
> 5. Pasá a la siguiente fase.

---

### PROMPT FASE 0 — Infraestructura compartida

Copiar desde aquí ────────────────────────────────────────────

```
Sos el arquitecto senior de Compass (Next.js 16 App Router, TypeScript estricto, Prisma, SQLite dev / Neon prod). Tenés que construir la infraestructura que permita que TODO el estado de dominio deje de vivir en localStorage y pase a la base de datos.

**Contexto del proyecto:**
- Monorepo en `k0mp4ss_fe/` (app: `apps/web`, UI: `packages/ui`).
- Fuente de verdad actual: `apps/web/lib/store.ts` (~8.600 líneas, zustand + persist en localStorage). Esto es un error arquitectónico que hay que corregir.
- Prisma ya existe: `apps/web/prisma/schema.prisma` (70 modelos, todos con `comunidadId`, multi-tenant). La BD es SQLite en dev, PostgreSQL en prod.
- Únicos endpoints que usan Prisma hoy: `POST /api/auditoria/sync`, `POST /api/fi/sync`, auth, rate limit.
- Validación con Zod ya existe en `lib/schemas.ts`.
- Authz con `puedeContextual()` en `lib/authz.ts`.
- Terminología: "comunidad" (jamás "condominio").

**Tareas de esta fase:**

1. **Crear `lib/api/with-comunidad-scope.ts`** — helper que extrae `comunidadId` desde la membresía del JWT de la sesión. Debe ser inescapable: ninguna API route puede recibir `comunidadId` por body/query.

2. **Crear `lib/api/crud-factory.ts`** — factory que genere handlers REST estándar (GET lista, POST upsert, PUT update, DELETE remove) para cualquier modelo Prisma. Debe incluir:
   - Scoping obligatorio `comunidadId` desde sesión
   - Validación zod del body
   - Idempotencia en POST (upsert por `id`)
   - Manejo de errores estandarizado

3. **Crear `lib/api/use-server-collection.ts`** — hook de cliente basado en `swr` (ya está en el proyecto o instalalo si falta) que:
   - Haga fetch a la API
   - Haga mutate optimista
   - Revalide en foco de ventana
   - Use localStorage como fallback cuando `navigator.onLine === false` (offline-first opcional)

4. **Agregar modelo `PeriodoDirectiva` a Prisma** — es el único modelo que existe en `lib/schemas.ts` pero NO en `prisma/schema.prisma`:

```prisma
model PeriodoDirectiva {
  id                    String   @id
  comunidadId           String
  comunidad             Comunidad @relation(fields: [comunidadId], references: [id], onDelete: Cascade)
  fechaInicio           String
  duracionMeses         Int
  fechaFin              String?
  fechaInscripcion      String
  referenciaInscripcion String
  fechasEstimadas       Boolean  @default(false)
  estado                String   // vigente | cerrado
  actaOrigenId          String?
  miembros              Json     // MiembroPeriodoDirectiva[]
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([comunidadId])
  @@index([estado])
  @@map("periodos_directiva")
}
```

5. **Crear migración Prisma** para el nuevo modelo.

6. **Crear `app/api/periodos-directiva/route.ts`** — API REST completa (GET/POST/PUT/DELETE) usando la factory, con authz (solo roles con permiso sobre GD).

7. **Tests unitarios** para la factory y el helper de scoping.

**Criterios de aceptación:**
- `tsc` 0 errores.
- Tests nuevos pasan.
- La API `/api/periodos-directiva` responde correctamente con datos de prueba.
- Ningún secret en código.
- Commitear al terminar.

**Qué NO hacer:**
- No tocar `lib/store.ts` todavía.
- No crear GraphQL ni tRPC.
- No normalizar `miembros` a tabla hija (Json está bien por ahora).
```

─────────────────────────────────────────────── hasta aquí

---

### PROMPT FASE 1 — MP (Personas + Vínculos) + Maestros Administrativos

Copiar desde aquí ────────────────────────────────────────────

```
Sos el arquitecto senior de Compass. En la Fase 0 se construyó la infraestructura compartida (factory API, hook SWR, helper de scoping, modelo PeriodoDirectiva en Prisma). Ahora hay que migrar el módulo más crítico: **Personas y Vínculos (MP/VU)**, porque todo el grafo de dominio depende de ellos.

**Contexto:**
- `lib/store.ts` tiene `savePersona`, `removePersona`, `saveVinculo`, `removeVinculo` que hoy solo escriben en localStorage.
- `prisma/schema.prisma` ya tiene modelos `Persona`, `VinculoUnidad`, y todos los maestros (`Afp`, `PrevisionSalud`, `MutualCaja`, `Feriado`, `Banco`, `IndiceAjuste`, `CajaFondo`, `CategoriaInsumo`, `UnidadMedida`, `ContactoEmergencia`, `CondicionEspecial`, `EstadoOcupacion`, `CategoriaMacro`, `CategoriaMicro`, `CategoriaUnidad`, `EstadoInmobiliario`, `AsignacionFamiliar`, `Jornada`, `Courier`, `Contratista`).
- `lib/schemas.ts` tiene Zod schemas para todo.
- `lib/authz.ts` tiene reglas de permisos.
- `app/api/fi/sync/route.ts` y `app/api/auditoria/sync/route.ts` son ejemplos del patrón batch idempotente.

**Tareas:**

1. **Crear API routes para MP:**
   - `app/api/personas/route.ts` (GET lista paginada, POST upsert)
   - `app/api/personas/[id]/route.ts` (GET, PUT, DELETE)
   - Scoping por `comunidadId` desde sesión (helper de Fase 0)
   - Validación zod del body
   - Authz: solo admin/directiva pueden crear/editar; residentes solo ven sus datos

2. **Crear API routes para VU:**
   - `app/api/vinculos/route.ts` (GET, POST)
   - `app/api/vinculos/[id]/route.ts` (GET, PUT, DELETE)
   - Replicar las validaciones de negocio que hoy están en `saveVinculo` del store:
     - Persona debe existir
     - Persona inactiva no se vincula
     - No duplicar vínculo activo
     - No solapar arriendos

3. **Crear API routes para Maestros:**
   - `app/api/maestros/[tipo]/route.ts` — un endpoint genérico que sirva todos los maestros (afps, bancos, etc.) usando la factory de CRUD.
   - O separados si preferís: `app/api/afps/route.ts`, `app/api/bancos/route.ts`, etc.

4. **Crear hooks de cliente:**
   - `lib/api/use-personas.ts` — wrapper de SWR para personas
   - `lib/api/use-vinculos.ts` — wrapper para vínculos
   - `lib/api/use-maestros.ts` — wrapper para maestros

5. **Modificar las páginas de UI** para que usen los hooks/API en lugar de las acciones del store:
   - `app/admin/personas/page.tsx` y sus componentes
   - `app/admin/vinculos/page.tsx` y sus componentes
   - `app/admin/maestros/page.tsx`
   - NO borrar las acciones del store todavía; solo hacer que la UI prefiera la API.

6. **Tests:**
   - Tests unitarios para las API routes (mock de Prisma o test DB).
   - Tests de integración: crear persona vía API → verificar que existe en Prisma → leer vía GET.
   - **IMPORTANTE:** Los tests deben validar que los datos quedan en la base de datos REAL (SQLite), no solo en el store. Usar `prisma.persona.findMany()` en el assert.

**Criterios de aceptación:**
- `tsc` 0 errores.
- Todos los tests pasan (unit + e2e).
- Crear una persona desde la UI queda en `dev.db` (verificable con `npx prisma studio` o query directa).
- Commitear al terminar.
```

─────────────────────────────────────────────── hasta aquí

---

### PROMPT FASE 2 — GD (Gobernanza + Directiva) + AD (Administración)

Copiar desde aquí ────────────────────────────────────────────

```
Sos el arquitecto senior de Compass. Las Fases 0-1 construyeron infraestructura y migraron MP/VU + maestros a persistencia servidora. Ahora toca **GD (Gestión de Directiva)** y **AD (Gestión Administrativa)**.

**Contexto:**
- `lib/store.ts` tiene: `saveActaGD`, `removeActaGD`, `aprobarActaGD`, `savePeriodoDirectiva`, `saveControlPropiedad`.
- `prisma/schema.prisma` tiene modelos: `ActaGD`, `ControlPropiedad`.
- **PeriodoDirectiva** fue agregado en Prisma en la Fase 0.
- La UI tiene formularios de gobernanza recién construidos (FormularioGobernanza, ficha de perfil con cargo/asunción/firma).

**Tareas:**

1. **API routes para Actas GD:**
   - `app/api/actas-gd/route.ts` (GET, POST)
   - `app/api/actas-gd/[id]/route.ts` (GET, PUT, DELETE)
   - `app/api/actas-gd/[id]/aprobar/route.ts` (POST — aprobación por persona)
   - Authz: aprobar actas requiere ser miembro de directiva vigente

2. **API routes para Períodos de Directiva:**
   - `app/api/periodos-directiva/route.ts` (ya existe de Fase 0, extender si falta)
   - `app/api/periodos-directiva/[id]/route.ts` (GET, PUT, DELETE)
   - `app/api/periodos-directiva/[id]/cerrar/route.ts` (POST — cierra período, archiva nómina)
   - Validación: art. 17 Ley 21.442 — duración ≤ 36 meses.

3. **API routes para Controles de Propiedad (AD):**
   - `app/api/controles-propiedad/route.ts`
   - `app/api/controles-propiedad/[id]/route.ts`

4. **Hooks de cliente:**
   - `lib/api/use-actas-gd.ts`
   - `lib/api/use-periodos-directiva.ts`
   - `lib/api/use-controles-propiedad.ts`

5. **Adaptar UI:**
   - Páginas de `/admin/directiva/*`
   - FormularioGobernanza y ficha de perfil
   - `/admin/gestion` (controles de propiedad)

6. **Tests con validación en DB real:**
   - Crear acta → assert en Prisma
   - Crear período → assert en Prisma
   - Cerrar período → assert que estado cambia a "cerrado" y nómina se congela

**Criterios de aceptación:**
- `tsc` 0, tests verdes.
- Actas y períodos persisten en `dev.db`.
- Quórum por período funciona correctamente (lee desde Prisma).
- Commitear.
```

─────────────────────────────────────────────── hasta aquí

---

### PROMPT FASE 3 — FI (Finanzas completo) + EF (Estructura Física)

Copiar desde aquí ────────────────────────────────────────────

```
Sos el arquitecto senior de Compass. Las Fases 0-2 migraron MP, VU, maestros, GD y AD. Ahora toca el módulo más complejo: **FI (Finanzas y Morosidad)** y **EF (Estructura Física)**.

**Contexto:**
- FI ya tiene espejo parcial a BD (`POST /api/fi/sync` para ingresos). Pero la UI sigue leyendo/escribiendo todo desde el store.
- `prisma/schema.prisma` tiene: `FondoFI`, `EgresoFI`, `IngresoFI`, `EmisionGC`, `CobroFI`, `TipoUnidad`, `MacroSector`, `MicroSector`, `Unidad`.
- El punto cero financiero (2023-2024) vive como seed en el store (`punto-cero-2324.json`).
- Hay 182 egresos históricos y 44 ingresos que deben migrarse a Prisma.

**Tareas:**

1. **Completar espejo FI en BD:**
   - `POST /api/fi/sync` ya existe para ingresos. Extender para: `fondosFI`, `egresosFI`, `emisionesGC`, `cobrosFI`.
   - O mejor: crear endpoints REST individuales por entidad (más limpio que sync batch):
     - `app/api/fondos-fi/route.ts`
     - `app/api/egresos-fi/route.ts`
     - `app/api/emisiones-gc/route.ts`
     - `app/api/cobros-fi/route.ts`

2. **API routes para EF:**
   - `app/api/tipos-unidad/route.ts`
   - `app/api/macro-sectores/route.ts`
   - `app/api/micro-sectores/route.ts`
   - `app/api/unidades/route.ts`
   - Validar integridad: no borrar tipo si tiene unidades, etc.

3. **Migrar punto cero a Prisma:**
   - Script `scripts/migrate-punto-cero-a-db.ts` que lea `punto-cero-2324.json` y haga upsert idempotente en Prisma.
   - El script debe ser idempotente (correr 2× no duplica).

4. **Hooks de cliente:**
   - `lib/api/use-fi-*.ts` (uno por entidad)
   - `lib/api/use-ef-*.ts`

5. **Adaptar UI:**
   - `/finanzas/*` — todo el módulo FI
   - `/admin/estructura/*` — todo el módulo EF

6. **Tests:**
   - Validar que egresos/ingresos quedan en Prisma.
   - Validar que el punto cero migra correctamente.
   - Validar que `emitirGastoComun` crea registros en `EmisionGC` y `CobroFI` en Prisma.

**Criterios de aceptación:**
- `tsc` 0, tests verdes.
- Punto cero migrado a `dev.db`.
- Todo el flujo de finanzas lee/escribe en Prisma.
- Commitear.
```

─────────────────────────────────────────────── hasta aquí

---

### PROMPT FASE 4 — Operativos (PE, RA, CV, CO, GE, IR, IN, MT)

Copiar desde aquí ────────────────────────────────────────────

```
Sos el arquitecto senior de Compass. Las Fases 0-3 migraron los módulos raíz (MP, VU, GD, FI, EF). Ahora tocan los **módulos operativos de alta frecuencia**.

**Contexto:**
- Estos módulos generan muchos writes (bitácoras, reservas, mensajes).
- Prisma ya tiene todos los modelos.
- El patrón REST + SWR + scoping por comunidadId ya está establecido.

**Módulos a migrar (en este orden):**

1. **PE (Personal y Servicios)** — bitácora visitas, encomiendas, ingresos contratistas, proveedores, mantenciones, visitas técnicas, cierres turno, proyecciones.
2. **RA (Reservas y Amenities)** — elementos, reservas.
3. **CV (Visor de Mensajes)** — avisos, plantillas.
4. **CO (Comunicación con Vecinos)** — plantillas, envíos, mensajes buzón, documentos.
5. **GE (Gestión de Solicitudes)** — solicitudes.
6. **IR (Inventario y Recursos)** — activos, solicitudes insumo, entregas EPP.
7. **IN (Infracciones y Multas)** — tipos, infracciones.
8. **MT (Mantenimiento y Proyectos)** — trabajos, proyectos.

**Tareas por módulo (patrón repetible):**

1. Crear `app/api/{modulo}/route.ts` y `[id]/route.ts`.
2. Crear `lib/api/use-{modulo}.ts` (hook SWR).
3. Adaptar las páginas del módulo para usar la API.
4. Tests que validen persistencia en Prisma.

**Notas especiales:**
- **PE**: las bitácoras de visita y encomiendas son de alta frecuencia. Considerar batch insert si hay muchos registros.
- **RA**: las reservas tienen conflictos de concurrencia (dos personas reservando el mismo horario). Usar `updateMany` con condición de estado.
- **CO**: los envíos masivos pueden ser pesados. Considerar paginación en GET.

**Criterios de aceptación:**
- `tsc` 0, tests verdes.
- Cada módulo verificable con `npx prisma studio`.
- Commitear por módulo o al final de la fase.
```

─────────────────────────────────────────────── hasta aquí

---

### PROMPT FASE 5 — Reportería, Configuración, Certificados + Deprecación Store

Copiar desde aquí ────────────────────────────────────────────

```
Sos el arquitecto senior de Compass. Las Fases 0-4 migraron todo el dominio a persistencia servidora. Esta fase final hace tres cosas:

1. Migra los módulos restantes: RE, CF, CT.
2. Migra las notificaciones.
3. **Depreca el store monolito** como fuente de verdad.

**Contexto:**
- `lib/store.ts` tiene ~8.600 líneas. Todas las acciones de dominio ya no se usan (las fases 0-4 reemplazaron las páginas).
- El store debe reducirse a:
  - Estado de UI (modales abiertos, filtros activos, vista seleccionada)
  - Caché offline transitoria (SWR ya hace esto, así que puede eliminarse)
  - Buffer de auditoría antes del sync batch (opcional)

**Tareas:**

1. **API routes para módulos restantes:**
   - `app/api/reportes-re/route.ts`
   - `app/api/configuracion/route.ts` (ya existe en Prisma como `ConfiguracionGlobal`)
   - `app/api/certificados-ct/route.ts`
   - `app/api/notificaciones/route.ts`

2. **Deprecación del store monolito:**
   - Crear `lib/store-ui.ts` — nuevo store zustand que SOLO tenga estado de UI (sin persist, o con persist muy ligero).
   - Migrar las páginas que usan el store para UI pura al nuevo store.
   - Marcar como `@deprecated` todas las acciones de dominio en `lib/store.ts`.
   - Documentar en comentario: "Estas acciones quedan como fallback legacy. No usar en código nuevo."

3. **Eliminar migraciones de dominio del store:**
   - `STORE_VERSION` deja de migrar datos de dominio.
   - Las funciones `migrateV*` que transforman colecciones de dominio se marcan como legacy.

4. **Actualizar especificaciones NSGC:**
   - Reescribir `Data/NSGC/docs/especificaciones/ST - Capa de Datos Persistente.md` para reflejar que la fuente de verdad es Prisma/Servidor.
   - Actualizar el bloque "🔌 Datos" en los 23 specs de módulo para que referencien la API REST, no ST-localStorage.

5. **Tests finales:**
   - Suite completa: unit + e2e.
   - Verificar que NINGÚN test nuevo dependa de localStorage para validar persistencia.
   - Verificar que `localStorage.getItem('compass-store')` no contenga datos de dominio (solo estado de UI si aplica).

6. **Script de verificación:**
   - `scripts/verificar-persistencia-db.ts` — script que:
     - Crea una persona vía API
     - Verifica que existe en Prisma
     - Borra localStorage
     - Recarga página
     - Verifica que la persona sigue visible (porque vino del servidor)

**Criterios de aceptación:**
- `tsc` 0, tests verdes (unit + e2e).
- `lib/store.ts` reducido a < 1.000 líneas (o documentado como legacy).
- Ningún dato de dominio nuevo va a localStorage.
- Todos los specs NSGC actualizados.
- Commitear.
- **ARCHIVAR** este change en openspec.
```

─────────────────────────────────────────────── hasta aquí

---

## 5. Checklist de validación cruzada (aplica a todas las fases)

### Por cada API route creada:
- [ ] `comunidadId` viene de la sesión, nunca del body/query.
- [ ] Body validado con Zod.
- [ ] Authz check con `puedeContextual()` o similar.
- [ ] Prisma query tiene `where: { comunidadId }`.
- [ ] Manejo de errores (404, 409 conflicto, 403, 500).
- [ ] Idempotencia en POST (upsert por `id` o manejo de conflicto).

### Por cada test creado:
- [ ] El test usa la API real (no solo el store).
- [ ] El assert verifica en Prisma que el dato existe (`prisma.modelo.findUnique`).
- [ ] El test no pasa si localStorage está vacío (demuestra que la fuente es la BD).

### Por cada página adaptada:
- [ ] Usa el hook SWR, no `useStore`.
- [ ] Muestra skeleton mientras carga (patrón existente).
- [ ] Maneja errores de red.

---

## 6. Bitácora de ejecución (actualizar después de cada fase)

| Fase | Estado | Commit | Tests | Notas |
|---|---|---|---|---|
| 0 — Infra | ⏳ PENDIENTE | | | |
| 1 — MP + Maestros | ✅ HECHA | Ver commit actual | 21/21 pass | API routes + hooks + UI adaptada; tsc 0 errores |
| 2 — GD + AD | ⏳ PENDIENTE | | | |
| 3 — FI + EF | ⏳ PENDIENTE | | | |
| 4 — Operativos | ⏳ PENDIENTE | | | |
| 5 — RE/CF/CT + Deprecación | ⏳ PENDIENTE | | | |

---

## 7. Notas sobre gentle-ai y subagentes

Esta serie está diseñada para correrse con el arnés **gentle-ai** de Pi. En cada fase:

- El **orquestador** (esta ventana / el humano) decide el orden y valida entregas.
- Los **trabajadores** pueden ser subagentes si una fase excede 4 archivos:
  - Fase 4 (operativos) tiene 8 módulos. Se puede delegar cada módulo a un subagente worker en paralelo, siempre que no toquen los mismos archivos.
  - Fase 1 (MP) es secuencial y sensible; mejor en una sola ventana.
- **Verificación**: después de cada fase, correr `npm test` y `npx prisma studio` para validar visualmente que los datos están en la BD.

---

## 8. Documentos a actualizar (post-serie)

| Documento | Cambio |
|---|---|
| `Data/NSGC/docs/especificaciones/ST - Capa de Datos Persistente.md` | Reescribir: fuente de verdad = Prisma/Servidor |
| `Data/NSGC/docs/especificaciones/*.md` (23 módulos) | Actualizar bloque "🔌 Datos" a referencia API REST |
| `docs/12 - Chuleta de Comandos de Flujo.md` | Agregar comandos de validación DB |
| `openspec/BACKLOG-100.md` | Marcar esta serie como completa |

---

*Fin del plan. Empezar con Fase 0.*
