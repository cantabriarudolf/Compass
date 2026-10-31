> **Este archivo ES tu prompt.** Ventana 1 de la serie **qa-lab**.
> Léelo completo (incluido `openspec/SERIE-QA-LAB/00-plan.md`) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie QA-LAB)

- Proyecto Compass. Front: `k0mp4ss_fe/apps/web`. `STORE_VERSION = 26`. Suite Vitest: 413/413.
  Lane E2E `e2e/flujo/`: 4 tests + setup = 5 passed; suite Playwright completa: 16 passed / 1
  skipped (rate-limit gated por diseño). CI 3/3 jobs verde.
- El Laboratorio QA es `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` (~1828 líneas, solo
  visible en dev). Hoy "Poblar todo de una vez" reporta `Carga con 27 errores`. La matriz
  completa de hallazgos con file:line vive en `openspec/SERIE-QA-LAB/00-plan.md` — es tu
  base de hechos; léela antes de tocar código.
- Las acciones de `lib/store.ts` FUNCIONAN (Vitest 413 + `test/store-integracion-nsgc.test.ts`
  con lecturas frescas). **PROHIBIDO tocar `lib/store.ts` en esta serie.** Si algo del store
  pareciera roto, repórtalo como pendiente heredado. Sin bump de STORE_VERSION esperado.

Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change
→ validar → commitear (conventional español) → sincronizar specs mains y archivar con
openspec-archive-change → skill nsgc-prepush antes de cualquier push.
(Preciso para esta serie: se corrige infraestructura de VERIFICACIÓN del lab, no requisitos
del producto — igual que el lane E2E del avance 2026-08-29 11-10, puede ir sin change
openspec; documéntalo así en la Bitácora. Si llegaras a tocar comportamiento del app, SÍ va
por openspec.)

Reglas permanentes: dato de dominio solo vía acciones del store (repository + StoreResult);
mocks de data/ son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en
localStorage ni código; cada cambio de esquema del store = bump STORE_VERSION + migrate + test.
Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores)
&& npm test (suite completa verde) + openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
No commitear Untitled.md. Si tu contexto se agota: cierra la tarea en curso + commit + deja
el estado exacto en openspec/SERIE-QA-LAB/00-plan.md.

## Arranque (Ventana 1: lectura inicial — no hay ventana anterior)

1. Lee `openspec/SERIE-QA-LAB/00-plan.md` completo (matriz, criterios, roadmap).
2. Verifica repo: `git status` limpio, `git status -sb` sin "ahead", `git log --oneline -8`,
   `grep "STORE_VERSION = " lib/store.ts` → 26.
3. Marca tu fila P1 como **EN CURSO** en `00-plan.md` (la actualizarás a HECHA antes del push).

## Alcance (corrección de los 27 hallazgos del lab)

**Objetivo verificable:** "Poblar todo de una vez" sobre store limpio termina con
`report.ok === true`, `erroresGlobales.length === 0`, mensaje `Carga completa OK`, las 22
fases OK y todos los pasos OK.

Trabaja SOLO en `app/admin/qa-lab/page.tsx` y `e2e/flujo/poblamiento.spec.ts`:

1. **Lecturas frescas (24 de 27 errores)**: en cada `cargarFaseX` que relea estado tras
   acciones, reemplaza la lectura del snapshot `s.<colección>` por
   `useCompassStore.getState().<colección>` inmediatamente después de la acción que la muta.
   Puntos exactos en `00-plan.md` (matriz): GE `437,443,448,453` · IR `479,487,492` ·
   IN `526` · MT `548,552,560` · RA `584,599,603` · CV `614,622,631,640-641,647-649` ·
   FI `668` · PE `755,759` · RE `912-913`. Conserva los pasos que YA leen fresco
   (FI `674-724` parcial; PE `762-816` parcial). Regla práctica: si un paso verifica un
   campo mutado más arriba en el mismo callback, lee estado fresco.
2. **GD estructural (cascada a CV)**: en `cargarFase6GD` (`372-392`), la lista de firmantes
   debe salir de estado FRESCO tras promover a `test-p-99`, o firmar declarativamente con la
   directiva completa (4 seed `g-1..g-4` de `data/comunidad/personas.ts` + `test-p-99`).
   Meta real: quórum 100% → acta en estado `publicada` (no solo que el check lo lea bien).
3. **PE paso 10**: normaliza a minúsculas antes del `includes` para matchear el aviso admin
   y la copia del trabajador ("Copia de su cierre de turno").
4. **FI paso 7**: lee `eventos` fresco al verificar `FI_MANUAL_DISCOUNT`.
5. **RA paso 2**: sustituye la aserción `folio === "RA-0001"` por regex `/^RA-\d{4}$/`.
   NO toques el paso 9 de FI (busca por `origenRef`/`concepto`: correcto así).
6. **Propagación de StoreResult**: ninguna llamada seed auxiliar puede ignorar `.ok`
   (hoy: MA `272-284`, MP `290-299`, IN `507`, PE `761`): si falla, marca el paso como
   error con el mensaje del store en vez de reportar éxito.
7. **E2E endurecido** en `e2e/flujo/poblamiento.spec.ts` (test maestro): tras "Poblar todo",
   afirma además `page.getByText(/Carga completa OK/)`. Conserva 🟢 Listo, "tasa huérfanos 0"
   y los cross-checks MP/EF. Quirúrgicos ya aprendidos (avance 2026-08-29 11-10): botones
   pesados del lab con `click({ force: true, noWaitAfter: true })`; el lab deja el mensaje
   persistente hasta la próxima acción.

**Fuera de alcance (no lo toques):** `limpiar()`, guard clean-first y `validar()` completo
(son P2); suites finales y documentación (P3); `lib/store.ts`.

## Verificación

1. `cd k0mp4ss_fe/apps/web && npx playwright test e2e/flujo/` → 5 passed CON la aserción
   `Carga completa OK` activa (solo aparece con 0 errores: es la prueba del objetivo).
2. `npm test` → 413/413 (o más) · `npx tsc --noEmit` → 0 · `npm run lint` → 0 errores.
3. Ante fallo E2E: leer `test-results/**/error-context.md` antes de diagnosticar.

## Cierre

1. `openspec/SERIE-QA-LAB/00-plan.md`: fila P1 **HECHA** + hash de commit + entrada en Bitácora.
2. Commit conventional español, p. ej. `fix(qa-lab): lecturas frescas + GD/PE/FI — Poblar todo 0 errores (Serie QA-LAB P1)`.
3. Skill `nsgc-prepush` completada → `git push` a origin main.
4. Reporte final (abajo).

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana P1 y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Archivos tocados (+ changes openspec si los hubo). 4. Números: STORE_VERSION, tests X/Y,
tsc/lint OK, errores del lab antes→después (27→0), fases OK (22/22). 5. Desviaciones vs el
prompt. 6. Pendientes heredados a P2/P3. 7. Última línea exacta:
`BITACORA_ENTRY: <resumen 2-3 líneas>`.
