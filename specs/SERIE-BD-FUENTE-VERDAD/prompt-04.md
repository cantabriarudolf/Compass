# FASE 4 — Operativos (PE, RA, CV, CO, GE, IR, IN, MT)

> Copiar TODO este archivo y pegarlo en una ventana de chat nueva.  
> Modelo recomendado: **Muse Spark 1.3** (módulos autocontenidos, cuota generosa).  
> Trabajo estimado: 2-3 ventanas (se puede dividir por sub-módulos).  
> **Nota:** Esta fase tiene 8 módulos. Si el modelo se ahoga, dividir en sub-fases: 4a (PE+RA), 4b (CV+CO+GE), 4c (IR+IN+MT).

---

## Contexto

Sos el arquitecto senior de Compass. Las Fases 0-3 migraron los módulos raíz (MP, VU, GD, FI, EF).

Ahora tocan los **módulos operativos de alta frecuencia**.

**Datos clave:**
- Estos módulos generan muchos writes (bitácoras, reservas, mensajes).
- Prisma ya tiene todos los modelos.
- El patrón REST + SWR + scoping por comunidadId ya está establecido en Fases 0-3.
- Terminología: "comunidad" (jamás "condominio").
- No tocar `.env*`.

**Antes de empezar, leé:**
1. `openspec/SERIE-BD-FUENTE-VERDAD/00-plan.md`
2. `apps/web/prisma/schema.prisma` (modelos de estos módulos)
3. `apps/web/lib/schemas.ts` (Zod schemas)
4. `apps/web/lib/store.ts` (buscá las acciones de cada módulo)

---

## Módulos a migrar (en este orden)

### 1. PE (Personal y Servicios)

Modelos Prisma: `BitacoraVisitaPE`, `EncomiendaPE`, `IngresoContratistaPE`, `ProveedorPE`, `MantencionPreventivaPE`, `VisitaTecnicaPE`, `CierreTurnoPE`, `ProyeccionPE`

Endpoints:
- `app/api/pe/bitacora-visitas/route.ts`
- `app/api/pe/encomiendas/route.ts`
- `app/api/pe/ingresos-contratistas/route.ts`
- `app/api/pe/proveedores/route.ts`
- `app/api/pe/mantenciones/route.ts`
- `app/api/pe/visitas-tecnicas/route.ts`
- `app/api/pe/cierres-turno/route.ts`
- `app/api/pe/proyecciones/route.ts`

**Nota especial:** PE es de alta frecuencia. Las bitácoras de visita pueden tener muchos registros. Considerar paginación obligatoria en GET.

### 2. RA (Reservas y Amenities)

Modelos Prisma: `ElementoRA`, `ReservaRA`

Endpoints:
- `app/api/ra/elementos/route.ts`
- `app/api/ra/reservas/route.ts`

**Nota especial:** Las reservas tienen conflictos de concurrencia (dos personas reservando el mismo horario). En el POST de reserva:
```typescript
// Patrón de prevención de race condition
const creada = await prisma.reservaRA.createMany({
  data: { ... },
  skipDuplicates: true, // o verificar antes con transacción
})
// O mejor: usar una transacción que verifique que no existe otra reserva
// para el mismo elemento, fecha, horaInicio-horaFin con estado !== "cancelada"
```

### 3. CV (Visor de Mensajes)

Modelos Prisma: `AvisoCV`, `PlantillaCV`

Endpoints:
- `app/api/cv/avisos/route.ts`
- `app/api/cv/plantillas/route.ts`

### 4. CO (Comunicación con Vecinos)

Modelos Prisma: `PlantillaCO`, `EnvioCO`, `MensajeBuzonCO`, `DocumentoCO`

Endpoints:
- `app/api/co/plantillas/route.ts`
- `app/api/co/envios/route.ts`
- `app/api/co/mensajes-buzon/route.ts`
- `app/api/co/documentos/route.ts`

**Nota especial:** Los envíos masivos pueden ser pesados. Paginación obligatoria en GET.

### 5. GE (Gestión de Solicitudes)

Modelo Prisma: `SolicitudGE`

Endpoints:
- `app/api/ge/solicitudes/route.ts`

### 6. IR (Inventario y Recursos)

Modelos Prisma: `RecursoIR`, `SolicitudInsumoIR`, `EntregaEPP`

Endpoints:
- `app/api/ir/recursos/route.ts`
- `app/api/ir/solicitudes-insumo/route.ts`
- `app/api/ir/entregas-epp/route.ts`

### 7. IN (Infracciones y Multas)

Modelos Prisma: `TipoInfraccionIN`, `InfraccionIN`

Endpoints:
- `app/api/in/tipos/route.ts`
- `app/api/in/infracciones/route.ts`

### 8. MT (Mantenimiento y Proyectos)

Modelos Prisma: `TrabajoMT`, `ProyectoMT`

Endpoints:
- `app/api/mt/trabajos/route.ts`
- `app/api/mt/proyectos/route.ts`

---

## Patrón repetible por módulo

Para cada módulo:

1. Crear `app/api/{modulo}/route.ts` (GET lista paginada, POST upsert)
2. Crear `app/api/{modulo}/[id]/route.ts` (GET, PUT, DELETE)
3. Crear `lib/api/use-{modulo}.ts` (hook SWR)
4. Adaptar las páginas del módulo para usar la API
5. Crear `test/api/{modulo}.test.ts` (validar persistencia en DB real)

---

## Criterios de aceptación

- [ ] `tsc` 0 errores.
- [ ] Tests verdes.
- [ ] Cada módulo verificable con `npx prisma studio`.
- [ ] Reservas RA manejan concurrencia correctamente.
- [ ] PE tiene paginación en bitácoras.
- [ ] Commitear (puede ser un commit por módulo o uno al final).

---

## Al terminar

1. Commitear.
2. Actualizar `openspec/SERIE-BD-FUENTE-VERDAD/00-plan.md`.
3. Decirle al humano: "Fase 4 lista. Pasar a prompt-05.md (RE/CF/CT + Deprecación Store)."
