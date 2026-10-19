# Design: store-cleanup — censo por miembro y poda del store legacy

## Contexto

`lib/store.ts` tenía 8.889 líneas, `@deprecated` pero vivo: la app ya muta por API REST +
hooks `lib/api/use-*.ts`, y el store legacy quedó como fallback con consumidores parciales.
El BACKLOG (`openspec/BACKLOG-100.md:216`) prometía eliminar "las acciones que ya nadie usa".
La decisión depende de una medición, no de una intuición: hay que contar **consumidores por
miembro** distinguiendo el uso real de la app, el QA-Lab, los tests, la e2e y el uso
**intra-store** (una acción que otra acción del store llama).

## Método del censo (ad-hoc, no versionado)

Script con la API del compilador de TypeScript:

1. Parsea `lib/store.ts` y toma los miembros de la interface `CompassStore` **y** de
   `CompassData` (la interface hereda de ahí: 48 miembros). Total: **180**.
2. Marca los **sitios de declaración** (nombre de cada `PropertySignature` de la interface y
   de cada propiedad del objeto *state factory* de `useCompassStore`) para no contarlos como uso.
3. Recorre los archivos de cada zona con el AST y cuenta nodos `Identifier` con el nombre del
   miembro, en cinco zonas separadas:
   - **intra-store**: `lib/store.ts`, sin los sitios de declaración.
   - **app (catch-all)**: todo `apps/web` que no sea el store, `lib/schemas.ts`, tests, e2e,
     `prisma/**` ni el QA-Lab. Incluye `app/**`, `lib/**`, `components/**`, `hooks/**`,
     `scripts/**`, `types/**`, `data/**` y los `.ts` de la raíz.
   - **qa-lab**: `app/admin/qa-lab/**`.
   - **tests**: `test/**` + cualquier `*.test.ts(x)`/`*.spec.ts(x)` de `app/**` o `lib/**`.
   - **e2e**: `e2e/**`.
4. Excluye `prisma/**`, `*.md`, `node_modules`, `.next`, `.vercel` y artefactos de build.

Notas de precisión:

- El corte de zonas importa: `app/admin/qa-lab/**` es una página de la app (2.667 líneas) que
  ejercita el store de punta a punta; contarla como "app" infla la protección y escondía la poda.
- Los tests que viven dentro de `lib/` (`lib/*.test.ts`) se cuentan como tests, no como app.
- El censo cuenta **identificadores**, no texto: los JSDoc que mencionan una acción
  (p. ej. `app/api/fondos-fi/[id]/route.ts` cita `removeFondoFI`) y los títulos de test
  (p. ej. `"removeIngresoFI paridad con removeEgresoFI"`) no son consumidores.

### Incidente del censo v1 (documentado)

La primera versión del censo definió la zona "app" como `app/**` + `lib/**` y **dejó fuera
`components/**`**, donde tres acciones sí tienen consumidor real
(`components/pe/{visitas,encomiendas,contratistas}-panel.tsx` usan
`removeBitacoraVisitaPE`/`removeEncomiendaPE`/`removeIngresoContratistaPE`). El `tsc` de la poda
lo destapó con 3 errores y la lista se corrigió de 31 a **28** miembros. El censo v2 usa una zona
app **catch-all** para que no vuelva a existir esa clase de hueco.

## Censo 2026-10-14 v2 (180 miembros)

| Clase | Miembros | Significado |
| --- | --- | --- |
| `app` | 79 | algún archivo de `apps/web` (sin QA-Lab) lo usa |
| `qa-lab` | 71 | solo lo usa la página del QA-Lab (y/o tests) |
| `solo-test` | 26 | solo aparece en tests y en ninguna otra zona |
| `muerto` | 2 | no aparece en ninguna zona (`removeEgresoFI`, `toggleActivoTipoUnidad`) |
| `intra-store` | 2 | lo llama otra acción (`notify`, `syncPublicacionesDesdeVinculos`) |

El censo previo del BACKLOG ("182 miembros → 107 app · 4 solo-QA-Lab · 21 solo-test · 1 muerto")
no separaba QA-Lab de app, no contaba `components/**` y contaba 2 miembros más.

## Regla de poda

Se borra un miembro **si y solo si**:

- es propio de `CompassStore` (nunca un campo de `CompassData`: el shape persistido está congelado), y
- su clase es `muerto` o `solo-test` (tests = único consumidor), y
- su uso intra-store es **0** (ninguna otra acción del store lo llama), y
- no aparece en migraciones de Prisma ni en `lib/schemas.ts`.

**No se borra**: campos de estado persistidos (`CompassData` y los `*IR/*MT/...` del shape),
nada con uso `app`, `qa-lab`, `e2e` o `intra-store`, y nada referenciado por una migración.

Resultado: **28 miembros** (2 `muerto` + 26 `solo-test`).

| # | Miembro | Clase | intra | test | Zona que NO lo usa |
| --- | --- | --- | --- | --- | --- |
| 1 | `toggleActivoTipoUnidad` | muerto | 0 | 0 | todas |
| 2 | `removeEgresoFI` | muerto | 0 | 0 | todas |
| 3 | `saveConfiguracion` | solo-test | 0 | 8 | app, QA-Lab, e2e |
| 4 | `savePublicacionPortal` | solo-test | 0 | 8 | app, QA-Lab, e2e |
| 5 | `saveLeadPortal` | solo-test | 0 | 9 | app, QA-Lab, e2e |
| 6 | `marcarNotificacionLeida` | solo-test | 0 | 1 | app, QA-Lab, e2e |
| 7 | `savePeriodoDirectiva` | solo-test | 0 | 4 | app, QA-Lab, e2e |
| 8 | `registrarDescargaDocCO` | solo-test | 0 | 2 | app, QA-Lab, e2e |
| 9 | `cambiarEstadoRecursoIR` | solo-test | 0 | 2 | app, QA-Lab, e2e |
| 10 | `comentarInfraccionIN` | solo-test | 0 | 2 | app, QA-Lab, e2e |
| 11 | `cancelarTrabajoMT` | solo-test | 0 | 2 | app, QA-Lab, e2e |
| 12 | `removeProyectoMT` | solo-test | 0 | 1 | app, QA-Lab, e2e |
| 13 | `removeElementoRA` | solo-test | 0 | 2 | app, QA-Lab, e2e |
| 14 | `removeAvisoCV` | solo-test | 0 | 2 | app, QA-Lab, e2e |
| 15 | `archivarAvisoCV` | solo-test | 0 | 1 | app, QA-Lab, e2e |
| 16 | `savePlantillaCV` | solo-test | 0 | 2 | app, QA-Lab, e2e |
| 17 | `removePlantillaCV` | solo-test | 0 | 2 | app, QA-Lab, e2e |
| 18 | `removeFondoFI` | solo-test | 0 | 2 | app, QA-Lab, e2e |
| 19 | `registrarIngresoFI` | solo-test | 0 | 8 | app, QA-Lab, e2e |
| 20 | `removeIngresoFI` | solo-test | 0 | 1 | app, QA-Lab, e2e |
| 21 | `editarCierreTurnoPE` | solo-test | 0 | 5 | app, QA-Lab, e2e |
| 22 | `removeCierreTurnoPE` | solo-test | 0 | 3 | app, QA-Lab, e2e |
| 23 | `removeMantencionPE` | solo-test | 0 | 1 | app, QA-Lab, e2e |
| 24 | `removeProveedorPE` | solo-test | 0 | 1 | app, QA-Lab, e2e |
| 25 | `generarLiquidacionPL` | solo-test | 0 | 12 | app, QA-Lab, e2e |
| 26 | `confirmarLiquidacionPL` | solo-test | 0 | 3 | app, QA-Lab, e2e |
| 27 | `removeLiquidacionPL` | solo-test | 0 | 3 | app, QA-Lab, e2e |
| 28 | `removeReporteRE` | solo-test | 0 | 2 | app, QA-Lab, e2e |

Casos que **quedan vivos** y explican por qué el censo importa:

- `notify` y `syncPublicacionesDesdeVinculos`: sin uso en app ni tests de UI, pero **otras
  acciones del store los llaman** (29 y 2 llamadas intra-store). Borrarlos rompería el store.
- `saveAdelantoPL`/`removeAdelantoPL` (página viva `finanzas/remuneraciones`) y `saveRecursoIR`
  (QA-Lab): sin uso "de app" aparente en un censo grueso, pero con consumidor vivo.
- `removeBitacoraVisitaPE`, `removeEncomiendaPE`, `removeIngresoContratistaPE`: consumidores en
  `components/pe/*.tsx` (el incidente del censo v1).
- Los campos de `CompassData` (`unidades`, `cobrosFI`, …) nunca entran a la poda aunque su clase
  sea baja: son el shape persistido (`STORE_VERSION = 28`).

## Mecánica del borrado

- `lib/store.ts`: se elimina la línea de la interface, el bloque de implementación y el JSDoc
  `@deprecated` que los precede, con un script ad-hoc sobre el AST (no edición a mano). Los 28
  miembros ocupaban **1.268 líneas** entre interface e implementación; el archivo pasa de
  **8.890 a 7.621 líneas** (−1.269). Verificado que ninguna línea con contenido se **agrega**
  (`diff` ignorando líneas vacías solo muestra borrados).
- Tests: **473 líneas** removidas en 16 archivos. Se eliminaron los casos cuyo **sujeto** era una
  acción borrada y se **adaptaron** (siembra directa de estado con `useCompassStore.setState`)
  los casos cuyo sujeto es una acción viva y que usaban la borrada solo como *setup*:
  `store-visor` (edición tardía, flag CV, activación de plantilla), `store-portal`
  (`removePublicacionPortal`, `notify`), `store-personal` (flag CF de visitas), `store-directiva`
  (`activarPeriodo`), `store-mantenimiento` (alta de proyecto), `store-finanzas` (unicidad de
  fondo), `store-ingresos-fi` (saldoFondo con ingresosFI), `store-remuneraciones` (setup de
  parámetros legales), `store-integracion-nsgc` (vitrina PI y CF), `store-secretos-migracion`
  (strip de secretos vía `ConfiguracionGlobalSchema`).

## Deriva de prosa en specs vivas (deuda declarada, fuera de alcance)

12 capacidades describen en prosa normativa acciones que esta ventana poda. La ventana solo puede
tocar `openspec/changes/store-cleanup/**` y la spec de ST (vía archive), así que el delta cubre
las 3 requirements afectadas **de ST** y el resto queda inventariado para decisión del owner:

| Capability | Acciones podadas que su prosa nombra |
| --- | --- |
| `FI-finanzas-morosidad` | `registrarIngresoFI`, `removeIngresoFI`*, `removeEgresoFI`*, `removeFondoFI` |
| `CV-visor-mensajes` | `savePlantillaCV`, `removePlantillaCV`, `removeAvisoCV`, `archivarAvisoCV` |
| `PI-portal-inmobiliario` | `savePublicacionPortal`, `saveLeadPortal` |
| `GD-gestion-directiva` | `savePeriodoDirectiva` |
| `PL-liquidaciones-remuneraciones` | `generarLiquidacionPL` |
| `CF-configuracion-global` | `saveConfiguracion` |
| `PE-personal-servicios` | `editarCierreTurnoPE`, `removeProveedorPE`, `removeMantenciónPE`* |
| `MT-mantenimiento-proyectos` | `removeProyectoMT` |
| `IR-inventario-recursos` | `cambiarEstadoRecursoIR` |
| `IN-infracciones-multas` | `comentarInfraccionIN` |
| `CO-comunicacion-vecinos` | `registrarDescargaDocCO` |
| `RA-reservas-amenities` | `removeElementoRA` |

`*` = mención solo en un título de test o comentario, no en prosa normativa de la spec.

**Gap funcional detectado (no causado por esta ventana)**: el evento `CF_UPDATE_PARAM` no tiene
emisor en el código. Su único emisor era `saveConfiguracion`, que la app ya no llamaba (por eso
es `solo-test`) y que esta ventana poda; la ruta `app/api/configuracion/route.ts` no lo emite.
Es un gap preexistente de la migración CF→API y queda registrado en el BACKLOG con el delta de ST
ya actualizado.

## Guardas verificadas

1. `STORE_VERSION` sigue 28 y `migrate`, `partialize`, `ESQUEMAS_COLECCION`,
   `sanitizarColecciones` y `onRehydrateStorage` no se tocan.
2. Ningún campo de `CompassData` cambia (el shape persistido es idéntico).
3. `useCompassStore` sigue exportando lo mismo que la app y el QA-Lab consumen: `tsc --noEmit`
   0 errores (los únicos errores de `tsc` son de `.next/types/validator.ts`, artefacto de build
   stale preexistente).
4. Ningún miembro borrado aparece en `prisma/**` ni en migraciones.
5. `eslint` 0 errores en `test/**` y `lib/store.ts`; suite completa con los pisos por área de
   `vitest.config.ts`; e2e dirigida del poblado.
