# Proposal: am-emisores-2

## Contexto

Al podar las acciones del store cliente en `store-cleanup` (noche-3, P1) quedaron eventos AM
**sin emisor server-side**. El censo del cierre de `deuda-1` (P6) los dejó declarados como deuda y
el owner decidió implementar los seis. `am-emisores-1` (D2) cubrió los tres primeros
(`CF_UPDATE_PARAM`, `FI_INGRESO_REGISTRADO`, `GD_PERIODO_REGISTRADO`); esta ventana (D3) cierra los
tres restantes:

- `IR_ASSET_REPAIR`: **0 referencias** en el código. El paso de un activo a Reparación se persiste
  por `PUT /api/ir/recursos/[id]` (`app/api/ir/recursos/[id]/route.ts`, put-merge genérico) y no
  audita.
- `CO_DOC_DOWNLOAD`: **0 referencias** en el código. La apertura/descarga de un documento de la
  biblioteca comunal es `GET /api/co/documentos/[id]` (`app/api/co/documentos/[id]/route.ts`,
  `GET_ONE` de la factory) y no audita. No existe endpoint de descarga propio: el documento es
  metadatos + URL (D1), así que el "abrir el documento" es el GET del detalle.
- `PE_CIERRE_EDITADO`: **0 referencias** en el código. La edición de un cierre ya registrado es
  `PUT /api/pe/cierres-turno/[id]` (`app/api/pe/cierres-turno/[id]/route.ts`, put-merge genérico) y
  no audita.

Hallazgo de esta ventana: los specs vivos de `IR-inventario-recursos` (línea 79-84),
`CO-comunicacion-vecinos` (63-70) y `PE-personal-servicios` (90-102) **ya exigen** las tres
emisiones como estado vigente — el código estaba en mora respecto de su spec. Por eso este change
**no modifica specs** (`skip_specs`), igual que el tramo FI/GD de `am-emisores-1`.

## Objetivo

Emitir los tres eventos con el patrón que el proyecto ya usa en 13+ rutas
(`prisma.eventoAuditoria.create` con `generarId("ev")`, `comunidadId` y `usuario` del scope,
`timestamp` ISO, `categoria`, `tipoAccion`, `referenciaId` y `descripcion`), sin helpers nuevos y sin
tocar el shape persistido (`STORE_VERSION = 28` intacto).

1. `IR_ASSET_REPAIR` en `PUT /api/ir/recursos/[id]`: emitir **solo en la transición real** a
   `estadoActivo = "reparacion"` (no en el re-guardado del mismo estado), categoría `IR`, referencia
   al recurso y descripción con código/nombre.
2. `CO_DOC_DOWNLOAD` en `GET /api/co/documentos/[id]`: emitir tras la lectura autorizada, categoría
   `CO`, referencia al documento y descripción con nombre/tipo MIME/tamaño.
3. `PE_CIERRE_EDITADO` en `PUT /api/pe/cierres-turno/[id]`: emitir tras la actualización exitosa,
   categoría `PE`, referencia al cierre y descripción con el tamaño del historial de cambios.

## Alcance

1. `k0mp4ss_fe/apps/web/app/api/ir/recursos/[id]/route.ts` (emisión en el PUT).
2. `k0mp4ss_fe/apps/web/app/api/co/documentos/[id]/route.ts` (emisión en el GET de detalle).
3. `k0mp4ss_fe/apps/web/app/api/pe/cierres-turno/[id]/route.ts` (emisión en el PUT).
4. Tests de integración en `test/api/` que afirman el evento (categoría/`tipoAccion`/referencia) y
   su **ausencia** en los caminos rojos (400/403/404) y en el re-guardado sin transición.
5. `Data/NSGC/docs/avances/**` (avance de la ventana) y `openspec/SERIE-DEUDA-2/00-plan.md`
   (fila D3 + Bitácora).

## No-alcance

- La baja de un activo IR (`estadoActivo = "baja"`): la spec pide que quede **registrada** (la fila
  lo hace) pero no nombra un evento del catálogo AM; no se inventa nombre. Queda declarado.
- `PE_CIERRE_TURNO` (el POST que crea el cierre) y el resto del catálogo PE/CO/IR ya cubierto.
- Pisos de cobertura, `STORE_VERSION`, shape persistido y `prisma/dev.db`.
- Helpers compartidos (`lib/api/**`): las tres rutas envuelven su handler en el propio `route.ts`.

## Riesgos

- **Auditoría que bloquea la operación**: la emisión va después de la escritura/lectura y en su
  propio `try/catch` con `logger.error`, así que un fallo del log no convierte en 500 una respuesta
  ya resuelta (patrón de `app/api/personas` y `app/api/mis-datos`).
- **Doble lectura del body en el PUT**: los handlers de put-merge consumen el cuerpo; la ruta lo lee
  de un `req.clone()` para decidir si hay transición. El clon se lee antes de delegar y nunca altera
  el request original.
- **GET de detalle como "descarga"**: en CO el documento es metadatos + URL, así que auditar el GET
  del detalle es la única lectura server-side de "abrir un documento". Se documenta en el design y
  el test fija el contrato.
- **Scope duplicado**: las tres rutas resuelven `withComunidadScope()` una vez más tras el éxito del
  handler (para obtener `comunidadId`/`usuario` del evento). Es una lectura de membresía extra sobre
  una operación ya autorizada; no cambia permisos ni respuestas.
