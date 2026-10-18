# Proposal: store-cobertura-fase-e — remanente del store y ratchet final

## Contexto

La fase D (`store-cobertura-fase-d`, ventana D4 de SERIE-DEUDA-2) pagó las 6 acciones con más
statements sin cubrir de `lib/store.ts` y dejó el archivo en **56 statements sin cubrir**
(98.68 % de statements), con `lib/**` en **98.64/91.77/99.44/98.64** y el global en
**94/85.03/93.77/94**. Los pisos vigentes siguen en global **92/83/92/92** y `lib/**`
**97/91/98/97`, o sea **por debajo de lo medido**: el ratchet queda pendiente.

El remanente declarado por D4: `removeMaestro` 14 · `migrate` (ramas de arranque 4940-4941 y
5127) · `apelarInfraccionIN` 4 · `saveReservaRA` 4 · `removeTipoInfraccionIN` 4 · `saveMaestro` 4 ·
`saveVinculo` 3 · `cancelarReservaRA` 3 · `removeAdelantoPL` 3 · `removeCertificadoCT` 3 ·
`savePersona` 2 · ramas sueltas de `distribuirReporteRE`, `removeVinculo`, `retenerGarantiaRA`,
`emitirGastoComun`, `ingresarBitacoraVisitaPE`, `registrarRetiroEncomiendaPE`,
`confirmarIngresoContratistaPE`, `generarCertificadoCT` y `generarReporteRE`, más la línea
declarada inalcanzable `lib/store.ts:4321`.

## Objetivo

Cerrar la deuda de cobertura del store legacy con tests comportamentales contra la API pública y
aplicar el **ratchet final** de `lib/**` y global (medido − 1 pt, nunca bajar), dejando el
remanente inalcanzable declarado con su línea y su causa.

## Alcance

1. Tests comportamentales nuevos en `k0mp4ss_fe/apps/web/test/store-cobertura-fase-e*.test.ts`
   para el remanente medido (guardas de hidratación, ramas de integridad referencial, ramas sin
   match de los `map` de estado, emisión de Gasto Común sin aporte al fondo de reserva,
   `retenerGarantiaRA` sin fondo de amenities y las ramas de arranque de `migrate`).
2. Re-baseline de los pisos `lib/**` y global en `vitest.config.ts` (**solo `thresholds`**) con la
   medición de la suite verde, medido − 1 pt y fecha/contexto en el comentario.
3. Delta `MODIFIED` del requirement "Gate de cobertura por área" en `DEV-qa-lab` con la **unión**
   de los escenarios vivos más el de esta fase.
4. Avance NSGC con la cobertura antes/después, las acciones cubiertas, los pisos nuevos y el
   remanente final declarado con línea y causa.

## Fuera de alcance

- Editar `lib/store.ts`, los slices o los handlers para hacerlos testeables.
- Cambiar el shape persistido: **`STORE_VERSION = 28` congelado**.
- Forzar ramas inalcanzables por la API pública con mocks de módulo o tests de internals: se
  declaran con su línea y causa en el avance NSGC.
- Re-baselinear el piso de `app/api/**` (su medición no cambia en esta ventana).

## Criterios de aceptación

- `npx tsc --noEmit` → 0 errores (corrido **después** de agregar los tests); `npm run lint` → 0
  errores; `npm test` → verde **con los pisos nuevos aplicados**; `openspec validate --all` sin
  fallos; `check-delta-coverage store-cobertura-fase-e` → `0 que romperían el archive`.
- Los pisos de `lib/**` y global quedan en medido − 1 pt y por encima de su valor anterior.
- El remanente final queda documentado con su línea y su causa en el avance NSGC.
