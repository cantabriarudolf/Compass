> **Este archivo ES tu prompt.** Ventana P2 de la serie produccion.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie produccion)

Estado previo: Compass es un proyecto Next.js 16 para gestión de comunidades edificadas. STORE_VERSION=27. Tests: 517 unit (vitest) + 86 e2e (playwright). Lint: 0 warnings (esperado tras P1). CI: GitHub Actions con unit+e2e. CD: no existe. Hosting target: Vercel. Database: SQLite dev.

Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change → validar → commitear (conventional español) → sincronizar specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de cualquier push.

Reglas permanentes: dato de dominio solo vía acciones del store (repository + StoreResult); mocks de data/ son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en localStorage ni código; cada cambio de esquema del store = bump STORE_VERSION + migrate + test.

Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores) && npm test (suite completa verde) + openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
No commitear Untitled.md. Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en openspec/SERIE-PRODUCCION/00-plan.md.

## Arranque: verificación de la ventana anterior (P1)

1. git status (tree limpio) y git status -sb (sin "ahead": todo pusheado) y git log --oneline -8.
2. openspec validate --all → sin fallos.
3. cd k0mp4ss_fe/apps/web && npm test → suite completa verde.
4. Contrasta con openspec/SERIE-PRODUCCION/00-plan.md:
   - Fila P1 HECHA y todo OK → marca tu fila P2 EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero (change fix pequeño + test), anótalo en la Bitácora, y solo después empieza tu alcance.
   - PARCIAL o repo a medias → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance de esta ventana (P2 — Configuración de producción)

### Tarea 1: Crear `vercel.json`

1. Crea `k0mp4ss_fe/apps/web/vercel.json` con configuración mínima de producción:
   - `version: 2`
   - `builds` o `framework` para Next.js
   - `routes` o `rewrites` si necesita
   - `headers` que complementen los de next.config.mjs (HSTS, CSP-RO, etc.)
   - `regions` opcional (sugiere `scl1` para Santiago si Vercel lo soporta, o deja default)
2. Documenta en comentarios qué ajustar cuando haya dominio real.

### Tarea 2: Activar `output: 'standalone'` en Next.js

1. En `next.config.mjs`, añade `output: 'standalone'`.
2. Verifica que no rompa `npm run build` local (corre `cd k0mp4ss_fe/apps/web && npm run build` si es posible; si falla por red/Google Fonts, documenta el error esperado).
3. Standalone reduce tamaño de imagen Docker si se usa, y optimiza para serverless.

### Tarea 3: Mejorar `lib/env-guard.ts`

1. Actual `getAppEnv()` usa `NEXT_PUBLIC_APP_ENV ?? APP_ENV ?? NODE_ENV`.
2. Problema: `isWriteApiEnabled()` retorna true si cualquiera de esas vars es "development". En producción con `NODE_ENV=production` pero `NEXT_PUBLIC_APP_ENV` mal seteada, las APIs dev quedan expuestas.
3. Mejora: `isWriteApiEnabled()` debe ser más restrictivo. Solo retornar true si `NODE_ENV === 'development'` Y `NEXT_PUBLIC_APP_ENV !== 'production'`. Documenta el cambio.
4. Añade helpers útiles: `isProduction(): boolean`, `isDevelopment(): boolean`, `requireEnv(name: string): string` (falla si falta en producción).
5. Tests para env-guard.ts (al menos 3 casos).

### Tarea 4: Scripts de build prod

1. Verifica que `package.json` scripts sean correctos para prod:
   - `build` debe funcionar con `NODE_ENV=production`
   - Añade `build:analyze` usando `@next/bundle-analyzer` (instálalo como devDependency si no existe)
2. Documenta en un comentario en `package.json` qué variables de entorno son obligatorias en producción.

### Tarea 5: Validación final

1. `npx tsc --noEmit` → 0 errores
2. `npm test` → suite completa verde
3. `npm run lint` → 0 warnings
4. `openspec validate --all` → sin fallos

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado: P2 HECHA/PARCIAL + motivo.
2. Commits: hash + subject y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION, tests X/Y, tsc/eslint OK.
5. Desviaciones vs el prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: P2 — Config producción: vercel.json, standalone, env guard mejorado (commit <hash>)`.
