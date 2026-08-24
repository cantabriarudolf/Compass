## 1. Spec y Navegación

- [x] 1.1 Crear delta spec `DEV-qa-lab` con requirements de `Carga Técnica`, `Historia Viva`, `Backups` y `Visibilidad dev-only`.
- [x] 1.2 Añadir entrada `Laboratorio QA` bajo `Desarrollo AI` en `k0mp4ss_fe/apps/web/components/app-sidebar.tsx:125` (visible solo dev/admin).

## 2. Página qa-lab - Carga Técnica

- [x] 2.1 Crear `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` (client, `useStoreRehydrated`, skeleton `hasHydrated` `k0mp4ss_fe/apps/web/lib/store.ts:176`).
- [x] 2.2 Definir datos `TEST-*` por Rank (FASE 0: `TEST-EdO-EnLimpieza`, `TEST-MACRO-TorreQA`, `TEST-MICRO-PisoQA`, `TEST-CATU-LoftQA`, `TEST-VULN-ElectroQA`, `TEST-EINM-PreReservaQA`, `TEST-EMER-CerrajeroQA`, `TEST-BANCO-BancoQA`; FASE1: `TU-TEST-LoftQA`; FASE2: `SectorTEST/Piso99-TEST/999+E-999`; FASE3: `99.999.999-9` vínculos) y funciones `cargarFASE`/`cargarTodo` que invocan `saveMaestro/saveTipo/saveMacro/saveMicro/saveUnidad/savePersona/saveVinculo` en orden Rank y acumulan `SeedValidationReport`.
- [x] 2.3 Grid por Rank con `Badge` estado (`pendiente/ok/error`) + `Detalle` Dialog por módulo (lista `errores[]` + JSON) + botones `Cargar FASE 0..3`, `Cargar Todo`, `Limpiar TEST-*` (borrado inverso `VU→EF micro→EF macro→MP→TU→MA` con `remove*`), `Validar` (tasa huérfanos).
- [x] 2.4 Botón `Exportar JSON` que genera `Data/NSGC/backups/compass-seed-report-*.json` con `SeedValidationReport + historia + diff` vía `POST /api/backup` `k0mp4ss_fe/apps/web/app/admin/dev-dashboard/page.tsx:219` y descarga local.

## 3. Página qa-lab - Historia Viva

- [x] 3.1 Tab `Historia Viva` con timeline vertical de capítulos de `Data/NSGC/docs/manuales/34 - Historia de Poblamiento - Relato de Uso.md:1` (Prólogo MA/CF → Cap1 TU/EF → Cap2 MP/VU → Cap3 PE/IR/CO → Epílogo AM) que se ilumina `⏳→🟢` según Rank cargado, con `Relato | Gear | Verificación` y botón `Ver en Historia`.
- [x] 3.2 El JSON de backup incluye `historia: [{capitulo, relato, estado, rank, count}]`.

## 4. Helpers opcionales en store (ST)

- [x] 4.1 (Opcional) Helpers `validateSeedOrder`/`seedBulkLoad`/`SeedValidationReport` implementados localmente en `qa-lab/page.tsx` (reusa `save*` en orden Rank); extracción a `k0mp4ss_fe/apps/web/lib/store.ts:57` queda para futuro `FI/PE` sin bloquear lab.

## 5. Validación

- [x] 5.1 `openspec validate qa-lab --strict` sin errores.
- [x] 5.2 `npx tsc --noEmit --project k0mp4ss_fe/apps/web/tsconfig.json` y `npx turbo lint` 0 errores, `hasHydrated` gate y skeleton respetados `openspec/specs/ST-capa-datos-persistente/spec.md:105`, sin `condominio` en diff.
