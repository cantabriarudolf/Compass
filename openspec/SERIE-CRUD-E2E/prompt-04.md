> **Este archivo ES tu prompt.** Ventana 4 de la serie **crud-e2e**.
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

## Arranque: verificación de la ventana anterior (P3) — antes de tu alcance

1. `git status` limpio y pusheado; `git log --oneline -8` con el commit P3.
2. `openspec validate --all` sin fallos; `npm test` verde; tsc/lint 0.
3. Contrasta con `openspec/SERIE-CRUD-E2E/00-plan.md`: fila P3 HECHA y `e2e/crud/` completo
   verde (16 tests con P1-P3). Si PARCIAL o algo falla → arréglalo primero, anótalo en la
   Bitácora.
4. Marca tu fila P4 como **EN CURSO**.

## Alcance (batch Comunidad — 4 specs en `e2e/crud/`)

1. **`crud/comunicacion.spec.ts`** — `/comunidad/comunicacion` (vista Administración, la
   default del admin): tab Plantillas → **"Nueva plantilla"** → Dialog → nombre/asunto/cuerpo
   únicos con marca QA → **"Guardar"** → afirmar card de plantilla visible. (Si el Dialog
   pide campos distintos, lee `app/comunidad/comunicacion/`.)
2. **`crud/directiva.spec.ts`** — `/comunidad/directiva` (vista administrador): click
   **"Registrar reunión / nueva acta"** → Dialog **"Nueva acta de reunión"** → "Fecha",
   "Hora", "Lugar" (`Sede QA`), "Minuta" → submit **"Guardar borrador"** → afirmar card de
   borrador visible con monitor de firmas y botones **"Aprobar como {cargo}"** (no aprobar:
   solo presencia).
3. **`crud/visor.spec.ts`** — `/comunidad/visor`: click **"Nuevo aviso"** → Dialog
   **"Nuevo aviso"** → "Título *" (`QA Aviso <ts>`), "Cuerpo *", "Tipología *" (info),
   "Duración… *" (8) → **"Guardar borrador"** → en la fila del aviso click **"Publicar"** →
   afirmar estado publicado en la Table → `page.goto("/visor-mensajes")` → afirmar que el
   título aparece en el carrusel público.
4. **`crud/gestion.spec.ts`** — `/admin/gestion`: localizar el primer switch de privacidad
   (aria-label `Morosidad visible en {unidad}`) → leer `aria-checked`, clickearlo, afirmar
   que `aria-checked` flippeó → opcional: **"Cargar firma"** → Dialog "Firma digitalizada" →
   URL de imagen placeholder (`https://placeholder.supabase.co/qa-firma.png`) → **"Guardar"**.

## Verificación

1. `npx playwright test e2e/crud/` → 20 passed (+setup). 2. `npx playwright test` → suite
completa verde. 3. `npm test` verde · tsc 0 · lint 0 · `openspec validate --all` sin fallos.

## Cierre

1. `00-plan.md`: fila P4 **HECHA** + hash + Bitácora. 2. Commit, p. ej.
`test(e2e): lane crud — comunidad (comunicacion/directiva/visor/gestion) (Serie CRUD-E2E P4)`.
3. `nsgc-prepush` → push. 4. Reporte final (abajo).

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana P4 y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas. 4. Números: tests crud X/Y, suite completa X/Y, tsc/lint OK. 5. Desviaciones
vs el inventario. 6. Pendientes a P5-P6. 7. Última línea exacta:
`BITACORA_ENTRY: <resumen 2-3 líneas>`.
