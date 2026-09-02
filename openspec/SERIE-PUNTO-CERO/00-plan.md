# Serie PUNTO-CERO — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila EN CURSO
> y actualizarla antes del push final. Reanudación: "corre la serie SERIE-PUNTO-CERO".

**Objetivo:** los datos reales de ingresos/egresos 2023-2024 del condominio
(`Data/NSGC/ingresosvsegresos.23y24/INGvsEGR.xlsx`) se convierten en el **nuevo punto cero**
del sistema: el fondo "Cuenta Corriente" arranca con la historia real cargada y saldos
validados contra el libro.

**Decisiones cerradas con el owner (2026-09-02):**
1. **Feature nueva "Ingreso manual a fondo"** — hoy los ingresos FI solo nacen de cobros por
   unidad; los 45 ingresos históricos son agregados mensuales y exigen un concepto propio.
2. **Versatilidad de apertura**: los fondos ganan campo opcional `saldoInicial` (editable en
   UI) que `saldoFondo()` suma — así un comprador del sistema puede reflejar el flujo tal
   cual (apertura 0) o cuadrar contra su libro (apertura ajustada). Para NUESTRO punto cero
   se carga la apertura que cuadra el fondo CC con el Saldo CC del libro (0 al cierre dic-24).
3. **Destino: store v26→v27** (migración idempotente por IDs deterministas `*-hist-*`).
   La sincronización FI→Prisma queda para ST (fuera de alcance).

**Datos verificados (ETL de análisis, `node + xlsx` sobre el archivo):**
- Ingresos: 45 filas · $45.408.317 · familias Contribuciones/Otros Ingresos/Multas/Fondo de
  Reserva · 11 conceptos · 2023 $13.309.017 / 2024 $32.099.300.
- Egresos: 186 filas · $62.491.011 · 12 familias · 16 conceptos · 2023 $19.506.242 / 2024
  $42.984.769.
- Saldo CC: 24 meses (ene-23→dic-24); movimientos desde jul-2023 ($3.881.470); cierre $0.
- Flujo neto cargado = −$17.082.694 → **apertura de fondo CC = $17.082.694** para cerrar en 0
  (saldoInicial configurable; con 0 el fondo queda negativo fiel al flujo — ambos válidos).

**Mapeos cerrados:**
- Familia egreso → categoría EgresoFI: Remuneraciones/Imposiciones/Aguinaldos→`sueldos`;
  Mantenimientos/HidroPack/Portón→`mantencion`; Servicios Básicos→`servicios`;
  Trámites→`administracion`; Útiles de Aseo/Materiales/Varios/Sin Especificar→`otro`.
- `esRecurrente`: true solo para Concepto "Pago Administración" (gasto fijo mensual).
- Fechas dd/mm/yyyy → ISO. Folios FE-#### secuenciales (respetan el generador del store).
- IDs deterministas: fondo `fondo-cc-punto-cero`, egresos `fi-egr-hist-NNN`,
  ingresos `fi-ing-hist-NNN` → migración v27 idempotente (re-correr no duplica).

## Quirúrgicos y reglas

- `STORE_VERSION` 26 → 27 con migración `v26→v27` que solo AÑADE (fondo + egresos +
  ingresos + saldoInicial del fondo CC) si no existen los IDs deterministas.
- La migración corre para TODO store existente (el punto cero es la nueva línea de base de
  la comunidad "Edificio Plaza Central" — convive con el seed NSGC y los datos TEST-*).
- ETL: el JSON normalizado se commitea como `data/finanzas/punto-cero-2324.json`
  (fuente: INGvsEGR.xlsx) — la migración lo importa; NO se parsea el xlsx en runtime.
- `saldoFondo()` (lib/finanzas-utils.ts) extiende `ContextoSaldoFondo` con
  `saldoInicialPorFondo?: Record<string, number>` o equivalente — sin romper los 462 tests.
- Validación de cierre: `saldoFondo("fondo-cc-punto-cero") === 0` (con apertura cuadrada).
- `next build` puede fallar por red (Google Fonts): ignóralo. Contexto agotado: cierra,
  commitea, deja estado exacto aquí.

## Roadmap

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | Feature "Ingreso manual a fondo": IngresoFISchema + colección ingresosFI + acción registrarIngresoFI + saldoInicial en FondoFI + saldoFondo() extendido + STORE_VERSION 27 + migración (vacía de datos, solo versión) + UI form/lista en FI + tests unit | HECHA | ac608f9 |
| P2 | ETL punto cero: fixture `data/finanzas/punto-cero-2324.json` (xlsx→JSON con mapeos) + migración v27 que carga fondo CC + 186 egresos + 45 ingresos + apertura cuadrada + validación saldo==0 + tests de la migración | pendiente | — |
| P3 | e2e del punto cero (egresos históricos visibles con folio, ingresos manuales, saldo del fondo CC en UI) + dashboards/reportería reflejando 2023-2024 + cierre integral (suite completa) + avance NSGC + SERIE COMPLETA | pendiente | — |

## Bitácora

- [2026-09-02] P1 HECHA: FI ingreso manual a fondo + saldoInicial versátil + STORE_VERSION 27 + migración ingresosFI + UI FI + 12 tests (474/474) + e2e FI verde (ac608f9)
