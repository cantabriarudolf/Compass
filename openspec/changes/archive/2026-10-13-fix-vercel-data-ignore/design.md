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
