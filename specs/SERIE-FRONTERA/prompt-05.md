> **Este archivo ES tu prompt.** Ventana 5 de la serie **frontera**. Lee
> `openspec/SERIE-FRONTERA/00-plan.md` y verifica en la Bitácora que P1-P4 estén HECHAS
> (git); si no, detente y repórtalo.

## Alcance P5 — change `rp-abac-matriz`: matriz contextual en `/admin/permisos`

**Objetivo:** hacer visible el ABAC de P4 en la vista `/admin/permisos` (solo lectura),
cerrando la visibilidad del modelo de permisos completo.

1. **openspec-propose** `rp-abac-matriz`: capability `RP-roles-permisos` (delta ADDED
   requirement "Matriz Contextual visible": `/admin/permisos` muestra las reglas ABAC por
   rol con su condición (propios/propia/unidad vinculada/controles de privacidad) de forma
   legible y read-only; MUST reflejar el snapshot de `lib/authz.ts` — nunca datos duros).
2. **Export del snapshot**: `lib/authz.ts` — helper puro `reglasContextuales(): EntradaABAC[]`
   donde `EntradaABAC = { rol, recurso, condicion: string, descripcion: string }` derivado
   del código de `puedeContextual` (constante de módulo, como MATRIZ; nunca se desincroniza).
   Con test Vitest (mínimo 6 asserts: reglas presentes por rol, condiciones legibles).
3. **Implementar** en `app/admin/permisos/page.tsx`: nueva sección "Permisos contextuales
   (ABAC)" entre la matriz y las membresías — por rol, tarjetas/filas con `recurso` +
   `condicion` (badge de condición: "solo propios", "unidad vinculada", "según privacidad")
   + `descripcion` legible. Mantener badge "solo lectura" y cero botones de mutación.
4. **e2e** — ampliar `e2e/crud/permisos.spec.ts` con una sección nueva: afirmar la sección
   ABAC (heading, al menos 3 reglas visibles, sin botones de mutación). 0 pageerror.

## Verificación

`npx tsc --noEmit` (0) · `npm run lint` (0 errores) · `npx vitest run` (total REAL) ·
`npx playwright test e2e/crud/permisos.spec.ts` verde · `openspec validate --all` · commit ·
nsgc-prepush · push · archive (git status limpio) · Bitácora P5 HECHA con hash.
