# Delta — `DEV-qa-lab`

## REMOVED Requirements

La capability se retira completa con el módulo QA/dev (F9): las pantallas, rutas API, helpers
y guard que la implementaban ya no existen en el árbol de trabajo.

### Requirement: Ruta y Visibilidad dev-only

**Reason**: la página `app/admin/qa-lab/page.tsx`, su enlace en el sidebar y su guard de acceso
(`lib/qa-dev-acceso.ts`) se retiraron; ya no hay ruta que responder 404 ni redirigir.

**Migration**: ninguna. No queda URL pública del Laboratorio.

### Requirement: Carga Técnica por Rank

**Reason**: la carga por fases (`Cargar FASE`, `Cargar Todo`) vivía en la pantalla retirada y
escribía el store legacy del navegador.

**Migration**: la creación de datos TEST sigue disponible por API y por los seed de fixtures
usados por los e2e (`e2e/helpers/datos-test.ts`).

### Requirement: Grid por Módulo con Detalle

**Reason**: el grid de módulos con `Badge`, `count` y `Dialog` de detalle era parte de la
pantalla del Laboratorio, que ya no existe.

**Migration**: ninguna; el reporte por módulo no tiene consumidor.

### Requirement: Limpiar TEST-* inverso

**Reason**: la purga de `TEST-*` desde la UI se retiró con el Laboratorio, junto con su orden
inverso y su reporte por módulo.

**Migration**: la limpieza de datos TEST queda en `scripts/higiene-qa-test.mjs`
(`npm run e2e:higiene`, dry-run por defecto) y en el cleanup de cada spec.

### Requirement: Historia Viva

**Reason**: el tab «Historia Viva» era una vista del Laboratorio sobre el relato de poblamiento.

**Migration**: el relato sigue documentado en
`Data/NSGC/docs/manuales/34 - Historia de Poblamiento - Relato de Uso.md`.

### Requirement: Backups JSON auditables

**Reason**: el requirement describe el botón «Exportar JSON» del Laboratorio y el contrato de
`POST /api/backup` que ese botón usaba.

**Migration**: `POST /api/backup` sobrevive con su contrato intacto (adjunto,
`Content-Disposition: attachment`, nombre fechado por el servidor, sin escritura en disco). Sólo
desaparece el consumidor de la UI; el endpoint sigue cubierto por `test/api-backup-authz.test.ts`
y por `test/security-rechecks.test.ts`.
