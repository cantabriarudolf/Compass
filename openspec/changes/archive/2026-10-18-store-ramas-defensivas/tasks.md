# Tasks: store-ramas-defensivas

Ventana **E2** de SERIE-DEUDA-3 (rama `serie/deuda-1`). Objetivo declarado: declarar el techo de
cobertura del store **por API pública** en **99.95 %** por diseño y dejar los 2 fallbacks defensivos
documentados y fijados por test. **No** se borran y **no** se toca `vitest.config.ts`.

- [x] **Test de invariante** (`test/store-ramas-defensivas.test.ts`, 4 tests): `generarCertificadoCT`
      con un directivo de período vigente deja el snapshot `directivaRef.firmantes` **poblado** (1
      firmante con `personaId`/`nombre`/`cargo`); el filtro `esMiembroDirectivaVigente` descarta a
      quien no tiene ficha (sin entrada vacía en el `flatMap`); `migrate` v27→v28 arma el período
      `periodo-1` con la nómina **poblada** y `miembros.length === personas con datosGobernanza`; y
      sin fichas la nómina queda vacía sin ejecutar la rama.
- [x] **Comentario en el código** de los dos fallbacks (`lib/store.ts`, firmantes CT y miembros del
      período inicial): invariante aguas arriba + defensa ante su cambio. Sin notas históricas largas
      y sin tocar ninguna otra línea del store.
- [x] **Techo declarado** en el avance NSGC: la cobertura del store por API pública tiene techo en
      **99.95 %** por diseño (los 2 `: []` de `flatMap` filtrados, inalcanzables con el invariante
      actual y conservados como defensa).
- [x] **Change openspec** con `skip_specs: true` y justificación: ninguna capacidad viva declara el
      techo de cobertura del store ni la forma de un fallback defensivo, y no hay comportamiento
      observable nuevo.
- [x] **`vitest.config.ts` sin tocar**: los pisos 93/84/92/93 · `lib/**` 98/93/98/98 · `app/api/**`
      87/74/88/87 y los 7 slices quedan como estaban; `STORE_VERSION = 28` congelado.
- [x] **Gate**: `npx tsc --noEmit` 0 · `npm run lint` 0 errores y 0 warnings · `npm test` verde con
      los pisos vigentes · `openspec validate --all` sin fallos · `check-delta-coverage
      store-ramas-defensivas` sin nada que rompería el archive.

## Declarado y NO forzado (fuera de la ventana)

- Los 2 statements quedan **sin cubrir a propósito**: cubrirlos exigiría fabricar por API pública un
  estado que el filtro aguas arriba hace imposible (persona sin ficha dentro de la nómina vigente), o
  sea, romper el invariante para pintar una línea. Se declara el techo, no se fuerza la métrica.
