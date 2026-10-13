# Design: qlab-purga-bulk (SERIE-NOCHE-2 P1)

## D1 — Endpoint único con guard + scope + authz

`POST /api/qa-lab/purga-test` (`app/api/qa-lab/purga-test/route.ts`, `export const dynamic =
"force-dynamic"`, runtime Node). Orden de cortes:

1. `isWriteApiEnabled()` falso → **404** (mismo patrón que `/api/qa-estado`: el guard decide
   ANTES que la sesión).
2. `withComunidadScope()` → **401** sin sesión, **403** sin membresía. La comunidad sale
   SIEMPRE de la membresía del servidor, nunca del body.
3. `puede(scope.rol, "eliminar", "qa-lab")` → **403** `Permiso denegado.` si el rol no es
   administración (hoy solo `administrador`, wildcard `*`; menor privilegio para el resto).

No acepta body: la purga es de la comunidad de la sesión y no parametrizable.

## D2 — Orden hijos→padres (una pass, ~26 `deleteMany`)

Cada paso es un `deleteMany` de Prisma sobre la comunidad, con `OR` de procedencia TEST donde
haga falta. Los pasos se ejecutan en este orden (hijos primero, para no dejar huérfanos que un
guard de ruta rechazaría borrar):

1. `cobros-fi` — `id|unidadId|origenRef` empieza con `test-` (la cobertura por procedencia es
   necesaria: la multa IN materializa un cobro con id `cob-*` generado por el servidor cuyo
   `origenRef` es la infracción `test-in-grave`; sin eso la multa se acumulaba entre corridas —
   bug ya documentado en `limpiar()`).
2. `emisiones-gc` — `id test-*` o `periodo` en los periodos TEST dedicados (`2019-03`,
   `2019-01`); los lineas son JSON y SQLite no puede filtrarlos, y esos periodos están fuera
   de todo calendario real.
3. `liquidaciones` (borradores QA: `id test-*` o `trabajadorPersonaId test-*`) y sus
   `egresos-fi` espejo (`egresoFIReferencia` con prefijo `egr-`, colectado de las
   liquidaciones QA antes de borrarlas).
4. `fondos-fi`, `egresos-fi` (`id test-*`).
5. `reservas-ra` antes que `elementos-ra` (`id test-*`).
6. `trabajos-mt` antes que `proyectos-mt` (`id test-*`).
7. `leads-portal` antes que `publicaciones-portal` (`id test-*`, orden documentado del guard
   409) y `notificaciones` (`moduloOrigen: "PI"` con la marca `TEST` en asunto/cuerpo, misma
   semántica que el bucle del cliente).
8. `vinculos`, `unidades`, `micro-sectores`, `macro-sectores`, `personas`, `tipos-unidad`
   (`id test-*`).
9. Maestros (`id test-*`): `bancos`, `contactos-emergencia`, `estados-inmobiliarios`,
   `condiciones-especiales`, `categorias-unidad`, `categorias-micro`, `categorias-macro`,
   `estados-ocupacion`.

Los dominios son tablas sin FK entre sí (claves string, solo la relación `comunidad` con
cascade), así que el orden hijos→padres es una garantía de negocio, no de constraints.

## D3 — "Solo test-*": prefijo + procedencia TEST documentada

El prefijo `test-` es el criterio principal. Tres extensiones de procedencia, todas
imposibles en datos reales (por diseño del lab: ids de infracción, unidades y periodos TEST
los genera el propio lab):

- cobros FI por `unidadId`/`origenRef` `test-*` (multa IN y cargos RA sobre unidades TEST);
- emisiones GC por periodo TEST dedicado;
- notificaciones PI con la marca `TEST` en el texto (las genera el lead QA).

## D4 — Inmutables: se saltan, no son bloqueo

Las liquidaciones PL **confirmadas** (inmutables por diseño, periodo rotativo) y los
certificados CT `test-*-ct` (PDF emitido) no se tocan y NO entran a `bloqueos`: son residuo
honesto documentado que `e2e:higiene` retira en cada reseed. Así la ruta feliz sigue
reportando `TEST-* limpio correctamente` con la confirmada QA presente (paridad con el bucle
de cliente actual, que también las deja pasar sin error).

## D5 — `{ borrados, bloqueos }` sin inventar

`borrados` solo incluye claves con `count > 0` (2ª corrida → `{}`). Un paso que lanza (p. ej.
P2003/P2009 de Prisma) emite `bloqueos.push("<coleccion>: <code> <primeros 120 chars del
mensaje>")` y la purga sigue con el resto: los conflictos reales aparecen con su motivo y no
abortan la corrida.

## D6 — `limpiar()`: camino principal + fallback

En `app/admin/qa-lab/page.tsx` la purga BD pasa a:

1. `POST /api/qa-lab/purga-test` (1 request). Si responde OK: sus `bloqueos` se copian a
   `errores` (que alimenta el mensaje rojo existente).
2. Si el fetch lanza o responde no-2xx: fallback documentado al bucle por entidad actual
   completo (borrarSiExiste + lotes de 6), sin cambios de comportamiento.

La purga del store (client-side, O(1) requests) no se toca. Los mensajes verde/rojo y la
semántica de `errores` quedan intactos.

## D7 — Idempotencia

Toda la purga es `deleteMany` por procedencia: ausente = 0 borrados, sin error (los DELETE
por id del bucle viejo ya eran 404-tolerantes; el bulk no necesita ese caso).

## D8 — Medición antes/después

- Antes: O(n) requests — contadas por el propio `limpiar()` (cada `borrarSiExiste` es 1-2
  fetch y cada listado pageSize=100 otro) y >120 s medidos en CI 2026-10-12.
- Después: 1 request; el endpoint loguea su duración con `logger.info` y la e2e dirigida
  muestra la limpieza de cola bien por debajo del timeout estricto de 120 s.
