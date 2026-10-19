## ADDED Requirements

### Requirement: Convención TEST-* y cleanup en specs e2e
Todo spec e2e que cree registros SHALL nombrarlos `TEST-<MODULO>-<timestamp>`
(timestamp `Date.now()`, sin espacios) y SHALL limpiar lo creado dentro del
propio spec cuando la UI/API lo permita (borrado por id o `Limpiar TEST-*`).
Lo que no se pueda limpiar (certificados con PDF ya emitido, pagos con asiento
aplicado, vínculos con historial) SHALL listarse como conocido en el propio spec
y no SHALL usarse en conteos exactos ni en aserciones de saldo global.

#### Scenario: Spec crea y limpia su TEST-*
- **WHEN** un spec crea `TEST-PAGOS-1727...` y termina en verde
- **THEN** ese registro no existe tras la corrida, o el spec lo declara como
  conocido no-limpiable.

### Requirement: Corrida e2e única sin tag GATED (specs autónomos)
La suite e2e SHALL correr en corrida única (`npx playwright test`, local y job
`e2e` del CI) sin tag `(GATED)` en los `describe` ni scripts de orden
`e2e:nongated` / `e2e:gated` / `e2e:full-orden` (eliminados por SERIE-E2E-SIN-GATED
`b7e88a8`: ya no existen en `package.json`). Cada spec que use poblamiento
QA-Lab SHALL ser autónomo: setup vía helper compartido `e2e/helpers/datos-test.ts`
y cleanup propio (API o `finally`), de modo que ningún spec dependa de su
posición en la corrida ni del dato que otro spec dejó poblado. Entre corridas,
la receta `npm run e2e:reseed-base` + `npm run e2e:higiene --apply` SHALL
restaurar el estado base (detalle en el requirement `Higiene BD repetible
(e2e:higiene)`). El restore del nombre de `admin-configuracion` en `finally`
SHALL mantenerse compatible: restaura el nombre original del seed para que
`permisos` siga encontrando `/Los Aromos/`.

#### Scenario: Corrida única sin tag GATED ni scripts de orden
- **WHEN** se corre `npx playwright test` (local o job `e2e` del CI)
- **THEN** todos los specs corren en una sola corrida sin fases, ningún
  `describe` lleva `(GATED)` y `package.json` no define `e2e:nongated`,
  `e2e:gated` ni `e2e:full-orden`

#### Scenario: Spec autónomo en cualquier posición de la corrida
- **WHEN** un spec que usa poblamiento QA-Lab corre al inicio, al final o solo
- **THEN** su setup vía `e2e/helpers/datos-test.ts` y su cleanup propio dejan
  el estado acotado: no depende de datos de otros specs ni contamina los que
  corren después

#### Scenario: Receta entre corridas restaura el estado base
- **WHEN** se corre `npm run e2e:reseed-base` y después `npm run e2e:higiene --apply`
  (su dry-run por defecto reporta las filas TEST/QA a purgar)
- **THEN** la BD vuelve al estado base y la corrida siguiente parte determinista,
  sin receta manual de membresías
