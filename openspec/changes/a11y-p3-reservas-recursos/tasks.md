# Tasks: a11y-p3-reservas-recursos

- [x] Fix `/operaciones/reservas`: quitar `opacity-70` del `<tr>` de reserva vencida
  (`app/operaciones/reservas/page.tsx:375`) y reemplazar el atenuado por una señal
  que NO baje el contraste. Decisión: se quitó `opacity-70` y se agregó
  `<Badge variant="outline">vencida</Badge>` junto a "Confirmada"; el badge de
  estado subió a `bg-sky-700`.
- [x] Fix `/inventario/recursos` `button-name`: `aria-label="Cambiar estado del recurso"`
  en el `<SelectTrigger>` sin nombre (`app/inventario/recursos/page.tsx:374`).
- [x] Fix `/inventario/recursos` `color-contrast`: `ESTADO_ACTIVO_BADGE` a 700
  (`emerald-700`, `sky-700`, `amber-700`) y `baja: bg-muted text-foreground`
  (patrón de la casa, commit 4e4d44a).
- [x] Verificación observada: `npx playwright test e2e/a11y/axe.spec.ts` →
  **14 passed (6 setup + 8 rutas)**, 0 failed. `DEUDA_CONOCIDA` sigue vacía.
- [x] Gate: unit **878/878**, `tsc` 0, `eslint` 0.
- [ ] NSGC/avance de los módulos RA/IR (pendiente de la tanda NSGC del cierre).
- [ ] Commit y archive (archive tras CI verde; el push lo decide el owner).
