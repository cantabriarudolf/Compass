# Tasks: fix-a11y-personas-bitacora

## 1. Contraste personas

- [x] 1.1 `getRoleBadgeClass`: `bg-emerald-600 hover:bg-emerald-700` → `bg-emerald-700 hover:bg-emerald-800`.
- [x] 1.2 Ídem `bg-amber-600 hover:bg-amber-700` → `bg-amber-700 hover:bg-amber-800`.
- [x] 1.3 Badge `estadoCuenta`: className suma `bg-red-700 text-white` (override del token `destructive` vía `cn`/`twMerge`).
- [x] 1.4 Contadores `text-[9px]` (×2): `text-muted-foreground` → `text-foreground`.

## 2. Tabs → botones (aria)

- [x] 2.1 Filtro por rol: `Tabs`→`div`, `TabsList`→`div role="group"`, `TabsTrigger`→`button aria-pressed` (visual 1:1, mismo handler).
- [x] 2.2 Cierre `</Tabs>` → `</div>`; quitar import `Tabs, TabsList, TabsTrigger` si queda sin uso.

## 3. Contraste bitácora

- [x] 3.1 Títulos: `text-amber-600` → `text-amber-700`, `text-emerald-600` → `text-emerald-700` (conservar `dark:`).

## 4. Validación

- [x] 4.1 `npx tsc --noEmit` → 0 errores; `eslint` en los dos archivos → 0 warnings.
- [x] 4.2 `npx playwright test e2e/a11y/axe.spec.ts` → 8/8 verde, `DEUDA_CONOCIDA` intacta (vacía).
- [x] 4.3 Revertir `next-env.d.ts` si el dev server lo regenera.
