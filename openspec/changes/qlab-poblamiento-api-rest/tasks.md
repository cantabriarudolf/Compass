# Tasks: qlab-poblamiento-api-rest

> Change grande: **4 ventanas**. Un escritor por vez. Test-first donde haya runner
> determinista (rutas API + helpers); el e2e del poblamiento es la verificación de cierre.
> **Orden re-escopado el 2026-10-07** por las dependencias D6.1/D6.2 del `design.md`.

## Fase 1 — FI (ventana 1) — acciones API + pasos FI puros

- [x] 1.1 RED: test de las acciones nuevas de API (pago, mora, retiro de fondo) con el patrón
      de `test/api/` (evento de auditoría post-write, uno por request, scoping por comunidad).
      **HECHO**: `test/api/fi-acciones.test.ts`, **13 tests**.
- [x] 1.2 GREEN: `POST /api/cobros-fi/[id]/pagar`, `POST /api/cobros-fi/[id]/mora`,
      `POST /api/fondos-fi/[id]/retirar` (patrón `liquidaciones/[id]/confirmar`).
      **HECHO**: commits `feat(api): acciones REST de pago y mora sobre cobros FI` y
      `feat(api): acción REST de retiro de fondo FI`. Suite **891/891**, tsc 0, eslint 0.
- [ ] 1.3a Migrar a API REST **sólo los pasos FI puros** de `cargarFase13FI`
      (`app/admin/qa-lab/page.tsx:781`): 1 (fondo), 2 (egreso), 3 (emisión GC + aporte),
      4 (emisión sin alcance → 400), 5 (pago), 6 (mora idempotente), 11 (retiro sin acta → 400).
      Las lecturas de verificación pasan a GET por API (`/api/cobros-fi?periodo=…`,
      `/api/egresos-fi`, `/api/emisiones-gc`), no al store.
- [ ] 1.3b Los pasos 7, 8, 9 y 10 quedan **explícitamente sin migrar** con comentario
      `// TODO Fase 1.5 — depende de migrar IN/RA/MT` (ver D6.1). No se disfrazan de verde.
- [ ] 1.4 Purga BD de FI en "Borrar todo" (ver D6.2): por API + allowlist de ids TEST.
      **Bloqueante de diseño**: no relajar `scripts/higiene-qa-test.mjs`.
- [ ] 1.5 Conexiones cross-módulo (pasos 7-10): migrar **después** de las fases IN, RA y MT.
- [ ] 1.6 Gate de fase: suite unitaria + `tsc` + `eslint` verdes; FI visible en las páginas reales.

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
