> **Este archivo ES tu prompt.** Ventana 2 de la serie **qa-lab**.
> Léelo completo (incluido `openspec/SERIE-QA-LAB/00-plan.md`) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie QA-LAB)

- Proyecto Compass. Front: `k0mp4ss_fe/apps/web`. `STORE_VERSION = 26`. Suite Vitest: 413/413.
  Lane E2E `e2e/flujo/`: 4 tests + setup = 5 passed; suite Playwright completa: 16 passed / 1
  skipped (rate-limit gated por diseño). CI 3/3 jobs verde.
- El Laboratorio QA es `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` (~1828 líneas, solo
  visible en dev). Tras P1, "Poblar todo" sobre store limpio termina en `Carga completa OK`
  (0 errores). La matriz completa de hallazgos con file:line vive en
  `openspec/SERIE-QA-LAB/00-plan.md` — es tu base de hechos.
- Las acciones de `lib/store.ts` FUNCIONAN (Vitest 413 + `test/store-integracion-nsgc.test.ts`).
  **PROHIBIDO tocar `lib/store.ts` en esta serie.** Si algo del store pareciera roto,
  repórtalo como pendiente heredado. Sin bump de STORE_VERSION esperado.

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

## Arranque: verificación de la ventana anterior (P1) — antes de tu alcance

1. `git status` (tree limpio) y `git status -sb` (sin "ahead") y `git log --oneline -8`
   (debe estar el commit P1).
2. `openspec validate --all` → sin fallos.
3. `cd k0mp4ss_fe/apps/web && npm test` → suite completa verde; `npx tsc --noEmit` 0; lint 0.
4. Contrasta con `openspec/SERIE-QA-LAB/00-plan.md`:
   - Fila P1 HECHA y el e2e afirma `Carga completa OK` → marca tu fila P2 EN CURSO y sigue.
   - P1 HECHA pero algo falla → ARREGLA primero (fix pequeño + test en el espíritu de P1),
     anótalo en la Bitácora, y solo después empieza tu alcance.
   - P1 PARCIAL o repo a medias → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance (seguridad del laboratorio: limpieza y guard)

**Objetivo verificable:** el lab SOLO elimina artefactos TEST (incluidos los de id
aleatorio derivados de la carga) y preserva datos reales; "Poblar todo" con datos `TEST-*`
presentes se BLOQUEA con mensaje claro, sin mutar nada.

Trabaja SOLO en `app/admin/qa-lab/page.tsx` (y, si extraes lógica pura a un módulo
`lib/`, con su test Vitest):

1. **`limpiar()` ownership-scoped**:
   - **Notificaciones** (hoy borra por `moduloOrigen` completo en `1168, 1182, 1196, 1226,
     1248`): filtra SOLO notificaciones TEST — criterio: `destinatarioPersonaId` de persona
     TEST (`startsWith("test-")`) o referencia explícita TEST en asunto/cuerpo. Las demás
     sobreviven.
   - **Configuración CF** (`1192-1198`): NO resetear a `undefined` a ciegas. Restaura
     `undefined` SOLO si el valor actual es exactamente el que la fase PL TEST pudo fijar
     (`ufMensual 39000`, `ingresoMinimoMensual 500000`, `topeGratificacionLegal 4.75`,
     `tasaSIS 1.48`); si es otro valor (real), presérvalo.
2. **Purge de artefactos de id aleatorio**: tras limpiar, no deben sobrevivir egresos FI
   derivados de liquidaciones PL TEST ni certificados CT generados por la fase (hoy el
   filtro por prefijo `test-*` en `1163-1167, 1200-1203` no los alcanza; sus ids son
   aleatorios, `store.ts:4132-4155` y `store.ts:4327-4343`). Rastrea la referencia que el
   store deja al crearlos (liquidación↔egreso, snapshot de certificado) y elimina por
   vínculo a datos TEST. Si el store NO deja referencia rastreable para algún artefacto,
   NO inventes heurísticas frágiles: documenta el gap como pendiente heredado.
3. **`validar()` completo** (`1365-1383`): hoy solo revisa FKs de unidades y vínculos TEST.
   Extiéndelo a referencias TEST de: FI (cobros por `origenRef test-*`, egresos, fondos),
   RA (reservas/elementos), PE (colecciones operacionales), PL (liquidaciones/adelantos),
   CT (certificados), CV (avisos con `actaId`/`plantillaId` TEST) y eventos AM de entidades
   TEST. El mensaje debe reportar huérfanos por área (p. ej. `3 huérfanos — FI: 2; CT: 1`).
4. **Guard clean-first**: al inicio de `runFase` (para `"todo"` y para cada fase), si
   existen datos `TEST-*` en colecciones core (personas, unidades, vínculos, actasGD,
   cobrosFI, reservasRA, liquidacionesPL, certificadosCT…), aborta SIN mutar nada con
   `setMsg({ type: "error", text: "Existen datos TEST-*: ejecuta primero «Borrar todo lo
   de prueba»" })`.
5. **Tests**: si extraes lógica pura (ownership, guard) a `lib/`, cúbrela con Vitest
   (notificación real sobrevive · config real se preserva · TEST-* se purga · guard
   bloquea). Si queda en el page.tsx, la cobertura E2E completa llega en P3.

**Fuera de alcance:** idempotencia de "Poblar todo" (decisión del owner: fuera de esta
serie); cambios en `lib/store.ts`; endurecimiento E2E final y documentación (P3).

## Verificación

1. `npm test` verde (413+, más los nuevos si extrajiste lógica) · `tsc --noEmit` 0 ·
   `npm run lint` 0 · `openspec validate --all` sin fallos.
2. Recorrido manual/e2e de humo: limpiar → "TEST-* limpio correctamente" → poblar →
   "Carga completa OK" → intentar poblar de nuevo SIN limpiar → mensaje del guard y sin
   cambios en el estado → limpiar de nuevo → limpio.
3. Deja en la Bitácora qué artefactos de id aleatorio quedaron con gap (si los hay) y por qué.

## Cierre

1. `openspec/SERIE-QA-LAB/00-plan.md`: fila P2 **HECHA** + hash de commit + entrada en Bitácora.
2. Commit conventional español, p. ej. `fix(qa-lab): limpieza ownership-scoped + validar completo + guard clean-first (Serie QA-LAB P2)`.
3. Skill `nsgc-prepush` completada → `git push` a origin main.
4. Reporte final (abajo).

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana P2 y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Archivos tocados (+ changes openspec si los hubo). 4. Números: STORE_VERSION, tests X/Y,
tsc/lint OK, huérfanos detectados por validar() antes→después, artefactos con gap. 5.
Desviaciones vs el prompt. 6. Pendientes heredados a P3. 7. Última línea exacta:
`BITACORA_ENTRY: <resumen 2-3 líneas>`.
