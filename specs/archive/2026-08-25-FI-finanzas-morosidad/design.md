# FI-finanzas-morosidad — Design

## Context

Dependencias ya resueltas: CF expone `modoCalculoGC`/`diaCortePago`/`limiteMesesAvisoCorte` (spec CF §Parametrización, escenario "CF sin carga bloquea FI"); TU define `montoBaseGc` y EF unidades traen `prorrateo`; VU identifica al responsable de cobro (propietario vigente); GD publica actas que sirven de aprobación documentada; IN/MT/RA dejaron el patrón `cargoFIReferencia:"pendiente"` a la espera de esta ventana. Restricción D1 del prep-fundamentos manda para comprobantes: metadatos + URL, jamás base64/Blob.

## Goals / Non-Goals

**Goals:**
- Libro financiero coherente: todo movimiento (cobro o egreso) imputado a un fondo; saldo de fondo derivable en base caja (pagos recibidos − egresos pagados... ver decisión de base).
- Emisión GC determinista: modo fijo lee `montoBaseGc` del tipo de unidad; modo prorrateo reparte `gastoTotal` por coeficiente; ambos exigen responsable de cobro por unidad y periodo no repetido.
- Morosidad operativa: mora propuesta por cobro vencido (`diaCortePago`), panel de corte de servicios (`limiteMesesAvisoCorte`) y gestiones de cobranza auditadas.
- Pago con control antifraude: ajuste manual obliga justificación y genera informe de diferencia inmutable.
- Cerrar las 3 referencias inversas IN/MT/RA con acciones reales del store.

**Non-Goals:**
- Certificados de deuda / estados de cuenta PDF (CT, ventana 8) y reportería dashboards (RE).
- Remuneraciones/sueldos como egresos automáticos desde PE (ventana 7 conectará sus costos); FI solo provee la categoría de egreso.
- Conciliación bancaria real, intereses legales parametrizados por asamblea o indexación UF.
- Consumos individuales con medidores (se deja como concepto `consumo` disponible pero sin UI dedicada).

## Decisions

- **`fondosFI {id, nombre, tipo gasto_comun|reserva|especial|amenities, descripcion?, porcentajeAporte?, activo}`** — colección propia en vez de reutilizar el maestro `cajasFondos`: los fondos financieros necesitan ciclo CRUD propio con integridad referencial contra egresos/cobros/emisiones y un campo extra (`porcentajeAporte`, usado solo por fondos de reserva). El maestro MA queda intacto. Seed NSGC: Fondo de Gasto Común, Fondo de Reserva (aporte 5%), Fondo de Amenities.
- **Saldo de fondo = base caja**: `saldoFondo(fondoId) = Σ pagos recibidos en cobros del fondo + aportes registrados de reserva − Σ egresos del fondo`. Se eligió caja (y no causación) porque es lo verificable sin conciliación bancaria; los cobros pendientes son cuentas por cobrar, no dinero. Los retiros son egresos especiales con aprobación.
- **Egresos `egresosFI {id, folio FE-*, fecha, categoria sueldos|mantencion|servicios|administracion|uso_de_fondo|otro, descripcion, monto>0, fondoId, esRecurrente, comprobante? D1, microSectoresIds? (gastos diferenciados), proveedor?, unidadId?, aprobacionActaGDId?}`** — imputación obligatoria al fondo (default gasto común activo). Retiros del fondo de reserva se modelan como egreso `uso_de_fondo` vía acción dedicada `retirarFondoFI`, que exige acta GD publicada como respaldo cuando el fondo es de reserva y valida saldo suficiente.
- **Emisión GC `emitirGastoComun({periodo AAAA-MM, gastoTotal?, fechaVencimiento?})`**:
  - Gate CF: si `configuracion.modoCalculoGC` es undefined → `{ok:false, error:"CF no cargado"}` (escenario CF:108). En stores sanos nunca ocurre (schema CF exige el campo), pero la validación defensiva queda especificada e implementada.
  - Unicidad de periodo: rechaza si ya existe `emisionesGC.periodo`.
  - Universo emitable: unidades NO estacionamiento (`u-E-*` excluidas: pagan vía GC del depto, decisión de dominio documentada). Cada unidad exige propietario vigente (responsable de cobro).
  - Fijo: monto = `montoBaseGc` del `tipoUnidadId`. Variable/prorrateo: exige `gastoTotal > 0`; monto = `round(gastoTotal * prorrateo / 100)`.
  - Materializa 1 `emisionesGC` (con líneas y totales) + N `cobrosFI` (concepto `gasto_comun`, fondo GC, vencimiento default = `diaCortePago` del mes siguiente al periodo).
  - Aporte automático al fondo de reserva: si existe fondo tipo reserva activo con `porcentajeAporte > 0`, registra `fondoReservaAporte {fondoId, monto = round(totalEmitido * pct / 100)}` en la emisión (alimenta el saldo del fondo).
  - Notificación masiva a propietarios si `configuracion.notificarEmisionGC !== false`; audita `FI_EMISION_GC`.
- **Mora**: vencido = cobro sin cubrir con `fechaVencimiento < hoy`. `aplicarMoraFI(cobroId, tasaMensualPct=1)` agrega `moras[] {monto = round(exigiblePendiente * tasa/100 * diasAtraso/30), diasAtraso, tasaMensualPct, fecha}` idempotente por día (no duplica mora del mismo día); audita `FI_MORA_APPLIED`. La tasa es parámetro de la acción (default 1% mensual pro-rata): no hay fuente configurada en CF y así el administrador aplica el cálculo "propuesto" según reglamento vigente.
- **Corte de servicios** (derivado, sin acción): `mesesAtraso(unidad) = # periodos GC pendientes vencidos`; `unidadesParaCorteServicios()` filtra `>= limiteMesesAvisoCorte` (CF). `enviarCobranzaFI(unidadId)` notifica al propietario con el detalle de deuda y audita `FI_COBRANZA_SENT` (gestiones contables para AM).
- **Pago + informe de diferencia**: `registrarPagoFI(cobroId, {monto>0, medio, ajusteJustificacion?})`. Exigible = `montoBase + Σmoras − Σpagos previos` (ajustes descuento ya reflejados en diferencias). Si `monto === exigible` → pago exacto, estado derivado pasa a pagado. Si difiere: sin `ajusteJustificacion` → `{ok:false}` exigiendo justificación; con ella → procesa el pago, appendea `diferencias[] {tipo descuento|recargo, esperado, recibido, diferencia, justificacion, fecha}` **inmutable** (sin acción de edición/borrado) y audita `FI_MANUAL_DISCOUNT` además de `FI_RECEIVE_PAYMENT`.
- **Estado de cobro derivado**: `pendiente | parcial | pagado | vencido` calculado por helper (nunca almacenado) para evitar inconsistencias.
- **Conexión IN (MODIFIED)**: dentro de `aplicarInfraccionIN`, tras fijar `estado:"aplicada"` y `montoAplicado`: si sanción `% GC` existe emisión GC previa de la unidad → monto = `round(valor/100 * último cobro GC de la unidad)`; si no hay historial, se usa el valor nominal (compatibilidad). Crea `cobrosFI {concepto multa_in, origenModulo IN, origenRef id, fondo gasto común}` y setea `infraccion.cargoFIReferencia = cobro.id`. Schema evoluciona de literal `"pendiente"` a `z.string().optional()` (acepta legacy persistido). Justificación: el patrón literal era un marcador sin consumidor; ahora la multa cerrada/aplicada vive como deuda real en el libro FI (NSGC FI §2 "Multas Individuales: Solo se cargan aquellas multas marcadas como Cerradas/Aplicadas").
- **Conexión MT (MODIFIED)**: `ProyectoMT.fondoFinanciamientoId?` nuevo campo opcional; `saveProyectoMT` valida FK hacia `fondosFI`, fondo activo y `saldoFondo >= presupuestoEstimado` ("proyecto financiado por fondo FI valida saldo disponible"). Sin fondo declarado, el proyecto sigue guardándose (financiamiento indefinido permitido, igual que hoy). `TrabajoMT.cargoFIReferencia` evoluciona a string opcional sin cambio de comportamiento: el pago a proveedores sigue gobernado por `estadoPago` (el egreso real se registrará en FI manualmente o con PE); materializarlo automáticamente duplicaría el costo en el libro.
- **Conexión RA (MODIFIED)**: en `saveReservaRA`, si `tarifaUso > 0` se crea cobro `reserva_ra` en el fondo amenities activo y `cargoFIReferencia = cobro.id`. En cancelación tardía se crea cobro `penalizacion_ra` y el campo pasa a ese id (la referencia única marca el último cargo vivo; la trazabilidad completa vive en `cobrosFI.origenRef`). En retención de garantía se crea cobro `garantia_ra`. El gate de morosidad se activa: `getDeudaVigenteFI(get, personaId)` retorna mensaje si algún cobro vencido pertenece a unidades con vínculo vigente de esa persona; `saveReservaRA` lo evalúa sobre el solicitante (antes era stub inerte).
- **Helpers puros** en `lib/finanzas-utils.ts` (testables sin store): `exigibleDeCobro`, `estadoDeCobro`, `saldoFondo`, `morosidadPorUnidad`, `unidadesParaCorteServicios`, `montoMoraPropuesta`. Reciben slices tipados de CompassData.
- **Rank/manifest ST**: FI ocupa rank 4 (canónico `4=FI/PE/IR/IN`); seed: `fondosFI` (3 registros), resto vacío hasta operación real. ADDED en delta ST documentando colecciones + bump v21 aditivo.

## Risks / Trade-offs

- [Base caja subestima disponibilidad] Cobros emitidos no pagados no suman saldo → aceptado: evita gastar dinero no recibido; MT valida contra caja real.
- [% GC sin historial cae a valor nominal] Multa % aplicada antes de la primera emisión usa el número crudo → aceptado: caso borde documentado; tras la primera emisión se resuelve contra el GC real.
- [cargoFIReferencia pierde exclusividad de literal] Igual que GD→CV en S4: convención `"pendiente"` = sin materializar, resto = id de cobro; compatible con datos persistidos.
- [Tasa de mora por acción y no por CF] Evita MODIFIED en CF fuera del alcance de la ventana; el default 1% mensual es editable por llamada y queda auditado en cada aplicación.
- [QA-lab más largo] La fase FI depende de IN/RA/MT; se ejecutan como prerrequisitos encadenados dentro de la fase (patrón ya usado por RA+CV con GD).

## Migration Plan

Aditiva v20→v21: `fondosFI` se siembra si ausente; `egresosFI/emisionesGC/cobrosFI` entran vacías. Campos evolucionados (`cargoFIReferencia` string, `fondoFinanciamientoId` opcional) validan datos persistidos previos sin migrate adicional.

## Open Questions

(ninguna)
