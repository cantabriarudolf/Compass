# Tasks: lint-higiene

Ventana D6 de SERIE-DEUDA-2. Objetivo declarado: bajar los ~6.702 warnings de ESLint **por orden de
valor y riesgo**. Medido al abrir con `npx eslint --format json`: **6.702** warnings, **97**
archivos con mensajes, **0** errores (`exit 0`).

- [x] **Medir y clasificar primero** (sin `--fix` a ciegas): agrupación por regla y por zona desde
  el JSON del linter. Resultado de apertura: `.vercel/` **6.602** · `test/` **64** · `scripts/`
  **21** · `app/` **11** · `lib/` **2** · `e2e/` **1** · `proxy.ts` **1**. Reglas dominantes:
  `@typescript-eslint/no-unused-expressions` 4.927 (todas en el bundle de `.vercel/`),
  `no-undef` 801, `@typescript-eslint/no-unused-vars` 302, `no-redeclare` 150,
  `@typescript-eslint/no-explicit-any` 47 (todas en `test/`).
- [x] **Artefactos generados que no deben lintarse**: `.vercel/**` (bundle de deploy de 7,5 M que el
  ignore compartido no cubría) al ignore del config; `.next/**` y `**/coverage/**` ya estaban.
  Es la corrección de mayor valor y menor riesgo: **−6.602** warnings de una línea de config.
- [x] **Globales de Node para los scripts** (`scripts/**/*.mjs`): 11 `no-undef` por `process` en
  scripts de Node que el config trataba como navegador/TS.
- [x] **Código de producto** (`app/`, `lib/`): 11 `no-unused-vars` (imports, destructures de store y
  parámetros muertos) y 2 directivas `eslint-disable` obsoletas (FATAL "Unused eslint-disable
  directive"). Sin cambio de comportamiento; verificado archivo por archivo con `npx eslint <file>`.
- [x] **Tests** (`test/`): 6 `no-unused-vars` (variables muertas) y los casts `as any` de los tres
  tests de `proxy` reemplazados por la firma real del default export (`(req: NextRequest) =>
  Response | Promise<Response>`), que es invocable sin cast. Los `any` de fixtures que son la
  herramienta correcta del test se dejan y se documentan en el avance.
- [x] **Declarados y no tocados** (fuera de alcance o riesgo de comportamiento): 21
  `turbo/no-undeclared-env-vars` (la solución honesta es declarar las env vars en `turbo.json`,
  fuera de los archivos de la ventana) y 2 `react-hooks` (`set-state-in-effect` y
  `exhaustive-deps`, cuyo arreglo cambia comportamiento observable).
- [x] **Change openspec** con `skip_specs: true` y justificación (ninguna spec viva declara la
  higiene del linter) + **avance NSGC** con la tabla antes/después por regla y zona.
