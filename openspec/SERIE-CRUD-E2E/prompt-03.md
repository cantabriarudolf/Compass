> **Este archivo ES tu prompt.** Ventana 3 de la serie **crud-e2e**.
> Léelo completo (incluido `openspec/SERIE-CRUD-E2E/00-plan.md`) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie CRUD-E2E)

- Proyecto Compass. Front: `k0mp4ss_fe/apps/web`. `STORE_VERSION = 26`. Suite Vitest: 413/413.
  Lane E2E: `e2e/flujo/` (5 con setup), `e2e/smoke/` (8), `e2e/auth/` (3), `e2e/crud/`
  (creciendo). Suite Playwright completa verde. CI 3/3.
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

## Arranque: verificación de la ventana anterior (P2) — antes de tu alcance

1. `git status` limpio y pusheado; `git log --oneline -8` con el commit P2.
2. `openspec validate --all` sin fallos; `npm test` verde; tsc/lint 0.
3. Contrasta con `openspec/SERIE-CRUD-E2E/00-plan.md`: fila P2 HECHA y `e2e/crud/` completo
   verde (12 tests con P1+P2). Si PARCIAL o algo falla → arréglalo primero, anótalo en la
   Bitácora.
4. Marca tu fila P3 como **EN CURSO**.

## Alcance (batch Operaciones — 4 specs en `e2e/crud/`)

1. **`crud/reservas.spec.ts`** — `/operaciones/reservas`: primero crear el elemento:
   tab Elementos → **"Nuevo elemento reservable"** → Dialog → nombre único
   (`QA-Sala-<ts>`), tipo `espacio_fisico`, tarifa 0 y garantía 0 (evita gates de
   morosidad/FL) → **"Guardar"**. Luego header **"Nueva reserva"** → Dialog →
   "Elemento reservable *" = el creado, "Solicitante (MP) *" = persona seed (primera
   activa), "Unidad del residente" (si aplica), "Fecha *" = mañana, "Tramo horario *" →
   submit **"Confirmar disponibilidad y reservar"** → afirmar fila en el calendario con el
   elemento y estado confirmada. Extra opcional: crear 2ª reserva igual y afirmar que la
   tercera en el mismo tramo es rechazada por "Conflicto horario".
2. **`crud/solicitudes.spec.ts`** — `/operaciones/solicitudes`: click header
   **"Enviar Solicitud"** → Dialog **"Nueva solicitud"** → "Tipo de gestión" = insumos →
   llenar los campos condicionales que pida (leer el page.tsx si difiere) → submit
   **"Enviar Solicitud"** → afirmar fila nueva en la Bandeja (muestra las 10 más recientes:
   un ticket fresco es visible) con estado **"En Revisión"** (transición automática al abrir).
3. **`crud/bitacora.spec.ts`** — `/operaciones/bitacora`: tab Visitas → formulario inline →
   "Nombre *" (`QA Visita <ts>`), "DNI *" (`16.444.555-0`), "Unidad destino" (seed) →
   **"Registrar visita"** → afirmar fila en la tabla del día → click **"Marcar Ingresada"** →
   afirmar estado `ingresada`.
4. **`crud/proveedores.spec.ts`** — `/operaciones/proveedores`: click **"Nuevo"** → Dialog
   **"Nuevo proveedor"** → "RUT empresa *" (`76.543.210-3`), "Nombre *" único
   (`QA-Servicios-<ts>`), "Rubro *" (`Ascensores`) → **"Guardar"** → afirmar fila en el
   catálogo (Table Empresa/RUT/Rubro).

## Verificación

1. `npx playwright test e2e/crud/` → 12 passed (+setup). 2. `npx playwright test` → suite
completa verde. 3. `npm test` verde · tsc 0 · lint 0 · `openspec validate --all` sin fallos.

## Cierre

1. `00-plan.md`: fila P3 **HECHA** + hash + Bitácora. 2. Commit, p. ej.
`test(e2e): lane crud — operaciones (reservas/solicitudes/bitacora/proveedores) (Serie CRUD-E2E P3)`.
3. `nsgc-prepush` → push. 4. Reporte final (abajo).

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana P3 y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas. 4. Números: tests crud X/Y, suite completa X/Y, tsc/lint OK. 5. Desviaciones
vs el inventario. 6. Pendientes a P4-P6. 7. Última línea exacta:
`BITACORA_ENTRY: <resumen 2-3 líneas>`.
