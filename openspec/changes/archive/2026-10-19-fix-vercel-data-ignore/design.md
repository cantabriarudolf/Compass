# Design: fix-vercel-data-ignore

## Decisión

Anclar con `/` el patrón `Data/` en `.vercelignore` (línea 6):

```diff
-Data/
+/Data/
```

Más un bloque de comentario en la cabecera del archivo que documenta la
trampa: el matcher de Vercel es **case-insensitive** y los patrones sin `/`
aplican a **cualquier profundidad**. Cualquier patrón futuro para una carpeta
de la raíz debe ir anclado (`/Nombre/`).

## Alternativas descartadas

- **Renombrar `Data/` o `data/`**: churn innecesario; `Data/` (docs NSGC) y
  `data/` (seeds de la app) están referenciados en docs, specs y código.
- **Mover el `.vercelignore` a `k0mp4ss_fe/`**: Vercel lo lee desde la raíz
  del repo (el log muestra `Found .vercelignore` sin que exista uno en
  `k0mp4ss_fe/`); moverlo rompería la exclusión de `openspec/`, `Data/`,
  `.agents/`.
- **Negación `!/k0mp4ss_fe/apps/web/data/`**: las negaciones re-incluyen, pero
  el anclaje es más simple y expresa la intención real (excluir solo la
  carpeta de docs de la raíz).

## Riesgos

- Bajo: el cambio solo afecta qué archivos se suben a Vercel. La simulación
  con `ignore@7.0.5` demuestra que `k0mp4ss_fe/apps/web/data/**` se conserva y
  que `Data/`, `openspec/`, `test/`, `e2e/`, `scripts/` siguen excluidos.
  La verificación final es el redeploy en Vercel (a cargo del owner).

## Addendum F1 (SERIE-DEUDA-4, 2026-10-19): también `k0mp4ss_fe/.vercelignore`

El párrafo de "Alternativas descartadas" afirma que Vercel lee el `.vercelignore` desde la raíz del
repo "sin que exista uno en `k0mp4ss_fe/`". Eso era cierto cuando se escribió, pero **ya no**: el
commit `1406277` agregó `k0mp4ss_fe/.vercelignore` (37 líneas) y ese archivo tenía **el mismo bug** —
`Data/` sin anclar en la línea 6, que con el matcher *case-insensitive* y *a cualquier profundidad*
también excluye `apps/web/data/**`.

El `Root Directory` del proyecto es `k0mp4ss_fe`, así que ése es el `.vercelignore` que Vercel aplica
a la subida del directorio del proyecto; el de la raíz cubre la subida del repo completo. Como el fix
de ambos es idéntico y de riesgo nulo (`/Data/` no ancla a nada existente dentro de `k0mp4ss_fe/`,
porque ahí no hay carpeta `Data/`), se aplica en **los dos** archivos para que el resultado no dependa
de cuál lea Vercel:

```diff
-Data/
+# ATENCIÓN: matcher case-insensitive, patrones sin '/' matchean a cualquier profundidad…
+/Data/
```

Evidencia (misma simulación, `ignore@7.0.5`, `ignorecase: true`, base `k0mp4ss_fe/`):

```text
=== FE previo (Data/ sin anclar) ===
EXCLUIDO | apps/web/data/comunidad/personas.ts
EXCLUIDO | apps/web/data/maestros.ts
=== FE actual (/Data/ anclado) ===
INCLUIDO | apps/web/data/comunidad/personas.ts
INCLUIDO | apps/web/data/maestros.ts
EXCLUIDO | Data/NSGC/backups/dev-2026-10-01.db
EXCLUIDO | openspec/BACKLOG-100.md
```
