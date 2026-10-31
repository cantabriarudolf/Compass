# Proposal — `retiro-modulo-qa-dev`

## Qué

Retira el módulo QA/dev (F9): el Laboratorio QA, el dashboard OpenSpec, el dashboard de
estado de pruebas QA y la pantalla de mantenimiento, junto con sus rutas API
(`/api/qa-estado`, `/api/qa-roadmap`, `/api/qa-lab/**`, `/api/dev-dashboard`), su guard de
acceso, sus helpers de backup/diff y sus entradas de menú.

## Por qué

- El Laboratorio escribía datos de dominio en el store legacy del navegador mientras las
  pantallas migradas leían la base por API: el poblamiento que mostraba el Lab nunca
  aparecía en los módulos reales (gap estructural documentado en los propios specs e2e).
- Ejecutaba purgas destructivas de datos TEST desde la UI con un guard propio
  (`app/admin/_qa-dev-guard.tsx`, `lib/qa-dev-acceso.ts`) en vez del motor de permisos:
  la excepción `qa-lab` vivía en la allowlist de `scripts/audit-desvios.mjs`.
- Era la última deuda del candado `audit:store`: sus tres pantallas eran las únicas
  excepciones de la allowlist de `scripts/audit-store.mjs`.
- Sus rutas dev participaban del gate de seguridad estático (`scripts/security-recheck.mjs`)
  aun sin existir ya, y el sidebar seguía ofreciendo URLs retiradas.

## Alcance

Dentro:

- Pantallas: `app/admin/qa-lab/`, `app/admin/qa-dashboard/`, `app/admin/dev-dashboard/`,
  `app/admin/mantenimiento/`, `app/admin/_qa-dev-guard.tsx`, `lib/qa-dev-acceso.ts`.
- Rutas API: `app/api/qa-estado/`, `app/api/qa-roadmap/`, `app/api/qa-lab/`,
  `app/api/dev-dashboard/`; lógica del dashboard en `lib/dev-dashboard.ts`.
- Helpers: `lib/store-backup.ts` y `lib/store-diff.ts` se retiran; `lib/qa-lab-helpers.ts`
  queda reducido a `esCobroTest`, que es regla de producción de `app/api/cobros-fi/[id]`.
- UI: sección «Desarrollo AI» del sidebar (con sus 4 entradas) y el enlace al Lab en
  `/admin/permisos`.
- Tests y e2e del módulo. El fallback de seed de TEST de `e2e/crud/permisos.spec.ts` pasa a
  `POST /api/admin/seed-authz` (mismo seed liviano, ruta que sobrevive) y
  `e2e/flujo/poblamiento.spec.ts` conserva sólo los casos que crean su dato por API con
  `e2e/helpers/datos-test.ts`.
- Candados: entrada `qa-lab` de `scripts/audit-desvios.mjs`; las 3 excepciones del módulo en
  `scripts/audit-store.mjs` (allowlist vacía, marcador `audit:store: archivos=0`); los
  chequeos de `scripts/security-recheck.mjs` que leían los archivos retirados.
- Specs: `DEV-qa-lab` y `DEV-qa-roadmap` se retiran completas (todos sus requirements).

Fuera:

- **F22 (retiro del store legacy) NO es parte de este change.** El owner lo declaró cancelado
  como unidad: `useCompassStore` conserva dos consumidores de producción (`lib/fi-sync.ts` y
  `lib/auditoria-sync.ts`, montados desde `app/layout.tsx`) y decenas de tests, y `hasHydrated`
  sólo cambia en `onRehydrateStorage`; retirarlo exige rediseñar la hidratación primero.
  `lib/store.ts` queda exactamente como está.
- `app/api/cobros-fi/**` y `esCobroTest`: son producción y no cambian de comportamiento.
- `POST /api/backup`: sobrevive completo. Lo único que desaparece es su consumidor
  «Exportar JSON» del Laboratorio; el endpoint sigue respaldando y sigue devolviendo el
  archivo con nombre fechado por el servidor.
- Otras capacidades: ningún otro contrato de spec se toca.

## Riesgo

- `DEV-qa-lab` creció hasta incluir requirements de infraestructura de pruebas que siguen
  vigentes y no dependen del Laboratorio: cobertura RTL+MSW del flujo de sesión, consentimiento
  persistido en `e2e/auth.setup.ts`, `e2e:higiene`, convención `TEST-*`, corrida e2e única sin
  tag GATED y el ratchet de cobertura de Vitest. Este change los retira como contrato de la
  capability; el código y los scripts que los implementan permanecen. Si el owner quiere
  conservarlos por escrito hay que re-alojarlos en otra capability antes de archivar.
  `check-delta-coverage.mjs` no lo detecta: sólo valida nombres y escenarios de `MODIFIED`.
- Los specs e2e `e2e/auth/roles-accesos.spec.ts` y `e2e/auth/roles-menu.spec.ts` todavía
  esperan el grupo «Desarrollo AI» del sidebar. No están en las superficies de esta unidad y
  deben actualizarse en la misma ventana; si no, la lane `auth` falla.
- Sin riesgo de runtime: las rutas retiradas no tienen consumidores de producción fuera del
  propio módulo. La verificación lo cubre con el candado `test/qa-dev-retiro.test.ts` y el
  grep de superficies retiradas.

## Recorte de alcance del delta (2026-10-31)

`DEV-qa-lab` alojaba dos familias de requirements: los del **módulo** (ruta dev-only, carga por
rank, grid, limpieza TEST-*, historia viva, backups JSON) y los de **infraestructura de pruebas**
que viven en el repo y siguen vigentes (cobertura RTL+MSW del flujo de sesión, poblado
idempotente, consentimiento en el setup e2e, `e2e:higiene`, convención TEST-*, corrida e2e única,
ratchet de cobertura de Vitest).

Este change retira **solo los seis del módulo**. Los siete de infraestructura se quedan en la spec
viva de `DEV-qa-lab`, que pasa a hospedar únicamente contratos de prueba. Retirarlos habría
borrado contratos que el código todavía cumple, y `check-delta-coverage.mjs` no puede detectar
ese tipo de pérdida.

## `LAB-mejoras` entra en el retiro (2026-10-31)

La capability `LAB-mejoras` describe la Fase 5 del tablero dev y nueve mejoras del Laboratorio
(vínculos en ventana nueva, screenshots, poblado vía API por módulo, purga bulk). Su sujeto es el
módulo retirado, así que sus nueve requirements se retiran en este mismo change. Las capacidades de
poblado que sobreviven son las de base de datos (`seed:mocks`, `db:*`, `e2e:higiene`), contratos que
permanecen en `DEV-qa-lab`.
