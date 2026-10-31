## 1. Vista /admin/logs sobre BD

- [x] 1.1 Reemplazar fuente `useCompassStore(s=>s.eventos)` por fetch a `GET /api/auditoria?categoria=&tipoAccion=&q=&page=&pageSize=50` con estados `cargando`/`error`/`eventos`/`total`/`totalPaginas` y `useEffect` disparado por `categoria/tipoAccion/qDebounced/page`.
- [x] 1.2 Mantener búsqueda con debounce 200ms igual que hoy mapeada a param `q`; selects `categoria`/`tipoAccion` derivados de los eventos de la página actual (o GET sin filtros inicial si se desea — documentar en design.md); reset page=1 al cambiar filtros/búsqueda; orden desc delegado al API.
- [x] 1.3 Paginación server-side: botones anterior/siguiente con `total` del response; contador "X de Y eventos en BD" (Y = total); `paginaActual = min(page, totalPaginas)`.
- [x] 1.4 Export CSV: del `eventos` cargados de la página actual (BOM + encabezado `timestamp,usuario,categoria,tipoAccion,referenciaId,descripcion`); deshabilitar si `eventos.length===0`.
- [x] 1.5 Skeleton de carga y empty state "Sin eventos para la búsqueda o filtros actuales."; mantener badge "solo lectura · pista inmutable" y cero botones de mutación; `CardDescription` con "retención completa en capa de datos".

## 2. e2e logs.spec.ts sobre BD

- [x] 2.1 Tras generar 2 eventos (flip switch *2 en /admin/gestion), navegar a /admin/logs y hacer poll hasta que filtro `tipoAccion=AD_OWNER_CONFIG_CHANGE` muestre ≥2 filas con celdas AD_OWNER_CONFIG_CHANGE (expect.poll / waitFor timeout 20-30s) en vez de afirmar "2 de 2 eventos" exacto.
- [x] 2.2 Ajustar asserts de contador a patrón laxo (/\\d+ de \\d+ eventos/ y "eventos en BD"); búsqueda/export igual pero export afirma ≥2 filas AD_OWNER_CONFIG_CHANGE; sin pageerror.

## 3. Verificación

- [x] 3.1 `npx tsc --noEmit` (0) · `npm run lint` (0 errores) · `npx vitest run` (435/435) · `npx playwright test e2e/crud/logs.spec.ts` verde (2 tests 1.4m)
- [x] 3.2 `openspec validate --all` sin fallos (33 passed)
- [x] 3.3 Commit conventional en español + nsgc-prepush + push + archive (git status limpio)
