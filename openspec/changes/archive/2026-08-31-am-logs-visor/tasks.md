## 1. Vista `/admin/logs`

- [x] 1.1 Crear `k0mp4ss_fe/apps/web/app/admin/logs/page.tsx` (client component, patrón de
      `app/admin/metricas/page.tsx`: `useCompassStore` + `useStoreRehydrated` + skeleton si
      `!hasHydrated`)
- [x] 1.2 Lista de `eventos` ordenada por `timestamp` descendente con paginación ligera por
      bloques (50 por página, el store retiene máx 500): columnas fecha/hora, categoría,
      tipo de acción, referencia y descripción
- [x] 1.3 Búsqueda de texto libre (descripcion, referenciaId, tipoAccion) con debounce +
      filtros por `categoria` (select con categorías presentes en los eventos) y `tipoAccion`
- [x] 1.4 Botón "Exportar CSV" que descarga el resultado filtrado con encabezado
      `timestamp, usuario, categoria, tipoAccion, referenciaId, descripcion` (BOM UTF-8 para Excel)
- [x] 1.5 Asegurar solo lectura: sin botones de mutación, badge "solo lectura · pista inmutable"
      en el header y contador de eventos (X de Y)

## 2. Sidebar

- [x] 2.1 En `components/app-sidebar.tsx`, quitar el placeholder "Próximamente" del ítem
      "Logs de Auditoría" y habilitar la ruta real `/admin/logs`

## 3. Verificación

- [x] 3.1 `cd k0mp4ss_fe/apps/web && npx tsc --noEmit` → 0 errores
- [x] 3.2 `npm run lint` → 0 errores (warnings heredados permitidos)
- [x] 3.3 `npx vitest run` → suite completa verde (421/421, sin cambios esperados)
- [x] 3.4 Nuevo spec `e2e/crud/logs.spec.ts` (lane crud, patrón read-oriented con quirúrgicos
      del 00-plan de Serie CRUD-E2E): crear un evento real vía acción de un módulo (p. ej.
      registrar visita en bitácora o crear plantilla en comunicación), luego en `/admin/logs`
      afirmar orden timestamp desc, filtrar por categoría y buscar por texto, exportar CSV
      (descarga o afirmación de datos visibles) y verificar ausencia de botones de mutación;
      cierre con `expect(errores).toEqual([])` sobre `pageerror`
- [x] 3.5 `npx playwright test e2e/crud/logs.spec.ts` verde + `npx playwright test e2e/crud/`
      completo (23 specs) verde
- [x] 3.6 `openspec validate --all` → sin fallos

## 4. Cierre

- [x] 4.1 Commit conventional en español (feat(admin): vista logs de auditoría …)
- [x] 4.2 `nsgc-prepush`: manual afectado `04 - Auditoría y Métricas.md` / `24 - AM - Auditoría
      y Métricas.md` (nueva sección de la vista) + avance de la sesión
- [x] 4.3 Push a origin/main
