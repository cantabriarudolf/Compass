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

### Requirement: Specs GATED al final de la corrida + re-seed
Los 4 specs que usan QA-Lab "Poblar todo de una vez" (`certificados`, `pagos`,
`portal`, `remuneraciones`, identificados con `(GATED)` en el describe) SHALL
correrse en bloque al FINAL de la corrida full (`npm run e2e:full-orden`:
no-GATED primero, GATED después). Tras una corrida con GATED, la receta
`npm run seed:authz` + `npm run seed:mocks -- --comunidad-id=comunidad-a`
SHALL dejar el store/BD en estado base scope A. El restore de nombre de
`admin-configuracion` en `finally` SHALL mantenerse compatible (restaura el
nombre original del seed para que `permisos` siga encontrando `/Los Aromos/`).

#### Scenario: Corrida ordenada no contamina specs no-GATED
- **WHEN** se corre `npm run e2e:full-orden`
- **THEN** ningún spec no-GATED ve datos del poblamiento QA-Lab de los GATED.
