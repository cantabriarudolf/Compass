# 📦 40 - MK - Data Dump Remuneraciones, Certificados y Reportería

Colecciones **transaccionales** creadas en la Sesión 7 NSGC (ventana 8: PL + CT + RE). Nacen vacías por diseño — son registros de negocio, no catálogos sembrados — por lo que este dump documenta su **estructura, patrones de ID y reglas**, no registros resueltos.

> [!NOTE]
> Store v23 (PL) → v24 (CT) → v25 (RE). Migraciones aditivas: cada colección se inyecta vacía al rehidratar stores previos, sin tocar datos existentes.

## 💰 PL - Liquidaciones y Remuneraciones

### `liquidacionesPL` (store v23)

Snapshot inmutable de cada liquidación generada. Un documento por trabajador+periodo; folio correlativo.

| Campo | Patrón / Tipo | Notas |
|---|---|---|
| `id` | `pl-liq-<timestamp>-<rand>` | PK |
| `folio` | `LIQ-####` | correlativo global, búsqueda rápida |
| `trabajadorPersonaId` | FK `personas.id` | exige ficha PE con `sueldoBase > 0` |
| `periodo` | `AAAA-MM` | único por trabajador |
| `diasTrabajados` | 0–31 | proporcionaliza el sueldo base sobre `diasMesComercial` CF |
| Snapshot paramétrico | `sueldoBaseContrato`, `diasMesComercial`, `jornadaSemanal`, `ufAplicada`, `tasaSIS` | congela los parámetros usados |
| Haberes imponibles | `sueldoBaseProporcional`, `horasExtrasHoras`, `valorHoraOrdinaria`, `montoHorasExtras`, `bonos[] {glosa, monto, imponible}`, `gratificacionLegal`, `totalImponible` | gratificación = min(25% imponible, tope×IMM/12) |
| No imponibles | `asignacionMovilizacion`, `asignacionColacion`, `montoAsignacionFamiliar` (+ `asignacionFamiliarTramoId`, `cargas`) | tramo × cargas desde maestro MA |
| Descuentos | `montoAFP` (+`afpId`,`tasaAFP`), `montoSalud` (+`saludId`,`saludTipo`,`saludPorcentaje?`,`saludValorUF?`), `montoSIS`, `montoSeguroCesantia`, `montoAPV`, `totalDescuentos` | honorarios omite legales |
| Totales de control | `totalHaberes`, `descuentoAnticipos`, `adelantosIds[]`, `alcanceLiquido`, `liquidoAPagar` | alcance = haberes − descuentos |
| Estado y referencias | `estado` borrador/confirmada · `egresoFIReferencia` `"pendiente"` → id egreso FE al confirmar · `proyeccionPEReferencia?` | materializa la referencia de PE |

Acciones: `generarLiquidacionPL` (`PL_GENERATE_PAYSLIP`, gate "CF no cargado"), `confirmarLiquidacionPL` (egreso FI categoría **sueldos** + adelantos→Descontado; `PL_EXPENSE_SYNC`), `removeLiquidacionPL` (solo borrador; `PL_DELETE_PAYSLIP`).

### `adelantosPL` (store v23)

| Campo | Patrón / Tipo | Notas |
|---|---|---|
| `id` | `pl-ade-<timestamp>-<rand>` | PK |
| `folio` | `ADE-####` | comprobante de entrega |
| `trabajadorPersonaId` | FK `personas.id` | exige ficha PE |
| `monto` | > 0 | efectivo entregado |
| `glosa` | ≥ 5 caracteres | trazabilidad obligatoria |
| `estado` | `pendiente` → `descontado` | descontado amarra `liquidacionId` y bloquea eliminación |

Acciones: `saveAdelantoPL` (`PL_ADD_ADVANCE` + notify trabajador), `removeAdelantoPL` (solo pendientes).

## 📜 CT - Certificados

### `certificadosCT` (store v24)

Historial de emisión auditablemente inmutable (solo ids TEST eliminables).

| Campo | Patrón / Tipo | Notas |
|---|---|---|
| `id` | `ct-<timestamp>-<rand>` | PK |
| `folio` | `CT-####` | correlativo global |
| `codigoVerificacion` | `VC-XXXXXXXX` | único, para validación externa |
| `tipo` | `residencia` \| `estado_cuenta` \| `liquidacion_sueldo` \| `al_dia` | gates: vínculo VU activo / libro FI / LIQ confirmada / saldo ≤ 0 |
| `unidadId`?, `personaId`?, `origenRef`? | FKs según tipología | validadas en escritura |
| `solicitanteNombre` | texto | quién pidió el documento |
| `resumen` + `detalle[] {clave, valor}` | snapshot inmutable | contenido exacto del PDF emitido |
| `firmaUrl`? | URL (D1) | referencia a la firma CF; jamás base64 |
| `fechaEmision` | `AAAA-MM-DD` | |

Acciones: `generarCertificadoCT` (`CT_GENERATE_RESIDENCE/FINANCIAL/PAYROLL/AL_DIA`), `removeCertificadoCT` (bloqueado fuera de TEST).

## 📊 RE - Reportería

### `reportesRE` (store v25)

Reportes personalizados con snapshot de bloques y segmentación declarada. Rank 99 (sumidero).

| Campo | Patrón / Tipo | Notas |
|---|---|---|
| `id` | `re-rep-<timestamp>-<rand>` | PK |
| `titulo` | ≥ 3 caracteres | |
| `bloques[]` | `gastos_mes` \| `bitacora_seguridad` \| `morosidad` \| `consumo_insumos` | ≥ 1 |
| `segmento` | `{macroSectorIds[], microSectorIds[], unidadIds[], perfiles[], tenencias[]}` | FKs EF validadas; perfiles administracion/personal/propietario/residente; tenencias propietarios/arrendatarios |
| `payloadSnapshot[]` | `{bloque, lineas[{etiqueta, valor}]}` | contenido congelado al generar |
| `destinatariosPersonaId[]` + `distribuidoA` + `fechaDistribucion?` | resueltos **al distribuir** (no al generar) | distribución única e idempotente |

Acciones: `registrarVistaDashboardRE` (`RE_DASHBOARD_VIEW` por vista del mando), `generarReporteRE` (`RE_REPORT_GENERATED`), `distribuirReporteRE` (notify masivo con gate AD; `RE_REPORT_DISTRIBUTED`), `removeReporteRE` (solo TEST).

---
*Sesión 7 NSGC (2026-08-26): ventana 8 serie NSGC — PL + CT + RE completos, store v25.*
