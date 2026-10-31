# Proposal: am-emisores-1

## Contexto

Al podar las acciones del store cliente en `store-cleanup` (noche-3, P1) quedaron eventos AM
**sin emisor server-side**. El censo del cierre de `deuda-1` (P6) los dejó declarados como deuda:

- `CF_UPDATE_PARAM`: la persistencia de CF corre server-side en `PUT /api/configuracion`
  (`app/api/configuracion/route.ts`) y la ruta **no emite** el evento; la acción cliente que lo
  emitía fue podada.
- `FI_INGRESO_REGISTRADO`: **0 referencias** en el código. El POST de `app/api/ingresos-fi` persiste
  el ingreso pero no audita.
- `GD_PERIODO_REGISTRADO`: **0 referencias** en el código. El POST de `app/api/periodos-directiva`
  registra el período pero no audita.

Decisión del owner (registrada en `openspec/SERIE-DEUDA-2/00-plan.md`): implementar los seis
emisores faltantes; esta ventana cubre los **tres primeros**.

Hallazgo de esta ventana: los specs vivos de `FI-finanzas-morosidad` y `GD-gestion-directiva` **ya
exigen** la emisión (`FI-finanzas-morosidad:100` y `GD-gestion-directiva:131` describen el POST con
el evento como estado actual), así que el código estaba en mora respecto de su spec y **no hay delta
que aplicar en esas dos capacidades**. `ST-capa-datos-persistente` y `CF-configuracion-global`, en
cambio, declaran el gap en prosa normativa: esos dos requirements sí se modifican aquí.

## Objetivo

Emitir los tres eventos con el patrón que el proyecto ya usa en 13 rutas
(`prisma.eventoAuditoria.create` con `generarId("ev")`, `comunidadId` y `usuario` del scope,
`timestamp` ISO, `categoria`, `tipoAccion`, `referenciaId` y `descripcion`), sin introducir helpers
nuevos ni tocar el shape persistido (`STORE_VERSION = 28` intacto).

1. `CF_UPDATE_PARAM` en `PUT /api/configuracion`: emitir **solo** cuando cambien los parámetros
   legales de remuneraciones (`ufMensual`, `ingresoMinimoMensual`, `topeGratificacionLegal`,
   `tasaSIS`), con **old/new** en la descripción (categoría `CF`, referencia a la fila de CF).
2. `FI_INGRESO_REGISTRADO` en `POST /api/ingresos-fi`: emitir tras el upsert exitoso (categoría
   `FI`, referencia al ingreso).
3. `GD_PERIODO_REGISTRADO` en `POST /api/periodos-directiva`: emitir tras el upsert exitoso
   (categoría `GD`, referencia al período).

## Alcance

1. `k0mp4ss_fe/apps/web/app/api/configuracion/route.ts` (emisión con old/new).
2. `k0mp4ss_fe/apps/web/app/api/ingresos-fi/route.ts` (emisión en el POST).
3. `k0mp4ss_fe/apps/web/app/api/periodos-directiva/route.ts` (emisión en el POST).
4. Tests de integración en `test/api/` que afirman la creación del evento con `categoria` y
   `tipoAccion` correctos **y la ausencia de evento cuando la operación falla** (400/403).
5. `Data/NSGC/docs/avances/**` (avance de la ventana) y `openspec/SERIE-DEUDA-2/00-plan.md`
   (fila D2 + Bitácora).

## No-alcance

- Los otros tres emisores (`IR_ASSET_REPAIR`, `CO_DOC_DOWNLOAD`, `PE_CIERRE_EDITADO`): van en D3.
- `openspec/BACKLOG-100.md`: la fila de deuda de `CF_UPDATE_PARAM` la cierra el orquestador (fuera de
  los archivos de esta ventana).
- Pisos de cobertura, `STORE_VERSION`, shape persistido y `prisma/dev.db`.

## Riesgos

- **Auditoría que bloquea la escritura**: si el `create` del evento falla dentro del mismo `try` de
  la mutación, la respuesta es 500 con la mutación ya persistida. Se sigue el patrón ya vigente en
  `app/api/personas` y `app/api/mis-datos`: la emisión va en su propio `try/catch` con log, de modo
  que la auditoría nunca revierte ni rompe la operación.
- **Doble emisión en upserts idempotentes**: `POST` de FI y GD emiten también cuando el rail es
  "update" del mismo id (cada escritura queda auditada). `CF_UPDATE_PARAM` es la excepción: se emite
  por **delta real** de los cuatro parámetros legales.
