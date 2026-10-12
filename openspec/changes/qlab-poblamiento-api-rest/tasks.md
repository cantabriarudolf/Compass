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
- [x] 1.5 Conexiones cross-módulo (pasos 7-10): **FASE COMPLETA (2026-10-07)** — las tres fases
      (IN, RA, MT) escriben BD por API y las conexiones FI se leen de BD. El recon (2026-10-07) fijó el
      alcance real: no bastaba migrar el lab, faltaban **acciones server-side** por módulo.

      **IN — HECHA**: `POST /api/in/infracciones/[id]/{apelar,respaldar,aplicar,desestimar}`
      (máquina de estados + eventos de auditoría; `aplicar` materializa `multa_in` transaccional e
      **idempotente por `origenRef`**), `cargarFase10IN` por API + espejo con verificación en BD, y la
      purga de cobros TEST del lab ahora barre por procedencia (`esCobroTest`) sin depender del período.
      Test-first: 18 tests (`test/api/in-acciones.test.ts`). Evidencia: suite **918/918**, tsc 0, eslint 0,
      e2e `poblado-idempotente` 8/8 y `flujo/poblamiento` 9/9. Commit `47b9ea7`.

      **RA — HECHA (2026-10-07)**: `POST /api/ra/reservas` deriva folio `RA-####`, hace snapshot de
      tarifa/garantía y materializa el cobro `reserva_ra` (fondo amenities) en la misma transacción,
      idempotente por `origenRef`; el 409 de solape ahora respeta la capacidad por stock. Nuevas
      `POST /api/ra/reservas/[id]/cancelar` (penalización tardía `penalizacion_ra`, libera el cupo) y
      `/[id]/retener` (`garantia_ra`), ambas exactly-once con evento de auditoría. `cargarFase12RA` por
      API + espejo con verificación en BD y purga de `test-ra-*` en `limpiar()`. Test-first: 13 tests
      (`test/api/ra-acciones.test.ts`). Evidencia: suite **931/931**, tsc 0, eslint 0, e2e 8/8 + 9/9.
      Commit `34f1d2a`. **No portado y declarado**: gate de morosidad FI y `anticipacionMinimaDias`
      (inactivos en el lab) y la notificación de retención (mismo criterio que las rutas IN).

      **MT — HECHA (2026-10-07)**: `POST /api/mt/trabajos` deriva folio `MT-####`; nuevas
      `POST /api/mt/trabajos/[id]/{iniciar,finalizar}` (exactly-once, preventivo automático con id
      determinista, evento por transición) y `POST /api/mt/garantias/verificar` (`MT_GUARANTEE_EXPIRED`
      una vez por trabajo, flag en BD); `POST /api/mt/proyectos` con el guard `saldoFondo` del store
      (409 "Saldo insuficiente", misma fórmula sobre BD). `cargarFase11MT` por API + espejo con
      verificación en BD y purga de `test-*` MT. Test-first: 13 tests (`test/api/mt-acciones.test.ts`)
      con borde de saldo $800.000. Evidencia: suite **944/944**, tsc 0, eslint 0, e2e 8/8 + 9/9.
      Commit `79dc8a8`.
      **Declarado y no portado**: `notify()` de finalizar/verificar, el paso IR del FORM (IR sin migrar)
      y los chequeos de existencia cross-collection sin FK en BD.
      **Divergencia preexistente detectada (no corregida, anotada)**: el saldo del store en
      `saveProyectoMT` **no** incluye `saldoInicial`/`ingresosFI` mientras `/api/fondos-fi/[id]/retirar`
      **sí**; el guard MT usa la fórmula del store para mantener paridad. Decisión de unificación:
      pendiente del owner (cambia semántica financiera).

      **FI 7-10 — HECHOS (2026-10-07)**: los cuatro pasos escriben API + store y verifican desde BD.
      7) descuento justificado sobre `multa_in` (400 sin justificación, una `diferencia` en ambos mundos,
      evento `FI_MANUAL_DISCOUNT` del store; la ruta emite `FI_RECEIVE_PAYMENT` — diferencia declarada);
      8) conexión IN (infracción y cobro leídos por id, `multa_in`/`origenRef`/fondo activo);
      9) conexión RA (reserva leída por id; cobro `reserva_ra` o `penalizacion_ra` tras la cancelación,
      fondo amenities activo); 10) conexión MT (`POST /api/mt/proyectos` → 409 "Saldo insuficiente" con el
      disponible parseado de BD y `disponible < 12.000.000`; el proyecto no queda creado).
      Evidencia: suite **944/944**, tsc 0, eslint 0, e2e `poblado-idempotente` 8/8 y `flujo/poblamiento` 9/9.
      Commit `757cc97`.
      **Divergencia detectada y no corregida (decisión del owner)**: la ruta IN resuelve el fondo GC como
      el primer `gasto_comun` activo por `id asc` (puede ser `fondo-cc-punto-cero`) mientras el store fija
      `fondo-gc`; el lab valida por **tipo** + activo, no por id.
- [x] 1.6 Gate de fase: **VERDE 2026-10-07** — suite **897/897** · tsc 0 · eslint 0 · e2e
      `poblado-idempotente` **8/8** · e2e `flujo/poblamiento` **9/9** (esto último satisface también
      el criterio de cierre 3.1 del change: el último rojo del lane P3 cayó con 1.3a + 1.4).

## Fase 2 — CT + higiene de dos mundos (ventana 2) — **CERRADA 2026-10-07**

- [x] 2.1 RED: **HECHO** — 3 tests del gate deuda/saldo en `test/api/api-certificados-ct.test.ts`
      (al_día con deuda → 409, al_día sin deuda → ok, estado_cuenta con deuda) + el test de `DELETE`
      actualizado a 409 inmutable. RED observado antes de cada implementación.
- [x] 2.2 GREEN: **HECHO** — gate server-side en `POST /api/certificados-ct` (409 con el saldo
      pendiente de la unidad, scoped por comunidad) y `DELETE /api/certificados-ct/[id]` con rechazo
      explícito **409 documento inmutable** (Decisión 5). Sin purga por API: el residuo TEST lo purga
      `e2e:higiene`.
- [x] 2.3 Migrar `cargarFase15CT` a la API con espejo transitorio (D7) e ids `test-*-ct`: **HECHO** —
      los 4 pasos escriben store + API y verifican en BD (folio `CT-`, tipo, saldo 0).
      Nota medida: el paso de inmutabilidad comprueba el guard del store **solo si existe un
      certificado real** (el guard del store exime a los `test-*`: es su vía de purga) y siempre el
      **409 de la API** (que no exime a nadie).
- [x] 2.4 `tieneDatosTest(state, bd?)` / `runFase` / "Borrar todo": **HECHO en lo bloqueante** — FI
      se purga por API (1.4); CT queda declarado como residuo no bloqueante (lo limpia
      `e2e:higiene`, que ya purga `certificadoCT`), y el guard clean-first solo mira PI/PL.
- [x] 2.5 Gate de fase: **VERDE** — suite **900/900** · tsc 0 · eslint 0 · `e2e:higiene --apply` sin
      residuos bloqueantes · e2e `poblado-idempotente` **8/8** y `flujo/poblamiento` **9/9**.

## Fase 3 — Cierre (ventana 3)

- [ ] 3.1 `e2e/flujo/poblamiento.spec.ts` **3/3** verde (una corrida, sin bucle).
- [ ] 3.2 Verificación de idempotencia: "Poblar todo" ×2 con limpieza intermedia, sin duplicados.
- [ ] 3.3 NSGC: manuales de FI/CT + avance.
- [ ] 3.4 `check-delta-coverage` + `openspec validate --all` en verde.
- [ ] 3.5 Commit(s) y archivar tras CI verde (el push lo decide el owner).
