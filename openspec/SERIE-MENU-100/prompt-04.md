> **Este archivo ES tu prompt.** Ventana 4 de la serie **menu-100**. Lee
> `openspec/SERIE-MENU-100/00-plan.md` (ARRANQUE + base de hechos) y verifica en la Bitácora
> que P1-P3 estén HECHAS (git); si no, detente y repórtalo.

## Alcance P4 — change `pe-accesos-vista`: `/operaciones/accesos` (Accesos y Visitas)

**Objetivo:** vista dedicada "Accesos y Visitas" (hoy placeholder). El contenido YA existe
como tabs "Visitas" y "Contratistas" dentro de `/operaciones/bitacora` — esta ventana lo
extrae a una vista dedicada sin cambiar comportamiento.

1. **Refactor previo (clave):** extrae el JSX/lógica de los tabs "Visitas" y "Contratistas"
   de `app/operaciones/bitacora/page.tsx` a componentes reutilizables (p. ej.
   `components/pe/visitas-panel.tsx`, `components/pe/contratistas-panel.tsx`) y deja el tab
   de bitácora renderizando esos componentes (cero cambio de comportamiento — la suite e2e
   existente de bitácora debe seguir verde).
2. **openspec-propose** `pe-accesos-vista`: capability `PE-personal-servicios` (delta ADDED
   requirement "Vista Accesos y Visitas": ruta dedicada con el panel de visitas y
   contratistas; mismo modelo de datos y acciones del store).
3. **Implementar:** `app/operaciones/accesos/page.tsx` renderizando los componentes
   extraídos (propio layout, sin tabs de turno). Quitar `/operaciones/accesos` de
   `RUTAS_PENDIENTES`.
4. **e2e** `e2e/crud/accesos.spec.ts`: goto, afirmar heading + presencia de los paneles de
   visitas/contratistas (labels reales del código) + 0 pageerror. La suite de bitácora
   (`e2e/crud/bitacora.spec.ts`) DEBE seguir verde (ejecútala).

## Verificación

`npx tsc --noEmit` (0) · `npm run lint` (0 errores) · `npx vitest run` (425/425 REAL) ·
`npx playwright test e2e/crud/accesos.spec.ts e2e/crud/bitacora.spec.ts` verde ·
`openspec validate --all` · commit · nsgc-prepush · push · archive · Bitácora P4 HECHA.
