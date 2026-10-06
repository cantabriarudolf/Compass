# Tasks: GD Períodos de Directiva

- [x] 1. Schemas: período + ficha extendida + actas + CT (+ tipos).
- [x] 2. Store: estado + v28 + migración + helpers + acción + auto-assign + attaches + quórum.
- [x] 3. UI: sección Períodos en `/comunidad/directiva` (vigente/históricos/diálogo).
- [x] 4. Tests: `períodos` (6) + `ficha` (5) dentro del describe exterior.
- [x] 5. Full suite + tsc + eslint (gate antes de NSGC).
  (2026-10-06: vitest **860/860** en 90 archivos; los tests del change **53/53**; `tsc --noEmit` 0
  errores; `eslint` 0 errores y 6703 warnings pre-existentes)
- [x] 6. NSGC pre-push (manuales + avance + mocks si toca) + commit + push (todo junto).
  (manuales GD/CT ya documentados desde `496f38d`; se agregó la línea de período vigente al
  manual AD; avance `2026-10-06 19-15`; mocks: no aplica — períodos son entidades de BD/store,
  no archivos de `apps/web/data/`)
