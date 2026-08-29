> **Este archivo ES tu prompt.** Ventana 3 (CIERRE) de la serie **qa-lab**.
> Léelo completo (incluido `openspec/SERIE-QA-LAB/00-plan.md`) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie QA-LAB)

- Proyecto Compass. Front: `k0mp4ss_fe/apps/web`. `STORE_VERSION = 26`. Suite Vitest: 413/413.
  Lane E2E `e2e/flujo/`: 4 tests + setup = 5 passed; suite Playwright completa: 16 passed / 1
  skipped (rate-limit gated por diseño). CI 3/3 jobs verde.
- El Laboratorio QA es `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` (~1828 líneas, solo
  visible en dev). Tras P1: "Poblar todo" limpio → `Carga completa OK` (0 errores, 22/22
  fases). Tras P2: limpieza ownership-scoped, `validar()` completo y guard clean-first.
  La matriz y los criterios viven en `openspec/SERIE-QA-LAB/00-plan.md`.
- Las acciones de `lib/store.ts` FUNCIONAN (Vitest 413 + `test/store-integracion-nsgc.test.ts`).
  **PROHIBIDO tocar `lib/store.ts` en esta serie.** Sin bump de STORE_VERSION esperado.

Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change
→ validar → commitear (conventional español) → sincronizar specs mains y archivar con
openspec-archive-change → skill nsgc-prepush antes de cualquier push.
(Preciso para esta serie: se corrige infraestructura de VERIFICACIÓN del lab, no requisitos
del producto — puede ir sin change openspec; documéntalo así en la Bitácora. Si llegaras a
tocar comportamiento del app, SÍ va por openspec.)

Reglas permanentes: dato de dominio solo vía acciones del store (repository + StoreResult);
mocks de data/ son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en
localStorage ni código; cada cambio de esquema del store = bump STORE_VERSION + migrate + test.
Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores)
&& npm test (suite completa verde) + openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
No commitear Untitled.md. Si tu contexto se agota: cierra la tarea en curso + commit + deja
el estado exacto en openspec/SERIE-QA-LAB/00-plan.md.

## Arranque: verificación de las ventanas anteriores (P1 y P2) — antes de tu alcance

1. `git status` (tree limpio) y `git status -sb` (sin "ahead") y `git log --oneline -8`
   (deben estar los commits P1 y P2).
2. `openspec validate --all` → sin fallos.
3. `cd k0mp4ss_fe/apps/web && npm test` → suite completa verde; `npx tsc --noEmit` 0; lint 0.
4. Contrasta con `openspec/SERIE-QA-LAB/00-plan.md`:
   - P1 y P2 HECHAS y sus criterios cumplidos (e2e afirma `Carga completa OK`; guard activo)
     → marca tu fila P3 EN CURSO y sigue.
   - P1 o P2 HECHA pero algo falla → ARREGLA primero (fix pequeño + test), anótalo en la
     Bitácora, y solo después empieza tu alcance.
   - PARCIAL o repo a medias → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance (cierre integral de la serie)

1. **E2E del ciclo completo** (en `e2e/flujo/poblamiento.spec.ts` o un spec nuevo
   `e2e/flujo/ciclo.spec.ts`; recuerda que cada test Playwright parte con localStorage
   vacío — cada test debe preparar su propio estado):
   - **Test A (ciclo feliz)**: "Borrar todo lo de prueba" → esperar "TEST-* limpio
     correctamente" → "Poblar todo de una vez" → esperar `Carga completa OK` + verificar
     tarjetas 🟢 Listo (22/22, cero tarjetas en error) → "Revisar que nada quedó suelto" →
     `Validación OK — tasa huérfanos 0, TEST-* coherente`.
   - **Test B (guard clean-first)**: poblar (store limpio) → esperar `Carga completa OK` →
     intentar poblar de nuevo SIN limpiar → esperar el mensaje "Existen datos TEST-*" y
     que el estado no cambie.
   - **Test C (limpieza conservadora)**: tras poblar, "Borrar todo" → limpio correcto.
     Opcional si logras sembrar una notificación real de forma barata: verifica que
     sobrevive; si no es barato, déjalo en el ámbito Vitest/evidencia manual documentada.
   - Conserva los tests actuales (maestro + cross-checks MP/EF + personas.spec).
2. **Suites completas**: `npx playwright test` (suite completa: smoke + auth + flujo;
   1 skipped gated) · `npm test` (413+) · `npx tsc --noEmit` · `npm run lint` ·
   `openspec validate --all`.
3. **Documentación**: avance final de la serie en `Data/NSGC/docs/avances/` (resumen 27→0,
   seguridad de limpieza, guard clean-first, archivos tocados, verificaciones) siguiendo el
   formato de los avances existentes. La skill `nsgc-prepush` te dirá si falta algo más.
4. **`openspec/SERIE-QA-LAB/00-plan.md`**: fila P3 HECHA + estado de la serie **SERIE
   COMPLETA** + Bitácora final con los 3 hashes.

**Fuera de alcance:** idempotencia de "Poblar todo" (decisión del owner: serie futura);
cambios en `lib/store.ts`; nuevas features del lab.

## Verificación

1. `cd k0mp4ss_fe/apps/web && npx playwright test` → suite completa verde (tests A/B/C
   incluidos; el gated rate-limit sigue skipped por diseño).
2. `npm test` verde · `tsc --noEmit` 0 · `lint` 0 · `openspec validate --all` sin fallos.
3. Ante fallo E2E: leer `test-results/**/error-context.md` antes de diagnosticar.

## Cierre

1. `openspec/SERIE-QA-LAB/00-plan.md`: P3 **HECHA** + **SERIE COMPLETA** + Bitácora final.
2. Commit conventional español, p. ej. `test(qa-lab): cierre integral serie — ciclo e2e completo y guard verificado (Serie QA-LAB P3)`.
3. Skill `nsgc-prepush` completada → `git push` a origin main.
4. Reporte final (abajo) — el orquestador de la serie hará la auditoría final con solo tu
   BITACORA_ENTRY: no hace falta pegar texto de esta conversación en ningún otro chat.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana P3 y estado (HECHA/PARCIAL + motivo) + dictamen de la serie (COMPLETA o no).
2. Commits (hash + subject) y push sí/no. 3. Archivos tocados (+ changes openspec si los
hubo). 4. Números: STORE_VERSION, tests X/Y (vitest y playwright), tsc/lint OK, fases del
lab OK (22/22), huérfanos 0, guard verificado. 5. Desviaciones vs el prompt. 6. Pendientes
post-serie (idempotencia futura, gaps documentados). 7. Última línea exacta:
`BITACORA_ENTRY: <resumen 2-3 líneas>`.
