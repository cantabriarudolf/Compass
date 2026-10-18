## MODIFIED Requirements

### Requirement: Gate de cobertura por área (ratchet de Vitest)
La suite Vitest de `k0mp4ss_fe/apps/web` SHALL mantener un gate de cobertura por
área en `vitest.config.ts` (`coverage.thresholds`): un piso global y un piso por
cada área vigilada (`lib/**`, `app/api/**`), calculado con la regla del ratchet:
piso = medido − 1 punto porcentual entero sobre la suite verde completa. Un piso
SHALL solo subir; cuando la cobertura real mejora, se re-baselinea en un commit
explícito que deje la fecha de medición documentada. La superficie `app/api/**`
SHALL crecer su cobertura por fases con tests reales escritos contra la interfaz
pública de los route handlers (camino feliz, validación 400 y guardias
401/403/404), sin mocks de Prisma y sin editar handlers para hacerlos testeables.
El área `lib/**` SHALL medir el interior de `lib/store/**` (los slices de
`lib/store/slices/**` y `lib/store/helpers.ts`) además de `lib/store.ts`, con
`coverage.include` explícito en `vitest.config.ts`; su cobertura SHALL crecer con
tests comportamentales escritos contra la interfaz pública del store
(`useCompassStore`: acciones y selectores), afirmando el efecto observable
(estado resultante, `StoreResult`, validaciones y errores) y nunca detalles
internos, y sin cambiar el shape persistido (`STORE_VERSION` congelado).

#### Scenario: Re-baseline solo hacia arriba
- **WHEN** una medición de la suite verde completa reporta cobertura de un área
  por encima de su piso vigente
- **THEN** el piso del área se sube a medido − 1 punto en un commit explícito con
  la fecha de medición, y ningún piso queda por debajo de su valor anterior

#### Scenario: Degradación de cobertura rompe el gate
- **WHEN** una corrida de `npm test` deja cualquier métrica de un área por
  debajo de su piso vigente
- **THEN** la corrida falla con `ERROR: Coverage … does not meet` y el cambio que
  degradó la cobertura no pasa el gate

#### Scenario: Fase de cobertura API sin tocar handlers
- **WHEN** se ejecuta una fase de `api-cobertura-fases` sobre las carpetas
  `app/api/**` con menor cobertura de statements
- **THEN** se agregan tests contra los handlers exportados (401 sin sesión, 403
  sin permiso, 404 por guard de entorno o scope de comunidad, 400 por validación y
  camino feliz) y el piso de `app/api/**` sube según la regla del ratchet

#### Scenario: Fase de cobertura del store sin tocar el shape persistido
- **WHEN** se ejecuta una fase de `store-cobertura-fase-b` sobre `lib/store/**`
  con el include de cobertura extendido a `lib/store/slices/**` y
  `lib/store/helpers.ts`
- **THEN** se agregan tests comportamentales contra `useCompassStore` (acciones y
  selectores, con el estado resultante, el `StoreResult` y los errores
  observados), el piso de `lib/**` y el global se re-baselinean con la regla del
  ratchet sin bajar ninguno, y el shape persistido del store queda intacto
  (`STORE_VERSION` sin cambios)

#### Scenario: Fase 3 de cobertura API sobre las 3 carpetas más bajas medidas
- **WHEN** se ejecuta la fase 3 del ratchet de cobertura API (`api-cobertura-fase3`)
  sobre las 3 carpetas de `app/api/**` con menor cobertura de statements de la
  medición vigente de la ventana (P3: `qa-roadmap` 62.5%, `emisiones-gc` 66.89% y
  `vinculos` 69.2%)
- **THEN** se agregan tests contra la interfaz pública de los handlers exportados
  (camino feliz, validación 400, 401 sin sesión, 403 por rol y 404 por scope de
  comunidad) con Prisma real y sin editar handlers, y el piso de `app/api/**` se
  re-baselinea con la regla del ratchet (medido − 1 pt, nunca baja), dejando la
  fecha de medición y las carpetas cubiertas documentadas en el commit explícito

#### Scenario: Fase 4 de cobertura API sobre las 3 carpetas más bajas medidas
- **WHEN** se ejecuta la fase 4 del ratchet de cobertura API (`api-cobertura-fase4`)
  sobre las 3 carpetas de `app/api/**` con menor cobertura de statements de la
  medición vigente de la ventana (P4: `fondos-fi` 71.16%, `personas` 72.82% y
  `cobros-fi` 74.43%)
- **THEN** se agregan tests contra la interfaz pública de los handlers exportados
  (camino feliz, validación 400, 401 sin sesión, 403 por rol y 404 por scope de
  comunidad) con Prisma real y sin editar handlers, y el piso de `app/api/**` se
  re-baselinea con la regla del ratchet (medido − 1 pt, nunca baja), dejando la
  fecha de medición y las carpetas cubiertas documentadas en el commit explícito

#### Scenario: Fase C de cobertura del store legacy sobre las acciones más descubiertas
- **WHEN** se ejecuta la fase C del ratchet de cobertura del store
  (`store-cobertura-fase-c`) sobre las acciones legacy de `lib/store.ts` con más
  statements sin cubrir de la medición vigente, más los bordes de
  `lib/store/helpers.ts` y de `lib/store/slices/**`
- **THEN** se agregan tests comportamentales contra `useCompassStore` que afirman
  el `StoreResult` y el efecto observable de cada rama (rechazos de validación,
  mutación del estado y cargos materiales en el libro FI), sin editar el código
  del store ni cambiar el shape persistido (`STORE_VERSION = 28`), los pisos de
  `lib/**` y global se re-baselinean con la regla del ratchet (medido − 1 pt,
  nunca bajan) con la fecha de medición documentada, y el remanente que no puede
  alcanzarse por la API pública queda declarado con su línea y su causa en el
  avance NSGC de la ventana

#### Scenario: Fase D de cobertura del store legacy sobre las 6 acciones más descubiertas
- **WHEN** se ejecuta la fase D del ratchet de cobertura del store
  (`store-cobertura-fase-d`) sobre las 6 acciones legacy de `lib/store.ts` con más
  statements sin cubrir de la medición vigente de la ventana
- **THEN** se agregan tests comportamentales contra `useCompassStore` que afirman
  el `StoreResult` y el efecto observable de cada rama (rechazos de validación,
  mutación del estado, folios correlativos y cargos materiales en el libro FI),
  sin editar el código del store ni cambiar el shape persistido
  (`STORE_VERSION = 28`), sin tocar los `thresholds` de `vitest.config.ts` (el
  ratchet lo aplica la ventana siguiente con la medición acumulada), y el
  remanente que no puede alcanzarse por la API pública queda declarado con su
  línea y su causa en el avance NSGC de la ventana

#### Scenario: Fase E de cobertura del store legacy sobre el remanente y ratchet final
- **WHEN** se ejecuta la fase E del ratchet de cobertura del store
  (`store-cobertura-fase-e`) sobre el remanente de statements sin cubrir de
  `lib/store.ts` que dejó la fase D (guardas de hidratación, ramas de integridad
  referencial de `removeMaestro`, ramas sin match de los `map` de estado, emisión
  de Gasto Común sin aporte al fondo de reserva, `retenerGarantiaRA` sin fondo de
  amenities y las ramas de arranque de `migrate`)
- **THEN** se agregan tests comportamentales contra `useCompassStore` que afirman
  el `StoreResult` y el efecto observable de cada rama, sin editar el código del
  store ni cambiar el shape persistido (`STORE_VERSION = 28`), los pisos de
  `lib/**` y global se re-baselinean con la regla del ratchet (medido − 1 pt,
  nunca bajan) con la fecha de medición documentada en `vitest.config.ts`, y el
  remanente que no puede alcanzarse por la API pública queda declarado con su
  línea y su causa en el avance NSGC de la ventana
