# CT-certificados Tasks

## 1. Store (ST) y esquemas

- [ ] 1.1 Schema `CertificadoCTSchema`: tipo (`residencia|estado_cuenta|liquidacion_sueldo|al_dia`), folio CT-#### auto, `codigoVerificacion` único, unidadId/personaId opcionales según tipo, `origenRef`, `payloadSnapshot` (datos usados al emitir), `firmaUrl` (referencia D1 a firma CF), fechaEmision
- [ ] 1.2 Acciones repository con `StoreResult`: `generarCertificadoCT` con gates (residencia: vínculo activo; estado_cuenta: unidad existente + snapshot cobros/pagos; liquidacion_sueldo: liquidación confirmada; al_dia: saldo <= 0) y `removeCertificadoCT` (solo TEST)
- [ ] 1.3 Colección `certificadosCT` (rank 6); bump `STORE_VERSION` 23→24 migrate aditivo
- [ ] 1.4 Eventos AM `CT_GENERATE_RESIDENCE/FINANCIAL/PAYROLL/AL_DIA` con data cuantificable
- [ ] 1.5 Plantillas PDF en `lib/pdf-utils.ts`: encabezado institucional CF, cuerpo por tipología desde payloadSnapshot, firma embebida como imagen (runtime), pie con código de verificación

## 2. UI

- [ ] 2.1 `/comunidad/certificados/page.tsx`: Generar (tipo + destino dinámico por tipología), vista previa de gate, PDF firmado, Historial de Emisión con código de verificación y filtro por tipo

## 3. QA Lab

- [ ] 3.1 Seeds TEST: certificado residencia TEST sobre vínculo TEST, certificado al día TEST sobre unidad pagada + rechazo de unidad morosa TEST, certificado liquidación TEST sobre la liquidación confirmada PL; limpieza inversa

## 4. Validación

- [ ] 4.1 tsc + eslint 0 errores + suite vitest verde completa
- [ ] 4.2 openspec validate --all sin errores
