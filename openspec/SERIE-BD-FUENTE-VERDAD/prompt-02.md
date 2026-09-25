# FASE 2 — GD (Gobernanza + Directiva) + AD (Administración)

> Copiar TODO este archivo y pegarlo en una ventana de chat nueva.  
> Modelo recomendado: **Muse Spark 1.3** (fase autocontenida, contexto moderado).  
> Trabajo estimado: 1 ventana.

---

## Contexto

Sos el arquitecto senior de Compass. Las Fases 0-1 construyeron infraestructura y migraron MP/VU + maestros a persistencia servidora.

Ahora toca **GD (Gestión de Directiva)** y **AD (Gestión Administrativa)**.

**Datos clave:**
- `lib/store.ts` tiene: `saveActaGD`, `removeActaGD`, `aprobarActaGD`, `savePeriodoDirectiva`, `saveControlPropiedad`.
- `prisma/schema.prisma` tiene modelos: `ActaGD`, `ControlPropiedad`.
- `PeriodoDirectiva` fue agregado en Prisma en la Fase 0.
- La UI tiene formularios de gobernanza recién construidos (FormularioGobernanza, ficha de perfil con cargo/asunción/firma).
- Terminología: "comunidad" (jamás "condominio").
- No tocar `.env*`.

**Antes de empezar, leé:**
1. `openspec/SERIE-BD-FUENTE-VERDAD/00-plan.md`
2. `apps/web/prisma/schema.prisma` (modelos ActaGD, ControlPropiedad, PeriodoDirectiva)
3. `apps/web/lib/schemas.ts` (ActaGDSchema, PeriodoDirectivaSchema)
4. `apps/web/lib/store.ts` (buscá saveActaGD, savePeriodoDirectiva para ver lógica actual)
5. `apps/web/lib/authz.ts`

---

## Tareas

### 1. API routes para Actas GD

Crear:
- `app/api/actas-gd/route.ts`
  - GET: lista paginada scoped por comunidad
  - POST: upsert idempotente por `id`. Validar con `ActaGDSchema`.
- `app/api/actas-gd/[id]/route.ts`
  - GET: una acta por id
  - PUT: update parcial
  - DELETE: eliminar (validar que estado no sea "publicada")
- `app/api/actas-gd/[id]/aprobar/route.ts`
  - POST: agregar `personaId` al array de `aprobaciones`
  - Validar que la persona sea miembro de la directiva vigente
  - Validar que no apruebe dos veces

Authz:
- Crear/editar actas: admin/directiva
- Aprobar actas: miembro de directiva vigente (usar `esMiembroDirectivaVigente`)
- Ver actas: según configuración (`residenteVeActas` en `ControlPropiedad`)

### 2. API routes para Períodos de Directiva

Crear:
- `app/api/periodos-directiva/route.ts`
  - GET: lista scoped por comunidad
  - POST: crear período. Validar con `PeriodoDirectivaSchema`.
- `app/api/periodos-directiva/[id]/route.ts`
  - GET: un período
  - PUT: update parcial
  - DELETE: eliminar (solo si no hay actas asociadas)
- `app/api/periodos-directiva/[id]/cerrar/route.ts`
  - POST: cambiar estado a "cerrado", archivar nómina en `miembros`
  - Validar que no haya otro período vigente al crear uno nuevo

Validaciones de negocio:
- Art. 17 Ley 21.442: duración ≤ 36 meses.
- Solo un período "vigente" por comunidad.
- Al cerrar, congelar la nómina (no permitir más cambios en `miembros`).

### 3. API routes para Controles de Propiedad (AD)

Crear:
- `app/api/controles-propiedad/route.ts` (GET, POST)
- `app/api/controles-propiedad/[id]/route.ts` (GET, PUT, DELETE)
- Scoping por comunidad
- Authz: admin/directiva puede modificar; residentes solo ver los de su unidad

### 4. Hooks de cliente SWR

Crear:
- `lib/api/use-actas-gd.ts`
- `lib/api/use-periodos-directiva.ts`
- `lib/api/use-controles-propiedad.ts`

### 5. Adaptar UI

Modificar páginas para usar APIs:
- `app/admin/directiva/page.tsx` y subpáginas
- `app/admin/directiva/actas/page.tsx`
- `app/admin/directiva/periodos/page.tsx`
- Componente `FormularioGobernanza` (en ficha de persona)
- `app/admin/gestion/page.tsx` (controles de propiedad)

### 6. Tests con validación en DB real

Crear:
- `test/api/actas-gd.test.ts`
- `test/api/periodos-directiva.test.ts`
- `test/api/controles-propiedad.test.ts`

Validar:
- Crear acta → assert en Prisma
- Crear período → assert en Prisma
- Cerrar período → assert que estado cambia a "cerrado"
- Aprobar acta → assert que `aprobaciones` incluye el personaId

---

## Criterios de aceptación

- [ ] `tsc` 0 errores.
- [ ] Tests verdes.
- [ ] Actas y períodos persisten en `dev.db`.
- [ ] Quórum por período funciona correctamente (lee desde Prisma).
- [ ] Solo un período vigente por comunidad.
- [ ] Commitear.

---

## Al terminar

1. Commitear.
2. Actualizar `openspec/SERIE-BD-FUENTE-VERDAD/00-plan.md`.
3. Decirle al humano: "Fase 2 lista. Pasar a prompt-03.md (FI + EF)."
