# F22a — Retirar el store legacy del navegador

## Contexto mínimo

Tras el retiro del módulo QA/dev (F9, commit `6dd8976`) el store `k0mp4ss_fe/apps/web/lib/store.ts`
quedó `@deprecated`, con `STORE_VERSION` congelado en 28 y **sin pantallas que lo lean**. Pero
**no está huérfano**: dos módulos de producción siguen leyéndolo y están montados en el layout raíz.

- `lib/fi-sync.ts` → consumido por `components/fi-sync-init.tsx`, montado en `app/layout.tsx`
- `lib/auditoria-sync.ts` → consumido por `components/auditoria-sync-init.tsx`, montado en `app/layout.tsx`

Quitar `persist` sin migrarlos deja `hasHydrated` en `false` para siempre (solo se activa en
`onRehydrateStorage`), y las ~97 acciones legacy rechazan con "El almacenamiento aún se está
hidratando". Hay además **~46 archivos de test** que dependen de `hasHydrated` y de
`useCompassStore.persist.getOptions()`.

Por eso F22 quedó bloqueada por **F22a**: migrar esos dos módulos primero.

## Specs que este trabajo debe respetar

- `openspec/specs/ST-capa-datos-persistente/spec.md` — requirements vigentes: la base vía API es la
  fuente de verdad; el store conserva solo su snapshot histórico; `STORE_VERSION` congelado en 28.
- `openspec/PENDIENTES-FUNCIONALIDAD.md` — fila **F22** (es la que este trabajo cierra) y **F22a**.
- `AGENTS.md` — lifecycle ODD; un change de openspec solo si cambia un contrato de capacidad
  (este sí: retira requirements de `ST`).

## Tareas (en este orden)

1. **Censo real.** `grep -rn "useCompassStore\|hasHydrated\|\.persist\." k0mp4ss_fe/apps/web/{app,components,lib,test,e2e}`
   y tabla: archivo → qué símbolo usa → qué hace con él. Nada se retira sin censo.
2. **Entender los dos sync antes de tocarlos.** Qué leen del store, con qué frecuencia escriben, qué
   hacen si falla la red (tolerancia a fallos declarada) y si emiten auditoría. Su comportamiento
   observable debe sobrevivir.
3. **Migrar `fi-sync` y `auditoria-sync` a la API** (hooks de `lib/api/use-*` o `fetch` directo con
   el mismo contrato de error). Si falta un endpoint, crearlo con el patrón del repo
   (`lib/api/crud-factory.ts`, matcher de permisos en la MATRIZ, scope por comunidad en el servidor).
4. **Retirar el store como almacén.** En `lib/store.ts`: quitar `persist` y la clave
   `compass-store`; borrar `useCompassStore`, `useStoreRehydrated`, `waitForStoreHydration`,
   `seedData` y todo export con cero consumidores. **Conservar** los helpers puros y tipos que sí
   usa el producto (`esMiembroDirectivaVigente`, `periodoDirectivaVigente`, `StoreResult`, etc.),
   verificando cada uno con grep antes de borrarlo.
5. **Limpieza única en navegadores**: snippet browser-only (SSR-safe) que haga
   `localStorage.removeItem("compass-store")` una vez, comentado en español.
6. **Tests**: reparar los ~46 archivos afectados; borrar los que se quedan sin sujeto. No debilitar
   ninguna aserción de seguridad ni de permisos para hacerlos pasar.
7. **Candados**: `scripts/audit-store.mjs` ya está en allowlist 0; actualizar el marcador
   `<!-- audit:store: archivos=N -->` de `openspec/BACKLOG-100.md` si cambia. Correr también
   `npm run audit:desvios` y `npm run check:rechecks`.
8. **Specs**: retirar de `ST-capa-datos-persistente` los requirements que dejan de existir y
   actualizar la fila F22 de `PENDIENTES-FUNCIONALIDAD.md` a **Hecho** con commit y tests.
9. **Verificación obligatoria** (workdir `k0mp4ss_fe/apps/web`): `npx tsc --noEmit`,
   `npx vitest run` completo, `npm run audit:store`, `npm run audit:desvios`,
   `npm run check:rechecks`, y Playwright sobre las lanes que toquen sync (auth + flujo + smoke).

## Riesgos y trampas conocidas

- **`app/api/cobros-fi/` importa `esCobroTest` de `lib/qa-lab-helpers.ts`**: es código de producción.
  No tocar ese helper ni esa ruta en este trabajo.
- La base descartable de Vitest (`prisma/perf-test.db`) es compartida: correr suites en paralelo da
  fallas intermitentes por contención.
- El agente padre ejecuta los borrados: los subagentes no pueden (`child safety`).
- **Ruteo del revisor**: si `review.start` falla con `no model is configured for <lente>`, revisar
  primero `~/.pi/gentle-ai/models.json` (formato `proveedor/modelo`). No es la ventana del modelo.
- Los commits van por unidad revisable; RDD está encendido y puede pedir revisión por candidato.
- Push y PR son decisión del owner. Antes de pushear: skill `nsgc-prepush` (manuales + avance).

## Criterio de terminado

- `useCompassStore` no existe o no tiene consumidores, y `persist` ya no escribe `compass-store`.
- `tsc` 0, suite completa verde, los 3 candados verdes, e2e de las lanes tocadas verde.
- La spec `ST` y la fila F22 reflejan el estado real.
- La bitácora vive al final de **este archivo**, con el espejo en Engram
  (`mem_save` con `topic_key: compass/f22a-store-legacy`).
