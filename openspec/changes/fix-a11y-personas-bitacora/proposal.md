# Change: fix-a11y-personas-bitacora

## Why

La suite e2e del 2026-09-16 dejó 2 specs a11y en rojo: `aria-valid-attr-value (critical)` + `color-contrast (serious, 49 nodos)` en `/comunidad/personas`, y `color-contrast (serious, 3 nodos)` en `/operaciones/bitacora`. Historia: eran deuda conocida en `DEUDA_CONOCIDA`; los commits `a14a05f`/`f74ea10`/`708196e` vaciaron la lista declarando "all resolved" pero los fixes no resolvieron (evidencia: nodos exactos vía axe-debug run del 2026-09-16).

Causas raíz (nodo por nodo):

- 39x badges rol `bg-emerald-600 text-white` + 4x `bg-amber-600 text-white`: blanco sobre 600 ≈ 3.3–3.5:1 (< 4.5).
- 5x badge `estadoCuenta` variante `destructive` del tema (`oklch(0.577…)` + foreground ≈ 4.3:1).
- 1x span contador `text-muted-foreground` sobre botón seleccionado con `bg-muted` (muted-sobre-muted).
- 1x trigger del filtro por rol: `Tabs` sin ningún `TabsContent` → `aria-controls` colgante (además, semántica incorrecta: filtra una tabla, no hay paneles).
- 3x títulos `text-amber-600` en bitácora (≈ 3.3:1); `text-emerald-600` gemelo se oscurece preventivamente.

## What Changes

- **`app/comunidad/personas/page.tsx`**:
  - `getRoleBadgeClass`: emerald-600→700, amber-600→700 (mismo hue, contrasta con blanco ≥ 4.5).
  - Badge `estadoCuenta`: override `bg-red-700 text-white` (rojo ≈ 6:1, conserva semántica).
  - Contadores `text-[9px]`: `text-muted-foreground` → `text-foreground` (pasa sobre blanco y sobre `bg-muted`, incluso con `opacity-70`).
  - Filtro por rol: `Tabs/TabsList/TabsTrigger` → `div` + `role="group"` + `button aria-pressed` (misma visual: pill `bg-muted`, activo con `bg-background shadow-sm`). Sin paneles no hay `aria-controls` colgante.
- **`app/operaciones/bitacora/page.tsx`**: títulos `text-amber-600`→`700`, `text-emerald-600`→`700` (se conserva `dark:`).
- **Sin cambios de esquema ni de tokens del tema**: el fix es local a las dos páginas (el token `destructive` global no se toca).

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

(ninguna — fix de accesibilidad, cero cambios de comportamiento de producto)

## Impact

- **Código:** `app/comunidad/personas/page.tsx`, `app/operaciones/bitacora/page.tsx`.
- **Tests:** spec `e2e/a11y/axe.spec.ts` debe quedar 8/8 verde sin tocar `DEUDA_CONOCIDA` (vacía) ni el spec.
- **Riesgos:** bajo — oscurecimientos dentro del mismo hue; la conversión tabs→botones preserva clases visuales y el handler existente.
