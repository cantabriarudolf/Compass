# Tasks: qlab-poblamiento-api-rest

> Change grande: **3 ventanas**. Un escritor por vez. Test-first donde haya runner
> determinista (rutas API + helpers); el e2e del poblamiento es la verificación de cierre.

## Fase 1 — FI (ventana 1)

- [x] 1.1 RED: test de las acciones nuevas de API (pago, mora, retiro de fondo) con el patrón
      de `test/api/` (evento de auditoría post-write, uno por request, scoping por comunidad).
      **HECHO**: `test/api/fi-acciones.test.ts`, **13 tests**.
- [x] 1.2 GREEN: `POST /api/cobros-fi/[id]/pagar`, `POST /api/cobros-fi/[id]/mora`,
      `POST /api/fondos-fi/[id]/retirar` (patrón `liquidaciones/[id]/confirmar`).
      **HECHO**: commits `feat(api): acciones REST de pago y mora sobre cobros FI` y
      `feat(api): acción REST de retiro de fondo FI`. Suite **891/891**, tsc 0, eslint 0.
- [ ] 1.3 Migrar `cargarFase13FI` (`app/admin/qa-lab/page.tsx:781`, 11 pasos) a API REST con
      ids `test-*-fi` e upsert.
- [ ] 1.4 Materializar las 3 conexiones cross-módulo (IN, RA, MT) vía API.
- [ ] 1.5 "Borrar todo lo de prueba": poda FI vía API (sin residuo bloqueante).
- [ ] 1.6 Gate de fase: suite unitaria + `tsc` + `eslint` verdes; spec de FI visible.

## Fase 2 — CT + higiene de dos mundos (ventana 2)

- [ ] 2.1 RED: test del gate deuda/saldo y de la inmutabilidad en la capa API
      (`app/api/certificados-ct/route.ts`).
- [ ] 2.2 GREEN: portar el gate deuda/saldo y el rechazo de borrado inmutable a la ruta.
- [ ] 2.3 Migrar `cargarFase15CT` (`app/admin/qa-lab/page.tsx:1064`) a `POST /api/certificados-ct`
      con id `test-*-ct`.
- [ ] 2.4 `tieneDatosTest(state, bd?)` / `runFase` / "Borrar todo" cubriendo store + BD sin
      residuos TEST bloqueantes.
- [ ] 2.5 Gate de fase: unit + `tsc` + `eslint`; `e2e:higiene` sin residuos.

## Fase 3 — Cierre (ventana 3)

- [ ] 3.1 `e2e/flujo/poblamiento.spec.ts` **3/3** verde (una corrida, sin bucle).
- [ ] 3.2 Verificación de idempotencia: "Poblar todo" ×2 con limpieza intermedia, sin duplicados.
- [ ] 3.3 NSGC: manuales de FI/CT + avance.
- [ ] 3.4 `check-delta-coverage` + `openspec validate --all` en verde.
- [ ] 3.5 Commit(s) y archivar tras CI verde (el push lo decide el owner).
