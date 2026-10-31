## Context

El motor RP ya opera en producción: `lib/authz.ts` (MATRIZ privada por rol, `puede()`,
`tienePermiso()`), `GET /api/admin/usuarios` (Auth.js session → membresía → `puede(rol,"ver",
"admin:usuarios")` → listado scoping por comunidad), modelo Prisma `Usuario`/`Membresia`,
seed QA Lab (admin@test.cl en comunidad-a y comunidad-b). La sesión no trae comunidades, y
el store local no conoce los ids de comunidad de la BD → la vista necesita descubrirlas por
API. Último placeholder del sidebar (`RUTAS_PENDIENTES`).

## Goals / Non-Goals

- **Goals:** vista `/admin/permisos` solo lectura (selector de comunidad propio + matriz por
  rol + membresías de la comunidad); API que permita descubrir las comunidades del usuario;
  quitar el último placeholder del sidebar.
- **Non-Goals:** asignar/cambiar roles o membresías desde la UI (queda en QA Lab seed);
  editar la matriz (código fuente del motor); ABAC filters visuales; cambios a Auth.js.

## Decisions

1. **API existente, rama nueva**: `GET /api/admin/usuarios` sin `comunidadId` →
   `{ comunidades: [{ id, nombre, rol }] }` de las membresías del usuario autenticado (sin
   datos de terceros). Con `comunidadId` → contrato actual intacto (401/400/403/404/200).
   Misma guarda de sesión; sin endpoint nuevo ni versión de API.
2. **Snapshot de matriz con helper puro**: `matrizPermisos()` en `lib/authz.ts` devuelve
   `Record<Rol, { recurso, acciones[] }[]>` plano derivado de MATRIZ (wildcard del
   administrador incluida como recurso `*`). Puro → testeable en Vitest (el e2e solo pinta).
   La vista lo importa directamente (misma bundle que usa el motor — nunca desincroniza).
3. **Vista client component** con dos fases: sin comunidad elegida muestra el selector;
   elegida una, muestra membresías (`fetch("/api/admin/usuarios?comunidadId=…",
   { credentials: "same-origin" })`). La matriz se muestra siempre, agrupada por rol con
   badges de acciones por recurso. Solo lectura por diseño (ni un botón de mutación).
4. **E2E read-oriented**: admin@test.cl tiene membresías en A y B → el spec afirma selector
   con ambas comunidades, elige una, afirma la tabla de membresías (emails del seed),
   matriz con wildcard `*` para administrador y ausencia de botones de edición. Sin QA Lab
   (no es gated: datos authz ya seeded por el setup de la app... se verificará en ejecución;
   si la BD no está seedeada, el spec usa el botón QA Lab "Crear usuarios TEST" como
   precondición, mismo patrón gated del 00-plan).

## Risks / Trade-offs

- La rama sin `comunidadId` cambia la respuesta de error 400 actual (requería `comunidadId`)
  → es un cambio de contrato controlado, cubierto por delta spec y por el e2e; el único
  consumidor actual de la API es esta vista (no hay otros callers en `app/`).
- `matrizPermisos()` expone la matriz al cliente bundle → no es secreto (el motor ya corre
  client-side en guardas de UI); menor privilegio se mantiene server-side.
- BD Prisma requerida en dev: si la BD local no tiene seed authz, la vista muestra estado
  vacío con CTA al QA Lab (mismo mensaje del seed) — el e2e lo contempla.

## Open Questions

(ninguna — scope cerrado con el owner: solo lectura; la edición queda diferida)
