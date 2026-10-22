# SERIE-FASE2 — resto de la deuda del store legacy (modo nocturno autónomo)

> **Protocolo nocturno (owner 2026-10-21)**: la serie corre sin el owner. **Ninguna ventana pregunta
> nada, ni pide push, ni abre PR, ni mergea.** Si un gate falla dos veces o falta una decisión, la
> ventana se marca **BLOQUEADA** con la evidencia exacta y el orquestador sigue con la siguiente.
> Un BLOQUEADO honesto vale más que una invención.

## Rama y commits

- Rama **`fase2/inventario-insumos`** (ya contiene la ventana de IR, cerrada y commiteada).
- Un commit por work-unit, en español, solo los archivos del cambio.
- **Prohibido**: `git push`, `gh`, merge, PR, `openspec archive`, `gentle_review`/RDD.
- Prohibido tocar: `prisma/dev.db` (el dev server lo bloquea), `.env*`, `Data/NSGC/backups/`,
  `lib/store.ts`, `STORE_VERSION` (28).

## Gate por ventana

`npx tsc --noEmit` 0 · `npm run lint` 0 · tests **focalizados** verdes.
**NO correr `npm test` completo** (8 min sin output; el arnés mata al subagente por inactividad a los
4 min). La suite completa la corre el orquestador en background.

## Decisiones fijadas (no reinterpretar; ante duda → BLOQUEADO)

### V2 — Personal (PE): 5 transiciones

`iniciarTurno`, `registrarHoraExtra`, `registrarEvaluacion`, `completarTareaMonitoreo`,
`enviarProyeccionCosto`.

- El **sobretiempo se mide** desde los reportes de turno: se muestra como KPI y se **sugiere** al
  administrador cuando liquida. **No** hay flujo de aprobación separado de hora extra.
- La **proyección de costo es un aviso/métrica, NO un gasto**: no crea egreso FI.
- La **evaluación es histórica e inmutable**: una vez registrada no se edita; se agrega otra.
- Authz: `pe` para conserjería y mantención (`ver/crear/editar`); `pe:cierre_turno` para quien
  inicia/cierra turno (conserjería); admin todo; comité `ver`. Evaluaciones: solo admin.
- Si el modelo no tiene dónde persistir horas extra/evaluaciones → **BLOQUEADO** (no inventar columnas
  sin decirlo).

### V3 — Reportería (RE): snapshot

- **Emitir** congela el informe con fecha, autor y número; el histórico no cambia.
- **Distribuir** = publicarlo en el visor (con permiso) + email opcional. Sin SMTP, el email queda
  como **outbox pendiente**, nunca simulado ni inventado.
- **No existe "tasa de apertura"**. Métrica: emitidos / distribuidos / leídos en la app.
- Authz: admin emite y distribuye; comité `ver` (centro de mando). Residente no.
- El informe se calcula al emitir desde la BD; no se recalcula al abrirlo.

### V4 — Adelantos PL (doctrina DT verificada)

Dos naturalezas, nunca una sola:

- **`anticipo_regular`**: pago anticipado de lo devengado. Se deduce **100% en la liquidación
  siguiente**, **sin tope 15%** (no es descuento art. 58; DT ORD 2676/140).
- **`prestamo` / `deuda`**: exige **acuerdo escrito adjunto** y topa **15% mensual** de la
  remuneración bruta, con **tope conjunto 45%** (art. 58 inc. 3 y 4).
- Si el líquido no alcanza: arrastra saldo al mes siguiente con alerta. Prohibido descontar arriendo,
  luz, agua, herramientas, medicinas, multas no autorizadas ni mermas sin responsabilidad acreditada.
- Modelo: `monto, fechaEntrega, periodoImputacion, pacto, estado {pendiente|descontado_parcial|saldado},
  saldo`; auditoría de creador, aprobador, comprobante y cada deducción ligada a su liquidación.
- Authz: admin. Comité `ver`. No hay auto-servicio del trabajador.

### V5 — Cobranza FI

- Multi-canal: **visor interno + email**. Interruptor **por residente** y **global** de la comunidad.
- Cada envío registra canal, fecha, destinatario y estado (`pendiente|enviado|fallido`). Sin SMTP, el
  email queda en outbox y **no** se reporta como enviado.
- Authz: admin ejecuta; comité `ver`.

### V6 — Publicar acta en CV (actas por referencia)

- El visor guarda **`actaId` + visibilidad** (`publicado`, fecha, actor); **no copia** el contenido.
- **Despublicable**, con auditoría de quién y cuándo. La versión general enmascara RUT y no
  individualiza morosidad ni sanciones (Ley 19.628 vigente; 21.719 diferida).
- Texto obligatorio en la vista: "Versión informativa — el documento oficial es el libro de actas".
- Authz: comité y admin publican/despublican; residente solo ve si `residenteVeActas` vigente.

## Ventanas y cap

| Ventana | Alcance | Estado |
|---|---|---|
| V1 | Inventario de insumos (IR) — entregar + comodín, folio, authz | HECHA |
| V2 | Personal (PE) — 5 transiciones | HECHA |
| V3 | Reportería (RE) — snapshot + distribución | HECHA |
| V4 | Adelantos PL — anticipo vs préstamo | HECHA |
| V5 | Cobranza FI — multicanal con interruptores | PENDIENTE |
| V6 | Publicar acta en CV — por referencia | PENDIENTE |
| V7 | Cierre: gates, censo del store, BACKLOG, avance, deuda | PENDIENTE |

**MÁXIMO: 7 ventanas.** Lo que no entre se declara como deuda en V7.

## Bitácora

- **2026-10-21** — Serie materializada tras cerrar la V1 (IR). Modo nocturno sin owner.
- **2026-10-21 — V2 (PE) HECHA.** Las 5 transiciones tienen ruta propia y la página dejó el store
  (0 usos de `useCompassStore`, verificado con grep). Rutas: `POST /api/pe/turnos/iniciar` +
  `GET /api/pe/turnos` (inicio de turno y contador del día, recurso `pe:cierre_turno`),
  `POST /api/pe/personas/[id]/horas-extras` (`pe` editar), `POST /api/pe/personas/[id]/evaluaciones`
  (`pe:evaluacion` **solo admin**, inmutable: reintento con el mismo `id` → 409 y la entrada no se
  toca), `POST /api/pe/tareas-monitoreo/[id]/completar` (`pe` editar) y
  `POST /api/pe/proyecciones/enviar` (`pe` editar, **sin** `EgresoFI`: solo `ProyeccionPE` +
  notificación a administración + evento). **Sin migración:** horas extra y evaluaciones ya tenían
  dónde persistir (`Persona.datosLaborales`, columna Json) y la regla del plan prohíbe inventar
  columnas a ciegas; el historial solo se amplía (append), nunca se reescribe. Matriz RBAC:
  `pe` ver/crear/editar para conserjería y mantención, `pe` ver para comité, `pe:evaluacion` vacío
  para el resto de los roles, `pe:cierre_turno` vacío para mantención (corta el fallback de prefijo).
- **2026-10-21 — V3 (RE) HECHA.** Emitir congela y distribuir publica en el visor con el email en
  outbox. La página dejó el store (**0 usos** de `useCompassStore`, verificado con grep; antes tenía
  3 selectores + 2 `getState()`). Rutas: `POST /api/reportes-re/generar` (`re` crear = **solo
  admin**), `POST /api/reportes-re/[id]/distribuir` (`re` editar = solo admin),
  `POST /api/reportes-re/[id]/lectura` (`re` ver: admin y comité) y `POST /api/reportes-re/vistas`
  (`re:centro_mando` ver). **Migración aditiva** `20261021233000_add_reporte_snapshot_emision`:
  `numero` (correlativo por comunidad, índice único `(comunidadId, numero)`), `periodo`,
  `autorUsuarioId`, `autorNombre`, `estadoDistribucion`, `envios` y `lecturas` (Json), todas
  NULL-ables para no tocar el histórico. El snapshot se calcula **al emitir** con las mismas
  etiquetas y funciones puras del legacy (`saldoPendiente`) y nunca se recalcula al abrirlo; el id
  es determinista por (comunidad, periodo, título, bloques, segmento), así reemitir el mismo informe
  devuelve el snapshot congelado en vez de duplicarlo. Distribuir solo al visor es el default del
  body (`email: false`); el envío por correo queda en `envios[]` con estado `pendiente` y
  `estadoDistribucion: "pendiente"` — **no hay emisor SMTP en la plataforma**, así que nunca se
  reporta como enviado (la ruta responde `email: "pendiente"` y el texto de la UI lo dice). Matriz
  RBAC: sin recursos nuevos (`re` crear/editar ya es exclusivo del administrador; el comité conserva
  `re` ver y `re:centro_mando` ver; el residente no tiene `re`). Métrica en la página: emitidos /
  distribuidos / leídos, sin tasa de apertura. Gates: `npx tsc --noEmit` 0, `npm run lint` 0,
  `test/api/reporteria-snapshot.test.ts` 15/15 verde (+ regresión `api-reportes-re`, `crud-factory`
  y `with-comunidad-scope` 22/22).
