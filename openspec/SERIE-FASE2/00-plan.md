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
| V5 | Cobranza FI — multicanal con interruptores | HECHA |
| V6 | Publicar acta en CV — por referencia | HECHA |
| V7 | Cierre: gates, censo del store, BACKLOG, avance, deuda | HECHA |

**MÁXIMO: 7 ventanas.** Lo que no entre se declara como deuda en V7.

## Bitácora

- **2026-10-21** — Serie materializada tras cerrar la V1 (IR). Modo nocturno sin owner.
- **2026-10-21 — V1 (IR) HECHA.** Entregar una solicitud de insumo y resolver el comodín tienen
  ruta propia y la página dejó el store (**0 usos** de `useCompassStore`, verificado con grep; antes
  tenía 5: el import + `entregarSolicitudInsumoIR` y `resolverComodinIR` con sus lecturas). Rutas:
  `POST /api/ir/solicitudes-insumo/[id]/entregar` y
  `POST /api/ir/solicitudes-insumo/[id]/resolver-comodin`, ambas sobre el recurso RBAC que ya usaban
  las rutas IR desplegadas (`ir:mantenimiento` con `editar`, resuelto en el módulo co-locado
  `app/api/ir/_acciones.ts`) — **sin recurso nuevo**. Decisiones owner: marcar la entrega es el
  único acto (sin segunda aprobación) y descuenta el stock en la **misma** `$transaction`, con el
  guard `stock >= cantidad` dentro del `updateMany` para que dos entregas concurrentes no dejen
  stock negativo; el comodín se resuelve en un click con tres salidas (`sustituir` asigna el
  sustituto **y lo entrega** descontando su stock, `rechazar` exige justificación, `aprobar_crear`
  da de alta el artículo con `stock 0`). Idempotencia por update condicional (`estado: "pendiente"`
  y `estadoComodin: "pendiente"`): re-entregar responde `200 { ok: true, yaEntregada: true }` sin
  volver a descontar ni repetir eventos; resolver dos veces → 400. Folio `IR-A-####` correlativo
  generado en el servidor (`siguienteCodigoIR`), no en el cliente — el `fix` `d4806f5` corrigió
  justamente el gate de entrega por rol y el folio server-side. **Sin migración**: las tablas IR ya
  existían. Gates: `npx tsc --noEmit` 0, `npm run lint` 0, `test/api/ir-insumos.test.ts` 27/27 verde.
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
- **2026-10-21 — V4 (PL) HECHA.** Los adelantos tienen **dos naturalezas** y el cálculo es un
  módulo puro testeado. La página `app/finanzas/remuneraciones/page.tsx` dejó el store (**0 usos** de
  `useCompassStore`, verificado con grep; antes tenía 4: el import + `addAdelantoPL`,
  `removeAdelantoPL` y la lectura de `adelantosPL`). **Migración aditiva**
  `20261022000000_add_adelantos_pl_pacto_saldo`: 8 columnas en `adelantos_pl` (`pacto` con default
  `anticipo_regular`, `saldo`, `periodoImputacion`, `acuerdoEscritoRef`, `creadoPor`, `aprobadoPor`,
  `comprobante`, `deducciones` Json) + `adelantosDetalle` Json en `liquidaciones_pl` + **backfill**
  `saldo = monto` para los adelantos legados `pendiente` (con saldo 0 nunca se habrían descontado) +
  índice `(comunidadId, trabajadorPersonaId, estado)`. Rutas: `GET|POST /api/liquidaciones/adelantos`
  y `GET|PUT|DELETE /api/liquidaciones/adelantos/[id]` (recurso nuevo `pl:adelantos`: admin full,
  comité `ver`, resto vacío explícito) y `POST /api/liquidaciones/adelantos/[id]/desestimar`
  (`editar`; el adelanto **no se borra**: queda `desestimado` con saldo anulado y sus deducciones ya
  aplicadas — paridad con el `removeAdelantoPL` legacy, que solo permitía borrar un `pendiente`). La
  doctrina vive en `app/api/liquidaciones/adelantos/_calculo.ts` (`TOPE_PRESTAMO_PCT = 0.15`,
  `TOPE_CONJUNTO_PCT = 0.45`, `saldoVivoAdelanto`, `adelantoImputableAlPeriodo`,
  `calcularDeduccionAdelantos`) y se aplica en dos puntos: al **generar** la liquidación
  (`/api/liquidaciones` congela el plan en `adelantosDetalle`, incluyendo los adelantos
  `descontado_parcial` con saldo arrastrado) y al **confirmarla** (`/api/liquidaciones/[id]/confirmar`
  materializa saldo, estado y una `DeduccionAdelantoPL` ligada a la liquidación con folio y periodo;
  las liquidaciones anteriores a §V4, sin plan, se saldan completas como hacía el legado).
  **Prelación propia declarada**: el préstamo va primero (es la deducción que la ley permite y topa)
  y el anticipo regular se lleva lo que quede del líquido; si no cabe completo, arrastra saldo y
  nunca deja el líquido en negativo. Gates: `npx tsc --noEmit` 0, `npm run lint` 0,
  `test/api/adelantos-pl.test.ts` 17/17 verde.
- **2026-10-21 — V5 (FI) HECHA.** La cobranza es multicanal con dos interruptores y cada envío queda
  registrado. La página `app/finanzas/gastos-comunes/page.tsx` dejó el store (**0 usos** de
  `useCompassStore`, verificado con grep; antes tenía el import del store + `getState().enviarCobranzaFI`
  y el TODO `:121`). Rutas: `POST /api/cobros-fi/[id]/cobranza` (`fi:cobranza` **ejecutar** = solo
  admin; el `[id]` es el cobro que ancla y la deuda cobrada es la de su unidad, igual que el legacy
  `enviarCobranzaFI(unidadId)`), `GET /api/cobros-fi/[id]/cobranza` (`fi:cobranza` ver: historial de
  envíos de la unidad) y `GET|PUT /api/cobros-fi/canales` (interruptor global y preferencia por
  residente). **Migración aditiva** `20261022010000_add_cobranza_fi_multicanal`: tres tablas nuevas
  (`configuracion_cobranza_fi` singleton con `canalVisor`/`canalEmail` default true,
  `preferencias_canal_cobranza_fi` única por `(comunidadId, personaId)`, `envios_cobranza_fi` con
  `canal, fecha, personaId, estado, motivo, montoTotal, cobrosIncluidos, claveEnvio, reenvio`); ninguna
  columna existente se altera. **No se duplica `Notificacion`**: la notificación interna sigue siendo
  el canal visor real (la crea la ruta) y las tablas nuevas guardan interruptores + registro auditable
  del envío, que `Notificacion` no modela. Resolución de canales = **global ∧ preferencia**
  (`app/api/cobros-fi/_cobranza.ts:resolverCanalesCobranza`), con motivo textual por canal omitido que
  queda en la respuesta **y** en el evento `FI_COBRANZA_SENT`. Sin SMTP el email se persiste
  `pendiente` con motivo explícito y nunca se reporta como enviado (`app/api/cobros-fi/[id]/cobranza/route.ts`, estado
  `pendiente`). Idempotencia por `claveEnvio = unidad:persona:canal` (índice único por comunidad):
  reenviar devuelve `duplicado` sin crear filas; `{ reenviar: true }` crea una fila nueva con
  `reenvio: true` y sufijo `:reenvio:<epoch>` + evento `FI_COBRANZA_RESENT`. Matriz RBAC: recursos
  nuevos `fi:cobranza` (admin full, comité `ver`, resto vacío explícito — la entrada exacta corta el
  fallback de prefijo hacia `fi`, donde el comité sí tiene `ejecutar`) y `fi:cobranza:propia`
  (residente `ver`+`editar` sobre **su** persona, ABAC en la ruta; resto vacío). Gates:
  `npx tsc --noEmit` 0, `npm run lint` 0, `test/api/cobranza-fi.test.ts` 14/14 verde, `lib/authz.test.ts`
  65/65 verde (+ regresión `fi-acciones` 16/16, `cobros-fi-fase4` 18/18, `crud-factory` 12/12 y
  `with-comunidad-scope` 4/4: 128/128). Si NINGÚN canal queda habilitado no se escribe envío ni
  notificación y el intento se audita como `FI_COBRANZA_SKIPPED` con el motivo de cada interruptor.
- **2026-10-21 — V6 (CV) HECHA.** El visor publica el acta **POR REFERENCIA**: guarda `actaId` +
  visibilidad y resuelve el contenido al leer desde GD. La página `app/comunidad/visor/page.tsx`
  dejó el store (**0 usos** de `useCompassStore`, verificado con grep; antes tenía 2: el import y
  `getState().publicarActaEnCV` en el botón de actas). **Migración aditiva**
  `20261022020000_add_actas_publicadas_cv`: una tabla nueva `actas_publicadas_cv`
  (`id`, `comunidadId`, `actaId`, `estado`, `publicadoEn`, `publicadoPorUsuarioId`,
  `despublicadoEn?`, `despublicadoPorUsuarioId?`) con índice único `(comunidadId, actaId)`; **no**
  guarda minuta, cuerpo ni adjuntos y `actas_gd` no se altera (sigue siendo el documento canónico e
  inmutable del libro de actas). Rutas: `POST /api/cv/actas` (`cv` crear = admin y comité; valida que
  el acta exista en la comunidad y esté `publicada` → 404 cross-comunidad, 409 borrador/desestimada;
  idempotente: republicar devuelve `duplicado: true` sin fila ni evento nuevos),
  `GET /api/cv/actas` (`cv` ver; residente/propietario además exige `residentesVenActas` de
  `lib/api/gd-guard.ts`, es decir control AD `residenteVeActas` con `estado: "vigente"` → 403 sin
  él) y `POST /api/cv/actas/[actaId]/despublicar` (`cv` editar; revierte la visibilidad y audita;
  segunda llamada → 404 porque no hay transición). Auditoría: `CV_ACTA_PUBLICADA`
  (`app/api/cv/actas/route.ts:230`) y `CV_ACTA_DESPUBLICADA`
  (`app/api/cv/actas/[actaId]/despublicar/route.ts:56`) con `usuario` = sesión y `referenciaId` = actaId.
  Vista general informativa: fecha, hora, lugar, nº de temas y asistentes con documento enmascarado
  (`app/api/cv/_actas.ts:67` `enmascararDocumento`, aplicado en `app/api/cv/actas/route.ts:147`);
  nunca minuta, morosidad ni sanciones individualizadas. El texto obligatorio lo dicta el servidor
  (`TEXTO_ACTA_INFORMATIVA_CV` en `lib/schemas.ts`) y se pinta en la tarjeta y en cada acta
  (`app/comunidad/visor/page.tsx:411` y `:437`). **Sin recurso RBAC nuevo**: se reutiliza `cv`
  (admin wildcard, comité ver/crear/editar, residente solo ver + ABAC). Gates: `npx tsc --noEmit` 0,
  `npm run lint` 0 problemas/0 warnings, `test/api/acta-publicada-cv.test.ts` 9/9 verde (+ regresión
  `fase4-cv` 6/6, `actas-gd` 10/10 y `borrado-logico-gd-ad` 16/16: 41/41). Decisiones propias:
  (a) no se escribe `ActaGD.avisoCVReferencia` —la visibilidad es de CV, no del libro—;
  (b) republicar un acta despublicada es una transición real y vuelve a auditarse;
  (c) la lista GET vuelve a exigir
  `actas_gd.estado = "publicada"` para que un acta desestimada nunca se muestre por referencia vieja.

- **2026-10-22 — V7 (CIERRE) HECHA. SERIE CERRADA 7/7.** Ventana de auditoría y documentación: **no
  escribe código de producto**. 27 commits en la rama `fase2/inventario-insumos`, 57 archivos, +10 527
  / −236. **19 rutas nuevas** (`git diff --name-status main...HEAD -- '*route.ts'`: 19 `A` + 4 `M`) y
  **4 migraciones aditivas** (RE snapshot, PL adelantos, FI cobranza multicanal, CV actas por
  referencia). Censo final de `useCompassStore` en `app/`:
  `grep -rn "useCompassStore" app/ | wc -l` → **4 archivos / 106 usos**, de los cuales 1 es un
  comentario (`app/finanzas/remuneraciones/page.tsx:5`), así que el uso real es **3 archivos / 105
  usos** y los 3 son las excepciones justificadas (`admin/qa-lab` 99, `admin/mantenimiento` 4,
  `admin/dev-dashboard` 2). Base al inicio de la fase 2 (`main` = merge-base `1bf0593`): 9 archivos /
  131 usos → **delta real −6 archivos / −25 usos (−26 usos migrados, +1 comentario)**; contra el
  inicio de la sesión (`13 archivos / 147 usos`, siembra de SERIE-DEUDA-6) el delta es **−10
  archivos / −41 usos**. **Ningún archivo fuera de alcance**: `prisma/dev.db`, `.env*`,
  `Data/NSGC/backups/`, `lib/store.ts` y `STORE_VERSION` (sigue en **28**, verificado con grep en
  `lib/store.ts:336`) están fuera del diff. Gates: `npx tsc --noEmit` **0** · `npm run lint` **0
  problemas** · `openspec validate --all` **36 passed / 0 failed** (`openspec validate` global, no
  `npx`: el paquete no está en `node_modules`). La suite completa **no se corrió acá**: la observó el
  orquestador en `d10279c` → **146 archivos, 1538 tests, `SUITE_EXIT=0`, 8m50s**. Documentación
  escrita: `openspec/BACKLOG-100.md` (§cierre fase 2 + deuda restante), avance
  `Data/NSGC/docs/avances/avance - 2026-10-22 03-30.md` y dos manuales que sí describían el
  comportamiento viejo (`12 - FI`, `16 - CO`). Deuda restante declarada: **SMTP** (decisión tomada:
  SMTP propio del dominio; faltan credenciales), `Notificacion` sin envío real, el módulo QA/dev a
  retirar antes de producción y las deudas menores de fase 1 (paginar `useCrudCollection` con
  `pageSize=100`, `Notificacion` sin `unidadId`). **Sin push, sin PR, sin merge, sin archive**: el
  change `ui-legacy-store-fase1` sigue aplicado y validado, no archivado.
