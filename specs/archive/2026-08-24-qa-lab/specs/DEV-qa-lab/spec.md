## Purpose

Laboratorio QA dev-only que ejecuta la carga ordenada por Rank `ST:9` con datos `TEST-*`, marca `🟢 OK` por módulo con Detalle y guarda JSON en `Data/NSGC/backups/`, además de reflejar la Historia de Poblamiento `34 - Historia` como timeline viva.

## ADDED Requirements

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

