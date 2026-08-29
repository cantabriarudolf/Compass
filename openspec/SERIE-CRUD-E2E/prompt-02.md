> **Este archivo ES tu prompt.** Ventana 2 de la serie **crud-e2e**.
> Léelo completo (incluido `openspec/SERIE-CRUD-E2E/00-plan.md`) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie CRUD-E2E)

- Proyecto Compass. Front: `k0mp4ss_fe/apps/web`. `STORE_VERSION = 26`. Suite Vitest: 413/413.
  Lane E2E: `e2e/flujo/` (4 tests + setup = 5 passed), `e2e/smoke/` (8 módulos), `e2e/auth/`
  (3 flujos), `e2e/crud/` (creciendo con la serie). Suite Playwright completa verde. CI 3/3.
- Esta ventana SOLO escribe specs E2E en `e2e/crud/`. **Sin cambios de app ni de
  `lib/store.ts`** (infraestructura de verificación — puede ir sin change openspec;
  documéntalo en la Bitácora). Sin bump de STORE_VERSION.
- El store parte con seed (54 personas, 166 unidades, maestros) en CADA contexto de test.
- Quirúrgicos obligatorios (§Quirúrgicos de `00-plan.md`): dialogs con submit fuera de
  viewport → `requestSubmit()`; botones pesados → `click({ force: true, noWaitAfter: true })`;
  strict mode → scoper locators; cierre de cada test → `expect(errores).toEqual([])` sobre
  `pageerror`.
- Si un label real difiere del inventario, confía en el CÓDIGO (lee el `page.tsx`) y anota
  la desviación en la Bitácora.

Método del proyecto: por cada cambio → openspec-propose → implementar → validar → commitear
(conventional español) → skill nsgc-prepush antes de cualquier push. (Preciso: esta serie es
infraestructura de verificación y puede ir sin change openspec.)
Reglas permanentes: dato de dominio solo vía acciones del store; D1 media por referencia;
secretos jamás en localStorage ni código; sin cambios de esquema del store.
Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0
errores) && npm test (suite completa verde) && npx playwright test e2e/crud/ (specs de la
ventana, verde) + openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo. No commitear Untitled.md. Si tu
contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en
openspec/SERIE-CRUD-E2E/00-plan.md.

## Arranque: verificación de la ventana anterior (P1) — antes de tu alcance

1. `git status` limpio y pusheado; `git log --oneline -8` con el commit P1.
2. `openspec validate --all` sin fallos; `npm test` verde; tsc/lint 0.
3. Contrasta con `openspec/SERIE-CRUD-E2E/00-plan.md`: fila P1 HECHA y sus 4 specs verdes
   (`npx playwright test e2e/crud/` pasa completo). Si P1 PARCIAL o algo falla → arréglalo
   primero (fix pequeño + test), anótalo en la Bitácora.
4. Marca tu fila P2 como **EN CURSO**.

## Alcance (batch Inventario — 4 specs en `e2e/crud/`)

1. **`crud/tipos.spec.ts`** — `/inventario/tipos`: click **"Nuevo Tipo"** → Dialog
   **"Nuevo Tipo de Unidad"** → llenar "Nombre del Tipo" (único `QA-Loft-<ts>`), seleccionar
   "Categoría" (primera del maestro), "Metraje (m²)" 55, "Monto Base GC ($)" 99999 → submit
   **"Actualizar Tarifario"** (¡ojo: mismo label para crear y editar!) → afirmar fila con el
   nombre en la Table "Plantillas Técnicas".
2. **`crud/estructura.spec.ts`** — `/inventario/estructura`: click **"Nueva Unidad"** →
   Dialog **"Alta de Nueva Unidad"** (componente `FormularioUnidad`) → seleccionar
   "Macro-Sector" y "Sub-Sector" (primeros del seed), "Categoría Física (Plantilla)" (primer
   tipo), "Número / Identificador" único (`QA-9999`) → submit **"Registrar Unidad"** →
   afirmar fila `QA-9999` en la Table "Unidades". Si el form exige árbol seleccionado antes,
   usa los selects del propio diálogo; si algo bloquea, lee `app/inventario/estructura/` y
   `components/inventario/formulario-unidad.tsx`.
3. **`crud/recursos.spec.ts`** — `/inventario/recursos`: click **"Nuevo recurso"** → Dialog
   **"Nuevo recurso"** → "Nombre *" único (`QA-Cloro-<ts>`), "Naturaleza" = insumo,
   "Stock inicial *" 10, "Umbral crítico" 2 → **"Guardar"** → afirmar fila en el catálogo
   (Table) con el nombre y stock 10.
4. **`crud/proyectos.spec.ts`** — `/inventario/proyectos`: tab Trabajos → **"Nuevo trabajo"**
   → Dialog **"Nuevo trabajo u obra"** → "Título *" único, "Descripción técnica *",
   "Unidad EF *" (seed), responsable o proveedor externo, "Costo total ($) *" → **"Guardar"**
   → afirmar fila → click **"Iniciar"** en la fila → afirmar estado En Curso (`en_curso`).

## Verificación

1. `npx playwright test e2e/crud/` → 8 passed (+setup). 2. `npx playwright test` → suite
completa verde. 3. `npm test` verde · tsc 0 · lint 0 · `openspec validate --all` sin fallos.

## Cierre

1. `00-plan.md`: fila P2 **HECHA** + hash + Bitácora. 2. Commit, p. ej.
`test(e2e): lane crud — inventario (tipos/estructura/recursos/proyectos) (Serie CRUD-E2E P2)`.
3. `nsgc-prepush` → push. 4. Reporte final (abajo).

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana P2 y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas. 4. Números: tests crud X/Y, suite completa X/Y, tsc/lint OK. 5. Desviaciones
vs el inventario. 6. Pendientes a P3-P6. 7. Última línea exacta:
`BITACORA_ENTRY: <resumen 2-3 líneas>`.
