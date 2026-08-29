> **Este archivo ES tu prompt.** Ventana 6 (CIERRE) de la serie **crud-e2e**.
> Léelo completo (incluido `openspec/SERIE-CRUD-E2E/00-plan.md`) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie CRUD-E2E)

- Proyecto Compass. Front: `k0mp4ss_fe/apps/web`. `STORE_VERSION = 26`. Suite Vitest: 413/413.
  Lane E2E: `e2e/flujo/` (5 con setup), `e2e/smoke/` (8), `e2e/auth/` (3), `e2e/crud/`
  (23 con P1-P5, +setup). Suite Playwright completa verde. CI 3/3.
- Esta ventana escribe specs E2E en `e2e/crud/` y documenta el cierre. **Sin cambios de app
  ni de `lib/store.ts`** (infraestructura de verificación — puede ir sin change openspec;
  documéntalo en la Bitácora). Sin bump de STORE_VERSION.
- El store parte con seed en CADA contexto de test. Módulos gated: precondición
  `/admin/qa-lab` → "Poblar todo de una vez" → esperar `page.getByText("🟢 Listo").first()`.
- Quirúrgicos obligatorios (§Quirúrgicos de `00-plan.md`): dialogs con submit fuera de
  viewport → `requestSubmit()`; botones pesados → `click({ force: true, noWaitAfter: true })`;
  strict mode → scoper locators; **downloads → `page.waitForEvent("download")` o afirmar el
  historial** (certificados/reportes); cierre de cada test → `expect(errores).toEqual([])`.
- Si un label real difiere del inventario, confía en el CÓDIGO (lee el `page.tsx`) y anota
  la desviación en la Bitácora.

Método del proyecto: por cada cambio → openspec-propose → implementar → validar → commitear
(conventional español) → skill nsgc-prepush antes de cualquier push. (Preciso: esta serie es
infraestructura de verificación y puede ir sin change openspec.)
Reglas permanentes: dato de dominio solo vía acciones del store; D1 media por referencia;
secretos jamás en localStorage ni código; sin cambios de esquema del store.
Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0
errores) && npm test (suite completa verde) && npx playwright test e2e/crud/ (verde) +
openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo. No commitear Untitled.md. Si tu
contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en
openspec/SERIE-CRUD-E2E/00-plan.md.

## Arranque: verificación de la ventana anterior (P5) — antes de tu alcance

1. `git status` limpio y pusheado; `git log --oneline -8` con el commit P5.
2. `openspec validate --all` sin fallos; `npm test` verde; tsc/lint 0.
3. Contrasta con `openspec/SERIE-CRUD-E2E/00-plan.md`: fila P5 HECHA y `e2e/crud/` completo
   verde (23 tests). Si PARCIAL o algo falla → arréglalo primero, anótalo en la Bitácora.
4. Marca tu fila P6 como **EN CURSO**.

## Alcance (complejas gated + cierre integral)

1. **`crud/certificados.spec.ts`** (GATED — poblar primero): `/comunidad/certificados` →
   tab Generar → "Tipo de certificado *" = Residencia, "Persona solicitante *" =
   `TEST Persona QA Uno` (test-p-99, tiene vínculo activo con test-u-999 gracias al
   poblar), "Unidad *" = la unidad TEST, "Solicitante *" (input) → click
   **"Generar certificado PDF firmado"** (si descarga PDF: envolver con
   `page.waitForEvent("download")` y aceptar) → afirmar fila nueva en "Historial de
   Emisión" con folio.
2. **`crud/remuneraciones.spec.ts`** (GATED — poblar primero): `/finanzas/remuneraciones` →
   completar y **"Guardar cambios"** en parámetros legales (UF/IMM/tope/SIS) → seleccionar
   "Trabajador con ficha PE *" = `TEST Persona QA Uno` (el poblar crea su ficha con FKs) →
   periodo/días → **"Generar liquidación (borrador)"** → afirmar fila en el historial de
   folios → click **"Confirmar"** en la fila → afirmar estado confirmada.
3. **`crud/portal.spec.ts`** (GATED — poblar primero): `/comunidad/portal` (admin logueado
   vía storageState; el gate de residentes no aplica) → afirmar que el catálogo muestra la
   publicación TEST (`test-pub-pi-e999`) → activar **"Gestionar vitrina"** → click
   **"Nueva publicación manual"** (crea + abre Dialog "Editar publicación · {unidad}") →
   **"Guardar"** → afirmar fila en la tabla de gestión.
4. **Cierre integral**:
   - `npx playwright test` → SUITE COMPLETA verde (smoke 8 + auth 3 + flujo 4 + crud 26 +
     setup; 1 skipped gated rate-limit).
   - `npm test` verde (413+) · `tsc --noEmit` 0 · lint 0 · `openspec validate --all`.
   - Verificar que la skill `pruebas` v2 + `/qa` reflejan el mapa completo (lane crud con
     sus 17 specs incluida personas ya existente); ajustar la tabla del mapa si algún spec
     quedó con otro nombre.
   - Avance final de la serie en `Data/NSGC/docs/avances/` (formato de avances existentes:
     resumen, hitos, archivos, verificaciones, próxima acción).
   - `00-plan.md`: fila P6 **HECHA** + **SERIE COMPLETA** + Bitácora final con los 6 hashes.

**Fuera de alcance:** e2e en CI del lane crud (si el runner lo exige, serie futura), POM
refactor, rate-limit.

## Verificación

1. `npx playwright test e2e/crud/` → 26 passed (+setup). 2. `npx playwright test` → suite
completa verde. 3. `npm test` verde · tsc 0 · lint 0 · `openspec validate --all` sin fallos.
4. Ante fallo E2E: leer `test-results/**/error-context.md` antes de diagnosticar.

## Cierre

1. Commit, p. ej.
`test(e2e): lane crud — gated (certificados/remuneraciones/portal) + cierre serie (Serie CRUD-E2E P6)`.
2. `nsgc-prepush` → push. 3. Reporte final (abajo) — el orquestador auditará la serie con
solo tu BITACORA_ENTRY.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana P6 y estado (HECHA/PARCIAL + motivo) + dictamen de la serie (COMPLETA o no).
2. Commits (hash + subject) y push sí/no. 3. Specs creadas + skill/avance actualizados.
4. Números: tests crud X/Y (26 esperados), suite completa X/Y, tsc/lint OK. 5. Desviaciones
vs el inventario. 6. Pendientes post-serie. 7. Última línea exacta:
`BITACORA_ENTRY: <resumen 2-3 líneas>`.
