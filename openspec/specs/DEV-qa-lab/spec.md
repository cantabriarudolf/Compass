# Dev QA Lab Specification

## Purpose

Laboratorio QA de carga tecnica ordenada por Rank (MA/CF -> TU/MP -> EF -> VU) con Historia Viva, reportes de validacion por modulo y backups auditables en Data/NSGC/backups/.

## Requirements

### Requirement: Ruta y Visibilidad dev-only

La página SHALL vivir en `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` bajo `Desarrollo AI > Laboratorio QA` `k0mp4ss_fe/apps/web/components/app-sidebar.tsx:125` y SHALL ser visible solo si `NODE_ENV !== production` o rol `admin`; en prod SHALL responder 404 o redirect.

#### Scenario: Acceso en prod
- **WHEN** un usuario navega a `/admin/qa-lab` en `production`
- **THEN** ve 404 o es redirigido a `/dashboard`.

### Requirement: Carga Técnica por Rank

El lab SHALL exponer botones `Cargar FASE 0..3`, `Cargar Todo`, `Limpiar TEST-*`, `Validar`, `Exportar` que ejecuten en orden `0=CF/MA` → `1=TU/MP` → `2=EF(macro→micro→unidad)` → `3=VU` `ST:9` invocando `saveMaestro/saveTipo/saveMacro/saveMicro/saveUnidad/savePersona/saveVinculo` `k0mp4ss_fe/apps/web/lib/store.ts:57` y SHALL acumular `SeedValidationReport {ok, errores[]: {coleccion, id, campoFK, motivo}}`.

#### Scenario: Cargar Todo ordenado
- **WHEN** el usuario pulsa `Cargar Todo`
- **THEN** el lab carga FASE 0, luego 1, luego 2, luego 3 y marca cada módulo `🟢 OK` o `🔴 Error` con conteo.

#### Scenario: Carga con FK dangling
- **WHEN** un `unidad.tipoUnidadId` no existe
- **THEN** el módulo reporta `errores[]` y el Badge queda `🔴 Error` sin silenciar.

### Requirement: Grid por Módulo con Detalle

Cada módulo SHALL mostrar `Badge` estado (`pendiente/cargando/ok/error`), `count` y botón `Detalle` que abre `Dialog` con `errores[]` y JSON del `SeedValidationReport` y diff `seed vs store`.

#### Scenario: Detalle de módulo
- **WHEN** el usuario pulsa `Detalle` en `EF-unidades`
- **THEN** ve lista `errores` y `JSON` copiable.

### Requirement: Limpiar TEST-* inverso

`Limpiar TEST-*` SHALL borrar solo ids con prefijo `test-`/`TEST-` en orden inverso `VU → EF unidades → EF micro → EF macro → MP → TU → MA` usando `remove*` con validación inversa `ST:58` y SHALL reportar `🟢 Limpio` por módulo.

#### Scenario: Limpiar tras Cargar Todo
- **WHEN** el usuario pulsa `Limpiar TEST-*`
- **THEN** todas las colecciones `TEST-*` desaparecen y `tasa huérfanos` vuelve a 0.

### Requirement: Historia Viva

El tab `Historia Viva` SHALL renderizar timeline de capítulos de `Data/NSGC/docs/manuales/34 - Historia de Poblamiento - Relato de Uso.md:1` (Prólogo MA/CF → Cap1 TU/EF → Cap2 MP/VU → Cap3 PE/IR/CO → Epílogo AM) que se ilumina `⏳→🟢` según Rank cargado, con `Relato | Gear | Verificación` y botón `Ver en Historia`.

#### Scenario: Capítulo iluminado
- **WHEN** FASE 2 EF termina `🟢 OK`
- **THEN** Cap1 `El Arquitecto` pasa a `🟢` y muestra `Verificación: dona EF roja`.

### Requirement: Backups JSON auditables

`Exportar JSON` SHALL generar un respaldo con `{_summary, report: SeedValidationReport, historia: [{capitulo, estado, rank, count}], diff}` y SHALL entregarlo como **descarga del navegador** a través de `POST /api/backup`, que SHALL responder el contenido como adjunto con `Content-Disposition: attachment` y nombre `<prefijo>-AAAA-MM-DD_HH-mm.json`.
La fecha del nombre SHALL fijarla el servidor; el cliente SHALL aportar solo el prefijo semántico (`compass-seed-report` para este comprobante), y un prefijo que no cumpla el formato SHALL caer al prefijo por defecto.
El endpoint MUST NOT escribir en el disco del servidor: en producción ese disco es efímero, y un archivo que se pierde no es un respaldo.
`AM` SHALL registrar `ST_SEED_*`.

#### Scenario: Export tras Cargar Todo
- **WHEN** el usuario pulsa `Exportar JSON`
- **THEN** el navegador descarga el archivo con el nombre fechado por el servidor y `AM` registra `ST_SEED_COLLECTION_LOADED`
- **AND** no se crea ningún archivo bajo `Data/NSGC/backups/`

### Requirement: Cobertura UI del flujo de sesión y hooks con RTL+MSW
El laboratorio QA SHALL incluir cobertura UI del flujo de sesión y de hooks compartidos usando React Testing Library y MSW. El flujo de sesión SHALL estar cubierto: página `/ingresar` (validaciones, login exitoso con MSW sobre `POST /api/auth/login` y creación de cookie, login fallido con mensaje visible, respeto de `?next=` solo para destinos internos que empiecen con `/`), logout, verificación de `/api/auth/session`, y hook compartido `useStoreRehydrated`. El módulo SHALL exponer pruebas unitarias de `lib/auth.ts` que verifiquen `verificarToken` inválido/expirado/firma inválida, `credencialesValidas` y el guard `excedeIntentos`. La configuración `vitest.config.ts` SHALL mantener `environment: jsdom` y `setupFiles` apuntando al setup que carga `jest-dom`, y SHALL declarar umbrales UI solo si no degradan los thresholds globales existentes documentando en `design.md` el gap remanente y el plan de crecimiento hacia ≥80% componentes / ≥85% hooks.

#### Scenario: Login exitoso vía MSW
- **WHEN** el usuario envía credenciales válidas en `/ingresar` y MSW responde `200` con `Set-Cookie: compass_session`
- **THEN** la UI navega al destino y la cookie queda creada (verificable vía `fetch` a `/api/auth/session` → `autenticado: true`).

#### Scenario: Login fallido muestra error
- **WHEN** MSW responde `401` o `429` ante credenciales inválidas o exceso de intentos
- **THEN** `/ingresar` muestra un `role=alert` con el mensaje del servidor y no navega.

#### Scenario: Respeto de ?next=
- **WHEN** el usuario visita `/ingresar?next=/admin/qa-lab` o un valor externo como `https://evil`
- **THEN** tras login exitoso la navegación va a `/admin/qa-lab` en el primer caso y a `/admin` en el segundo.

#### Scenario: Sesión y logout
- **WHEN** se consulta `GET /api/auth/session` sin/con cookie válida y luego se hace `POST /api/auth/logout`
- **THEN** el contrato responde `{ autenticado: false/true }` y el logout invalida la cookie (subsecuente `session` → `false`).

#### Scenario: Hook useStoreRehydrated
- **WHEN** un componente monta `useStoreRehydrated` y el `localStorage` contiene un persistido previo
- **THEN** el store rehidrata, marca `hasHydrated: true` y no bloquea operaciones `save*`.

#### Scenario: lib/auth unitario
- **WHEN** se verifica un token expirado, con firma alterada y se prueban credenciales y rate-limit
- **THEN** `verificarToken` retorna `null`, `credencialesValidas` distingue éxito/fracaso según env, y `excedeIntentos` se activa tras `MAX_INTENTOS` fallos dentro de la ventana.

### Requirement: Poblado idempotente

El laboratorio QA SHALL permitir que "Poblar todo de una vez" sea idempotente desde la UI: cuando existen datos `TEST-*` y el usuario confirma la acción, el sistema SHALL ejecutar `limpiar()` seguido del poblado completo sin intervención adicional, terminando en "Carga completa OK" con `22/22` fases en estado `🟢 Listo`; cuando cancela, SHALL no mutar ningún dato ni reporte.

#### Scenario: Confirmar limpiar y poblar con datos existentes
- **WHEN** existen datos `TEST-*` en el store y el usuario pulsa "Poblar todo de una vez" y luego "Limpiar y poblar" en el dialog de confirmación
- **THEN** el sistema ejecuta `limpiar()` (visible "TEST-* limpio correctamente") y luego `runFase("todo")`, finalizando con mensaje "Carga completa OK" y `22` tarjetas `[id^="mod-"]` en `🟢 Listo` con `0` en `🔴 Con error`

#### Scenario: Cancelar no muta nada
- **WHEN** existen datos `TEST-*` y el usuario pulsa "Poblar todo de una vez" y luego "Cancelar" en el dialog
- **THEN** el sistema no ejecuta `limpiar()` ni `runFase`, el dialog se cierra y las `22` tarjetas permanecen en `🟢 Listo` sin errores nuevos ni cambio de reporte

#### Scenario: Sin datos TEST-* pobla directo sin dialog
- **WHEN** no existen datos `TEST-*` y el usuario pulsa "Poblar todo de una vez"
- **THEN** el sistema pobla directamente sin mostrar el dialog de confirmación y termina en "Carga completa OK" con `22/22` fases

### Requirement: Consentimiento persistido en el setup e2e
`e2e/auth.setup.ts` SHALL aceptar el banner de cookies con verificación
del flag en localStorage (reintento ×3): el click pre-hidratación se pierde
sin listener y el flag no llegaba al storageState, de modo que el banner
fijo tapaba triggers al fondo del viewport e interceptaba clics (caso
`permisos` paso 5: el dropdown B nunca abría).

#### Scenario: StorageState hereda el consentimiento
- **WHEN** el setup autentica cada cuenta TEST
- **THEN** `e2e/.auth/<rol>.json` incluye el flag en localStorage y ningún
  spec ve el banner (e2e `permisos` en verde ~15s).

### Requirement: Higiene BD repetible (`e2e:higiene`)
`scripts/higiene-qa-test.mjs` SHALL purgar filas TEST/QA por patrón de id
(timestamp/base36 o prefijos TEST-/QA-/ct-test-...) en tablas de dominio,
sin tocar seed (personas, fondos/egresos/ingresos punto-cero, maestros),
auditoría (append-only) ni membresías. DRY-RUN por defecto, `--apply`
ejecuta. El backup P3 trae leftovers de corridas previas que rompen la
asunción "mi fila TEST es única" (caso `solicitudes`: abría el detalle de
una fila stale). Receta reseed P3 = restore P3 + migrate + 2 seeds +
punto-cero a A + `e2e:higiene --apply`.

#### Scenario: Reseed deja BD sin leftovers
- **WHEN** se corre la receta completa
- **THEN** `e2e:higiene` (dry-run) reporta 0 filas a purgar y las lanes
  no-GATED parten de estado determinista.

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
`permisos` siga encontrando `/Los Aromos/`. `npm run e2e:fresh`
(`scripts/e2e-fresh.mjs`) SHALL regenerar el cliente Prisma del schema SQLite
(`npx prisma generate --schema=prisma/schema.sqlite.prisma`, con el
`DATABASE_URL` propio de la base descartable) entre el `migrate deploy` y el
`e2e:reseed-base`, de modo que el seed y la corrida no dependan de cuál fue el
último `prisma generate` de la máquina (p. ej. el default PostgreSQL tras el job
`unit-pg`), que rompía el seed con exit 1 (R3-missing-prisma-generate).

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

#### Scenario: e2e:fresh fija el cliente Prisma SQLite antes del seed (R3-missing-prisma-generate)
- **WHEN** el último `prisma generate` de la máquina fue el default PostgreSQL
  (p. ej. tras correr `npx prisma generate` a secas como el job `unit-pg`) y se
  ejecuta `npm run e2e:fresh`
- **THEN** el script corre `npx prisma generate --schema=prisma/schema.sqlite.prisma`
  con el `DATABASE_URL` de la base descartable antes de `npm run e2e:reseed-base`,
  el seed termina completo y el script cierra con "Lista: base fresca + seed completo"

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
