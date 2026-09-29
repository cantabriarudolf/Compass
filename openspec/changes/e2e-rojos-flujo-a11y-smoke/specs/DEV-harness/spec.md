## MODIFIED Requirements

### Requirement: Consentimiento persistido en el setup e2e
`e2e/auth.setup.ts` SHALL aceptar el banner de cookies con verificación
del flag en localStorage (reintento ×3): el click pre-hidratación se pierde
sin listener y el flag no llegaba al storageState, de modo que el banner
fijo tapaba triggers al fondo del viewport e interceptaba clics (caso
`permisos` paso 5: el dropdown B nunca abría).

#### Scenario: StorageState hereda el consentimiento
- **WHEN** el setup autentica cada cuenta TEST
- **THEN** `e2e/.auth/<rol>.json` incluye el flag en localStorage y ningún
  spec ve el banner (e2e `permisos` en verde ~15s).

### Requirement: Higiene BD repetible (`e2e:higiene`)
`scripts/higiene-qa-test.mjs` SHALL purgar filas TEST/QA por patrón de id
(timestamp/base36 o prefijos TEST-/QA-/ct-test-...) en tablas de dominio,
sin tocar seed (personas, fondos/egresos/ingresos punto-cero, maestros),
auditoría (append-only) ni membresías. DRY-RUN por defecto, `--apply`
ejecuta. El backup P3 trae leftovers de corridas previas que rompen la
asunción "mi fila TEST es única" (caso `solicitudes`: abría el detalle de
una fila stale). Receta reseed P3 = restore P3 + migrate + 2 seeds +
punto-cero a A + `e2e:higiene --apply`.

#### Scenario: Reseed deja BD sin leftovers
- **WHEN** se corre la receta completa
- **THEN** `e2e:higiene` (dry-run) reporta 0 filas a purgar y las lanes
  no-GATED parten de estado determinista.
