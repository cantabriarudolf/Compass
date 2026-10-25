# Proposal: f6-unidad-destino-buscable

## Contexto

`openspec/PENDIENTES-FUNCIONALIDAD.md` §F6 dejó la **capacidad** entregada (búsqueda `?q=` opt-in
en `lib/api/crud-factory.ts`, `?q=` en `/api/unidades` sobre `numero`/`etiqueta`/`rolSii`, y
`components/selector-buscable.tsx` con 13 tests) pero **sin cablear a ninguna pantalla**. El
intento en «Unidad destino» de visitas se revirtió en el PR #16 con un diagnóstico que, al
verificarlo sobre la base descartable de la lane (`prisma/perf-e2e.db`), no se sostiene:

| Lo que decía el handoff | Lo que muestra el repo |
|---|---|
| «el padrón de unidades del scope de la sesión está vacío» | la base de la lane tiene **166 unidades en `comunidad-a`** y el scope del admin e2e resuelve a **`comunidad-a`** (`withComunidadScope`: `createdAt desc, id desc, take 1`) |
| «hace falta un fixture de unidades en la lane» | **no hay nada que sembrar**: `visitas-panel.tsx:72` no consulta la API, lee `useCompassStore((s) => s.unidades)` |

O sea: lo vacío era el **store del cliente**, no el padrón del servidor. Y el spec que debía
verificarlo no podía: `e2e/crud/bitacora.spec.ts` acepta «Sin unidad» y no afirma ninguna opción
real.

Al medir el filtro de destinos apareció un defecto vivo más:

- `unidadesDestino = unidades.filter((u) => !u.id.startsWith("u-E-"))` nació cuando `u-E-` eran
  solo plazas de estacionamiento. Hoy el seed —y la semilla del store— generan los deptos de la
  **torre E** con ese mismo prefijo: `u-E-101` es «Depto 101» (rol SII `123-E11`) y `u-E-001` es
  «Estacionamiento E-001». El filtro por prefijo **excluye 16 departamentos** del selector de
  destino. La pertenencia la dice `etiqueta`, no el id.

## Objetivo

Que el conserje encuentre **cualquier** unidad de la comunidad (166 en el seed, 100 en el
`.env` de producción) al registrar una visita, buscando en el servidor, sin perder de vista qué
eligió y sin que una plaza de estacionamiento pueda quedar como destino.

## Alcance

**Dentro:**
1. `lib/api/use-unidades.ts` — `buscarUnidades(q)` contra `GET /api/unidades?q=` (mismo patrón que
   `buscarPersonaPorRun`), más los helpers puros `esUnidadDestino()` y `etiquetaUnidad()`.
   La etiqueta visible incluye el **rol SII** cuando existe: hay cinco unidades llamadas
   «Depto 101» (torres A–E) y sin el rol el conserje no puede distinguirlas.
2. `components/pe/visitas-panel.tsx` — «Unidad destino» pasa de `Select` (100 opciones montadas,
   recorte declarado) a `SelectorBuscable` con la búsqueda en el servidor. El panel recuerda la
   etiqueta de la unidad elegida para mostrarla en el control y en la tabla del día.
3. Corrección del filtro de destinos: `etiqueta === "Estacionamiento"` en vez del prefijo `u-E-`.
4. `e2e/crud/bitacora.spec.ts` — deja de tolerar «Sin unidad»: afirma opciones reales, elige una
   buscando, y verifica que la fila de la bitácora muestre la unidad elegida.
5. Delta `PE` (requirement nuevo, `ADDED`): búsqueda de la unidad destino sobre el padrón completo.

**Fuera:**
- «Residente destino» sigue leyendo el store con su `AvisoTruncamiento`: el padrón de personas
  tiene el mismo problema y merece su propio cableado (fila F6 del ledger, que queda abierta).
- Persistencia de la bitácora: las visitas siguen en el store (`bitacoraVisitasPE`), no en la BD.
  Etiquetas de unidades fuera de la sesión (recarga) caen al id hasta que exista la migración.
- Filtro de estacionamientos en el servidor: se descarta en cliente sobre la página pedida
  (`pageSize=25`); un término que solo devuelva plazas muestra «sin resultados» honesto.

## Riesgo

Bajo y contenido: una pantalla, un módulo cliente nuevo y un spec e2e. Sin cambios de schema, sin
`STORE_VERSION`, sin tocar la API (`?q=` ya existe y ya está probado). Los tests de componente
existentes del panel se actualizan porque el control cambia de `Select` a combobox buscable.
