> **Este archivo ES tu prompt.** Ventana 5 de la serie **crud-e2e**.
> Léelo completo (incluido `openspec/SERIE-CRUD-E2E/00-plan.md`) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie CRUD-E2E)

- Proyecto Compass. Front: `k0mp4ss_fe/apps/web`. `STORE_VERSION = 26`. Suite Vitest: 413/413.
  Lane E2E: `e2e/flujo/` (5 con setup), `e2e/smoke/` (8), `e2e/auth/` (3), `e2e/crud/`
  (creciendo). Suite Playwright completa verde. CI 3/3.
- Esta ventana SOLO escribe specs E2E en `e2e/crud/`. **Sin cambios de app ni de
  `lib/store.ts`** (infraestructura de verificación — puede ir sin change openspec;
  documéntalo en la Bitácora). Sin bump de STORE_VERSION.
- El store parte con seed (54 personas, 166 unidades, maestros) en CADA contexto de test.
  Módulo gated (`pagos`): precondición `/admin/qa-lab` → "Poblar todo de una vez" → esperar
  `page.getByText("🟢 Listo").first()` (los datos core se crean aunque hoy el mensaje diga
  "Carga con 27 errores"; tras la Serie QA-LAB dirá "Carga completa OK").
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

## Arranque: verificación de la ventana anterior (P4) — antes de tu alcance

1. `git status` limpio y pusheado; `git log --oneline -8` con el commit P4.
2. `openspec validate --all` sin fallos; `npm test` verde; tsc/lint 0.
3. Contrasta con `openspec/SERIE-CRUD-E2E/00-plan.md`: fila P4 HECHA y `e2e/crud/` completo
   verde (20 tests con P1-P4). Si PARCIAL o algo falla → arréglalo primero, anótalo en la
   Bitácora.
4. Marca tu fila P5 como **EN CURSO**.

## Alcance (batch Finanzas — 3 specs en `e2e/crud/`)

1. **`crud/gastos-comunes.spec.ts`** — `/finanzas/gastos-comunes`:
   - Tab Fondos → **"Nuevo Fondo"** → Dialog **"Nuevo fondo"** → "Nombre" único
     (`QA-Fondo-<ts>`), "Tipo" select, "Fondo activo" on → **"Guardar"** → afirmar card del
     fondo visible.
   - Tab Egresos → **"Registrar Gasto"** → Dialog **"Registrar gasto"** → "Fecha" (hoy),
     "Monto ($)" 15000, "Descripción" (`QA Egreso <ts>`), "Categoría" (cualquiera),
     "Fondo de imputación" = `fondo-gc` → submit **"Registrar gasto"** → afirmar fila en la
     Table de egresos con folio `FE-` y el monto.
2. **`crud/multas.spec.ts`** — `/finanzas/multas`: tab Registro → **"Registrar infracción"**
   → Dialog **"Registrar infracción"** → "Origen *" (conserjería/manual), "Tipo de
   infracción *" (uno del catálogo seed, p. ej. ruidos), "Unidad infractora *" (seed),
   "Fecha/Hora del suceso *", "Antecedentes *" (`QA <ts>`) → submit **"Registrar"** →
   afirmar fila en el registro (Table) con la unidad y estado en revisión.
3. **`crud/pagos.spec.ts`** (GATED — usa fixture del QA Lab): precondición poblar (ver
   contexto) → `/finanzas/pagos` → en el "Libro de cobros" localizar un cobro pendiente
   creado por el poblar (concepto `gasto_comun` del periodo actual o `multa_in`) → row
   action **"Registrar pago"** → Dialog **"Registrar pago"** → "Monto recibido ($)" = el
   exigible mostrado en la fila, "Medio" transferencia → submit **"Procesar pago"** →
   afirmar que el estado del cobro cambia (Pagado / Al día) en la fila. Si el cobro tarda
   en aparecer, recarga la ruta (el store ya está poblado en el mismo contexto).

## Verificación

1. `npx playwright test e2e/crud/` → 23 passed (+setup). 2. `npx playwright test` → suite
completa verde. 3. `npm test` verde · tsc 0 · lint 0 · `openspec validate --all` sin fallos.

## Cierre

1. `00-plan.md`: fila P5 **HECHA** + hash + Bitácora. 2. Commit, p. ej.
`test(e2e): lane crud — finanzas (gastos-comunes/multas/pagos) (Serie CRUD-E2E P5)`.
3. `nsgc-prepush` → push. 4. Reporte final (abajo).

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana P5 y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas. 4. Números: tests crud X/Y, suite completa X/Y, tsc/lint OK. 5. Desviaciones
vs el inventario. 6. Pendientes a P6. 7. Última línea exacta:
`BITACORA_ENTRY: <resumen 2-3 líneas>`.
