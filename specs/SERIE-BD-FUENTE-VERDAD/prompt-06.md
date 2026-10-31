> **Este archivo ES tu prompt.** Ventana 5B de la serie SERIE-BD-FUENTE-VERDAD.
> Léelo completo (incluido `openspec/SERIE-BD-FUENTE-VERDAD/00-plan.md` de la serie) y ejecuta sus bloques en orden.

---

## Contexto común (válido para TODA la serie BD-FUENTE-VERDAD)

- **Estado previo**: Fases 0–4 ✅ HECHAS. Ventana 5A (la anterior) debe haber creado:
  - API routes: `reportes-re`, `configuracion`, `certificados-ct`, `notificaciones`
  - Hooks: `use-reportes-re.ts`, `use-configuracion.ts`, `use-certificados-ct.ts`, `use-notificaciones.ts`
  - `lib/store-ui.ts` con estado de UI puro
  - `@deprecated` en acciones de dominio de `lib/store.ts`
- **STORE_VERSION**: 28 en `apps/web/lib/store.ts` (congelado, ya no migra dominio).
- **UI_STORE_VERSION**: 1 en `lib/store-ui.ts`.
- **Tests baseline**: 774+ passed + 14 skipped, 0 fallos (pre-5A). tsc 0 errores.
- **Monorepo**: `k0mp4ss_fe/` (app en `apps/web`, UI en `packages/ui`). Workdir para comandos: `cd k0mp4ss_fe/apps/web`.
- **Stack**: Next.js 16 App Router, TypeScript estricto, Prisma (SQLite dev / PostgreSQL prod), Auth.js credentials, Tailwind v4 + shadcn/ui, zustand persist.
- **Patrón API**: `lib/api/crud-factory.ts` + `lib/api/with-comunidad-scope.ts` + `lib/api/use-crud-collection.ts`.
- **Terminología**: "comunidad" (jamás "condominio").
- **Método del proyecto**: por cada cambio → openspec-propose → implementar con openspec-apply-change → validar → commitear (conventional español) → sincronizar specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de cualquier push.
- **Reglas permanentes**: dato de dominio solo vía API REST; mocks de `data/` son solo seed; secretos jamás en localStorage ni código.
- **Verificación por ventana**: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores) && npm test (suite completa verde) + openspec validate --all` sin fallos.
- `next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
- No commitear `Untitled.md`. Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en `openspec/SERIE-BD-FUENTE-VERDAD/00-plan.md`.

---

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` (tree limpio) y `git status -sb` (sin "ahead": todo pusheado) y `git log --oneline -8`.
2. `openspec validate --all` → sin fallos.
3. `cd k0mp4ss_fe/apps/web && npm test` → suite completa verde.
4. Contrasta con `openspec/SERIE-BD-FUENTE-VERDAD/00-plan.md`:
   - Fila 5A HECHA y todo OK → marca tu fila (5B) EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero (change fix pequeño + test), anótalo en la Bitácora, y solo después empieza tu alcance.
   - PARCIAL o repo a medias → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

---

## Alcance de esta ventana (5B)

### Objetivo
Completar la serie: actualizar specs NSGC, tests finales, script de verificación, y archivo.

### 1. Migrar páginas de UI pura a `store-ui.ts`

Buscar en todo el proyecto (`apps/web/`) dónde se usa `useStore` para cosas que NO son datos de dominio:
- Modales abiertos/cerrados
- Filtros de tabla
- Vista seleccionada (grilla vs lista)
- Estado de sidebar
- Toasts / notificaciones transientes

Migrar esos usos a `lib/store-ui.ts`. Las páginas que aún usan `useStore` para datos de dominio se dejan como están (ya están marcadas @deprecated en 5A).

**Criterio**: si una página importa `useStore` solo para `modalAbierto`, `filtrosActivos`, `vistaSeleccionada`, `sidebarExpandido`, o `toasts`, migrarla a `store-ui.ts`. Si además lee datos de dominio del store, dejarla como está (es legacy, la deprecación ya está marcada).

### 2. Actualizar especificaciones NSGC

**A. Reescribir `Data/NSGC/docs/especificaciones/ST - Capa de Datos Persistente.md`**

Nueva introducción:
> "La fuente de verdad de Compass es la base de datos (Prisma/SQLite en dev, PostgreSQL/Neon en prod). Toda operación de escritura pasa por API Routes de Next.js App Router."

- Eliminar o deprecar la sección que dice que la persistencia vive en localStorage.
- Agregar sección "Arquitectura de datos" con diagrama conceptual:
  ```
  UI Component → SWR Hook (use-*.ts) → API Route (app/api/*/route.ts) → Prisma Client → BD
  ```
- Documentar que `lib/store-ui.ts` es el único store zustand permitido para estado de UI (modales, filtros, vistas).
- Documentar que `lib/store.ts` está legacy y sus acciones de dominio están `@deprecated`.

**B. Actualizar el bloque "🔌 Datos" en los 23 specs de módulo**

Cambiar de:
> "Este módulo persiste en la capa de datos (ST) — ver ST - Capa de Datos Persistente."

A:
> "Este módulo persiste en la base de datos vía API REST; ver endpoints `/api/{modulo}`. La fuente de verdad es Prisma/Servidor."

Los 23 módulos son: AD, AM, AU, CF, CO, CT, CV, EF, FI, GD, GE, IN, IR, MA, MP, MT, PE, PL, RA, RE, ST, VU.

Hacer esto con un script automatizado (sed/awk/Node) si es posible, para no tocar 23 archivos a mano. Documentar en la bitácora si usaste script.

### 3. Tests finales

**Suite completa:**
```bash
cd k0mp4ss_fe/apps/web
npx tsc --noEmit
npm test
npm run test:e2e
```

Verificar:
- NINGÚN test nuevo dependa de `localStorage` para validar persistencia.
- `localStorage.getItem('compass-store')` no contenga datos de dominio (puede contener estado de UI si `store-ui.ts` se persiste).

**Si hay tests fallando por dependencia de localStorage:**
- Reemplazar asserts que leen `localStorage` por asserts que leen de Prisma (`prisma.modelo.findMany()`).
- O marcar el test como `@deprecated` si es un test de legacy del store.

### 4. Script de verificación

Crear `scripts/verificar-persistencia-db.ts`:

```typescript
/**
 * Script de verificación: la fuente de verdad es la base de datos, no localStorage.
 *
 * Pasos:
 * 1. Crea una persona vía API (simulado o con fetch real si hay servidor corriendo).
 * 2. Verifica que existe en Prisma.
 * 3. Borra localStorage (simulado: key 'compass-store').
 * 4. Simula recarga: lee la persona desde Prisma directamente.
 * 5. Verifica que la persona sigue visible (porque vino del servidor).
 */
```

Como es un script de Node, puede usar `prisma.$queryRaw` o `prisma.persona.findMany()` directamente. No necesita un servidor corriendo si usa Prisma client directamente.

El script debe:
- Correr con `npx tsx scripts/verificar-persistencia-db.ts` (o `ts-node`).
- Salir con código 0 si pasa, 1 si falla.
- Imprimir un resumen claro.

### 5. Commitear y archivar

**Commit:** `feat(docs,tests): Fase 5B BD-FUENTE-VERDAD — specs NSGC, tests finales, script verificación`

**Archivar el change en openspec:**
- Crear el change en `openspec/changes/` con el nombre que corresponda (ej. `bd-fuente-verdad-fase5/`).
- Proponer → aplicar → validar → archivar.

**Actualizar `openspec/SERIE-BD-FUENTE-VERDAD/00-plan.md`:**
- Marcar fila 5A como ✅ HECHA (con hash del commit).
- Marcar fila 5B como ✅ HECHA (con hash del commit).

**Actualizar `openspec/BACKLOG-100.md`:**
- Marcar la serie SERIE-BD-FUENTE-VERDAD como completa.

### 6. Mensaje final al humano

Al terminar, decir:
> "SERIE-BD-FUENTE-VERDAD completa. La fuente de verdad ahora es la base de datos."

---

## Criterios de aceptación

- [ ] `tsc` 0 errores.
- [ ] Tests verdes (unit + e2e).
- [ ] Ningún dato de dominio nuevo va a localStorage.
- [ ] `ST - Capa de Datos Persistente.md` reescrito con arquitectura de datos.
- [ ] Bloque "🔌 Datos" actualizado en los 23 specs de módulo.
- [ ] Script `scripts/verificar-persistencia-db.ts` pasa.
- [ ] Change archivado en openspec.
- [ ] `openspec/BACKLOG-100.md` actualizado.
- [ ] Commitear.

---

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. **Ventana y estado**: HECHA / PARCIAL + motivo.
2. **Commits**: hash + subject. ¿Push sí/no?
3. **Specs creadas/modificadas + changes archivados**.
4. **Números**: STORE_VERSION, UI_STORE_VERSION, tests X/Y, tsc/eslint OK, specs NSGC actualizados count.
5. **Desviaciones vs el prompt**.
6. **Pendientes heredados** (si hay).
7. **Última línea exacta**: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
