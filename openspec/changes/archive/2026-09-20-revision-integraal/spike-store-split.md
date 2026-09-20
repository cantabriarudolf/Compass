# Spike: split del store monolito por dominio (solo exploración — 2026-09-19)

> Fuente: scout read-only sobre `k0mp4ss_fe/apps/web/lib/store.ts` (~8.468 líneas,
> `STORE_VERSION = 27`). NO se tocó código. Decisión: implementación en 3 fases
> (7–8 ventanas) pendiente de calendarizar por el owner.

## 1. Mapa de dominios (implementación aprox.)

| Dominio | Estado / acciones | Líneas |
|---|---|---|
| Núcleo EF/MP/VU | tiposUnidad, macro/microSectores, unidades, personas, vínculos, maestros, configuración | ~1100–1950 (~850) |
| PI + D3 | publicacionesPortal, leadsPortal, notificaciones | ~1950–2300 (~350) |
| AD/GD | controlesPropiedades, actasGD | ~2300–2700 (~400) |
| CO/GE | plantillas/envíos/buzón/documentos CO, solicitudes GE | ~2700–3400 (~700) |
| IR | activosIR, solicitudesInsumoIR, entregasEPP | ~3400–3700 (~300) |
| IN | tiposInfraccionIN, infraccionesIN | ~3712–4300 (~600) |
| MT | trabajosMT, proyectosMT | ~4300–4650 (~350) |
| RA | elementosRA, reservasRA | ~4659–5300 (~650) |
| CV | avisosCV, plantillasCV | ~5050–5370 (~320) |
| FI/GC | fondos/egresos/ingresos FI, emisionesGC, cobrosFI (+ seed punto-cero) | ~5370–6150 (~780, más denso) |
| PE | bitácora, encomiendas, contratistas, proveedores, mantenciones, turnos, proyecciones | ~6150–7040 (~900, más grande) |
| PL/CT/RE + auditoría | liquidacionesPL, adelantosPL, certificadosCT, reportesRE, eventos | ~7040–8008 (~950) |
| Infra | seedData, migrate v2→v27, rehydrate, backup | helpers ~200 + migrate ~380 + seed ~200 |

Dependencias vía `get()`: RA→FI, IN→FI, FI→GD, GD→CV, PE→MT, PE→FI, CO→MP/EF,
PI→VU; casi todo valida contra personas/unidades/vínculos/maestros.

## 2. Acoplamientos peligrosos (no partir sin contrato)

- Mutación cruzada directa: `saveReservaRA` (set cobrosFI + reservasRA),
  `aplicarInfraccionIN` (crea CobroFI), `publicarActaEnCV` (set avisosCV + actasGD),
  `completarTareaMonitoreoPE` (escribe trabajosMT), `retirarFondoFI` (lee actasGD).
- `migrate` mezcla v2–v27 encadenado: partirlo rompe el orden; queda último y monolítico.
- Seed compartido con `validateSeedOrder` (macro→micro→unidad).
- Helpers transversales a extraer primero: registrarEvento, upsert, nombrePersona,
  refUnidad, resolverVariablesCO, siguienteCodigoIR/FolioRA/FolioFE, getDeudaVigenteFI.

## 3. Corte en 3 fases

- **Fase 1 (1 ventana, riesgo mínimo):** helpers + tipos a `lib/store/helpers.ts` sin
  tocar `create()`. Verificación: tests store-validacion/migracion-seed/secretos + tsc.
- **Fase 2 (2–3 ventanas, riesgo bajo):** slices hoja sin escrituras cruzadas
  (CV, GE, IR, MT, AD, PI/D3, CO) como factories `(set,get)=>` con spread.
  Verificación por slice + e2e crud.
- **Fase 3 (3–4 ventanas, riesgo alto, última):** (a) PE-PL-CT-RE, (b) RA+IN,
  (c) FI/GC + GD + núcleo + migrate/seed/persist. Definir antes interfaces entre
  slices (`emitirCargoFI`, `exigirActaPublicada`, `chequearDeudaFI`). Verificación:
  suite financiera completa + e2e flujo/smoke/auth + migración v26→v27 con backup real.

## 4. Mayor riesgo

`emitirGastoComun / registrarPagoFI / aplicarMoraFI / retirarFondoFI` + migrate v27:
un `set()` partido corrompe saldos o duplica cobros; el `persist` versionado hace el
daño irreversible en localStorage. FI y migrate se tocan últimos, con backup
exportado antes de cada ventana.
