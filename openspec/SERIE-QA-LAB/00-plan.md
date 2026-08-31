# Serie QA-LAB — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila EN CURSO
> y actualizarla antes del push final. La Bitácora es el registro durable de la serie.

**Objetivo:** corregir los 27 hallazgos del Laboratorio QA (`/admin/qa-lab`) y dejarlo
**confiable, seguro sobre datos existentes y verificado E2E con reporte completo**.

**Alcance técnico:** SOLO se corrige `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` (y su
verificación E2E). **No se toca `lib/store.ts`**: las acciones del store ya funcionan y
están cubiertas por Vitest (`test/store-integracion-nsgc.test.ts` replica la cadena completa
con lecturas frescas y pasa). Sin bump de `STORE_VERSION` (v26) esperado.

**MÁXIMO: 3 ventanas.** Post-serie (queda fuera): idempotencia completa de "Poblar todo"
(requeriría cambios semánticos en store — serie futura), rate-limit y otras lanes E2E.

**Base de hechos:**
- `Data/NSGC/docs/avances/avance - 2026-08-29 11-10.md` (lane E2E flujo + hallazgo)
- `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` (el lab, 1828 líneas)
- `k0mp4ss_fe/apps/web/lib/store.ts` (store v26, acciones verificadas)
- `k0mp4ss_fe/apps/web/test/store-integracion-nsgc.test.ts` (cadena cross-módulo con lecturas frescas)
- Auditoría independiente 2026-08-29 (matriz abajo, verificada file:line)

---

## Matriz de hallazgos (auditoría 2026-08-29 — veredicto: AJUSTAR)

### Causa global (24 de 27 errores)

Patrón de **lectura obsoleta**: cada `cargarFaseX` captura `const s =
useCompassStore.getState()` UNA vez al inicio; el store actualiza inmutablemente
(`upsert` reemplaza arrays, `store.ts:575-579`), así que toda relectura vía `s.<colección>`
ve el snapshot viejo → `undefined`. Las acciones en sí SÍ persisten (Vitest 413 lo prueba).
Fases afectadas: GD(1) GE(4) IR(3) IN(1) MT(3) RA(3) CV(5) FI(2) PE(2) RE(1).

### 3 hallazgos estructurales

1. **GD → cascada CV**: el loop de firmas (`page.tsx:385`) filtra `personas` del snapshot
   obsoleto → `test-p-99` (promovido a directiva en `page.tsx:378`) nunca firma → el store
   recalcula quórum con estado vivo (`store.ts:1438-1441`) y el acta queda "borrador" →
   CV paso 4 falla de verdad (`page.tsx:635-637`) y arrastra FI/CT dependientes de acta.
2. **PE paso 10**: filtro case-sensitive `asunto.includes("Cierre de turno")`
   (`page.tsx:813`) no matchea la copia al trabajador "Copia de su **c**ierre de turno"
   (`store.ts:3859-3864`) → `copiaTrabajador=false`. El test de integración sí normaliza a
   minúsculas (`store-integracion-nsgc.test.ts:295-297`): bug del verificador.
3. **FI paso 7**: el sub-check de `FI_MANUAL_DISCOUNT` lee `s.eventos` obsoleto
   (`page.tsx:713`); el store sí registra el evento (`store.ts:3381-3395`).

### Aserciones frágiles (corregir aunque no fallen hoy)

- **RA paso 2**: exige folio exacto `RA-0001` (`page.tsx:585`), válido solo con store
  limpio. Correcto: `/^RA-\d{4}$/`.
- **FI paso 9**: la reserva queda con `cargoFIReferencia` del cargo de PENALIZACIÓN tras
  la cancelación (contrato del store, `store.ts:2837-2845`); el cobro de tarifa debe
  buscarse por `origenRef === "test-ra-rs-1"` && `concepto === "reserva_ra"` (`page.tsx:724`
  ya lo hace — no "arreglar" ese paso, solo no romperlo).

### Riesgos de `limpiar()` y reejecución (auditoría — alcance P2)

- `limpiar()` borra notificaciones **por módulo**, no por ownership TEST
  (`page.tsx:1168, 1182, 1196, 1226, 1248`) → destruye notificaciones reales.
- Resetea parámetros legales de CF a `undefined` (`page.tsx:1192-1198`) en vez de
  restaurar valores previos.
- Fugas de artefactos indirectos: egresos FI de liquidaciones PL y certificados CT con id
  aleatorio no `test-*` (`store.ts:4132-4155`, `store.ts:4327-4343`) sobreviven a la
  limpieza (solo filtra por prefijo `page.tsx:1163-1167, 1200-1203`).
- `validar()` (`page.tsx:1365-1383`) solo comprueba FKs de unidades y vínculos TEST —
  ignora referencias FI/RA/PE/PL/CT/CV.
- Varias llamadas seed ignoran el `StoreResult` (p. ej. `page.tsx:272-284, 290-299`) →
  un fallo real se reporta como éxito.
- **Reejecución NO idempotente** (decisión del owner: NO se hace idempotencia): FI
  rechaza periodo ya procesado (`store.ts:3191-3192`), PL rechaza liquidación existente
  (`store.ts:3998-4003`), `activarPlantillaCV` crea aviso nuevo cada corrida
  (`store.ts:3049-3075`), CT genera ids aleatorios (`store.ts:4327-4343`), `upsert`
  sobrescribe con `folio: ""` (`store.ts:2692-2695`).
- **Política aprobada (guard clean-first)**: si existen datos `TEST-*`, "Poblar todo" se
  BLOQUEA con mensaje claro ("ejecuta primero Borrar todo lo de prueba"). La segunda
  corrida se prueba como BLOQUEADA, no como carga verde.

### Criterios de aceptación de la serie

- `Poblar todo` sobre store limpio → `report.ok === true`, `erroresGlobales.length === 0`
  (mensaje `Carga completa OK`), las 22 fases OK y todos los pasos OK.
- Acta GD "publicada" con quórum completo (incluye `test-p-99`); CV materializa
  `avisoCVReferencia` del acta.
- E2E afirma el **reporte completo** (no solo el primer badge 🟢): mensaje OK + todas las
  tarjetas Listo + tasa huérfanos 0 vía "Revisar".
- Limpieza: elimina SOLO artefactos TEST (incluidos los de id aleatorio derivados de la
  carga) y preserva notificaciones y configuración reales.
- Guard clean-first: 2ª corrida sin limpiar → bloqueada con mensaje claro.
- Suites completas verdes: Vitest 413+, `tsc --noEmit`, lint, Playwright (smoke+auth+flujo).

## Roadmap

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | Lecturas frescas en los 10 `cargarFaseX` + fixes estructurales GD/PE/FI + aserción RA por regex + propagación de todos los `StoreResult` + e2e afirmando `Carga completa OK` | HECHA | e64657b |
| P2 | Limpieza ownership-scoped TEST + preservación de config/notificaciones reales + purge de artefactos de id aleatorio + `validar()` completo + guard clean-first | pendiente | — |
| P3 | Cierre integral: e2e del ciclo limpiar→poblar→validar→limpiar + 2ª corrida bloqueada + suites completas + avance final + bitácora SERIE COMPLETA | pendiente | — |

## Bitácora

- [2026-08-31] P1 HECHA: lecturas frescas 24/27 + GD quórum 5/5 (g-1..g-4+test-p-99) → acta publicada, PE case-insensitive, FI evento fresco, RA regex /^RA-\d{4}$/, StoreResult propagado (MA/MP/IN/PE) y e2e Carga completa OK; Vitest 413/413 tsc0 lint0 e2e flujo 5/5. 27→0 errores, 22/22 fases OK. Desviación: helper periodoMesesAtras con overflow 31→01 fix y FI paso9 cargo penalización (no equality). (e64657b)
