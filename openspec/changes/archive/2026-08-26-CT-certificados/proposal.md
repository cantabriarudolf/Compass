# CT-certificados

## Why

El módulo CT del NSGC genera la documentación oficial y acreditaciones para residentes y personal (certificado de residencia, estado de cuenta, liquidación de sueldo, certificado "Al Día"), garantizando validez mediante firma digitalizada del administrador, folio e historial de emisión con código de verificación único. Es la segunda pieza de la ventana 8 (Sesión 7) de la serie NSGC.

## What Changes

- Nueva capability **CT-certificados**: suite de 4 tipologías nutridas de datos reales del store — Residencia (VU: solicitante activo en unidad), Estado de Cuenta (FI snapshot de cargos/abonos), Liquidación de Sueldo (PL confirmada; control administración/descarga trabajador) y Al Día (gate saldo <= 0) — con historial de emisión auditable.
- **pdfmake** como restricción de salida: el PDF se genera en memoria con la firma digitalizada embebida **como imagen dentro del documento**; el store solo persiste metadatos por referencia (D1): URL de la firma usada, nunca el binario ni base64.
- Colección nueva en ST (rank 6 `CT/PL`): `certificadosCT` con folio CT-####, código de verificación único, snapshot del payload emitido y referencia a la fuente (`origenRef`).
- Acciones repository: `generarCertificadoCT` (valida gates por tipología, snapshot inmutable, código verificación), `removeCertificadoCT` (solo ids TEST; el historial de emisión es auditablemente inmutable).
- Eventos AM: `CT_GENERATE_RESIDENCE`, `CT_GENERATE_FINANCIAL`, `CT_GENERATE_PAYROLL` (+`CT_GENERATE_AL_DIA` bajo FINANCIAL data).
- Bump `STORE_VERSION` 23 → 24 con migrate aditivo (colección vacía).
- UI `/comunidad/certificados` (ruta ya prevista en sidebar): selector tipo + destino, botón Generar PDF firmado, historial con código de verificación.

## Capabilities

### New Capabilities
- `CT-certificados`: generación certificada de documentos oficiales con gates por tipología, firma embebida en el PDF, folios y código de verificación.

### Modified Capabilities
- `ST-capa-datos-persistente`: colección `certificadosCT` rank 6, bump v24 aditivo, validación FK por tipología, media D1.
- `AM-auditoria-metricas`: catálogo de eventos CT con data cuantificable (certificados por tipo, tiempo de respuesta).
- `RP-roles-permisos`: matriz CT — administración genera todos; residente solicita residencia/estado de cuenta/al día de su unidad; trabajador descarga su liquidación.

## Impact

- Código: `lib/schemas.ts` (+1 esquema), `lib/store.ts` (+1 colección, +2 acciones, migrate v24), nuevo `lib/pdf-utils.ts` ya creado por PL (se extiende con plantillas de certificados), página `/comunidad/certificados`, qa-lab fase final.
- Specs: nueva carpeta `openspec/specs/CT-certificados/`; deltas MODIFIED sobre ST/AM/RP.
- Depende de: VU (vínculos activos para residencia), FI (saldo/cobros para estado de cuenta y al día), PL (liquidaciones confirmadas), CF (firmaDigitalizadaUrl, identidad comunidad), MP (solicitantes).
- Tests afectados: nueva suite `test/store-certificados.test.ts`; sin cambios en suites previas.
