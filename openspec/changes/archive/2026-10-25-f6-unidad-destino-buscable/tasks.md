# Tasks: f6-unidad-destino-buscable

Rama `feat/f6-unidad-destino-buscable`. Delta: `specs/PE-personal-servicios/spec.md`
(requirement nuevo `ADDED`).

Specs numeradas del proposal:

- **S1** — el término viaja a `GET /api/unidades?q=`; opciones del servidor, no de la lista montada.
- **S2** — la opción muestra número, etiqueta y rol SII; la unidad elegida se registra por su id.
- **S3** — `Estacionamiento` no se ofrece como destino; la regla es la etiqueta, no el prefijo `u-E-`.
- **S4** — sin coincidencias se declara en pantalla y el registro no se bloquea.
- **S5** — la bitácora del día muestra la unidad elegida, no su id crudo.

## Tareas

- [x] **T1 · S1, S2, S3** — `lib/api/use-unidades.ts`: `buscarUnidades(q)` + `esUnidadDestino()` +
  `etiquetaUnidad()` (etiqueta + número + rol SII). El `useUnidades()` SWR que ya vivía en el
  módulo se conserva: lo consumen `/operaciones/reservas` y `/operaciones/proveedores`.
- [x] **T2 · S1, S3, S4** — `components/pe/visitas-panel.tsx`: «Unidad destino» pasa a
  `SelectorBuscable`; se retira el recorte `LIMITE_SELECT` de unidades y su `AvisoTruncamiento`
  (sigue el de personas); el filtro de destinos pasa a `esUnidadDestino`.
- [x] **T3 · S2, S5** — el panel recuerda la etiqueta de la unidad elegida (búsqueda y
  preselección por QR) y `refUnidad` la prefiere sobre el store. La etiqueta del panel y la de la
  búsqueda comparten formato (`etiquetaUnidad`), así que la tabla del día y el control muestran
  «Depto 101 · 123-A11» en vez del id.
- [x] **T4 · S1-S5** — `test/componentes/visitas-unidad-buscable.test.tsx` (nuevo, 6 casos:
  etiqueta con rol SII · destino por etiqueta y no por prefijo · término a la API con
  estacionamiento excluido · error propagado · unidad elegida en la visita registrada + fila con
  etiqueta · sin resultados no bloquea el registro). Se actualizaron los 2 casos de
  `test/componentes/pe-panels.test.tsx` que elegían la unidad por índice de combobox y el aserto de
  etiqueta del caso QR. Los stubs de Radix se extrajeron a `test/componentes/entorno-radix.ts`.
- [x] **T5 · S1, S3, S5** — `e2e/crud/bitacora.spec.ts`: busca «101», exige que la primera opción
  sea un `Depto 101` con rol SII, la elige y afirma que la fila muestra esa unidad. Se eliminó la
  tolerancia a «Sin unidad». El primer run del PR puso rojo `crud/roles-journeys.spec.ts`, que
  abría el mismo control en el journey de conserjería: se actualizó igual y se retiraron los helpers
  Radix que quedaron sin uso (`pickFirstOption`, `menuAbierto`).
- [x] **T6** — Gates locales.
- [x] **T7** — Lane e2e real.
- [x] **T8** — Ledger `openspec/PENDIENTES-FUNCIONALIDAD.md`: F6 pasa a «cableado parcial» con la
  evidencia, y el defecto del prefijo `u-E-` queda anotado como corregido en la sección Hecho.
- [x] **T9 · S1, S3** — `app/api/pe/unidades/route.ts`: proyección de solo lectura con
  `pe:bitacora`, scope por sesión, cuatro campos y estacionamiento excluido por etiqueta. Apareció
  al correr el journey de conserjería: `/api/unidades` gatea con `mp` y conserjería solo tiene
  `mp:propios`, así que la ruta le devolvía **403** — el selector del store lo ocultaba. No se tocó
  `lib/authz.ts` (skill de auditoría, regla 5). Test `test/api/pe-unidades-operacion.test.ts` (6
  casos: 200 conserjería, 200 admin, 403 residente, 401 sin sesión, scope y proyección).

## Evidencia

RED primero: `test/componentes/visitas-unidad-buscable.test.tsx` falló 6/6 antes de existir
`buscarUnidades` y antes de que «Unidad destino» fuera un campo con label asociado.

| Gate (workdir `k0mp4ss_fe/apps/web`) | Resultado |
| --- | --- |
| `npx vitest run` foco (3 archivos) | **22/22** |
| `npm test` (suite completa) | **exit 0** |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 · 1 warning preexistente (`co-leer-concurrente.test.ts:21`, de `02cae05`) |
| `npm run audit:desvios` | 0 hallazgos · candado en verde |
| `openspec validate f6-unidad-destino-buscable --strict` (raíz) | *is valid* |
| `node openspec/scripts/check-delta-coverage.mjs f6-unidad-destino-buscable` | 1 ok · 0 que romperían el archive |
| `npx vitest run test/api/pe-unidades-operacion.test.ts` | **6/6** (códigos por rol) |
| `npx vitest run` foco componentes (4 archivos) | **38/38** |
| `npm run e2e:fresh -- -- e2e/crud/bitacora.spec.ts` | **7 tests, 0 failures** — `test-results/junit.xml`: `crud/bitacora.spec.ts` 1 test 0 fallos en 6.8 s |
| `npm run e2e:fresh -- -- e2e/crud/bitacora.spec.ts e2e/crud/roles-journeys.spec.ts` | ver cierre |

La lane se verificó por el artefacto (`test-results/junit.xml`), no por el log: `e2e:fresh` lo
trunca a las últimas 45 líneas y el resumen de Playwright no siempre entra ahí.

## Higiene de suite

La suite completa marcó `test/componentes/certificados-descarga.test.tsx` en 5050 ms: el default de
5 s de Vitest bajo carga, no comportamiento (pasa aislado en 2 s). Se le fijó `PRESUPUESTO_CARGA`
explícito, igual que `pe-panels` y `certificados-fuente-hooks`.

## Entrega

Una sola unidad de trabajo, **624 líneas authored** (código + tests + spec del change) en el
commit `b2767c0`, sobre la guía de ~400. No se partió a propósito: separar los tests del
comportamiento que fijan, o el spec del change de su código, empeora la revisión en vez de
mejorarla. El delta de `PE`, el proposal y las tareas viajan con el cambio porque el archive los
exige juntos.

PR: #17.
