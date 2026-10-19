# Proposal: a11y-p3-reservas-recursos

## Contexto

Los lanes e2e P3 (`e2e/a11y/axe.spec.ts`) quedaron **27/30** en la corrida de
`odd/NOCHE-2026-10-07.md` (ítem 3). De los 3 rojos, **2 son violaciones de
accesibilidad reales** con causa en código de aplicación (el tercero es el
`poblamiento` test1, que depende del gap estructural QA-Lab store→BD, ítem 4).

El gate de axe corre con `DEUDA_CONOCIDA` **vacía** a propósito: cualquier
violación `critical`/`serious` falla. La salida de la corrida fue:

```
[axe] /operaciones/reservas: graves → color-contrast (serious, 6 nodos)
[axe-html] /operaciones/reservas | color-contrast | [
  '<span class="block text-xs text-muted-foreground">00:00–03:00</span>',
  '<span class="block text-xs text-muted-foreground">garantía $0</span>',
  '<span data-slot="badge" data-variant="default" ...>'
]
[axe] /inventario/recursos: graves → button-name (critical, 1 nodo), color-contrast (serious, 1 nodo)
[axe-html] /inventario/recursos | button-name | [
  '<button type="button" role="combobox" aria-controls="radix-..." aria-expanded="false" ...>'
]
[axe-html] /inventario/recursos | color-contrast | [
  '<span data-slot="badge" data-variant="default" ...>'
]
```

## Causa raíz (recon)

1. **`/operaciones/reservas` — color-contrast (serious, 6 nodos)**
   `app/operaciones/reservas/page.tsx:375` aplica `opacity-70` al `<tr>` completo
   cuando la reserva está vencida y confirmada. La opacidad reduce el contraste
   efectivo de **todos** los hijos: los `<span class="text-xs text-muted-foreground">`
   (hora, garantía) y el badge de estado `bg-sky-600 text-white`. Es un falso
   "atenuado" que rompe el umbral 4.5:1 (WCAG AA, texto pequeño).

2. **`/inventario/recursos` — button-name (critical, 1 nodo)**
   `app/inventario/recursos/page.tsx:374` renderiza un `<SelectTrigger>` **sin**
   `aria-label` y con `<SelectValue />` **sin** `placeholder` (los otros triggers
   de la página sí tienen nombre: `:323`/`:332` con `aria-label`, `:486`/`:595` con
   `placeholder`). El combobox queda sin nombre accesible.

3. **`/inventario/recursos` — color-contrast (serious, 1 nodo)**
   `app/inventario/recursos/page.tsx:64-69` (`ESTADO_ACTIVO_BADGE`): el estado
   `baja` usa `bg-muted text-muted-foreground` (par de bajo contraste) y
   `reparacion` usa `bg-amber-500 text-white` (por debajo de 4.5:1 con texto
   `text-[10px]`). El badge con clase custom conserva `text-primary-foreground`
   del variant default, lo que agrava el par.

## Objetivo

Dejar los 8 módulos del lane a11y **sin violaciones `critical`/`serious`**,
**sin** agregar entradas a `DEUDA_CONOCIDA` (el gate debe seguir siendo honesto),
con el **cambio mínimo** de estilo/atributo y **sin** cambiar comportamiento,
contratos de datos ni textos visibles de negocio.

## Alcance

Dentro:
- `k0mp4ss_fe/apps/web/app/operaciones/reservas/page.tsx`
- `k0mp4ss_fe/apps/web/app/inventario/recursos/page.tsx`

Fuera:
- `e2e/a11y/axe.spec.ts` (no se toca: no se agrega deuda conocida).
- Cualquier refactor de tokens de color o del componente `Badge` compartido.
- El test1 de `poblamiento.spec.ts` (depende de QA-Lab store→BD; va en su change).

## Reglas

- Terminología RG §4: "comunidad".
- Sin cambios de comportamiento: solo clases de estilo y `aria-label`.
- No introducir placeholders ni datos falsos.

## Aceptación

- `npx playwright test e2e/a11y/axe.spec.ts` → **8/8**.
- `DEUDA_CONOCIDA` sigue vacía.
- `tsc` 0 errores · `eslint` 0 errores.
- Suite unitaria sin regresiones.
