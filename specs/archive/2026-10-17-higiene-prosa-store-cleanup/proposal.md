# Proposal: higiene-prosa-store-cleanup — prosa de specs al estado actual

## Problema

`store-cleanup` (P1 de SERIE-NOCHE-3) podó 28 acciones del store legacy `@deprecated` sin
consumidores (2 muertas + 26 solo-test). La poda fue correcta, pero dejó **deriva de prosa** en
las specs vivas: varios requirements describen su mecanismo de mutación nombrando acciones que ya
no existen (`saveConfiguracion`, `registrarIngresoFI`, `removeProyectoMT`, etc.), algunas veces
dentro de escenarios y pasos `WHEN`. El estado real es la API REST server-side
(`app/api/**` + hooks `lib/api/use-*`), con el store legacy exponiendo solo miembros vivos.

Además, el evento AM `CF_UPDATE_PARAM` quedó **sin emisor**: su único emisor era
`saveConfiguracion` y la ruta `app/api/configuracion/route.ts` no lo emite. Es un gap
**preexistente** de la migración CF→API (registrado en `openspec/BACKLOG-100.md:277`).

## Propuesta

1. Reescribir la prosa de las specs vivas afectadas al estado actual: nombrar la API REST
   server-side (colección + `/[id]`) donde corresponde, conservando las acciones de store que
   siguen vivas. Sin notas históricas en el cuerpo: la spec viva describe el estado actual.
2. Un delta `MODIFIED` por cada requirement tocado, con **todos** sus escenarios vivos y sus
   nombres exactos (trampa 1 de `openspec/CONVENCION-DELTAS.md`).
3. `CF_UPDATE_PARAM`: **no se cablea emisión**. La ruta `app/api/configuracion/route.ts` existe
   pero no emite el evento, y el proyecto no tiene emisor AM server-side (los eventos AM se
   registran en el store cliente y se sincronizan por `/api/auditoria/sync`): cablearlo sería
   comportamiento nuevo fuera del alcance de una ventana documental. Queda **declarado como deuda**
   con la referencia exacta (`app/api/configuracion/route.ts` PUT + `openspec/BACKLOG-100.md:277` +
   el requirement de `ST-capa-datos-persistente`).
4. Manuales NSGC (4) por `nsgc-prepush` (prosa, sin cambiar comportamiento ni estructura) +
   Trazabilidad si cambia un estado.

## No-objetivos

- Cambios de comportamiento, de runtime, de esquema Prisma o del shape persistido
  (`STORE_VERSION = 28` congelado).
- Re-baselinear los pisos de cobertura.
- Certificación de los emisores AM de cada evento (la observación de otros eventos sin emisor
  server-side se registra como deuda en el avance, no se resuelve acá).

## Capabilities

### New Capabilities
- (ninguna)

### Modified Capabilities
13 capacidades con prosa que nombraba acciones podadas: `CF-configuracion-global`,
`CO-comunicacion-vecinos`, `CV-visor-mensajes`, `FI-finanzas-morosidad`, `GD-gestion-directiva`,
`IN-infracciones-multas`, `IR-inventario-recursos`, `MT-mantenimiento-proyectos`,
`PE-personal-servicios`, `PI-portal-inmobiliario`, `PL-liquidaciones-remuneraciones`,
`RA-reservas-amenities` y `ST-capa-datos-persistente` (requirement de `CF_UPDATE_PARAM`).

## Impact

- `openspec/specs/**` (prosa) + este change. Sin impacto en `k0mp4ss_fe/**`, Prisma, cobertura ni
  runtime. `openspec validate --all` sin fallos y `check-delta-coverage` en 0.
