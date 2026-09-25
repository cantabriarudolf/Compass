> **Este archivo ES tu prompt.** Ventana P6 de la serie `SERIE-UI-MIGRACION-BD`.
> Léelo completo (incluido `openspec/SERIE-UI-MIGRACION-BD/00-plan.md`) y ejecuta sus bloques en orden.

---

## Contexto común (válido para TODA la serie UI-Migración-BD)

**Estado previo:** La serie `SERIE-BD-FUENTE-VERDAD` creó la infraestructura completa de persistencia servidora: 107 API routes, ~30 hooks SWR en `lib/api/`, tests de API 151/151 pasando. El store legacy (`lib/store.ts`, 8.600 líneas) está marcado `@deprecated` con `STORE_VERSION = 28` congelado. Pero 28 páginas de la app aún leen/escriben datos de dominio desde `useCompassStore`.

**Método del proyecto:** Por cada cambio → openspec-propose → implementar con openspec-apply-change → validar → commitear (conventional español) → sincronizar specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de cualquier push.

**Reglas permanentes:**
- Dato de dominio solo vía hooks SWR (`lib/api/use-*.ts`) o API REST directa; el store legacy (`useCompassStore` para datos de dominio) está deprecado.
- Mocks de `data/` son solo seed; no son fuente de verdad en runtime.
- D1 media por referencia (sin base64/Blob).
- Secretos jamás en localStorage ni código.
- Terminología "comunidad" (jamás "condominio").
- No commitear Untitled.md.

**Verificación por ventana:**
```bash
cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores) && npm test (suite completa verde)
```

`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en `openspec/SERIE-UI-MIGRACION-BD/00-plan.md`.

---

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` (tree limpio) y `git status -sb` (sin "ahead": todo pusheado) y `git log --oneline -8`.
2. `openspec validate --all` → sin fallos.
3. `cd k0mp4ss_fe/apps/web && npm test` → suite completa verde.
4. Contrastar con `openspec/SERIE-UI-MIGRACION-BD/00-plan.md`:
   - Fila P5 HECHA y todo OK → marca tu fila P6 EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero (change fix pequeño + test), anótalo en la Bitácora, y solo después empieza tu alcance.
   - PARCIAL o repo a medias → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

---

## Alcance de esta ventana (P6): Visor-mensajes + QA/Dev + Cierre

### Páginas objetivo

1. **`app/visor-mensajes/page.tsx`** → `useCV`
   - Reemplazar lectura de avisos del visor de mensajes.

2. **`app/admin/qa-lab/page.tsx`**
   - Esta página probablemente usa el store de forma intensiva (seed, migraciones, etc.).
   - Revisar si puede usar hooks SWR o si necesita datos agregados que no tienen API.
   - Si es demasiado compleja, dejar como excepción documentada con `// TODO`.

3. **`app/admin/mantenimiento/page.tsx`**
   - Revisar qué datos lee del store.
   - Migrar lo que tenga hook disponible.

4. **`app/admin/dev-dashboard/page.tsx`**
   - Similar a qa-lab: puede ser compleja. Migrar lo posible, documentar el resto.

### Tareas de cierre de serie

Después de migrar las páginas, ejecutar estas verificaciones finales:

1. **Conteo de usos de store legacy:**
   ```bash
   cd k0mp4ss_fe/apps/web && grep -r "useCompassStore\|useStore" app/ --include="*.tsx" | grep -v "store-ui" | wc -l
   ```
   - Documentar el número restante en la bitácora.
   - Si es 0 (ideal), celebrar.
   - Si es >0, listar qué páginas quedan y por qué.

2. **Verificar que las páginas migradas no regresan al store:**
   ```bash
   grep -r "useCompassStore" app/ --include="*.tsx" | grep -v "store-ui" | cut -d: -f1 | sort | uniq
   ```

3. **Tests finales:**
   - `npm test` completo.
   - `npx tsc --noEmit`.
   - `npm run lint`.

4. **Actualizar `00-plan.md`:**
   - Marcar todas las filas P1-P6 como HECHAS con sus commits.
   - Escribir resumen final en la Bitácora.

5. **Commitear y push:**
   - `git add -A && git commit -m "feat(ui): P6 cierre serie UI-Migración-BD — visor + qa/dev + verificación"`
   - Si hay cosas pendientes, documentarlas en el commit message.

6. **Archivar serie en openspec:**
   - Crear change `ui-migracion-bd` en `openspec/changes/` si aplica.
   - Actualizar `openspec/BACKLOG-100.md` si es relevante.

### Criterios de aceptación

- [ ] Las 4 páginas migradas (o documentadas como excepción) no usan `useCompassStore` para datos de dominio.
- [ ] Conteo de usos restantes documentado.
- [ ] `tsc` 0 errores.
- [ ] `npm test` suite completa verde.
- [ ] `00-plan.md` actualizado con bitácora completa.
- [ ] Commitear y pushear.

---

## Reporte final estandarizado (OBLIGATORIO)

1. **Ventana y estado:** P6 HECHA/PARCIAL + motivo.
2. **Commits:** hash + subject y push sí/no.
3. **Specs:** ninguna o las del cierre.
4. **Números:** tests X/Y pass, tsc/eslint OK, páginas migradas N/4, usos de store restantes Z.
5. **Desviaciones vs el prompt:** documentar.
6. **Pendientes heredados:** ninguno (es la última ventana).
7. **Última línea exacta:** `BITACORA_ENTRY: P6 — Serie UI-Migración-BD CERRADA. Visor + QA/Dev migrados. Usos de store restantes: Z. Commit <hash>, tests X/Y.`
