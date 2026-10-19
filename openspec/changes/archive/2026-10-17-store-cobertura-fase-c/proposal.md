# Proposal: store-cobertura-fase-c — cerrar la cobertura del store legacy (fase C)

## Contexto

Al cierre de SERIE-NOCHE-3 quedaron **168 statements sin cubrir** en `lib/store.ts` (ramas de
validación puntuales de acciones legacy + arranque/migraciones), **5** en
`lib/store/helpers.ts` (líneas 40, 98, 101-103) y **5** en slices (`ad-slice` 332/357;
`ge-slice` 162/234/318). Los pisos vigentes al abrir la ventana eran `lib/**` 96/90/98/96 y global
90/80/90/90.

## Objetivo

Subir la cobertura **real** del store legacy con tests **comportamentales** contra la API pública
(`useCompassStore`), y re-baselinear los pisos `lib/**` y global con la regla del ratchet
(medido − 1 pt, nunca baja).

## Alcance

1. Tests comportamentales nuevos en `k0mp4ss_fe/apps/web/test/`:
   - `store-cobertura-fase-c-bordes.test.ts` — bordes de `lib/store/helpers.ts` y de los slices
     (`ad-slice`, `ge-slice`).
   - `store-cobertura-fase-c-legacy.test.ts` — ramas de validación de acciones legacy:
     `saveUnidad` (FKs de RG escritura), `aplicarInfraccionIN` (rechazos, daño directo y sanción
     % GC contra el libro FI), `generarReporteRE` (bloques bitácora de seguridad, morosidad y
     consumo de insumos), `removeMaestro` (integridad referencial por colección) y
     `retenerGarantiaRA` (rechazos y cargo al fondo de amenities).
2. Re-baseline de `vitest.config.ts` (`coverage.thresholds`): global 90/80/90/90 →
   **92/83/92/92** y `lib/**` 96/90/98/96 → **97/91/98/97**, medido 93.70/84.77/93.28/93.70 y
   98.39/92.19/99.43/98.39 respectivamente.
3. Delta `MODIFIED` del requirement "Gate de cobertura por área" en `DEV-qa-lab` con la unión de
   los escenarios vivos (el último archive gana) más el de esta fase.
4. Avance NSGC con la cobertura antes/después y el remanente declarado con sus líneas.

## Fuera de alcance

- Editar `lib/store.ts`, los slices o los handlers para hacerlos testeables.
- Cambiar el shape persistido: **`STORE_VERSION = 28` congelado**.
- Excluir archivos de `coverage.include` o usar `thresholds.autoUpdate` (ocultan deuda).
- El piso `app/api/**` (lo re-baselinean P3/P4).

## Criterios de aceptación

- `npx tsc --noEmit` → 0 errores (corrido **después** de agregar los tests); `npm run lint` → 0
  errores; `npm test` → verde con los pisos nuevos aplicados; `openspec validate --all` sin
  fallos; `check-delta-coverage store-cobertura-fase-c` → `0 que romperían el archive`.
- Ningún piso baja respecto de su valor anterior.
- El remanente sin cubrir queda documentado con su línea y su causa en el avance NSGC.

## Estado real de la ventana

La ventana se ejecutó **inline** por el orquestador tras 3 intentos fallidos del ejecutor delegado
(cortes de infraestructura, sin archivos producidos). Se cubrieron **57 de los 168** statements de
`lib/store.ts` más los 10 de `helpers.ts`/slices, y el remanente se declara como deuda para P7. Ver
el avance NSGC de la ventana.
