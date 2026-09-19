# Change: produccion-p2-config-produccion

## Why

Ventana P2 de la serie SERIE-PRODUCCION. Estado previo: el proyecto NO tiene
configuración de hosting (CD inexistente, hosting target Vercel), `output` de
Next.js es el default (imagen de deploy innecesariamente grande), y el guard
de entorno `isWriteApiEnabled()` es débil: retorna true si el entorno
efectivo es "development", así que en un deploy de producción con
`NEXT_PUBLIC_APP_ENV` mal seteada (p. ej. "development") las APIs dev/QA
quedaban expuestas. Además no existe un script para analizar el bundle de
producción.

## What Changes

- **Nuevo `vercel.json`** (apps/web): config mínima de producción —
  `framework: nextjs` y `regions: ["scl1"]` (Santiago). Deliberadamente SIN
  headers: `next.config.mjs` ya envía la suite completa de seguridad y
  `proxy.ts` setea CSP-RO en runtime; duplicarlos en el edge provocaría
  headers duplicados. Cuando exista dominio real, este archivo es el lugar
  para HSTS con `preload` y CSP enforcement.
- **`next.config.mjs`**: `output: "standalone"` (optimiza serverless/Docker) +
  envoltorio condicional con `@next/bundle-analyzer` SOLO cuando
  `ANALYZE=true` (import dinámico: builds normales no requieren el paquete).
- **`lib/env-guard.ts` endurecido**: `isWriteApiEnabled()` solo retorna true
  si `NODE_ENV` es un runtime de desarrollo real (`development`; `test` para
  vitest) Y el entorno efectivo no está forzado a producción. Nuevos helpers:
  `isProduction()`, `isDevelopment()`, `requireEnv(name)` (falla fast en
  producción si falta la variable).
- **`package.json`**: script `build:analyze` + comentario con las variables de
  entorno obligatorias de producción (DATABASE_URL, AUTH_SECRET).

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

(ninguna — configuración de infraestructura y guard interno; sin cambios de
producto visibles para el usuario)

## Impact

- **Código:** `vercel.json` (nuevo), `next.config.mjs`, `lib/env-guard.ts`,
  `package.json`, `test/env-guard.test.ts` (nuevo).
- **Tests:** suite completa debe seguir verde (530 tras P1 + 12 nuevos de
  env-guard).
- **Riesgos:** el endurecimiento de `isWriteApiEnabled()` cambia el criterio
  de 404: un deploy con `NODE_ENV=development` real sigue habilitado, pero ya
  no basta con `NEXT_PUBLIC_APP_ENV=development` en un runtime production.
  `build:analyze` requiere `@next/bundle-analyzer` como devDependency (no
  instalado en esta ventana: la instalación mutaría `package-lock.json`
  fuera de las superficies autorizadas; escalado al owner).
- **Dependencias:** ninguna instalada en esta ventana (ver riesgo).
- **Fuera de alcance:** pipeline CD (P5), monitoreo (P3).
