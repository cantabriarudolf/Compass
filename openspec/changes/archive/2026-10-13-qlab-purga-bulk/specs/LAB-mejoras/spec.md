## ADDED Requirements

### Requirement: Purga bulk TEST en el QA-Lab vía endpoint único

El sistema SHALL purgar el residuo TEST de BD del QA-Lab con un único endpoint
`POST /api/qa-lab/purga-test` (runtime Node) que, para la comunidad de la sesión, borre solo
entidades TEST —ids con prefijo `test-` más la procedencia TEST documentada (cobros FI por
`unidadId`/`origenRef` `test-`, emisiones GC de los periodos TEST dedicados, notificaciones PI
con marca `TEST`)— en orden hijos→padres, y devuelva
`{ borrados: Record<string, number>, bloqueos: string[] }` con los conflictos reales y su
motivo. El endpoint SHALL responder 404 fuera de dev/test (`isWriteApiEnabled()`), 401 sin
sesión, 403 sin membresía o sin permiso de administración de la comunidad, y SHALL ser
idempotente (segunda corrida: 0 borrados, sin errores). Las liquidaciones confirmadas y los
certificados CT inmutables no se borran y no se reportan como bloqueo (residuo honesto).
`limpiar()` del QA-Lab SHALL usar el endpoint como camino principal y SHALL conservar el
bucle por entidad como fallback documentado ante un error del endpoint, con los mensajes verde
`TEST-* limpio correctamente` y rojo `Limpieza con N bloqueos (dependencias)` intactos. Las
limpiezas de cola de `e2e/crud/poblado-idempotente.spec.ts` y `e2e/flujo/ciclo.spec.ts` SHALL
ser estrictas otra vez (mensaje verde visible con timeout de 120 s).

#### Scenario: Purga bulk borra TEST y respeta los reales

- **WHEN** una comunidad autenticada como administrador tiene entidades `test-*` (incluida una
  multa IN cuyo cobro tiene id `cob-*` con `origenRef` `test-in-grave`) y datos reales
  mezclados, y se llama `POST /api/qa-lab/purga-test`
- **THEN** la respuesta es 200 con los conteos por colección, el cobro de procedencia TEST
  desaparece y todos los datos reales permanecen intactos en BD.

#### Scenario: Segunda corrida no borra nada

- **WHEN** se ejecuta `POST /api/qa-lab/purga-test` dos veces seguidas sobre la misma comunidad
- **THEN** la segunda respuesta es 200 con `borrados` vacío y `bloqueos` vacío.

#### Scenario: Guard y permisos cortan antes de tocar BD

- **WHEN** se llama el endpoint sin sesión, con el guard de entorno apagado o con un rol sin
  permiso de administración de la comunidad
- **THEN** responde 401, 404 y 403 respectivamente sin haber borrado nada.

#### Scenario: Limpieza de cola estricta tras el poblamiento

- **WHEN** la lane e2e corre `poblado-idempotente.spec.ts` y `ciclo.spec.ts` con paridad CI
- **THEN** cada "Borrar todo lo de prueba" muestra `TEST-* limpio correctamente` dentro de los
  120 s, sin tolerancia best-effort.
