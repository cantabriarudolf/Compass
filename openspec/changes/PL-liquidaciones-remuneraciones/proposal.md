# PL-liquidaciones-remuneraciones

## Why

El módulo PL del NSGC automatiza el cálculo de haberes, descuentos y pagos del personal cruzando la asistencia reportada (PE) con las condiciones contractuales y los parámetros legales de CF, generando documentos legales con firma y registros contables en FI. Es la primera pieza de la ventana 8 (Sesión 7) de la serie NSGC y materializa el pendiente `liquidacionPLReferencia` dejado por PE.

## What Changes

- Nueva capability **PL-liquidaciones-remuneraciones**: generación de liquidaciones con estructura estándar chilena (haberes imponibles/no imponibles, descuentos legales AFP/salud/SIS/cesantía/APV, anticipos, totales de control), gestión de adelantos de sueldo con comprobante de entrega e historial de folios, integración contable automática (egreso "Sueldos" en FI al confirmar) y PDF oficial con firma digitalizada embebida vía pdfmake.
- **pdfmake se instala ahora** (`k0mp4ss_fe/apps/web`), como restricción de salida documental: solo genera el binario PDF en memoria al descargar, jamás persiste base64/Blob en el store (D1).
- Parámetros legales CF (delta ya especificado): `ufMensual`, `ingresoMinimoMensual`, `topeGratificacionLegal` (factor sobre IMM), `tasaSIS` — opcionales para compatibilidad, auditados con `CF_UPDATE_PARAM`.
- Extensión aditiva de `ExtensionLaboralSchema`: `sueldoBase` (opcional) para la liquidación; FKs legales existentes no cambian.
- Colecciones nuevas en ST (rank 6 `CT/PL`): `liquidacionesPL` (snapshot inmutable de líneas calculadas + totales) y `adelantosPL` (ciclo Pendiente → Descontado).
- Acciones repository: `generarLiquidacionPL` (calcula §1.1 horas extras contra jornada CF/PE, gratificación legal con tope, asignación familiar desde maestro MA, descuenta adelantos pendientes y materializa `liquidacionPLReferencia` en proyeccionesPE), `confirmarLiquidacionPL` (crea egreso FI categoría sueldos → evento `PL_EXPENSE_SYNC`), `removeLiquidacionPL` (solo borrador), `saveAdelantoPL`/`removeAdelantoPL`. Helpers puros en `lib/pl-utils.ts`.
- Eventos AM: `PL_GENERATE_PAYSLIP`, `PL_ADD_ADVANCE`, `PL_DELETE_PAYSLIP`, `PL_EXPENSE_SYNC`.
- Bump `STORE_VERSION` 22 → 23 con migrate aditivo (2 colecciones vacías).
- UI `/finanzas/remuneraciones` (ruta ya prevista en sidebar, roles admin): pestañas Liquidaciones / Adelantos / Parámetros Legales (CF).

## Capabilities

### New Capabilities
- `PL-liquidaciones-remuneraciones`: cálculo de remuneraciones estándar Chile con asistencia PE, maestros legales MA y parámetros CF; adelantos con comprobante; egreso contable FI y PDF con firma.

### Modified Capabilities
- `CF-configuracion-global`: implementa los parámetros legales Chile para remuneraciones (UF mensual, ingreso mínimo mensual, tope gratificación legal, tasa SIS) editables solo por administración y auditados.
- `ST-capa-datos-persistente`: colecciones `liquidacionesPL`/`adelantosPL` rank 6, bump v23 aditivo, validación FK en escritura, bloqueo inverso al eliminar maestros legales usados en snapshots, auditoría `CF_UPDATE_PARAM` de parámetros legales.
- `AM-auditoria-metricas`: catálogo de eventos PL con data cuantificable (gasto mensual en remuneraciones, volumen de adelantos, tasa de retenciones).
- `RP-roles-permisos`: matriz PL — administración gestiona liquidaciones/adelantos/parámetros; personal consulta sus propios documentos.

## Impact

- Código: `lib/schemas.ts` (+2 esquemas, +4 parámetros CF, `sueldoBase` opcional), `lib/store.ts` (+2 colecciones, +6 acciones, migrate v23, auditoría CF), nuevo `lib/pl-utils.ts`, nuevo `lib/pdf-utils.ts` (motor pdfmake compartido PL/CT), páginas `/finanzas/remuneraciones`, qa-lab fase final.
- Specs: nueva carpeta `openspec/specs/PL-liquidaciones-remuneraciones/`; deltas MODIFIED sobre CF/ST/AM/RP.
- Depende de: MP (identidad del trabajador), PE (ficha laboral con FKs legales, horas extras registradas, proyección pendiente), MA (afps/previsionesSalud/asignacionFamiliar/bancos), CF (diasMesComercial, jornadaSemanalEstandar, parámetros legales nuevos), FI (fondo GC destino del egreso), ST (`notify()`).
- Tests afectados: nueva suite `test/store-remuneraciones.test.ts`; sin cambios en suites previas (evolución aditiva/opcional).
