# Design: Store Split Fase 2 — Slices hoja

## Estructura de archivos

```text
lib/store/
  store.ts              # Store principal (combina slices)
  helpers.ts            # Helpers transversales (Fase 1)
  slices/
    ir-slice.ts         # Inventario y Recursos
    mt-slice.ts         # Mantenimiento y Proyectos
    ad-slice.ts         # Gestión Administrativa
    pi-slice.ts         # Portal Inmobiliario
    co-slice.ts         # Comunicación Vecinos
    ge-slice.ts         # Gestión de Solicitudes
    cv-slice.ts         # Visor de Mensajes
```

## Patrón zustand slices

Cada slice exporta:
- `interface SliceState` — estado + acciones del dominio
- `const sliceName: StateCreator<CompassStore, [], [], SliceState>`

El store principal combina con spread:

```typescript
export const useCompassStore = create<CompassStore>()(
  persist(
    (...a) => ({
      ...coreSlice(...a),
      ...irSlice(...a),
      ...mtSlice(...a),
      ...adSlice(...a),
      ...piSlice(...a),
      ...coSlice(...a),
      ...geSlice(...a),
      ...cvSlice(...a),
      // Fase 3 slices (con escrituras cruzadas)
      ...inSlice(...a),
      ...raSlice(...a),
      ...fiSlice(...a),
      ...peSlice(...a),
      ...plSlice(...a),
      ...ctSlice(...a),
      ...reSlice(...a),
      // Infra
      ...seedSlice(...a),
      ...migrateSlice(...a),
      ...persistSlice(...a),
    }),
    { name: "compass-store", version: STORE_VERSION }
  )
)
```

## Orden de extracción (recomendado)

1. **IR** (primero) — dominio puro, sin lecturas cruzadas hacia fuera, bien testeado.
2. **MT** — similar a IR, puro.
3. **AD** — tiene `publicarActaEnCV` que escribe en CV, pero la acción vive en AD.
   En Fase 2, AD puede mutar `avisosCV` directamente (mismo `set`).
4. **PI/D3** — lee de VU pero no escribe en otros slices.
5. **CO** — lee de MP/EF para resolver destinatarios.
6. **GE** — simple, pocas acciones.
7. **CV** — recibe escritura de AD, pero las acciones propias son puras.

## Dependencias entre slices (lecturas)

```text
CO → MP/EF (resolver destinatarios)
PI → VU (unidades para publicaciones)
AD → CV (publicarActaEnCV escribe avisos)
IN → FI (aplicarInfraccionIN crea cobro)
RA → FI (reserva genera cobro)
PE → MT, FI (tareas y cobros)
FI → GD (retirarFondoFI lee actas)
```

En Fase 2, las lecturas cruzadas (`get().otroSlice`) están permitidas.
Las escrituras cruzadas (`set({ otroSlice: ... })`) van a Fase 3.

## Verificación por slice

Para cada slice extraído:
1. `tsc --noEmit` → 0 errores
2. `npm test -- test/store-<dominio>.test.ts` → verde
3. `npm run test:e2e -- e2e/crud/<dominio>.spec.ts` → verde
4. Migración v27 con backup: abrir app en navegador, verificar datos intactos

## Rollback

Si un slice rompe:
1. Revertir el commit del slice
2. Restaurar backup de localStorage
3. El store monolito sigue funcionando (commits independientes por slice)
