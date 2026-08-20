# ES - Estacionamientos — Absorbido en EF (v8)

> ⚠️ **Estado v8:** desde `STORE_VERSION=8` este módulo ya no tiene colección propia `estacionamientos` ni `ubicacionesEstacionamiento`. Los 83 estacionamientos son `unidades` con `tipoUnidadId: tipo-es-1` y `microSectorId` en `est-sup`/`est-sub1`/`est-sub2`/`est-vis` del macrosector `estacionamientos` en [EF - Estructura Física](<EF - Estructura Fisica.md>). La ubicación se resuelve como `microSectores[unidad.microSectorId].nombre`. Ver [ST - Capa de Datos Persistente](<ST - Capa de Datos Persistente.md>) y [MA - Maestros Administrativos](<MA - Maestros Administrativos.md>). El spec histórico se conserva para trazabilidad; el comportamiento CRUD es el de `Unidad`.

## 1. Atributos (mapeados a Unidad v8)
- **Número de Estacionamiento:** `unidades.numero` (ej: `E-001`), `id: u-E-001`.
- **Ubicación:** `microSectores[unidad.microSectorId]` (Superficie, Subterráneo -1/-2, Sector Visitas) — antes `ubicacionesEstacionamiento` de MA, ahora microsector de EF.
- **ID Unidad Principal:** no aplica como FK separada; se vincula vía [VU - Vinculación de Unidades](<VU - Vinculacion Unidades.md>) (`vinculos.unidadId = u-E-*`).
- **Macro-Sector:** `macroSectores.estacionamientos` (Sector Estacionamientos) — permite filtrar y agrupar por torre/sector usando los tabs de EF.
- **Asignado A:** derivado de `vinculos` activos sobre `u-E-*` (ej: "Depto 204 (Torre A)", "Disponible").
- **Estado de Ocupación:** `unidad.estadoId` → `maestros.estadosOcupacion`.
- **Metraje / Prorrateo:** `tipo-es-1` (12.5 m², 0.005) heredado por `tipoUnidadId`.

## 2. Historial de Asignaciones (Trazabilidad)

Reutiliza el historial de [VU - Vinculación de Unidades](<VU - Vinculacion Unidades.md>) §4 (línea de tiempo por `unidadId` + cierre automático de tramos `propietario`/`arrendatario`). Un estacionamiento-unidad cambia de dueño vía `saveVinculo` con `cerrarAnterior`.

## 3. Integración con Auditoría y Métricas (AM)

Eventos y métricas legacy mapeados a VU/EF:
- **Evento:** `ES_ASSIGN_CREATED` → `VU_CHANGE_OWNER`/`VU_NEW_TENANT` sobre `u-E-*`, `ES_ASSIGN_RELEASED` → `VU_ASSIGN_RELEASED`.
- **Data Cuantificable:** plazas ocupadas vs disponibles (conteo de `unidades` con `etiqueta=Estacionamiento` y `vinculos` activos), cambios por periodo.
- **Métrica:** tasa de ocupación, rotación, ingresos por arriendo de estacionamientos (dashboard EF filtrado por `estacionamientos`).
