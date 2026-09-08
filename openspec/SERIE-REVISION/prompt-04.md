> **Este archivo ES tu prompt.** Ventana 4 de la serie revision.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie revision)

Project: Compass (Next.js 16 + TypeScript + Prisma + SQLite + Auth.js + Zustand persist).
Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change
→ validar → commitear (conventional español) → sincronizar specs mains y archivar con
openspec-archive-change → skill nsgc-prepush antes de cualquier push.
Reglas permanentes: dato de dominio solo vía acciones del store (repository + StoreResult);
mocks de data/ son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en
localStorage ni código; cada cambio de esquema del store = bump STORE_VERSION + migrate + test.
Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores)
&& npm test (suite completa verde) + openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
No commitear Untitled.md. Si tu contexto se agota: cierra la tarea en curso + commit + deja
el estado exacto en openspec/SERIE-REVISION/00-plan.md.

Estado previo: STORE_VERSION = 27, tests 515/516 pasan (1 roto en RA), e2e 86/88 pasan,
build limpio, tsc limpio, lint 43 warnings (0 errores), último commit 7108e1c.

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` (tree limpio) y `git status -sb` (sin "ahead": todo pusheado) y `git log --oneline -8`.
2. `openspec validate --all` → sin fallos.
3. `cd k0mp4ss_fe/apps/web && npm test` → suite completa verde.
4. Contrasta con `openspec/SERIE-REVISION/00-plan.md`:
   - Filas P1, P2, P3 HECHAS y todo OK → marca tu fila EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero, anótalo en la Bitácora, y solo después empieza.
   - PARCIAL o repo a medias → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance de esta ventana (P4 — Arquitectura & Deuda Técnica)

Objetivo: Identificar code smells, violaciones de SRP/DRY, y oportunidades de mejora estructural.
NO se ejecutan refactorings grandes en esta ventana (salvo que sean triviales y seguros).
Se documentan para decisión del owner.

### Tarea 4.1 — Análisis del store monolito

- `lib/store.ts` tiene ~5000 líneas. Analizar su estructura:
  - ¿Cuántas acciones CRUD tiene? ¿Por dominio?
  - ¿Cuántas migraciones? ¿Son idempotentes?
  - ¿El `partialize` es correcto? ¿No persiste datos sensibles?
- Evaluar si un split por dominio es viable sin romper persistencia Zustand:
  - Opción A: slices separados (`createStore<FIState>()`, `createStore<PEState>()`) con un
    composite store
  - Opción B: slices dentro del mismo store usando patrones de Zustand
  - Opción C: mantener monolito pero extraer helpers/acciones a archivos por dominio
- Documentar recomendación con pros/contras y riesgo de migración

### Tarea 4.2 — Revisión de `lib/schemas.ts`

- Verificar consistencia de mensajes de error en Zod schemas
- Buscar schemas duplicados o que deberían componerse de otros
- Verificar que todos los `save*` validen FKs (regla RG §Validación Referencial en Escritura)
- Buscar campos opcionales mal tipados (`undefined` vs `null` vs omisión)

### Tarea 4.3 — Revisión de DRY y abstracciones

- Buscar patrones repetidos en componentes (tablas CRUD, formularios, diálogos de confirmación)
- ¿Hay componentes genéricos que se podrían extraer? (DataTable, FormDialog, ConfirmDialog)
- Revisar hooks repetidos (useToast, useConfirm, etc.)
- Buscar "magic strings" repetidos (nombres de estados, IDs de comunidad de prueba, etc.)

### Tarea 4.4 — Hallazgos del revisor-fin

- Revisar `test/store-integracion-nsgc.test.ts` y comentarios sobre "Al Día exige pagar TODO"
- Revisar `e2e/crud/fi-espejo.spec.ts` y el TODO sobre sync parcial
- Documentar hallazgo F1: apertura 17.082.694 es derivada, no viene del libro
- Documentar hallazgo F2: serie `saldoCC` del fixture no reconcilia mes a mes con la derivada
- Determinar si estos hallazgos necesitan tests que declaren la semántica, o solo comentarios

### Tarea 4.5 — Documentación de deuda técnica

- Crear `openspec/changes/revision-arquitectura/` con:
  - `findings.md`: lista priorizada de deuda técnica (alta/media/baja) con justificación
  - `recommendations.md`: propuestas de mejora con estimación de esfuerzo y riesgo
- Si algún fix es trivial (1-2 líneas, 0 riesgo), aplicarlo inline y mencionarlo

## Verificación obligatoria antes de reportar

```bash
cd k0mp4ss_fe/apps/web
npx tsc --noEmit
npm run lint
npm test
```

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo).
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION, tests X/Y, tsc/eslint OK, items de deuda por prioridad.
5. Desviaciones vs el prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
