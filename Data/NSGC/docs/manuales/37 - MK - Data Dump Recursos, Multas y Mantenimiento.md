# 📋 MK - Data Dump: Recursos, Multas y Mantenimiento (Sesión 3 NSGC)

> Registros resueltos de las colecciones IR/IN/MT. La única colección **con datos sembrados** es `tiposInfraccionIN` (5 faltas del NSGC); `activosIR`, `solicitudesInsumoIR`, `entregasEPP`, `infraccionesIN`, `trabajosMT` y `proyectosMT` están **vacías por diseño** y se pueblan desde la UI.
> Fuente: `k0mp4ss_fe/apps/web/data/finanzas/tipos-infraccion.ts` + `lib/store.ts` (seeds) + `lib/schemas.ts` (esquemas). Store v16/v17/v18.

## 📦 Catálogo de Faltas IN — `tiposInfraccionIN` (5 registros sembrados)

| ID | Nombre | Categoría | Sanción base | Valor |
|----|--------|-----------|--------------|-------|
| `tipo-in-ruidos` | Ruidos Molestos | grave | porcentaje_gc | 50 (% GC) |
| `tipo-in-mascotas` | Mascota sin correa en áreas comunes | leve | monto_fijo | $15.000 |
| `tipo-in-basura` | Basura fuera de horario | leve | monto_fijo | $10.000 |
| `tipo-in-areas-comunes` | Uso indebido de áreas comunes | grave | monto_fijo | $50.000 |
| `tipo-in-obras` | Obras sin autorización | gravisima | porcentaje_gc | 100 (% GC) |

### Patrón para crear faltas manualmente

```
ID:          tipo-{dominio}-{tema}  (ej: tipo-in-mascotas)
Categoría:   leve | grave | gravisima
Sanción:     monto_fijo (valor = pesos CLP) | porcentaje_gc (valor = % sobre GC)
Nota:        Grave/Gravísima exigen respaldo directiva antes de aplicar la multa
```

---

## 📦 Catálogo de Recursos IR — `activosIR` (0 registros)

Vacía por diseño. Código auto-generado `IR-A-####`.

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| `id`, `nombre` | string | ✅ | Patrón id `ir-{timestamp}` |
| `codigo?` | string | — | `IR-A-{secuencial}`, generado al alta si falta |
| `categoria` | enum | ✅ | infraestructura \| mobiliario \| insumo \| epp \| acceso |
| `estadoActivo` | enum | ✅ | disponible \| en_uso \| reparacion \| baja |
| `microSectorId?` / `unidadId?` | FK EF | condicional | Infraestructura exige una de las dos; acceso exige unidad |
| `responsablePersonaId?` | FK MP | — | Vinculación laboral plena llega con PE |
| `stock` / `esCritico` / `umbralCritico?` | number/bool | ✅ | Insumo crítico exige umbral; `IR_STOCK_LOW` al cruzarlo entregando |
| `proveedor?` / `numeroFactura?` / `facturaUrl?` / `garantiaHasta?` | string/ISO | — | Compra como metadatos D1; deja `cargoFIReferencia:"pendiente"` |
| `talla?` / `renovacionMeses?` | string/int | — | Solo EPP; renovación calcula próxima fecha en cada entrega |
| `asignacionActual?` | `{personaId, fecha}` | — | Solo accesos ("quién tiene qué") |

---

## 📮 Solicitudes de Insumo — `solicitudesInsumoIR` (0 registros)

Vacía por diseño. Folio auto `SI-####`; ciclo Pendiente → Entregada (descuenta stock) o Rechazada.

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| `recursoInsumoId?` | FK activosIR | condicional | Requerido salvo comodín |
| `comodin?` | `{descripcionArticulo, justificacion(≥20)}` | — | Alerta crítica al admin (`IR_COMODIN_ALERTA`) |
| `estadoComodin` | enum | ✅ | no_comodin \| pendiente \| aprobada_creada \| sustituida \| rechazada |
| `cantidad` / `areaDestino` | number/string | ✅ | Tipificación quién×qué×dónde |

---

## 🦺 Entregas EPP — `entregasEPP` (0 registros)

Vacía por diseño. Cada entrega audita `IR_DELIVERY_EPP`; si el EPP tiene `renovacionMeses`, calcula `proximaRenovacion`.

---

## ⚖️ Infracciones — `infraccionesIN` (0 registros)

Vacía por diseño. Folio auto `IN-####`; estado inicial En Revisión.

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| `tipoInfraccionId?` XOR `danoDirecto?` | FK / objeto | ✅ (una) | Daño directo exige costo>0 y ≥1 evidencia D1 |
| `unidadId` | FK EF | ✅ | Unidad infractora |
| `mensajeBuzonId?` | FK CO | — | Nacimiento desde reclamo verídico |
| `fechaSuceso`+`horaSuceso` / `antecedentes(≥20)` / `evidencias[]` | — | ✅ | Respaldo documental D1 |
| `estado` | enum | ✅ | en_revision \| apelada \| aplicada \| desestimada |
| `respaldosDirectiva[]` | personaIds | condicional | Grave/Gravísima exigen ≥1 antes de aplicar |
| `montoAplicado?` | number | — | Fijado al aplicar; `cargoFIReferencia:"pendiente"` |

---

## 🔧 Trabajos MT — `trabajosMT` (0 registros)

Vacía por diseño. Folio auto `MT-####`; estado inicial Planificado.

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| `unidadId?` / `microSectorId?` | FK EF | ✅ (una) | Ubicación obligatoria |
| `activoIRId?` | FK IR | — | Histórico por equipo crítico |
| `responsablePersonaId?` XOR `proveedor?` | — | ✅ (uno) | Interno MP o empresa externa |
| `prioridad` / `estado` | enum | ✅ | baja\|media\|alta\|emergencia / planificado\|en_curso\|finalizado\|cancelado |
| `costoTotal` / `origenFondos` / `estadoPago` | — | ✅ | Fondos documental con `cargoFIReferencia:"pendiente"` |
| `garantiaInicio?`/`garantiaFin?` | ISO | — | `verificarGarantiasMT` alerta ≤30 días o vencidas (1 vez) |
| `preventivo?` | `{periodicidadMeses}` | — | Al finalizar genera el próximo Planificado automáticamente |

---

## 🏗️ Proyectos MT — `proyectosMT` (0 registros)

Vacía por diseño. Cuota sugerida derivable = `presupuestoEstimado ÷ plazoMeses` (ej. $12.000.000 / 120 meses → $100.000/mes).
