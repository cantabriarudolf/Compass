# Tasks: qlab-poblamiento-api-rest

> Change grande: **4 ventanas**. Un escritor por vez. Test-first donde haya runner
> determinista (rutas API + helpers); el e2e del poblamiento es la verificación de cierre.
> **Orden re-escopado el 2026-10-07** por las dependencias D6.1/D6.2/D6.3 del `design.md`. El grafo
> real es `EF/VU → FI → CT`, con IN/RA/MT antes de las conexiones.

## Fase 0 — Estructura (EF/VU) a BD — **PRIMERA, desbloquea todo**

- [x] 0.1 Migrar `cargarFase12EF`/`VU` (`app/admin/qa-lab/page.tsx:320-403`) a API REST: maestros,
      tipos de unidad, macro/micro sectores, **unidades** y **vinculos** (incluidas `test-u-999` y
      su propietario). **HECHO con espejo transitorio (design.md Decisión 7)**: escribe a la API **y**
      al store, porque ~13 fases siguientes leen el store. Commit `c758115`.
- [x] 0.2 Verificar en BD: **medido** → `unidad` id `test-*` = 2 (incluye `test-u-999`),
      `vinculoUnidad` con `unidadId` `test-*` = 3, `persona` `test-*` = 3, 8/8 maestros + TU +
      macro + 2 micro-sectores persistidos. Suite **891/891**, tsc 0, eslint 0.
- [x] 0.3 Gate: unidades TEST visibles en `/inventario/estructura`. **VERIFICADO 2026-10-07**:
      `GET /api/unidades` devuelve `test-u-999` en la primera página (total 168, pageSize 100,
      orden `createdAt desc`) y la página real renderiza "999"/"TEST" (20 filas visibles).
      Nota de método: la página carga 100 unidades por API y pagina de a 20; el gate exige esperar
      la carga de las 9 colecciones (una pasada con 4s de espera dio falso negativo).
- [x] 0.4 **Purga BD de la estructura en `limpiar()`** — **RESUELTO 2026-10-07**.
      **Causa raíz real (medida)**: no era la excepción PL ni los guards 409, sino una **carrera de
      hidratación**. `limpiar()` arrancaba con `if (!ensureHydrated()) return`; el click quirúrgico
      del e2e llega antes de que zustand-persist rehidrate el fixture grande de `localStorage`,
      así que el handler abortaba con "aún se está hidratando" y la purga nunca corría.
      **Fix**: `waitForStoreHydration()` en `lib/store.ts` (espera acotada, 10s) + `ensureHydrated()`
      async que la espera; `runFase`/`limpiar`/`validar` la aguardan (3 call sites).
      **Evidencia**: `test/lib/wait-for-store-hydration.test.ts` (3/3, RED→GREEN); e2e
      `e2e/crud/poblado-idempotente.spec.ts` **8 passed / 0 failed** (6 auth setup + 2 spec);
      purga medida: 22 DELETEs en orden hijos→padres, mensaje verde a 27s (rutas calientes) y
      67.9s (cold-compile de Turbopack, log del server: `compile: 7.9s-11.5s` por ruta);
      poblamiento de 22 fases: 12.1s caliente. Los guards 409 no bloquean: el orden de purga los
      evita (hijos primero). Timeouts del spec recalibrados 30s→120s en las aserciones de purga y
      de carga completa, **después** del fix real y con la medición de arriba (tolerancia al
      cold-compile del dev server; el intento previo de subir la ventana sin arreglar la causa
      seguía revertido). Suite 894/894 · tsc 0 · eslint 0.
      Residuo FI (cobros con pagos, guard 409) sigue parkeado por decisión del owner → Fase 1.4.

## Fase 1 — FI (ventana 1) — acciones API + pasos FI puros

- [x] 1.1 RED: test de las acciones nuevas de API (pago, mora, retiro de fondo) con el patrón
      de `test/api/` (evento de auditoría post-write, uno por request, scoping por comunidad).
      **HECHO**: `test/api/fi-acciones.test.ts`, **13 tests**.
- [x] 1.2 GREEN: `POST /api/cobros-fi/[id]/pagar`, `POST /api/cobros-fi/[id]/mora`,
      `POST /api/fondos-fi/[id]/retirar` (patrón `liquidaciones/[id]/confirmar`).
      **HECHO**: commits `feat(api): acciones REST de pago y mora sobre cobros FI` y
      `feat(api): acción REST de retiro de fondo FI`. Suite **891/891**, tsc 0, eslint 0.
- [x] 1.3a Migrar a API REST los pasos FI puros de `cargarFase13FI`: **HECHO 2026-10-07**.
      Los pasos 1, 2, 3, 4, 5, 6 y 11 escriben API + store (espejo D7) con el patrón
      `espejarQA`/`espejarRechazoQA` (los rechazos esperados — 400 del paso 4 y del paso 11 —
      cuentan como ok sin debilitar los demás). Las verificaciones se leen de BD: egreso por id
      (`GET /api/egresos-fi/[id]`, no listado paginado), emisión por período, cobro por id devuelto
      por la API. **Períodos TEST-scoped** (2019-03 / 2019-01) en vez del mes corriente: los
      períodos reales ya tenían emisión de corridas previas → 409 → sin cobro TEST → pasos 5/6 en
      falso rojo irrecuperable (medido). Evidencia: e2e `poblado-idempotente` 8/8 y
      `flujo/poblamiento` 9/9 (último rojo del lane P3), suite 897/897, tsc 0, eslint 0.
- [x] 1.3b Los pasos 7, 8, 9 y 10 quedan **explícitamente sin migrar** con comentario
      `// TODO Fase 1.5 — depende de migrar IN/RA/MT` (ver D6.1). **HECHO**: los cuatro pasos lo
      llevan y no se disfrazan de verde (el e2e los reporta ok por el store, que sigue siendo su
      fuente hasta la Fase 1.5).
- [x] 1.4 Purga BD de FI en "Borrar todo" (D6.2 + **Decisión 8**): **HECHA 2026-10-07**.
      `DELETE /api/cobros-fi/[id]` permite dar de baja un cobro TEST con pagos en desarrollo
      (`esCobroTest()` + `getAppEnv() === "development"`); el guard 409 queda intacto para filas
      reales (test-first: 3 tests de ruta, RED→GREEN con triangulación real/TEST/production).
      `limpiar()` purga por API, TEST-scoped, hijos→padres: cobros de los períodos TEST → emisiones
      TEST de esos períodos → fondos/egresos TEST; idempotente (404 = limpio) y solo bloqueante si
      la entidad existe y el DELETE la rechaza.
- [ ] 1.5 Conexiones cross-módulo (pasos 7-10): migrar **después** de las fases IN, RA y MT.
- [x] 1.6 Gate de fase: **VERDE 2026-10-07** — suite **897/897** · tsc 0 · eslint 0 · e2e
      `poblado-idempotente` **8/8** · e2e `flujo/poblamiento` **9/9** (esto último satisface también
      el criterio de cierre 3.1 del change: el último rojo del lane P3 cayó con 1.3a + 1.4).

## Fase 2 — CT + higiene de dos mundos (ventana 2)

- [ ] 2.1 RED: test del gate deuda/saldo y de la inmutabilidad en la capa API
      (`app/api/certificados-ct/route.ts`).
- [ ] 2.2 GREEN: portar el gate deuda/saldo y el rechazo de borrado inmutable a la ruta.
- [ ] 2.3 Migrar `cargarFase15CT` (`app/admin/qa-lab/page.tsx:1064`) a `POST /api/certificados-ct`
      con id `test-*-ct`.
- [ ] 2.4 `tieneDatosTest(state, bd?)` / `runFase` / "Borrar todo" cubriendo store + BD sin
      residuos TEST bloqueantes.
- [ ] 2.5 Gate de fase: unit + `tsc` + `eslint`; `e2e:higiene` sin residuos.

## Fase 3 — Cierre (ventana 3)

- [ ] 3.1 `e2e/flujo/poblamiento.spec.ts` **3/3** verde (una corrida, sin bucle).
- [ ] 3.2 Verificación de idempotencia: "Poblar todo" ×2 con limpieza intermedia, sin duplicados.
- [ ] 3.3 NSGC: manuales de FI/CT + avance.
- [ ] 3.4 `check-delta-coverage` + `openspec validate --all` en verde.
- [ ] 3.5 Commit(s) y archivar tras CI verde (el push lo decide el owner).
