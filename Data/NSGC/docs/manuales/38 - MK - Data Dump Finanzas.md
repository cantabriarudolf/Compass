# 🗂️ 38 - MK - Data Dump Finanzas

> Dump resuelto de las colecciones financieras de la **Sesión 5 NSGC** (store v21 → **v27 con punto cero**). `fondosFI` es la única colección sembrada (inline en `lib/store.ts`, constante `FONDOS_FI_SEED` + `PUNTO_CERO_FONDO`); `egresosFI`/`ingresosFI` traen históricos P2, `emisionesGC` y `cobrosFI` siguen operativas vacías.

## 💰 `fondosFI` (seed, 4 registros — 3 NSGC + 1 punto cero)

**ID pattern:** `fondo-<slug>` (kebab-case; fondos creados por UI usan `fondo-<timestamp>-<rand>`). El 4º es histórico.

| id | nombre | tipo | descripcion | saldoInicial | porcentajeAporte | activo |
|----|--------|------|-------------|--------------|------------------|--------|
| `fondo-gc` | Fondo de Gasto Común | gasto_comun | Caja principal para la operación ordinaria de la comunidad. | — | — | true |
| `fondo-reserva` | Fondo de Reserva | reserva | Ahorro obligatorio según la Ley de Copropiedad. | — | 5 | true |
| `fondo-amenities` | Fondo de Amenities | amenities | Centro de costos de reservas, tarifas y garantías de amenities. | — | — | true |
| `fondo-cc-punto-cero` | Cuenta Corriente | gasto_comun | Cuenta corriente histórica (punto cero 2023-2024). Saldo inicial cuadra el libro. | 17082694 | — | true |

> Saldo del fondo CC = `saldoInicial (17082694) + Σ ingresosFI (45.408.317) − Σ egresosFI (62.491.011) = 0` — valida contra Saldo CC del libro (cierre dic-24 $0).

## 📤 `egresosFI` (históricos P2 + operativa)

**Históricos P2:** 182 registros `fi-egr-hist-001..182` (orden fecha ISO asc, folio `FE-####` continuo desde `max(FE)+1`, sin colisión con seed/TEST-*), imputados a `fondo-cc-punto-cero`. Categoría mapeada: Remuneraciones/Imposiciones/Aguinaldos→sueldos, Mantenimientos/HidroPack/Portón→mantencion, Servicios Básicos→servicios, Trámites→administracion, Útiles de Aseo/Materiales/Varios/Sin Especificar→otro; `esRecurrente=true` solo "Pago Administración" (22). Totales: $62.491.011 (2023 $19.506.242, 2024 $42.984.769). 4 filas con monto 0 del libro filtradas por schema `monto>0`. Fuente: `Data/NSGC/ingresosvsegresos.23y24/INGvsEGR.xlsx` hoja Egresos → `data/finanzas/punto-cero-2324.json`.

Campos: `id`, `folio FE-####` (auto), `fecha AAAA-MM-DD`, `categoria` (sueldos/mantencion/servicios/administracion/uso_de_fondo/otro), `descripcion` (Concepto), `monto >0`, `fondoId` (FK fondosFI, obligatorio), `esRecurrente`, `comprobante?` {nombre/tipoMime/tamanoKB/url D1}, `microSectoresIds?` (gastos diferenciados), `proveedor?`, `unidadId?`, `aprobacionActaGDId?` (retiros de reserva).

## 📥 `ingresosFI` (históricos P2 + operativa)

**Históricos P2:** 44 registros `fi-ing-hist-001..044` imputados a `fondo-cc-punto-cero`, familias Contribuciones/Fondo de Reserva/Multas/Otros Ingresos. Totales: $45.408.317 (2023 $13.309.017, 2024 $32.099.300). 1 fila con monto 0 filtrada. Saldo CC: 24 meses (ene-23→dic-24) con apertura 17.082.694 cierra en 0.

Campos: `id`, `fecha AAAA-MM-DD`, `monto>0`, `concepto`, `fondoId` FK, `familia?`.

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
