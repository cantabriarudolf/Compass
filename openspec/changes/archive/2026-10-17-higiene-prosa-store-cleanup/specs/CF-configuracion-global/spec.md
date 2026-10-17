## MODIFIED Requirements

### Requirement: Persistencia y Auditoría
All changes to Configuración Global MUST be persisted server-side in the `configuracion_global` table via `PUT /api/configuracion` (upsert por `comunidadId`) and remain traceable. La emisión del evento `CF_UPDATE_PARAM` no tiene emisor en el código actual (la ruta `app/api/configuracion/route.ts` no lo emite): el gap está declarado como deuda en `openspec/BACKLOG-100.md:277` y detallado en `ST-capa-datos-persistente`.

#### Scenario: Save Configuration
- **WHEN** the admin clicks "Guardar Cambios"
- **THEN** the configuration MUST be persisted via `PUT /api/configuracion` without `smtpPassword` or `claveEliminacionMaestro`
- **AND** the application header and Sidebar MUST reflect the new identity immediately

#### Scenario: Audit Event
- **WHEN** a configuration value changes
- **THEN** the system MUST emit a `CF_UPDATE_PARAM` event for Auditoría y Métricas (AM) without including secret values

### Requirement: Dependencias de Carga y Seed (ST) - CF Singleton Rank 0

Entidad `CompassData.configuracion` singleton `k0mp4ss_fe/apps/web/lib/store.ts:83`, seed `data/admin/configuracion.ts:49 configuracionDefault` (1 registro). `Rank 0` raíz sin `dependsOn` (paralelo a `MA`). La persistencia y validación server-side corre en `PUT /api/configuracion` (`app/api/configuracion/route.ts`), que aplica `ConfiguracionGlobalSchema` y SHALL validar rangos `diaCortePago 1-31`, `diasMesComercial 28-31`, `jornadaSemanalEstandar 35-48` `CF-configuracion-global:41,81`. `configuracion` es FK blanda para `FI.modoCalculoGC` (`fijo|variable`) y `PE.jornada/CF.claveEliminacionMaestro`.

#### Scenario: CF sin carga bloquea FI/PE
- **WHEN** `FI` intenta `emisión GC` con `configuracion.modoCalculoGC` undefined
- **THEN** validación `ST` reporta `CF no cargado` y `FI_SEED_VALIDATION_FAILED`.

#### Scenario: Validación rangos en save
- **WHEN** `PUT /api/configuracion` recibe `{diaCortePago:99}`
- **THEN** responde 400 con validación `rango 1-31`.

### Requirement: Parámetros Legales Chile para Remuneraciones (implementación)
La configuración global SHALL incluir los campos `ufMensual` (valor UF vigente del mes, positivo), `ingresoMinimoMensual` (positivo), `topeGratificacionLegal` (factor sobre el ingreso mínimo mensual, positivo; estándar 4.75) y `tasaSIS` (porcentaje 0–100) usados por PL. Los cuatro campos son opcionales en el schema para compatibilidad con stores previos, pero su ausencia bloquea la generación de liquidaciones ("CF no cargado"). Su edición queda restringida a administración y todo cambio SHALL auditarse como `CF_UPDATE_PARAM` con old/new.

#### Scenario: Edición desde Parámetros Legales
- **WHEN** la administración actualiza la UF o el tope de gratificación desde `/finanzas/remuneraciones`
- **THEN** `PUT /api/configuracion` persiste el valor; la emisión de `CF_UPDATE_PARAM` (old/new) queda pendiente server-side (gap declarado en `openspec/BACKLOG-100.md:277`)

#### Scenario: Rango inválido rechazado
- **WHEN** se intenta guardar `tasaSIS` fuera de 0–100 o valores negativos
- **THEN** la validación Zod rechaza el guardado con mensaje claro
