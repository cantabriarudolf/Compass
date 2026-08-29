> **Este archivo ES tu prompt.** Ventana 1 de la serie **crud-e2e**.
> Léelo completo (incluido `openspec/SERIE-CRUD-E2E/00-plan.md`) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie CRUD-E2E)

- Proyecto Compass. Front: `k0mp4ss_fe/apps/web`. `STORE_VERSION = 26`. Suite Vitest: 413/413.
  Lane E2E: `e2e/flujo/` (4 tests + setup = 5 passed), `e2e/smoke/` (8 módulos), `e2e/auth/`
  (3 flujos). Suite Playwright completa: 16 passed / 1 skipped (rate-limit gated). CI 3/3 verde.
- Esta serie SOLO escribe specs E2E en `e2e/crud/` (naming: `crud/<modulo>.spec.ts`, un spec
  por módulo). **Sin cambios de app ni de `lib/store.ts`** (infraestructura de verificación,
  igual que el lane e2e del avance 2026-08-29 11-10 — puede ir sin change openspec;
  documéntalo así en la Bitácora). Sin bump de STORE_VERSION.
- El store parte con seed (54 personas, 166 unidades, maestros, vínculos) en CADA contexto
  de test (localStorage aislado por test). Módulos gated: precondición `/admin/qa-lab` →
  "Poblar todo de una vez" → esperar `page.getByText("🟢 Listo").first()` (los datos core se
  crean aunque hoy el mensaje diga "Carga con 27 errores"; tras la Serie QA-LAB dirá
  "Carga completa OK").
- Quirúrgicos obligatorios (§Quirúrgicos de `00-plan.md`): dialogs con submit fuera de
  viewport → `requestSubmit()`; botones pesados → `click({ force: true, noWaitAfter: true })`;
  `alert()` nativo → `page.on("dialog", d => d.accept())`; strict mode → scoper locators;
  downloads → `waitForEvent("download")` o afirmar el historial; cierre de cada test →
  `expect(errores).toEqual([])` sobre `pageerror`.
- Inventario UI exacto por módulo: en tu prompt y en `00-plan.md`. Si un label real difiere
  del inventario, confía en el CÓDIGO (lee el `page.tsx` del módulo) y anota la desviación
  en la Bitácora.

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

## Arranque (Ventana 1: lectura inicial — no hay ventana anterior)

1. Lee `openspec/SERIE-CRUD-E2E/00-plan.md` completo (mapa módulo→spec, quirúrgicos, criterios).
2. Verifica repo: `git status` limpio y pusheado, `git log --oneline -8`, STORE_VERSION 26.
3. Verifica que la skill `pruebas` v2 y el comando `/qa` YA están materializados por el
   orquestador (`.opencode/skills/pruebas/SKILL.md` con "Protocolo de puerta de entrada" y
   `.opencode/command/qa.md`): si falta algo o el mapa difiere del 00-plan, ajústalo como
   parte de esta ventana y anótalo en la Bitácora.
4. Marca tu fila P1 como **EN CURSO** en `00-plan.md`.

## Alcance (batch Admin/Personas — 4 specs en `e2e/crud/`)

Cada spec: patrón del lane (pageerror array, asserts accesibles, cierre `expect(errores).toEqual([])`).

1. **`crud/admin-maestros.spec.ts`** — `/admin/maestros`: click en un sub-tab del panel
   izquierdo (p. ej. botón "Estados de Ocupación") → el botón header **"Nuevo Registro"** se
   habilita → Dialog **"Añadir Nuevo Maestro"** → llenar "Nombre / Categoría" (input
   `name=nombre`) con valor ÚNICO (`QA-EdO-<timestamp>`) → submit **"Guardar"** → afirmar
   fila nueva en la Table del sub-tab. Ojo: nombre duplicado muestra error inline "Ya existe
   un registro…" — por eso el valor único. Edit opcional: pencil → "Editar Maestro".
2. **`crud/admin-configuracion.spec.ts`** — `/admin/configuracion`: registrar
   `page.on("dialog", d => d.accept())` ANTES (el guardado dispara `alert()` nativo) →
   cambiar "Nombre de la Comunidad *" a valor único → click header **"Guardar Cambios"**
   (asociado a `form#config-form`) → `page.goto` de nuevo a la ruta dentro del MISMO test →
   afirmar que el input conserva el valor (persistencia en store).
3. **`crud/admin-reporteria.spec.ts`** — `/admin/reporteria` → tab "Reportes y Segmentación"
   → llenar "Título del reporte *" (único) → marcar ≥1 checkbox de "Bloques de información *"
   → click **"Generar reporte (snapshot)"** → afirmar card con el título en "Historial de
   reportes" → click **"Distribuir"** en esa card → afirmar mensaje de distribución enviada.
4. **`crud/personal.spec.ts`** — `/personas/personal`: elegir una card de trabajador sin
   ficha (o con) → click **"Crear ficha"** → Dialog **"Ficha Integral — {nombre}"** → llenar
   "Cargo *" y "Fecha ingreso *" + seleccionar AFP / salud / mutualidad / banco (FKs
   obligatorias; usa los maestros seed) → submit **"Guardar ficha"** → afirmar que la card
   muestra la ficha (cargo visible). Ante labels de select no listados aquí: leer
   `app/personas/personal/` y su componente de ficha.

## Verificación

1. `npx playwright test e2e/crud/` → 4 passed (+setup). 2. `npx playwright test` → suite
completa verde (crud incluido). 3. `npm test` verde · `tsc --noEmit` 0 · lint 0 ·
`openspec validate --all` sin fallos. 4. Prueba la puerta: simula mentalmente el protocolo
de la skill (no hace falta correr el navegador).

## Cierre

1. `00-plan.md`: fila P1 **HECHA** + hash + Bitácora. 2. Commit conventional español, p. ej.
`test(e2e): lane crud — admin/personal + skill pruebas v2 y /qa (Serie CRUD-E2E P1)`.
3. `nsgc-prepush` → push. 4. Reporte final (abajo).

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana P1 y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas + skill/comando ajustados. 4. Números: tests crud X/Y, suite completa X/Y,
tsc/lint OK. 5. Desviaciones vs el inventario (labels reales distintos). 6. Pendientes a
P2-P6. 7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
