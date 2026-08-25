# 🗂️ 38 - MK - Data Dump Finanzas

> Dump resuelto de las colecciones financieras de la **Sesión 5 NSGC** (store v21). `fondosFI` es la única colección sembrada (inline en `lib/store.ts`, constante `FONDOS_FI_SEED`); `egresosFI`, `emisionesGC` y `cobrosFI` son colecciones operativas que nacen vacías — se llenan con el uso real del módulo (emisiones, multas aplicadas, reservas con tarifa, pagos).

## 💰 `fondosFI` (seed, 3 registros)

**ID pattern:** `fondo-<slug>` (kebab-case del nombre; fondos creados por UI usan `fondo-<timestamp>-<rand>`).

| id | nombre | tipo | descripcion | porcentajeAporte | activo |
|----|--------|------|-------------|------------------|--------|
| `fondo-gc` | Fondo de Gasto Común | gasto_comun | Caja principal para la operación ordinaria del condominio. | — | true |
| `fondo-reserva` | Fondo de Reserva | reserva | Ahorro obligatorio según la Ley de Copropiedad. | 5 | true |
| `fondo-amenities` | Fondo de Amenities | amenities | Centro de costos de reservas, tarifas y garantías de amenities. | — | true |

## 📤 `egresosFI` (operativa, inicia vacía)

Campos: `id`, `folio FE-####` (auto), `fecha AAAA-MM-DD`, `categoria` (sueldos/mantencion/servicios/administracion/uso_de_fondo/otro), `descripcion`, `monto >0`, `fondoId` (FK fondosFI, obligatorio), `esRecurrente`, `comprobante?` {nombre/tipoMime/tamanoKB/url D1}, `microSectoresIds?` (gastos diferenciados), `proveedor?`, `unidadId?`, `aprobacionActaGDId?` (retiros de reserva).

## 🧾 `emisionesGC` (operativa, inicia vacía)

Campos: `id egc-*`, `periodo AAAA-MM` (único), `modo fijo|variable` (snapshot CF), `gastoTotal`, `lineas[]` {unidadId, responsablePersonaId (propietario vigente), monto, cobroId}, `fondoReservaAporte?` {fondoId, monto = round(totalEmitido × %)}, `fechaEmision`.

Reglas de cálculo: modo fijo → monto = `montoBaseGc` del tipo de unidad; modo variable → monto = `round(gastoTotal × unidad.prorrateo)` (el coeficiente se almacena como fracción, ej. 0.0125 = 1.25%); vencimiento = `diaCortePago` (CF) dentro del mes siguiente al periodo.

## 📒 `cobrosFI` (operativa, inicia vacía)

Campos: `id cob-*`, `unidadId`, `periodo AAAA-MM`, `concepto` (gasto_comun/cuota_extraordinaria/multa_in/consumo/reserva_ra/penalizacion_ra/garantia_ra), `origenModulo FI|IN|RA`, `origenRef?` (id de emisión/infracción/reserva), `fondoId`, `descripcion`, `montoBase >0`, `fechaCargo`, `fechaVencimiento?`, `moras[]` {monto, diasAtraso, tasaMensualPct, fecha} idempotentes por día, `pagos[]` {monto, fecha, medio}, `diferencias[]` {tipo descuento|recargo, esperado, recibido, diferencia, justificación ≥10, fecha} **inmutables**.

Origen de cargos automáticos:

| Concepto | Disparador | Fondo destino |
|----------|-----------|---------------|
| `gasto_comun` | `emitirGastoComun` (1 cobro por unidad) | fondo-gc |
| `multa_in` | `aplicarInfraccionIN` (% GC contra último GC emitido) | fondo-gc |
| `reserva_ra` | `saveReservaRA` con tarifa > 0 | fondo-amenities |
| `penalizacion_ra` | `cancelarReservaRA` tardía | fondo-amenities |
| `garantia_ra` | `retenerGarantiaRA` | fondo-amenities |
