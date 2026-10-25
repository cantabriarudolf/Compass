# Tasks: f6-personas-operacion-buscable

Rama `feat/f6-personas-operacion-buscable`. Delta: `specs/PE-personal-servicios/spec.md` (`ADDED`).

- [x] **T1** — `app/api/pe/personas/route.ts`: proyección `id`/`rut`/`nombreCompleto` con
  `pe:bitacora`, scope, `?rut=` con variantes canónicas y `?q=` sobre nombre y RUT.
  Test `test/api/pe-personas-operacion.test.ts` (8 casos, RED primero).
- [x] **T2** — `buscarPersonaPorRun` pasa a la proyección: el QR deja de caer al store por 403.
- [x] **T3** — «Residente destino» pasa a `SelectorBuscable` con búsqueda en el servidor; se retira
  su `AvisoTruncamiento` y `aviso-truncamiento` fija el contrato nuevo (con 137 personas en el
  store no hay recorte y la búsqueda va a `/api/pe/personas`).
- [x] **T4** — **El guardado del store rechazaba las referencias del servidor**: `saveBitacoraVisitaPE`
  exigía que `unidadId` y `destinoPersonaId` existieran en el padrón del store, así que una persona
  o unidad creada después se rechazaba como huérfana. Se retiran esos dos chequeos (la jornada
  sigue validándose, su maestro vive en el store) y los dos casos que los fijaban pasan a fijar la
  aceptación.
- [x] **T5** — Gates.

## Evidencia

| Gate | Resultado |
| --- | --- |
| `npx vitest run` (suite de store + pe-personas + aviso + panel) | **457 tests / 39 archivos, 0 fallos** |
| `npx tsc --noEmit` · `npm run audit:desvios` | exit 0 · candado en verde |
| `npx vitest run test/api/pe-personas-operacion.test.ts` | **8/8** — conserjería 200 · admin 200 · residente 403 · sin sesión 401 · RUN con y sin puntos · 400 con RUN inválido · proyección de 3 campos |
