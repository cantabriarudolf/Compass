# Proposal: e2e-rojos-crud (SERIE-E2E-FULL-VERDE P2)

## Problema
Baseline P2 sobre reseed limpio P1 (restore P3 + 2 seeds, scope A OK, setup
auth 6/6): lane no-GATED 12 pass / 9 fail. Causas verificadas (no asumidas,
reproducidas con spec debug temporal):

1. `admin-configuracion`: el PUT nunca se dispara. La columna Prisma es
   `rutCondominio` (legacy) pero el schema Zod + form usan `rutComunidad`
   (requerido). El GET devuelve la fila sin `rutComunidad` → input required
   vacío → la validación nativa del form bloquea el submit silenciosamente
   (`form.checkValidity() === false`, sin request). El fix P2-parcial
   (`febb25a`, nullable en opcionales) era necesario pero insuficiente.
2. `tipos`, `personal`, `proyectos` (+ `reservas` por verificar): dialogs
   Radix que no cierran tras guardar (`toBeHidden` / `getByRole('dialog')`
   timeout). Patrón: error de validación/FK contra datos del seed o falta
   de cierre explícito tras mutación exitosa.
3. `gestion`, `admin-reporteria`, `punto-cero` (1/2), `roles-journeys`
   (conserjería): causas por verificar una por una.
4. GATED (`certificados`, `pagos`, `portal`, `remuneraciones`): corren al
   final con estrategia P1 (`e2e:full-orden`).

## Propuesta
1. Fix `admin-configuracion`: migración Prisma rename
   `rutCondominio` → `rutComunidad` (preserva datos) + alinear defaults de
   la route, seed, listas de cifrado y fixtures. Terminología RG §4
   ("comunidad"). Test: PUT persiste nombre + GET lo refleja.
2. Por cada spec rojo restante: triage individual (causa verificada) + fix
   pequeño con test + delta en este change.
3. Si un rojo resulta bug grande de módulo: NO agrandarlo — dejarlo PARCIAL
   con nombre y apellido para P4/owner y seguir con el resto.
4. Criterio de salida: lane `e2e/crud` completa en verde sobre reseed limpio
   (una sola corrida) + tsc/lint/validate OK.

## Alcance
- Toca: `prisma/schema` (+migración), `app/api/configuracion`,
  `scripts/seed-db-from-mocks`, listas de cifrado, specs e2e CRUD en P2.
- No toca: flujo/a11y/smoke (P3), archivado de changes (P4).
