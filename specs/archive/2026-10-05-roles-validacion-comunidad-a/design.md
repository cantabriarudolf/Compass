# Design: roles-validacion-comunidad-a

## Decisión

Reutilizar el seed idempotente existente en vez de crear datos a mano:

```sh
# desde k0mp4ss_fe/apps/web
npx vite-node scripts/seed-db-from-mocks.ts --comunidad-id=comunidad-a
```

(`tsx` no está en devDependencies; `vite-node` sí, vía Vitest. El flag de
comunidad es obligatorio en esta BD: sin flag siembra en la primera comunidad
por creación, que podría ser `comunidad-backup-a` y contaminaría datos reales
con mocks.)

Más script npm para dejar la receta fijada:

```json
"seed:mocks": "vite-node scripts/seed-db-from-mocks.ts"
```

(acepta `-- --comunidad-id=xxx` por CLI).

## Por qué no las alternativas

- **Membresías TEST en `backup-a`**: rompería el diseño (los TEST validan
  contra `comunidad-a` según spec RP + e2e) y mezclaría validación con datos
  restaurados.
- **Poblado manual por UI (QA Lab)**: no reproducible, se pierde al recrear
  la BD, y QA Lab sigue en store legacy.
- **Copiar filas backup-a → comunidad-a**: duplica identidades y arrastra
  historia; los mocks deterministas (p-1, u-A-101…) ya están alineados con
  `personaId` p-3..p-7 del seed-authz.

## Riesgos

- Bajo: upsert idempotente por id, no borra nada, no toca fondos ni punto
  cero. Verificación por conteos SQL por comunidad antes y después.
