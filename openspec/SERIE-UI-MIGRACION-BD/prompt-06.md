> **Este archivo ES tu prompt.** Ventana P6 de la serie `SERIE-UI-MIGRACION-BD`.
> Abrí este archivo, leelo completo, y ejecuta cada bloque en orden.

---

## Estado del repo al iniciar P6

**Commits previos de la serie:**
- P1: `d4f8d13` — Dashboard + Admin
- P2: `cd56d02` + `da40ab8` + `b691dfe` — Comunidad
- P3: `17605dc` — Operaciones
- P4: `<hash>` — Inventario
- P5: `<hash>` — Finanzas + Personas

**Base de datos poblada:** `prisma/dev.db` tiene datos de seed.

---

## Hooks disponibles (YA EXISTEN, no crear)

### Visor de Mensajes (CV)
- `useAvisosCV()` → `{ items, isLoading, create, update, remove }` — `/api/cv/avisos`
- `usePlantillasCV()` → `{ items, isLoading, create, update, remove }` — `/api/cv/plantillas`

### Reportes (RE)
- `useReportesRE()` → `{ items, isLoading, create, update, remove }` — `/api/reportes-re`

### Configuración (CF)
- `useConfiguracion()` → `{ config, isLoading, update }` — `/api/configuracion`

### Notificaciones
- `useNotificaciones()` → `{ items, isLoading, update }` — `/api/notificaciones`

### Personas, Unidades, Vinculos
- `usePersonas()`, `useUnidades()`, `useVinculos()` — ya conocidos

---

## Alcance: 4 páginas + cierre de serie

### 1. `app/visor-mensajes/page.tsx`

**Usos actuales del store:**
- `useCompassStore(s => s.avisosCV)` → `useAvisosCV().items`
- `useCompassStore(s => s.reservasRA)` → `useReservasRA().items`
- `hasHydrated` → `isLoading`

### 2. `app/admin/qa-lab/page.tsx` ⚠️ Excepción probable

**Esta página usa el store de forma intensiva:**
- Seed de datos (`seedData`)
- `STORE_VERSION`
- Migraciones del store
- Estado de QA (poblado, tests, etc.)

**Decisión:** Si la página usa el store para **gestionar datos de QA** (seed, migraciones, etc.), eso es funcionalidad específica de QA Lab que no tiene equivalente en API REST. **Documentar como excepción** con `// TODO: QA-Lab requiere API de gestión de seed/migraciones`.

Si solo lee datos de dominio para mostrarlos, migrar esas lecturas.

### 3. `app/admin/mantenimiento/page.tsx`

**Revisar qué lee del store.** Probablemente:
- Datos de mantenciones (`useMantencionesPE()`)
- Proveedores (`useProveedoresPE()`)
- Visitas técnicas (`useVisitasTecnicasPE()`)

Migrar lo que tenga hook. El resto, TODO.

### 4. `app/admin/dev-dashboard/page.tsx` ⚠️ Excepción probable

**Similar a QA-Lab:** usa el store para funciones de desarrollo (logs, estado del sistema, etc.). Migrar solo lecturas de datos de dominio si las hay. El resto, documentar como excepción.

---

## Tareas de cierre de serie (OBLIGATORIAS)

Después de migrar las páginas, ejecutar estas verificaciones:

### 1. Conteo de usos restantes del store legacy
```bash
cd k0mp4ss_fe/apps/web
echo "=== Usos de useCompassStore en app/ ==="
grep -r "useCompassStore\|useStoreRehydrated" app/ --include="*.tsx" | grep -v "store-ui" | grep -v "TODO" | wc -l
echo "=== Archivos que aún usan el store ==="
grep -rl "useCompassStore\|useStoreRehydrated" app/ --include="*.tsx" | grep -v "store-ui" | sort
```

**Documentar en el reporte:**
- Número total de usos restantes
- Lista de archivos que aún usan el store
- Por qué cada uno quedó (excepción documentada, TODO pendiente, etc.)

### 2. Tests finales
```bash
cd k0mp4ss_fe/apps/web
npx tsc --noEmit
npx vitest run test/api/
npm run lint
```

### 3. Actualizar `00-plan.md`
- Marcar P6 como HECHA
- Escribir resumen final en la Bitácora
- Listar excepciones/TODOs pendientes

### 4. Commitear y push
```bash
git add -A
git commit -m "feat(ui): P6 cierre serie UI-Migración-BD — visor + qa/dev + verificación"
```

### 5. Archivar serie
Crear change en openspec si aplica, o actualizar BACKLOG-100.md.

---

## Criterios de aceptación

- [ ] Páginas migradas (o documentadas como excepción)
- [ ] Conteo de usos restantes documentado
- [ ] `tsc --noEmit` 0 errores nuevos
- [ ] `npx vitest run test/api/` 151/151 pass
- [ ] `00-plan.md` actualizado con bitácora completa
- [ ] Commitear y pushear

---

## Reporte final

```
BITACORA_ENTRY: P6 — Serie UI-Migración-BD CERRADA. Visor + QA/Dev migrados.
Usos de store restantes: Z (listar archivos y razones).
Commit <hash>, tests X/Y.
```
