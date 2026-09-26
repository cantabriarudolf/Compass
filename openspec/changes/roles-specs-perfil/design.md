# Design: roles-specs-perfil

## Decisión

Seguir el patrón de `e2e/crud/roles-journeys.spec.ts`: un `test.describe` por
perfil con `test.use({ storageState })`, helpers `gotoStable` +
`pickFirstOption`, recolección de `pageerror` (debe ser `[]`), entidades
`TEST-*` con timestamp (nunca reutilizar ids del seed, nunca confirmar
retiros/pagos del seed, nunca conteos exactos frágiles).

## Mapeo spec ↔ fuente de verdad

| Spec nuevo | Fuente | Qué afirma |
| --- | --- | --- |
| `maestros-datos.spec.ts` | `/admin/maestros` (8 subtabs: estados, macros, micros, tipos, condiciones, estadosInmobiliarios, emergencias, bancos) + `admin-maestros.spec.ts` (diálogo Nuevo Registro) | cada subtab renderiza filas con datos del seed; crea 1 `TEST-*` en bancos y verifica la fila |
| `residente-ficha.spec.ts` | `GET /api/mis-datos` (persona p-3 Roberto Gómez) + `/admin/mis-datos` + `/operaciones/reservas` (Nueva reserva) + `/comunidad/certificados` (Generar) | ficha propia + reserva RA `TEST-*` confirmada + certificado CT de su unidad |
| `arrendatario-limite.spec.ts` | ficha `p-arrendatario-1` (Daniela Fuenzalida, vínculo `v-arrendatario-1` rol arrendatario en `u-A-101`, `permiteVerFinanzas: false`) + `GET /api/mis-datos` + `GET /api/personas` (filtrado propio) | ve su ficha y su unidad; su vínculo oculta finanzas; no ve fichas ajenas |
| `abac-denegacion.spec.ts` | `GET /api/personas` (residente: solo propia) + `GET /api/personas/p-5` (ajena → 403 `mp:propios`) + `GET /api/admin/usuarios` (→ 403) | filtrado en colección + 403 en detalle ajeno + 403 en admin:usuarios |

## Setup + MATRIZ (arrendatario)

- `e2e/auth.setup.ts`: agregar `{ email: "arrendatario@test.cl", archivo:
  "e2e/.auth/arrendatario.json" }` a `CUENTAS` (pasa de 5 a 6 sesiones; el
  prompt la llama "7ma" contando admin dos veces por sus 2 membresías — la
  realidad es 6 archivos).
- `roles-accesos.spec.ts`: entrada MATRIZ `arrendatario@test.cl` con visibles
  `["Inicio","Operaciones","Finanzas","Comunidad"]` y ocultos
  `["Inventario","Personas","Desarrollo AI","Sistema"]` + `describe` que usa
  `storageState: e2e/.auth/arrendatario.json` y verifica 403 en admin:usuarios.

## Fix ARRANQUE P2 (rojo heredado P1)

- `/admin/gestion`: filtro `datosGobernanza !== undefined` dejaba pasar
  `null` (JSON de BD) y el render `p.datosGobernanza!.cargoDirectiva`
  reventaba (`Application error`) para todo rol con datos de comunidad-a
  (comite, residente, admin tras alinear su scope a A). Fix: `!= null` en
  `directiva` y `personal` (misma clase de hazard en `datosLaborales`).
  Test: los propios `roles-accesos.spec.ts` (6 roles) + `roles-menu.spec.ts`.
- Seed `seed-authz.mjs`: orden `membresiasData` intencional (admin-a
  ÚLTIMA) para que el scope del admin sea comunidad-a (diseño
  `cuentas-funcionales.md` §3.4); antes B quedaba más reciente y el admin
  veía cero datos (comunidad-b vacía). Solo afecta BDs frescas; en dev se
  recreó la membresía admin-a (borrar + `seed:authz`).

## Por qué no las alternativas

- Extender `roles-journeys.spec.ts` en vez de specs propios: el archivo ya cubre
  4 journeys; mezclar ficha/ABAC/límite lo vuelve frágil y rompe la regla de la
  serie (un spec por capacidad, "sin conteos frágiles").
- Unit tests contra `puede()` para ABAC: `puede` es RBAC puro; el `mp:propios`
  vive en las rutas API (scope + `personaIdDelUsuario`), así que la evidencia
  debe ser e2e contra la API real con sesión real.

## Riesgos

- Bajo-medio: selectores de diálogos RA/CT (mitigado con el patrón defensivo
  `pickFirstOption` + asserts de confirmación, no de forma).
- Bajo: filas `TEST-*` en BD dev (convención del proyecto; QA Lab las distingue;
  no se commitea la BD).
