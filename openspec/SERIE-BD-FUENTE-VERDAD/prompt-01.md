# FASE 1 — MP (Personas + Vínculos) + Maestros Administrativos

> Copiar TODO este archivo y pegarlo en una ventana de chat nueva.  
> Modelo recomendado: **Kimi** (necesita entender el grafo completo personas→vínculos→unidades).  
> Trabajo estimado: 1-2 ventanas.

---

## Contexto

Sos el arquitecto senior de Compass. La **Fase 0** se completó: infraestructura compartida lista (factory API, hook SWR, helper de scoping, modelo PeriodoDirectiva en Prisma).

Ahora hay que migrar el módulo más crítico: **Personas y Vínculos (MP/VU)**, porque todo el grafo de dominio depende de ellos. Sin personas en servidor, no hay foreign keys consistentes.

**Datos clave:**
- `lib/store.ts` tiene `savePersona`, `removePersona`, `saveVinculo`, `removeVinculo` que hoy solo escriben en localStorage.
- `prisma/schema.prisma` ya tiene modelos `Persona`, `VinculoUnidad`, y todos los maestros.
- `lib/schemas.ts` tiene Zod schemas para todo.
- `lib/authz.ts` tiene reglas de permisos.
- Terminología: "comunidad" (jamás "condominio").
- No tocar `.env*`, no commitear secrets.

**Antes de empezar, leé:**
1. `openspec/SERIE-BD-FUENTE-VERDAD/00-plan.md`
2. `apps/web/prisma/schema.prisma` (modelos Persona, VinculoUnidad, maestros)
3. `apps/web/lib/schemas.ts` (PersonaSchema, VinculoUnidadSchema)
4. `apps/web/lib/store.ts` (buscá savePersona, saveVinculo para ver las validaciones de negocio actuales)
5. `apps/web/lib/authz.ts`
6. `apps/web/app/api/auditoria/sync/route.ts` (patrón batch idempotente, referencia)

---

## Tareas

### 1. API routes para Personas (MP)

Crear:
- `app/api/personas/route.ts`
  - GET: lista paginada, filtrable por `?q=` (búsqueda en nombre/rut/email), siempre scoped por `comunidadId` desde sesión
  - POST: upsert idempotente por `id`. Validar con `PersonaSchema`.
- `app/api/personas/[id]/route.ts`
  - GET: una persona por id (verificar que pertenezca a la comunidad del usuario)
  - PUT: update parcial
  - DELETE: eliminar (validar que no tenga vínculos activos)

Authz:
- Admin/directiva: CRUD completo
- Residente: solo puede ver sus propios datos (verificar que el `personaId` de la sesión coincida)

Validaciones de negocio (replicar desde `savePersona` del store):
- RUT único por comunidad (no puede haber dos personas con mismo RUT en la misma comunidad)
- Email único por comunidad (opcional, pero recomendado)
- Campos obligatorios según `PersonaSchema`

### 2. API routes para Vínculos (VU)

Crear:
- `app/api/vinculos/route.ts` (GET, POST)
- `app/api/vinculos/[id]/route.ts` (GET, PUT, DELETE)

Validaciones de negocio (replicar desde `saveVinculo` del store):
- La persona vinculada debe existir en la comunidad.
- Una persona con `estadoCuenta: "inactiva"` no puede vincularse.
- No puede existir más de un vínculo activo (sin `fechaFin`) de la misma persona a la misma unidad.
- Los contratos de arriendo (`rol: "arrendatario"`) en la misma unidad no pueden solaparse en fechas.

### 3. API routes para Maestros Administrativos

Opción A (genérica): `app/api/maestros/[tipo]/route.ts`
- `tipo` puede ser: afps, previsiones-salud, mutuales-cajas, feriados, bancos, indices-ajuste, cajas-fondos, categorias-insumos, unidades-medida, contactos-emergencia, condiciones-especiales, estados-ocupacion, categorias-macro, categorias-micro, categorias-unidad, estados-inmobiliarios, asignaciones-familiar, jornadas, couriers, contratistas
- GET: lista scoped por comunidad
- POST: upsert idempotente
- DELETE: eliminar (validar que no esté en uso por otras entidades)

Opción B (separados): Si la opción A se vuelve compleja, crear un endpoint por maestro.

**Validación de integridad al eliminar maestros:**
- No eliminar `EstadoOcupacion` si está usado por algún `VinculoUnidad`.
- No eliminar `CondicionEspecial` si está en `condicionesEspecialesIds` de alguna `Persona`.
- No eliminar `Afp` si está referenciada por alguna `LiquidacionPL`.
- etc.

### 4. Hooks de cliente SWR

Crear:
- `lib/api/use-personas.ts` — wrapper de SWR para personas
- `lib/api/use-vinculos.ts` — wrapper para vínculos
- `lib/api/use-maestros.ts` — wrapper para maestros (genérico por tipo)

Cada hook debe:
- Usar `useSWR` para lectura
- Exponer `create`, `update`, `remove` que hagan `mutate` optimista
- Revalidar después de mutaciones

### 5. Adaptar páginas de UI

Modificar las páginas para que usen los hooks/API en lugar de las acciones del store:

- `app/admin/personas/page.tsx` y componentes hijos
- `app/admin/vinculos/page.tsx` y componentes hijos
- `app/admin/maestros/page.tsx` y componentes hijos
- `app/admin/personas/[id]/page.tsx` (ficha de persona)

**NO borrar las acciones del store todavía.** Solo hacer que la UI prefiera la API. Las acciones del store quedan como fallback legacy.

### 6. Tests con validación en DB real

Crear:
- `test/api/personas.test.ts`
- `test/api/vinculos.test.ts`
- `test/api/maestros.test.ts`

**IMPORTANTE:** Los tests deben validar que los datos quedan en la base de datos REAL (SQLite `dev.db`).

Ejemplo de patrón de test:
```typescript
// Crear persona vía API
const res = await POST('/api/personas', { body: personaPayload })
expect(res.status).toBe(200)

// Verificar en Prisma
const personaEnDb = await prisma.persona.findUnique({ where: { id: personaPayload.id } })
expect(personaEnDb).not.toBeNull()
expect(personaEnDb.nombreCompleto).toBe(personaPayload.nombreCompleto)

// Verificar que NO depende de localStorage
// (limpiar localStorage y verificar que GET sigue devolviendo la persona)
```

---

## Criterios de aceptación

- [ ] `tsc` 0 errores.
- [ ] Todos los tests pasan (unit + e2e existentes + nuevos).
- [ ] Crear una persona desde la UI queda en `dev.db` (verificable con `npx prisma studio`).
- [ ] Crear un vínculo desde la UI queda en `dev.db`.
- [ ] Eliminar un maestro usado bloquea con error apropiado.
- [ ] Commitear al terminar.

---

## Qué NO hacer

- No tocar `lib/store.ts` (quitar acciones es Fase 5).
- No migrar datos históricos todavía.
- No crear WebSockets ni "tiempo real".

---

## Al terminar

1. Commitear.
2. Actualizar `openspec/SERIE-BD-FUENTE-VERDAD/00-plan.md`: marcar Fase 1 como ✅ HECHA.
3. Decirle al humano: "Fase 1 lista. Pasar a prompt-02.md (GD + AD)."
