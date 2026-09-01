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

`Exportar JSON` SHALL generar `Data/NSGC/backups/compass-seed-report-YYYY-MM-DDTHH-MM-SS.json` con `{_summary, report: SeedValidationReport, historia: [{capitulo, estado, rank, count}], diff}` vía `POST /api/backup` `k0mp4ss_fe/apps/web/app/admin/dev-dashboard/page.tsx:219` y descarga local; `AM` SHALL registrar `ST_SEED_*`.

#### Scenario: Export tras Cargar Todo
- **WHEN** el usuario pulsa `Exportar JSON`
- **THEN** se descarga el JSON y, si `backupToRepo` activo, queda en `Data/NSGC/backups/` y `AM` registra `ST_SEED_COLLECTION_LOADED`.

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

