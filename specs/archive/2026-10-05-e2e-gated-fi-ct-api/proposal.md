# Proposal: e2e-gated-fi-ct-api (SERIE-GATED-API-BD P1)

## Problema
Los GATED `pagos` y `certificados` dependían de QA-Lab "Poblar todo de una
vez", que escribe el store legacy mientras `/finanzas/pagos` y
`/comunidad/certificados` leen BD vía API REST (`useCobrosFI`,
`useCertificadosCT` + `usePersonas`/`useUnidades`). Tras poblar, las páginas
ven vacío y los specs caían en fallbacks frágiles (emisión GC por UI,
inyección localStorage). Causa estructural verificada en P4 E2E-FULL-VERDE.

## Propuesta
Reescribir `e2e/crud/pagos.spec.ts` y `e2e/crud/certificados.spec.ts` con el
patrón P3 (datos TEST propios vía API + cleanup, sin QA-Lab):
- pagos: unidad TEST vía POST `/api/unidades` + cobro pendiente TEST vía POST
  `/api/cobros-fi` (upsert por factory, id pre-generado OK) + fondo del seed
  vía GET `/api/fondos-fi` + cleanup (PUT reset de pagos por guard 409, luego
  DELETE cobro y unidad). Sin fallback localStorage.
- certificados residencia: persona + unidad + vínculo propietario activo TEST
  vía POST a `/api/personas`, `/api/unidades`, `/api/vinculos` + cleanup en
  orden (vínculo → persona → unidad, guards 409). Resto del flujo igual
  (generar PDF, folio CT-, historial, VC-).
Sin cambios de app. El change queda abierto (lo archiva P5).

## Alcance
- `e2e/crud/pagos.spec.ts`, `e2e/crud/certificados.spec.ts`
- Deltas en specs FI-finanzas-morosidad y CT-certificados (este change)
