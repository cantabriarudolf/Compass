---
description: "Valida que un módulo llevado a OpenSpec respete la capa de datos ST (store, seed, acciones CRUD)"
---

Valida que el módulo [MÓDULO] respete la convención de la capa de datos persistente (ST) al ir a OpenSpec. NO implementes el módulo; valida y corrige solo lo que esté claramente dentro de la validación.

Contexto: existe una capa de datos persistente (ST) — store Zustand+persist en `apps/web/lib/store.ts` (key `compass-store`, versión 3, `hasHydrated`). Regla de la casa declarada en RG y `openspec/specs/project.md`: TODO módulo lee/escribe datos vía `useCompassStore` y sus acciones CRUD; las páginas NUNCA usan `useState` sembrado de mocks, imports estáticos de `data/` para entidades, ni mutan el store directo. El seed vive en `apps/web/data/` y solo lo importa `lib/store.ts`.

Módulo a validar: [MÓDULO] (doc fuente: `Data/NSGC/docs/especificaciones/[MÓDULO].md`, change: `openspec/changes/[AA]-[modulo]/`).

## 1) Artefactos OpenSpec
- Existe `proposal.md`, `design.md` (con Goals/Non-Goals reales), `spec.md` y `tasks.md`.
- El spec cubre las reglas de negocio del `.md` de NSGC (fuente de verdad de dominio) sin omitir ni inventar reglas.
- `design.md` declara explícitamente: entidades en el store, acciones CRUD nuevas (`saveX`/`removeX`), validaciones al eliminar (integridad referencial) y reglas de negocio validadas en las acciones (no solo en la UI).

## 2) Contrato de datos en el spec
- Las entidades del módulo quedan en `CompassData`/`MaestroCollections` del store (o se declara su incorporación al estado ST).
- Las acciones CRUD del módulo se especifican como funciones del store (patrón repository), NO como lógica de página.
- Toda referencia entre módulos usa ids existentes (ej: `unidadId` → `unidades`, `personaId` → `personas`) y el spec nombra de dónde sale cada id.
- Se especifica el seed: qué mock de `data/` siembra el estado inicial (o se declara que no hay seed).

## 3) Implementación contra antipatrones históricos
- Ninguna página/componente importa entidades desde `@/data/...` (solo `lib/store.ts` importa mocks; formularios reutilizados leen del store).
- Ningún `useState` sembrado desde mocks para datos de dominio (estado local solo para UI efímera: inputs, diálogos, filtros).
- No hay colecciones estáticas (`CATEGORIAS_*`, `ESTADOS_*`, listas hardcodeadas) que debieran vivir en el store; si el módulo necesita una nueva colección, va a `MaestroCollections` con su `migrate` si aplica.
- Las páginas llaman `useStoreRehydrated` y respetan `hasHydrated` (no mutar antes de hidratar). Además renderizan un skeleton mientras `hasHydrated` es `false` y montan el contenido real solo tras la hidratación (regla "Hidratación segura en renderizado SSR" del spec ST), evitando mismatch SSR/cliente.
- Eliminaciones validadas por dependencias (la acción devuelve `StoreResult` con error; la UI lo muestra).
- Los ids nuevos siguen el patrón existente del módulo (ej: `v-`, `u-`, `t-`, `est-`) y no colisionan con el seed.

## 4) Integración entre módulos
- Si el módulo lee de otros (ej: FI usa `tiposUnidad`, `unidades`, `personas`), el spec lo declara y la implementación lee del store (no de imports).
- Si el módulo modifica entidades de otro módulo, usa las acciones de ese módulo, no mutación directa.

## 5) Verificación
- `npx tsc --noEmit` y `npx turbo lint` (0 errores).

## Entregable
Informe en chileno con (a) hallazgos por severidad (crítica/media/baja) con archivo+línea y regla violada, (b) correcciones aplicadas con justificación, (c) checklist explícito de los 5 puntos marcando ✅/❌. Si todo está conforme, decláralo explícitamente. No commitear.
