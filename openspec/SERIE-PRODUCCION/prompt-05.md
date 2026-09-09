> **Este archivo ES tu prompt.** Ventana P5 de la serie produccion.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie produccion)

Estado previo: Compass es un proyecto Next.js 16 para gestión de comunidades edificadas. STORE_VERSION=27. Tests: 517 unit (vitest) + 86 e2e (playwright). Lint: 0 warnings. CI: GitHub Actions con unit+e2e. CD: no existe. Hosting target: Vercel. Database: SQLite dev.

Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change → validar → commitear (conventional español) → sincronizar specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de cualquier push.

Reglas permanentes: dato de dominio solo vía acciones del store (repository + StoreResult); mocks de data/ son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en localStorage ni código; cada cambio de esquema del store = bump STORE_VERSION + migrate + test.

Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores) && npm test (suite completa verde) + openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
No commitear Untitled.md. Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en openspec/SERIE-PRODUCCION/00-plan.md.

## Arranque: verificación de la ventana anterior (P4)

1. git status (tree limpio) y git status -sb y git log --oneline -12.
2. openspec validate --all → sin fallos.
3. cd k0mp4ss_fe/apps/web && npm test → suite completa verde.
4. Contrasta con openspec/SERIE-PRODUCCION/00-plan.md:
   - Filas P1-P4 HECHAS y todo OK → marca tu fila P5 EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero, anótalo en la Bitácora, y solo después empieza tu alcance.
   - PARCIAL → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance de esta ventana (P5 — Pipeline de CD)

### Tarea 1: Crear job de deploy en GitHub Actions

1. Lee `.github/workflows/ci.yml` existente.
2. Añade un job `deploy` que dependa de `unit` y `e2e` (usa `needs: [unit, e2e]`):
   - Solo corre en pushes a `main` (no en PRs): `if: github.ref == 'refs/heads/main'`
   - Instala Vercel CLI: `npm i -g vercel`
   - Despliega con: `vercel --prod --token=${{ secrets.VERCEL_TOKEN }} --confirm`
   - O usa la action oficial: `vercel/action-deploy@v1`
3. El job debe setear las variables de entorno necesarias:
   - `DATABASE_URL` (apuntando a PostgreSQL prod cuando exista; por ahora usa un placeholder o deja comentado)
   - `AUTH_SECRET`
   - `NEXT_PUBLIC_APP_ENV=production`
4. Documenta en comentarios del YAML qué secrets debe configurar el owner en GitHub:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
   - `DATABASE_URL`
   - `AUTH_SECRET`

### Tarea 2: Script de deploy local (fallback)

1. Crea `scripts/deploy-vercel.mjs` que:
   - Valide que `VERCEL_TOKEN` esté en env
   - Valide que `NODE_ENV` o `NEXT_PUBLIC_APP_ENV` no sea `development`
   - Ejecute `vercel --prod` o documente el comando exacto
   - Sea útil para deploys manuales mientras no hay CD automatizado

### Tarea 3: Documentar variables de entorno de producción

1. Actualiza `.env.example` con sección clara `[Producción]`:
   - Qué variables son obligatorias
   - Qué variables son opcionales
   - Valores de ejemplo para cada proveedor (Vercel Postgres, Supabase, Neon)
   - Nota sobre `AUTH_SECRET` (mínimo 32 chars, aleatorio)
   - Nota sobre `PUBLIC_DOMAIN` (activa HSTS preload)
2. Añade comentarios de seguridad: "NUNCA commitear valores reales".

### Tarea 4: Validación final

1. `npx tsc --noEmit` → 0 errores
2. `npm test` → suite completa verde
3. `npm run lint` → 0 warnings
4. `openspec validate --all` → sin fallos
5. Valida sintaxis del YAML con `actionlint` si está disponible, o revisa visualmente indentación.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado: P5 HECHA/PARCIAL + motivo.
2. Commits: hash + subject y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION, tests X/Y, tsc/eslint OK.
5. Desviaciones vs el prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: P5 — CD: GitHub Actions deploy job, script deploy local, env docs (commit <hash>)`.
