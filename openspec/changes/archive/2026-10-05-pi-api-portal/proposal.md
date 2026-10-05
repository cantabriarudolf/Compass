# Proposal: pi-api-portal (SERIE-GATED-API-BD P2)

## Problema
El GATED `portal` depende de QA-Lab "Poblar todo de una vez", que escribe
`publicacionesPortal`/`leadsPortal` en el store legacy mientras
`/comunidad/portal` ya lee personas/vínculos/unidades/notificaciones/config
vía API (`cd56d02`) pero publicaciones/leads del store (`TODO` en
`app/comunidad/portal/page.tsx:64`). Verificado en P2 sobre reseed limpio: el
spec pasa en verde (7/7), pero el acoplo al store persiste — cualquier cambio
de QA-Lab (P4) o del guard de poblar lo vuelve a romper. Causa estructural de
P4 E2E-FULL-VERDE: páginas que leen store + QA-Lab que escribe store.

## Propuesta
API PI con el contrato canónico + migración de la page + spec independizado:
- `POST/GET /api/publicaciones-portal` + `[id]` (GET_ONE/PUT/DELETE) vía
  crud-factory + `PublicacionPortalSchema` (sin refine → factory directa, sin
  put-merge). Sin migración Prisma (campos 1:1 con el schema).
- `POST/GET /api/leads-portal` + `[id]`: POST custom (valida publicación
  existente+activa, upsert, notifica al propietario vía bandeja + evento
  `PI_LEAD_CONTACT` server-side); resto vía factory. Se incluye leads aunque el
  spec no lo ejercita: `saveLeadPortal` valida contra publicaciones y dejarlo
  en store rompería "Me interesa" al vaciarse el store (desviación motivada
  vs prompt P2).
- Authz: lectura abierta a cualquier rol autenticado del scope (la vitrina es
  visible a residentes); escritura publicaciones y gestión leads solo
  administración (`puede(rol, accion, "pi")`); crear lead abierto (cualquier
  autenticado expresa interés). DELETE publicación con leads → 409
  (`beforeDelete`, paridad con el guard del store).
- Hooks `use-publicaciones-portal` / `use-leads-portal` (espejo
  `use-cobros-fi`) + migración de `app/comunidad/portal/page.tsx` (mantiene UX
  y textos: "E-999", "venta", "Retirada"/"Activa").
- Reescritura `e2e/crud/portal.spec.ts` patrón P3: publicación TEST vía API +
  cleanup, sin QA-Lab. Tests `test/api/api-publicaciones-portal.test.ts`
  (+ leads: POST custom, 401, 404 cross-comunidad).
- El change queda abierto (lo archiva P5).

## Alcance
- `app/api/publicaciones-portal/**`, `app/api/leads-portal/**`
- `lib/api/use-publicaciones-portal.ts`, `lib/api/use-leads-portal.ts`
- `app/comunidad/portal/page.tsx`, `e2e/crud/portal.spec.ts`
- `test/api/api-publicaciones-portal.test.ts`
- Deltas en spec PI-portal-inmobiliario (este change)
