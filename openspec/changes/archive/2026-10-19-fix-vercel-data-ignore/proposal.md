# Proposal: fix-vercel-data-ignore

## Contexto

El deploy en Vercel (commit `7831ffe`) falla con 11 errores Turbopack
`Module not found: Can't resolve '@/data/...'` (`lib/store.ts` y
`app/finanzas/gastos-comunes/page.tsx`). Los archivos existen en git
(`git ls-tree origin/main` los lista) y el build local resuelve el alias
`@/*` correctamente. La causa es el `.vercelignore` de la raíz.

## Causa raíz

La línea 6 del `.vercelignore` (`Data/`, pensada para excluir la carpeta de
documentación `Data/` de la raíz) también excluye `k0mp4ss_fe/apps/web/data/`
—los seeds de la app—. El motor de ignore que usa Vercel matchea patrones de
directorio **sin distinguir mayúsculas/minúsculas** y a **cualquier
profundidad**: verificado con el paquete `ignore@7.0.5`, el patrón `Data/`
ignora `data/x.ts`, `DATA/x.ts` y `a/data/b.ts`. Resultado: `data/` nunca se
sube a Vercel y todos los `@/data/*` fallan.

## Objetivo

Hacer que el deploy de Vercel incluya `k0mp4ss_fe/apps/web/data/` sin dejar de
excluir la documentación pesada (`Data/`, `openspec/`, tests, e2e).

## Alcance

1. Anclar el patrón a la raíz: `Data/` → `/Data/` (solo `<repo>/Data/`).
2. Comentario de advertencia en el `.vercelignore` sobre el matching
   case-insensitive para futuros patrones.
3. Verificación con simulación del motor `ignore` (data/ se sube, `Data/` y
   tests siguen excluidos) + `tsc` verde.

## No-alcance

- Cambiar `Root Directory` (ya es `k0mp4ss_fe`, correcto con
  `k0mp4ss_fe/vercel.json`), estrategia de build (turbo) ni código de la app.
- Migración SQLite → PostgreSQL, rotación de secretos y demás pendientes de
  BACKLOG-100 (se reportan por separado).
