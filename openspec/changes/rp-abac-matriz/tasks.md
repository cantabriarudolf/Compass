## 1. Snapshot ABAC en lib/authz.ts

- [x] 1.1 Definir `EntradaABAC` (`rol`, `recurso`, `condicion`, `descripcion`, `donde`, `detalle?`) + constante `REGLAS_ABAC` derivada del if-tree de `puedeContextual` (incluye las 3 familias inline heredadas con `donde: "check local"` y refs archivo:línea) y exportar `reglasContextuales(): EntradaABAC[]` (copia ordenada por rol+recurso).
- [x] 1.2 Añadir tests Vitest para `reglasContextuales()` en `lib/authz.test.ts` — mínimo 6 asserts: `mp:propios` solo propios motor, `pl:propia` solo propia conserjeria motor, `ct:residencia`/`ct:al_dia` unidad vinculada motor, `gd` residenteVeActas motor, `mp:morosidad`/`fi:morosidad` residenteVeMorosidad check local, `notify:residente` alertasResidentesActivas check local + copia no referencial + orden.

## 2. Vista /admin/permisos — sección ABAC read-only

- [x] 2.1 Modificar `app/admin/permisos/page.tsx`: importar `reglasContextuales` y renderizar nueva sección "Permisos contextuales (ABAC)" entre matriz RBAC y membresías — por rol, tarjetas/filas con `recurso` + badge condición + `descripcion` + badge `donde` ("motor"/"check local"); mantener badge "solo lectura" y cero botones de mutación.
- [x] 2.2 Verificar `npx tsc --noEmit` (0) y `npm run lint` (0 errores).

## 3. E2E y validación

- [x] 3.1 Ampliar `e2e/crud/permisos.spec.ts` con sección ABAC: heading "Permisos contextuales (ABAC)" visible, ≥3 reglas visibles, badges "motor"/"check local" visibles, 0 botones de mutación en sección, 0 pageerror.
- [x] 3.2 Ejecutar `npx vitest run` y `npx playwright test e2e/crud/permisos.spec.ts` verde; `openspec validate --all` passed; commit + nsgc-prepush + push + archive con git status limpio.
