# Proposal: store-ramas-defensivas — el techo de 99.95 % del store, documentado (ventana E2 de SERIE-DEUDA-3)

## Contexto

`k0mp4ss_fe/apps/web/lib/store.ts` quedó en **99.95 % de statements** al cerrar SERIE-DEUDA-2. Los
**2** statements sin cubrir son los `... : []` de dos `flatMap` filtrados:

| Línea (pre-E2) | Zona | Filtro aguas arriba |
| --- | --- | --- |
| `lib/store.ts:4321` | fallback de la lista de **firmantes** del snapshot de directiva del certificado CT | `esMiembroDirectivaVigente(p, vigenteCT.id)` |
| `lib/store.ts:5127` | fallback equivalente al armar los **miembros** del período de directiva inicial (migración v27→v28) | `personasPrev.filter((p) => p.datosGobernanza)` |

Ambos filtros **garantizan hoy** que el `flatMap` solo itera sobre personas con ficha de
gobernanza, así que la rama `: []` es inalcanzable por la API pública.

## Objetivo

Dejar el 99.95 % **declarado como techo por diseño** (no como deuda) y convertir las dos ramas en
**defensa documentada**, sin borrarlas y sin cambiar comportamiento.

## Decisión (tomada por el orquestador y el owner — no se re-litiga)

**No se borran.** Son defensa a propósito: borrarlas ataría el código al invariante actual
(`esMiembroDirectivaVigente` exige ficha; el filtro del período inicial exige `datosGobernanza`) y
perdería robustez ante un cambio futuro de ese filtro. No se gana nada borrando 2 statements y sí se
pierde defensa.

## Alcance

1. **Test de fijación del invariante** (`test/store-ramas-defensivas.test.ts`): recorre el camino real
   por la API pública —`generarCertificadoCT` para un directivo de período vigente y la entrada de
   migración `v27→v28`— y afirma que las listas salen **pobladas** (1 firmante, 1 miembro, y
   `miembros.length === fichas con datosGobernanza`), más el caso sin ficha, que el filtro descarta
   antes del `flatMap`.
2. **Comentario breve en el código** en cada uno de los dos fallbacks: invariante aguas arriba +
   defensa ante su cambio.
3. **Declaración del techo** en el avance NSGC y en el cierre de la serie: cobertura del store **por
   API pública** con techo en **99.95 %** por diseño, con las 2 líneas y su causa.
4. **Change openspec** con `skip_specs: true` justificado.

## Fuera de alcance

- **Borrar** los fallbacks, o refactorizar el store para "hacerlos alcanzables" con datos inválidos.
- **`vitest.config.ts`**: el ratchet no se mueve (la cobertura no cambió). Los pisos global
  **93/84/92/93**, `lib/**` **98/93/98/98** y `app/api/**` **87/74/88/87** quedan igual.
- Cualquier otra parte de `lib/store.ts` fuera de los 2 comentarios. `STORE_VERSION = 28` congelado.

## Criterios de aceptación

- `npx tsc --noEmit` → 0 · `npm run lint` → 0 errores y 0 warnings · `npm test` verde con los pisos
  vigentes (≥ 1300 tests).
- `lib/store.ts` sigue en **99.95 %** de statements: el test nuevo fija el invariante, no la rama.
- `openspec validate --all` sin fallos · `check-delta-coverage store-ramas-defensivas` sin nada que
  rompería el archive (con `skip_specs: true`).
