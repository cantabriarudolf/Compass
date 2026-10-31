# Proposal: lint-higiene — bajar los warnings de ESLint por valor y riesgo

## Contexto

`npm run lint` sale con **exit 0** (el config compartido monta `eslint-plugin-only-warn`, así que
todo se degrada a warning) pero arrastra **6.702 warnings** preexistentes. La serie deuda-2 los
midió al cerrar D5 y el owner los incluyó como ventana propia (D6).

La medición de apertura (agrupada por regla y por zona, `eslint --format json`) muestra que el
problema no es uniforme:

| Zona | Warnings |
| --- | --- |
| artefacto `.vercel/` (build de deploy, 244 K + 7,5 M de `output/`) | **6.602** |
| `test/` | 64 |
| `scripts/` | 21 |
| `app/` | 11 |
| `lib/` | 2 |
| `e2e/` + `proxy.ts` | 2 |

O sea: **el 98,5 % de los warnings son ruido de un artefacto generado** (`.vercel/node/index.js`,
un bundle de deploy) que el ignore de ESLint no contempla — el config compartido ignora `dist/**`,
`.next/**`, `**/.turbo/**` y `**/coverage/**`, pero **no** `.vercel/**`. El resto son 100 warnings
reales, casi todos en tests.

## Objetivo

Bajar los warnings **por orden de valor y riesgo**, no en bloque: primero el ruido de artefactos
generados (cero riesgo), después los warnings reales de código de producto (tipos honestos, sin
cambio de comportamiento) y por último los de tests, donde `any` es a veces la herramienta correcta
y se declara en vez de forzarse.

## Alcance

1. **Config de ESLint**: agregar `.vercel/**` al ignore y dar globales de Node a los scripts `.mjs`
   del artefacto de build (`scripts/**`), que hoy disparan `no-undef` por `process`.
2. **Código de producto** (`app/`, `lib/`): 11 warnings reales de `@typescript-eslint/no-unused-vars`
   (imports/destructures muertos), 2 directivas `eslint-disable` obsoletas detéctadas como FATAL.
   Ningún cambio de comportamiento.
3. **Tests** (`test/`): quitar los `no-unused-vars` (variables muertas) y reemplazar los casts
   `as any` de los tres tests de `proxy` por la firma real del default export, sin perder los
   `any` legítimos de fixtures (se documentan).
4. **Change openspec** con `skip_specs: true` y su justificación (no hay requirement vivo de
   capacidad que declare la higiene del linter) y **avance NSGC** con la tabla de warnings
   antes/después por regla y zona.

## Fuera de alcance

- `vitest.config.ts` (ni `thresholds` ni nada) y cualquier cambio de comportamiento observable.
- Declarar las env vars (`CSP_ENFORCEMENT`, `SQLITE_URL`, `POSTGRES_URL`, `COMUNIDAD_ID`,
  `SKIP_DATOS`, `DATABASE_URL_POSTGRES`) en `turbo.json`: es la solución honesta a los 21 warnings
  de `turbo/no-undeclared-env-vars`, pero `turbo.json` está fuera de los archivos de esta ventana.
  Quedan medidos y declarados como deuda post-serie.
- Los 2 warnings de `react-hooks` (`set-state-in-effect` en `app/finanzas/remuneraciones`,
  `exhaustive-deps` en `app/visor-mensajes`): silenciarlos o "arreglarlos" cambia comportamiento
  observable; se declaran y se dejan.
- Bajar `no-explicit-any` en tests forzando tipos: se documenta caso por caso.

## Criterios de aceptación

- `npm run lint` → **exit 0**, 0 errores y warnings **medidos y declarados** (el número final va al
  avance NSGC, con la tabla antes/después por regla y zona).
- `npx tsc --noEmit` → 0 errores · `npm test` → verde con los pisos vigentes.
- `openspec validate --all` sin fallos · `check-delta-coverage lint-higiene` sin nada que rompa el
  archive (con `skip_specs: true`).
- Ningún archivo de comportamiento tocado: solo imports/destructures muertos, directivas
  obsoletas, casts de test y el config del linter.
