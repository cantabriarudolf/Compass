# Proposal: qa-lab-poblar-api (SERIE-GATED-API-BD P4)

## Problema
Con PI/PL ya en API (P2/P3), QA-Lab "Poblar todo" miente en dos fases:
escribe `publicacionesPortal`/`leadsPortal` y `liquidacionesPL`/`adelantosPL`
al store legacy mientras `/comunidad/portal` y `/finanzas/remuneraciones`
leen BD vía API REST. Tras poblar, la vitrina y las remuneraciones se ven
vacías. Causa verificada sobre reseed limpio, no asumida: `cargarFase4PI`
usa `savePublicacionPortal`/`saveLeadPortal` del store y `cargarFase15PL`
usa `saveAdelantoPL`/`generarLiquidacionPL`/`confirmarLiquidacionPL` del
store; ningún fetch a `/api/*`. Los 4 GATED ya no dependen de QA-Lab
(P1–P3), pero `poblado-idempotente`, `poblamiento` y `ciclo` sí usan
"Poblar todo" y deben seguir en verde (22/22 🟢, huérfanos 0).

## Propuesta
Fases PI/PL poblan vía API REST con el mismo reporte (pasos y 22/22 intactos):
- **PI**: `POST /api/publicaciones-portal` (upsert, unidad del seed vía
  `GET /api/unidades`) + `POST /api/leads-portal` (upsert; notifica solo al
  alta). Ids fijos `test-pub-pi-qa` / `test-lead-pi-qa`.
- **PL**: `PUT /api/configuracion` (params CF idempotentes) + `POST
  /api/personas` (upsert trabajador fijo `test-qa-pl-trab`, RUT 77.777.777-7,
  ficha con sueldo base + FKs del seed) + `POST /api/liquidaciones`
  (generar, periodo rotativo 2027–2029 primer libre) + `POST …/confirmar`
  (egreso FI sueldos espejo en BD). Sin descuento por adelanto: no existe
  `/api/adelantos` (recorte P3) y el generar server-side solo descuenta
  adelantos pendientes de BD.
- **Adelanto legacy documentado**: `test-ade-1` sigue en store (sin
  contraparte API; la pestaña Adelantos lee el store → coherente y visible).
- **Espejo store transitorio**: la liquidación confirmada BD se refleja al
  store (mismo id, `trabajadorPersonaId: test-p-99`, `adelantosIds: []`) más
  su egreso espejo (`fondoId: fondo-gc`), para no romper los consumidores
  legacy que aún leen store: dropdown de liquidadas en
  `/comunidad/certificados`, paso CT-4 (`generarCertificadoCT` exige la
  liquidación en store) y `validarEstadoCompleto` (huérfanos 0).
- **CT-4 sin cambios de código**: consume el espejo (lee store como antes).
- **Limpieza e higiene en ambos mundos**: "Borrar todo" purga además vía API
  (lead→pub por el guard 409, notificaciones PI TEST, borradores QA, egreso
  espejo, persona QA); el guard clean-first suma chequeo BD asíncrono
  (`tieneDatosTest` gana parámetro opcional `bd`); `e2e:higiene` ya cubre BD
  (pub/lead/liq/adelanto/persona con id TEST). Residuo honesto: la confirmada
  QA es inmutable (sin PUT/DELETE por diseño) y queda como documento con
  periodo rotativo que no colisiona; `limpiar` la salta y el guard la excluye
  (documentado en el manual).
- Manual "34 - Historia de Poblamiento" actualizado (fases PI/PL vía API +
  residuo honesto).

## Alcance recortado (fuera de P4)
Fases FI/CT del QA-Lab siguen store-only (sus pages leen BD; coherencia
completa FI/CT = post-serie). Sin `/api/adelantos` (post-serie con la
migración de la pestaña Adelantos).
