> **Este archivo ES tu prompt.** Ventana P4 de la serie produccion.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie produccion)

Estado previo: Compass es un proyecto Next.js 16 para gestión de comunidades edificadas. STORE_VERSION=27. Tests: 517 unit (vitest) + 86 e2e (playwright). Lint: 0 warnings. CI: GitHub Actions con unit+e2e. CD: no existe. Hosting target: Vercel. Database: SQLite dev.

Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change → validar → commitear (conventional español) → sincronizar specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de cualquier push.

Reglas permanentes: dato de dominio solo vía acciones del store (repository + StoreResult); mocks de data/ son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en localStorage ni código; cada cambio de esquema del store = bump STORE_VERSION + migrate + test.

Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores) && npm test (suite completa verde) + openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
No commitear Untitled.md. Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en openspec/SERIE-PRODUCCION/00-plan.md.

## Arranque: verificación de la ventana anterior (P3)

1. git status (tree limpio) y git status -sb y git log --oneline -10.
2. openspec validate --all → sin fallos.
3. cd k0mp4ss_fe/apps/web && npm test → suite completa verde.
4. Contrasta con openspec/SERIE-PRODUCCION/00-plan.md:
   - Filas P1-P3 HECHAS y todo OK → marca tu fila P4 EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero, anótalo en la Bitácora, y solo después empieza tu alcance.
   - PARCIAL → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance de esta ventana (P4 — Calidad de código)

### Tarea 1: Pre-commit hooks (husky + lint-staged)

1. Instala `husky` y `lint-staged` como devDependencies en `k0mp4ss_fe/apps/web`.
2. Configura `.husky/pre-commit` que ejecute:
   - `lint-staged` → `eslint --fix` + `prettier --write` en archivos staged
   - `tsc --noEmit` (typecheck rápido)
3. Configura `lint-staged` en `package.json`:
   ```json
   "lint-staged": {
     "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
     "*.{json,md}": ["prettier --write"]
   }
   ```
4. Asegúrate de que los hooks no rompan el flujo de trabajo (si tsc es lento, considera omitirlo del pre-commit y dejarlo solo en CI).
5. Documenta en README cómo instalar hooks (`npx husky install` o `npm run prepare`).

### Tarea 2: Extender coverage de tests

1. Actual `vitest.config.ts` tiene `coverage.include: ["lib/store.ts"]`.
2. Extiende a:
   - `lib/authz.ts`
   - `lib/schemas.ts`
   - `lib/logger.ts` (creado en P3)
   - `lib/date-utils.ts` (creado en P1)
   - `lib/id-utils.ts`
   - `lib/env-guard.ts` (mejorado en P2)
   - `app/api/**/route.ts` (al menos los handlers principales: fi, auditoria, admin/usuarios)
3. Ajusta thresholds si es necesario (no bajes los existentes: statements 90, branches 75, functions 85, lines 90).
4. Corre `npm run test:coverage` y verifica que no baje el porcentaje global.
5. Si algún archivo nuevo tiene cobertura muy baja, añade tests mínimos (no es objetivo llegar al 100%, pero sí cubrir los paths críticos).

### Tarea 3: npm audit y documentación de vulnerabilidades

1. Corre `cd k0mp4ss_fe && npm audit` (o `npm audit --prefix k0mp4ss_fe/apps/web` si es necesario).
2. Documenta los resultados en un archivo `docs/auditoria-dependencias-2026-09-08.md` con:
   - Lista de vulnerabilidades encontradas (severidad, CVE, descripción)
   - Recomendaciones de fix (update, replace, accept risk)
   - Dependencias en versión beta/inestable (especialmente `next-auth@5.0.0-beta.32`)
3. Si hay vulnerabilidades High/Critical que se puedan fixear con `npm audit fix`, hazlo.
4. Si requieren cambio de versión mayor o reemplazo de dependencia, documenta como tarea pendiente (no la hagas en esta ventana para no romper compatibilidad).

### Tarea 4: Validación final

1. `npx tsc --noEmit` → 0 errores
2. `npm test` → suite completa verde
3. `npm run lint` → 0 warnings
4. `openspec validate --all` → sin fallos
5. Testea el pre-commit hook localmente (haz un cambio pequeño, stage, intenta commit — el hook debe correr).

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado: P4 HECHA/PARCIAL + motivo.
2. Commits: hash + subject y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION, tests X/Y, coverage %, vulnerabilidades encontradas/fixed.
5. Desviaciones vs el prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: P4 — Calidad: pre-commit hooks, coverage extendido, npm audit (commit <hash>)`.
