> **Este archivo ES tu prompt.** Ventana 4 de la serie **frontera**. Lee
> `openspec/SERIE-FRONTERA/00-plan.md` y verifica en la Bitácora que P1-P3 estén HECHAS
> (git); si no, detente y repórtalo.

## Alcance P4 — change `rp-abac-contextual`: `puedeContextual()` sin cambio de comportamiento

**Objetivo:** formalizar el ABAC que hoy está hardcodeado inline, con un modelo puro en
`lib/authz.ts`, migrando los checks existentes 1:1 (misma decisión que hoy — paridad
testada). ESTRICTAMENTE behavior-preserving: si un test existente falla, la migración está
mal, no el test.

1. **Inventario de los checks inline actuales** (lee el código, no el plan):
   - `mp:propios` — edición de datos propios por personaId (buscar en app/ y lib/ dónde se
     compara personaId de sesión vs recurso).
   - `pl:propia` — trabajador consulta su liquidación (comparación por trabajadorPersonaId).
   - `ct:propio` / `ct:residencia` / `ct:al_dia` — certificados de su unidad (comparación por
     unidadId del vínculo del residente).
   - `residenteVeMorosidad` / `residenteVeActas` / `alertasResidentesActivas` — controles de
     privacidad (`controlesPropiedad` en el store) que filtran visibilidad FI/GD.
   Documenta cada uno (archivo:línea, lógica actual) en el design.md del change.
2. **openspec-propose** `rp-abac-contextual`: capability `RP-roles-permisos` (delta ADDED
   requirement "Permisos Contextuales (ABAC)": el sistema evalúa permisos con contexto —
   `puedeContextual(rol, accion, recurso, contexto)` donde contexto incluye identidad propia
   (`personaId`), unidad (`unidadId`) y controles de privacidad; MUST preservar menor
   privilegio y las decisiones actuales 1:1; la migración de checks no cambia decisiones).
3. **Implementar** en `lib/authz.ts`:
   ```ts
   export interface ContextoABAC {
     personaId?: string;          // identidad del usuario autenticado (sesión)
     unidadId?: string;           // unidad reclamada
     unidadIdsVinculadas?: string[]; // unidades con vínculo vigente del usuario
     privacidad?: { residenteVeMorosidad?: boolean; residenteVeActas?: boolean; alertasResidentesActivas?: boolean }
   }
   export function puedeContextual(rol: string, accion: string, recurso: string, ctx: ContextoABAC): boolean
   ```
   Regla: `puedeContextual` = `puede(rol, accion, recurso)` base + refinamiento ABAC para los
   recursos granulares (`:propios`, `:propia`, `:residencia`, `:al_dia`, privacidad). Los
   checks sin dimensión contextual delegan directo a `puede()`.
4. **Migración (solo si es seguro)**: reemplaza los checks inline localizados en el paso 1
   por `puedeContextual(...)` con el contexto correspondiente. Si algún check es de UI
   client-side (store, sin sesión), envuélvelo igual pasando el personaId/unidad desde el
   store — mismo resultado. Si algún check resulta no migrable sin cambio de comportamiento,
   NO lo migres: déjalo inline y anótalo en la Bitácora.
5. **Tests**: `lib/authz.test.ts` (o nuevo `puede-contextual.test.ts`) — paridad 1:1: para
   cada check migrado, los mismos casos que la lógica antigua (propietario sí, de otra
   unidad no, conserje sin ficha previsional, residente con morosidad oculta no ve FI, etc.).
   Mínimo 12 asserts nuevos.

## Verificación

`npx tsc --noEmit` (0) · `npm run lint` (0 errores) · `npx vitest run` (425 + nuevos, REAL) ·
`openspec validate --all` · `npx playwright test e2e/crud/permisos.spec.ts` (la vista ABAC
viene en P5, pero la vista actual no debe romperse) · commit · nsgc-prepush · push ·
archive (git status limpio) · Bitácora P4 HECHA con hash.
