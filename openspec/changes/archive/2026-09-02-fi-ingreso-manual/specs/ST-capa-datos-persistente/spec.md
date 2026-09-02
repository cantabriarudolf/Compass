## ADDED Requirements

### Requirement: Colección ingresosFI y campo saldoInicial en FondoFI
El sistema SHALL incluir en `CompassData` la colección `ingresosFI: IngresoFI[]` (transaccional, seed vacío, rank 4 junto a FI) y SHALL extender `FondoFISchema` con `saldoInicial?: number` opcional (no negativo, default 0 en migración). Ambas SHALL validarse por zod en `ESQUEMAS_COLECCION`, persistirse en `partialize` y sanearse en `sanitizarColecciones`/`onRehydrateStorage`.

#### Scenario: Colección ingresosFI disponible tras migración
- **WHEN** un store persistido en versión 26 se rehidrata en 27
- **THEN** `ingresosFI` existe como array vacío (si no existía) y ningún dato previo se pierde

#### Scenario: Fondo con saldoInicial validado
- **WHEN** se persiste un fondo con `saldoInicial` 50000
- **THEN** `FondoFISchema.safeParse` lo acepta y el valor sobrevive a rehidratación

### Requirement: Migración STORE_VERSION 26 → 27
El sistema SHALL bump `STORE_VERSION` a 27 y proveer `migrate` aditivo `v26→v27` que asegure `ingresosFI: []` si ausente y preserve `saldoInicial` de fondos existentes (sin cargar datos históricos aún; la carga es P2). La migración SHALL ser idempotente (re-correr no duplica).

#### Scenario: Migración idempotente v26→v27
- **WHEN** `migrate(persistedV26, 26)` se ejecuta dos veces sobre el mismo persistido
- **THEN** ambas ejecuciones dejan `ingresosFI: []` y fondos intactos sin duplicar
