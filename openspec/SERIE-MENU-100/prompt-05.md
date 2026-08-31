> **Este archivo ES tu prompt.** Ventana 5 de la serie **menu-100**. Lee
> `openspec/SERIE-MENU-100/00-plan.md` (ARRANQUE + base de hechos) y verifica en la Bitácora
> que P1-P4 estén HECHAS (git); si no, detente y repórtalo.

## Alcance P5 — change `pe-paqueteria-vista`: `/operaciones/paqueteria` (Encomiendas)

**Objetivo:** vista dedicada "Encomiendas" (hoy placeholder). El contenido YA existe como
tab "Encomiendas" en `/operaciones/bitacora` (colección `encomiendasPE`, acciones
`saveEncomiendaPE` / `registrarRetiroEncomiendaPE` / `removeEncomiendaPE`, eventos
`PE_ENCOMIENDA_RECIBIDA/RETIRADA`). Misma técnica de extracción que P4.

1. **Refactor:** extrae el tab "Encomiendas" de `app/operaciones/bitacora/page.tsx` a
   `components/pe/encomiendas-panel.tsx` (bitácora lo reutiliza; cero cambio de comportamiento).
2. **openspec-propose** `pe-paqueteria-vista`: capability `PE-personal-servicios` (delta
   ADDED requirement "Vista Encomiendas": ruta dedicada para recepción y retiro de
   encomiendas con las acciones del store; retiro requiere quién retira; registro auditable).
3. **Implementar:** `app/operaciones/paqueteria/page.tsx` con el panel extraído. Quitar
   `/operaciones/paqueteria` de `RUTAS_PENDIENTES` — al terminar, `RUTAS_PENDIENTES` debe
   quedar vacío (o con las rutas que el owner decida mantener; anota el estado final).
4. **e2e** `e2e/crud/paqueteria.spec.ts`: goto, afirmar heading + panel encomiendas
   (labels reales), flujo real del store si es barato (recibir encomienda de prueba → fila;
   NO confirmes retiro de datos del seed — usa una TEST-* nueva), 0 pageerror. La suite de
   bitácora DEBE seguir verde.

## Verificación

`npx tsc --noEmit` (0) · `npm run lint` (0 errores) · `npx vitest run` (425/425 REAL) ·
`npx playwright test e2e/crud/paqueteria.spec.ts e2e/crud/bitacora.spec.ts` verde ·
`openspec validate --all` · commit · nsgc-prepush · push · archive · Bitácora P5 HECHA.
