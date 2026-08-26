# 🧪 MK - Catálogo de Mocks

> Documento de trazabilidad para saber **qué datos mockeados existen**, **dónde viven**, **qué contienen** y **quién los consume**.
> Cuando un módulo se conecte a backend real, este documento sirve de checklist para saber qué reemplazar.

---

## 📍 Ubicación Base

Los mocks de seed viven en `data/` y las colecciones de módulos nuevos viven en el store (`lib/store.ts`, seeds vacíos):
```
k0mp4ss_fe/apps/web/data/
├── maestros.ts                    ← Categorías estructurales y estados de ocupación
├── admin/
│   ├── maestros.ts                ← AFP, salud, mutuales, feriados, bancos, etc. (MA)
│   └── configuracion.ts           ← Configuración Global por defecto (CF)
├── comunidad/
│   ├── personas.ts                ← Maestro de Personas (identidades + roles)
│   ├── vinculos.ts                ← Vínculos persona ↔ unidad (VU)
│   ├── plantillas-co.ts           ← Seed del Maestro de Plantillas (CO, Sesión 2)
│   └── plantillas-cv.ts           ← Seed del Maestro de Plantillas Rápidas (CV, Sesión 4)
├── finanzas/
│   └── tipos-infraccion.ts        ← Seed del Catálogo de Faltas (IN, Sesión 3)
└── inventario/
    └── estructura.ts              ← Tipos de unidad, sectores y unidades (incluye plazas u-E-*)
```

> **⚠️ Desde ST**, casi todo vive en el store `compass-store` (`lib/store.ts`) con migraciones versionadas. Las colecciones PI/AD/GD (Sesión 1) nacen **vacías por diseño** dentro del store — ver sección 5. Las colecciones CO/GE (Sesión 2) siguen el mismo patrón; la excepción es `plantillasCO`, que se **siembra** desde `data/comunidad/plantillas-co.ts` — ver sección 6. En la Sesión 3 el patrón se repite para **IR/IN/MT**: `tiposInfraccionIN` se siembra desde `data/finanzas/tipos-infraccion.ts`; `activosIR`, `solicitudesInsumoIR`, `entregasEPP`, `infraccionesIN`, `trabajosMT` y `proyectosMT` nacen vacías — ver sección 7. En la **Sesión 4** lo hace **RA/CV**: `plantillasCV` se siembra desde `data/comunidad/plantillas-cv.ts`; `elementosRA`, `reservasRA` y `avisosCV` nacen vacías — ver sección 8. En la **Sesión 5** llega **FI**: `fondosFI` se siembra inline desde el propio store (3 fondos NSGC); `egresosFI`, `emisionesGC` y `cobrosFI` nacen vacías — ver sección 9.

---

## 📦 Archivo por Archivo

### 1. `data/maestros.ts`

| Campo | Detalle |
|-------|---------|
| **Ruta** | `k0mp4ss_fe/apps/web/data/maestros.ts` |
| **Propósito** | Catálogos/enums del sistema. Son los "maestros administrativos" que alimentan dropdowns, badges y filtros en todo el frontend. |
| **Líneas** | ~46 |

#### Contenido exportado:

| Export | Tipo | Cantidad | Para qué se usa |
|--------|------|----------|-----------------|
| `CATEGORIAS_MACRO` | `{ id, nombre }[]` | 7 items | Tipos de agrupación mayor: Torre, Manzana, Etapa, Sector, Parcela, Calle, Edificio |
| `CATEGORIAS_MICRO` | `{ id, nombre }[]` | 5 items | Subdivisiones: Piso, Nivel, Pasaje, Bloque, No Aplica |
| `CATEGORIAS_UNIDAD` | `{ id, nombre }[]` | 6 items | Tipos de propiedad: Departamento, Casa, Local, Oficina, Bodega, Estacionamiento |
| `ESTADOS_OCUPACION` | `{ id, nombre, color, hex }[]` | 5 items | Estados de una unidad: id + clases CSS (`color`) para badges y `hex` para gráficos (Vacante, En Uso, En Arriendo, En Venta, En Mantención) |
| `UBICACIONES_ESTACIONAMIENTO` | `{ id, nombre }[]` | 4 items | Niveles físicos de estacionamiento: Superficie, Subterráneo -1/-2, Visitas |

#### Consumido por:

| Página/Componente | Qué importa |
|-------------------|-------------|
| `lib/store.ts` | `ESTADOS_OCUPACION`, `CATEGORIAS_MACRO`, `CATEGORIAS_MICRO` (seed de `MaestroCollections`) |
| `app/inventario/estacionamientos/page.tsx` | `UBICACIONES_ESTACIONAMIENTO` |

> **⚠️ Nota:** Desde la capa de datos persistente (ST), las colecciones `ESTADOS_OCUPACION`, `CATEGORIAS_MACRO` y `CATEGORIAS_MICRO` viven en el store (`MaestroCollections`) y las páginas las leen vía `useCompassStore`. Los estados nuevos creados en MA reciben un `hex` automático (`hexDesdeId`).

> **⚠️ Este es el archivo más transversal.** Casi toda la app lo importa. Cuando se migre a API, este será el primero que se deba resolver.

---

### 2. `data/inventario/estructura.ts`

| Campo | Detalle |
|-------|---------|
| **Ruta** | `k0mp4ss_fe/apps/web/data/inventario/estructura.ts` |
| **Propósito** | Todo el inventario inmobiliario: tipos de unidad, sectores macro/micro, y las unidades generadas algorítmicamente. |
| **Líneas** | ~159 |

#### Interfaces definidas:

| Interface | Campos clave | Relación |
|-----------|-------------|----------|
| `TarifaHistorica` | `id`, `monto`, `fechaVigencia`, `creadoEn` | Hijo de `TipoUnidad` |
| `TipoUnidad` | `id`, `nombre`, `categoria`, `metraje`, `montoBaseGc`, `activo`, `historialTarifas[]` | Plantilla de unidad |
| `MacroSector` | `id`, `nombre`, `etiqueta`, `descripcion?` | Torre/Sector |
| `MicroSector` | `id`, `macroSectorId`, `nombre`, `etiqueta` | Piso/Nivel dentro de un MacroSector |
| `Unidad` | `id`, `microSectorId`, `numero`, `etiqueta`, `tipoUnidadId`, `metraje`, `prorrateo`, `rolSii`, `estadoId`, `servicios` | La unidad habitacional concreta (el estado se guarda por id → `estadosOcupacion`) |

#### Contenido exportado:

| Export | Cantidad | Cómo se genera |
|--------|----------|----------------|
| `tiposUnidad` | 5 registros | Hardcodeados manualmente (Tipo A, B, Local A, B, Estacionamiento) |
| `macroSectores` | 6 registros | Hardcodeados (Torres A-E + Centro Comercial) |
| `microSectores` | 21 registros | **Generados algorítmicamente** → 4 pisos × 5 torres + 1 nivel comercial |
| `unidades` | 83 registros | **Generados algorítmicamente** → 4 deptos × 4 pisos × 5 torres (80) + 3 locales comerciales manuales |

> **💡 Dato clave:** Las unidades se generan con IDs predecibles tipo `u-A-101`, `u-B-201`, etc. Esto es fundamental porque `personas.ts` y `estacionamientos.ts` referencian estos IDs.

#### Consumido por:

| Página/Componente | Qué importa |
|-------------------|-------------|
| `app/admin/metricas/page.tsx` | `unidades`, `tiposUnidad`, `macroSectores` |
| `app/inventario/estructura/page.tsx` | `tiposUnidad`, `macroSectores`, `microSectores`, `unidades`, `Unidad` |
| `app/inventario/tipos/page.tsx` | `tiposUnidad`, `unidades`, `TipoUnidad` |
| `app/inventario/estacionamientos/page.tsx` | `macroSectores` |
| `components/inventario/formulario-unidad.tsx` | `tiposUnidad`, `macroSectores`, `microSectores`, `Unidad` |
| `components/inventario/formulario-estacionamiento.tsx` | `unidades`, `tiposUnidad`, `macroSectores`, `microSectores` |

---

### 3. `data/inventario/estacionamientos.ts` — ❌ ELIMINADO (v8)

| Campo | Detalle |
|-------|---------|
| **Estado** | **Eliminado.** El módulo ES fue absorbido por EF: las plazas hoy son unidades `u-E-*` dentro de `estructura.ts` (83 plazas: Superficie 1–20, Subterráneo -1 21–41, Subterráneo -2 42–62, Visitas 63–83). |
| **Impacto en docs** | Los dumps históricos de plazas `es-*` quedaron obsoletos; el patrón vigente es `u-E-{NNN}`. |

---

### 4. `data/comunidad/personas.ts`

| Campo | Detalle |
|-------|---------|
| **Ruta** | `k0mp4ss_fe/apps/web/data/comunidad/personas.ts` |
| **Propósito** | Maestro de identidades del sistema. Cada persona tiene roles y extensiones (laboral, gobernanza, vínculos con unidades). |
| **Líneas** | ~208 |
| **Depende de** | `maestros.ts` → `ESTADOS_OCUPACION`, `estructura.ts` → `unidades`, `estacionamientos` |

#### Interfaces definidas:

| Interface | Campos clave | Propósito |
|-----------|-------------|-----------|
| `VinculoUnidad` | `id`, `unidadId`, `rol`, `fechaInicio`, `fechaFin?`, `estadoOcupacionPropiedad?`, `permiteVerFinanzas` | Relación persona ↔ unidad (mock de tabla join) |
| `ExtensionLaboral` | `id`, `cargo`, `afp`, `prevision`, `fechaIngreso` | Datos de personal contratado |
| `ExtensionGobernanza` | `id`, `cargoDirectiva`, `firmaDigital?`, `fechaAsuncion` | Datos de cargos de directiva |
| `Persona` | `id`, `rut`, `nombreCompleto`, `nombres`, `apellidos`, `email`, `telefonoMovil`, `telefonoFijo?`, `fotografiaUrl?`, `estadoCuenta`, `condicionesEspecialesIds[]`, `roles[]`, `vinculosUnidad?`, `datosLaborales?`, `datosGobernanza?` | La identidad atómica del sistema |

#### Los 10 personajes mockeados:

| ID | Nombre | RUT | Roles | Caso que simula |
|----|--------|-----|-------|----------------|
| `p-1` | Juan Pérez González | 15.123.456-7 | propietario, residente, directiva | **Caso complejo:** vive en su depto, es presidente de la directiva |
| `p-2` | María López Soto | 18.987.654-3 | residente | **Arrendatario vulnerable:** movilidad reducida (`c-2`) |
| `p-3` | Roberto Gómez Bolaños | 12.345.678-9 | propietario | **Inversionista:** 3 propiedades (depto arrendado, depto próxima vacancia, local en venta), no vive en el edificio |
| `p-4` | Ana María Silva | 19.111.222-K | personal, residente | **Personal que vive ahí:** conserje con 2 vulnerabilidades (electrodependiente + adulto mayor solo) |
| `p-5` | Carlos Castillo Ruiz | 13.555.666-8 | personal | **Administrador puro:** no vive en el edificio, solo trabaja |
| `p-6` | Laura Martínez Cárdenas | 14.222.333-4 | propietario, residente, directiva | **Tesorera:** propietaria que vive en su depto |
| `p-7` | Pedro Valdés Orellana | 17.444.555-6 | contratista | **Externo:** mantención de ascensores, sin datos laborales internos |
| `p-8` | Tomás Alarcón | 20.123.987-5 | residente | **Inactivo:** ex-arrendatario con `fechaFin`, mantiene trazabilidad |
| `p-9` | Rosa Meléndez | 11.234.567-0 | personal | **Auxiliar de aseo:** personal estándar con datos laborales |
| `p-10` | Esteban Dido | 16.777.888-7 | residente | **Bloqueado:** moroso extremo, cuenta bloqueada |

> **⚠️ Actualización:** el maestro creció a **54 personas** (`p-1` … `p-54`, incluye empresas SpA) y todos los RUT fueron migrados a DV válido (`scripts/fix-rut-seeds.cjs`). Los RUT de esta tabla histórica pueden diferir; el dump vigente es el código fuente.

#### Consumido por:

| Página/Componente | Qué importa |
|-------------------|-------------|
| `app/comunidad/personas/page.tsx` | `personas`, `Persona` |
| `app/comunidad/personas/[id]/page.tsx` | `personas` |
| `components/comunidad/formulario-persona.tsx` | `Persona` (solo la interface) |

---

### 5. Colecciones del Store — Sesión 1 NSGC (PI / AD / GD)

Estas colecciones **no viven en `data/`**: nacen en `lib/store.ts` con seeds vacíos por diseño (el usuario las puebla desde la UI) y sus esquemas están en `lib/schemas.ts`. Documentadas por estructura/campos según la norma.

#### 5.1 `publicacionesPortal` (PI, store v11)

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | string | Patrón: id de entidad |
| `unidadId` | string | FK a unidades (`u-*`) |
| `operacion` | `"venta" \| "arriendo"` | Trigger desde VU |
| `precio` | number ≥ 0 | |
| `moneda` | `"CLP" \| "UF"?` | |
| `dormitorios`, `banos`, `etiquetaEstado`, `descripcion`, `urlMapa`, `condicionesContractuales` | opcionales | Ficha pública |
| `imagenes` | array referencia | URL/metadatos, jamás base64 (D1) |
| `activa` | boolean | |
| `fechaPublicacion` | ISO date | |

Consumidor: `app/comunidad/portal/page.tsx`. Acciones: `savePublicacionPortal`, `removePublicacionPortal`, `syncPublicacionesDesdeVinculos`.

#### 5.2 `leadsPortal` (PI, store v11)

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | string | |
| `publicacionId` | string | FK a `publicacionesPortal` |
| `nombreContacto`, `contacto` | string | Contacto seguro, no revela datos del dueño |
| `mensaje?` | string | |
| `fecha` | ISO date | |
| `atendido` | boolean | |

Acción: `saveLeadPortal` → dispara `notify()` (D3) al propietario.

#### 5.3 `notificaciones` (D3, transversal, store v11+)

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | string | |
| `destinatarioRol` | `"administracion" \| "propietario" \| "residente" \| "directiva" \| "personal"` | |
| `destinatarioPersonaId?` | string | |
| `asunto`, `cuerpo` | string | |
| `canal` | `"email_simulado"` (literal) | Correo simulado, sin SMTP real |
| `moduloOrigen` | string | PI/AD/GD/... |
| `fecha` | ISO date | |
| `leida` | boolean | |

Acciones: `notify()`, `marcarNotificacionLeida`. Tope: 500 eventos.

#### 5.4 `controlesPropiedades` (AD, store v12)

| Campo | Tipo | Default sin registro |
|-------|------|---------------------|
| `id` | string | |
| `unidadId` | string | FK a unidades |
| `residenteVeMorosidad` | boolean | `false` |
| `residenteVeActas` | boolean | `false` |
| `alertasResidentesActivas` | boolean | `true` |

Consumidor: `app/admin/gestion/page.tsx`; gobierna visibilidad en GD. Acciones: `saveControlPropiedad`, `removeControlPropiedad`.

#### 5.5 `actasGD` (GD, store v13)

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | string | |
| `fecha`, `hora` (HH:MM), `lugar` | | Datos de reunión |
| `tablaTemas` | string[] | |
| `presentes`, `ausentes` | ids personas | Miembros con `datosGobernanza` |
| `invitados` | string[] | Nombres libres |
| `minuta` | string | |
| `adjuntos` | array referencia | D1 |
| `estado` | `"borrador" \| "publicada"` | Publica al quórum 100% |
| `aprobaciones` | ids personas | Firmas de directiva vigente |
| `fechaPublicacion?` | ISO date | |
| `avisoCVReferencia?` | string | `"pendiente"` hasta que CV publica; luego id del aviso |

Consumidor: `app/comunidad/directiva/page.tsx`. Acciones: `saveActaGD`, `removeActaGD`, `aprobarActaGD`.

---

### 6. Store + Seed — Sesión 2 NSGC (CO / GE)

#### 6.0 `data/comunidad/plantillas-co.ts` (seed real de `plantillasCO`, store v14)

| Campo | Detalle |
|-------|---------|
| **Ruta** | `k0mp4ss_fe/apps/web/data/comunidad/plantillas-co.ts` |
| **Propósito** | Las 5 plantillas prefijadas de ejemplo del NSGC (§2), sembradas en `plantillasCO` vía migrate aditivo. |
| **Export** | `plantillasComunicacion: PlantillaCO[]` (5 registros: asamblea/comunidad, corte-agua/urgente, recordatorio-gc/cobranza, ascensores/informacion, bienvenida/onboarding). El cuerpo soporta variables `[Nombre_Usuario]`, `[Nombre_Torre]`, `[Nombre_Comunidad]`. |

Consumido por: `lib/store.ts` (seedData). Dump completo en `36 - MK - Data Dump Comunicación y Solicitudes.md`.

#### 6.1 Colecciones store CO/GE (vacías salvo `plantillasCO`)

| Colección | Store | Contenido | Acciones repository |
|-----------|-------|-----------|---------------------|
| `plantillasCO` | v14 | 5 plantillas seed (arriba); CRUD libre | `savePlantillaCO`, `removePlantillaCO` (bloqueo si envíos la usan) |
| `enviosCO` | v14 | Snapshot inmutable `{personaId, unidadId?}[]` + lecturas[] | `saveEnvioCO` (loop `notify()` + `CO_SEND_MASSIVE`), `registrarLecturaEnvioCO` (idempotente) |
| `mensajesBuzonCO` | v14 | Folio `BUZ-####`, clasificación felicitacion/sugerencia/reclamo, estado recibido→en_gestion→resuelto→cerrado, respuestas[], `visibilidadComite` | `saveMensajeBuzonCO`, `responderMensajeBuzonCO` (auto En Gestión), `cambiarEstadoBuzonCO` (matriz estricta), `removeMensajeBuzonCO` |
| `documentosCO` | v14 | Referencias D1 {nombre, tipoMime, tamanoKB, url, categoria} | `saveDocumentoCO` (rechaza data:/blob:), `removeDocumentoCO`, `registrarDescargaDocCO` |
| `solicitudesGE` | v15 | Folio `GE-####`, tipo insumos/grabaciones/buzon, estado workflow NSGC §1.4, comentarios[], historialEstados[] con timestamps SLA | `saveSolicitudGE`, `abrirSolicitudGE` (auto En Revisión), `responderSolicitudGE`, `resolverSolicitudGE`, `cerrarSolicitudGE`, `removeSolicitudGE` |

Consumidores: `app/comunidad/comunicacion/page.tsx` (CO), `app/operaciones/solicitudes/page.tsx` (GE). Eventos AM: `CO_SEND_MASSIVE`, `CO_TICKET_CREATED/RESPONDIDO/ESTADO`, `CO_DOC_DOWNLOAD`; `GE_TICKET_CREATED/STATE_CHANGE/RESOLVED`.

### 7. Store + Seed — Sesión 3 NSGC (IR / IN / MT)

#### 7.0 `data/finanzas/tipos-infraccion.ts` (seed real de `tiposInfraccionIN`, store v17)

| Campo | Detalle |
|-------|---------|
| **Ruta** | `k0mp4ss_fe/apps/web/data/finanzas/tipos-infraccion.ts` |
| **Propósito** | Faltas de ejemplo al Reglamento de Copropiedad (IN §1) con sanción base monto fijo o % GC, sembradas en `tiposInfraccionIN` vía migrate aditivo. |
| **Export** | `tiposInfraccionSeed: TipoInfraccionIN[]` (5 registros: ruidos-molestos/grave/%GC-50, mascotas/leve/$15.000, basura/leve/$10.000, areas-comunes/grave/$50.000, obras/gravisima/%GC-100). |

Consumido por: `lib/store.ts` (seedData). Dump completo en `37 - MK - Data Dump Recursos, Multas y Mantenimiento.md`.

#### 7.1 Colecciones store IR/IN/MT (vacías salvo `tiposInfraccionIN`)

| Colección | Store | Contenido | Acciones repository |
|-----------|-------|-----------|---------------------|
| `activosIR` | v16 | Código `IR-A-####`, categoria infraestructura/mobiliario/insumo/epp/acceso, ubicación EF (microSectorId/unidadId), stock+umbral crítico, proveedor/factura D1, asignación vigente de accesos | `saveRecursoIR`, `removeRecursoIR` (integridad), `cambiarEstadoRecursoIR` (`IR_ASSET_REPAIR`/baja), `asignarAccesoIR`, `devolverAccesoIR` |
| `solicitudesInsumoIR` | v16 | Folio `SI-####`, quién×qué×área destino, comodín con 3 salidas admin, entrega con descuento de stock | `saveSolicitudInsumoIR` (alerta comodín), `resolverComodinIR` (aprobar_crear/sustituir/rechazar), `entregarSolicitudInsumoIR` (`IR_STOCK_LOW` al cruzar umbral) |
| `entregasEPP` | v16 | Entregas individuales {recursoId, personaId, talla, estado, proximaRenovacion} | `registrarEntregaEPP` (`IR_DELIVERY_EPP`) |
| `tiposInfraccionIN` | v17 | Seed NSGC (arriba); CRUD libre | `saveTipoInfraccionIN`, `removeTipoInfraccionIN` (bloqueo si usada) |
| `infraccionesIN` | v17 | Folio `IN-####`, tipo catálogo XOR daño directo, unidad infractora, evidencias D1, estado en_revision/apelada/aplicada/desestimada, comentariosDirectiva[], respaldosDirectiva[], `cargoFIReferencia` = id del cobro multa_in al aplicar (v21; `"pendiente"` solo legacy) | `saveInfraccionIN` (`IN_REG_EVENT`), `apelarInfraccionIN` (`IN_APELACION`), `respaldarInfraccionIN`, `aplicarInfraccionIN` (grave exige respaldo; `IN_APPLY_FINE`; crea cobro FI), `desestimarInfraccionIN`, `removeInfraccionIN` |
| `trabajosMT` | v18 | Folio `MT-####`, ubicación EF/equipo IR, responsable interno o proveedor, prioridad, costo+origenFondos+estadoPago, garantías, evidencias D1 tipadas, preventivo{periodicidadMeses} | `saveTrabajoMT`, `iniciarTrabajoMT`, `finalizarTrabajoMT` (genera próximo preventivo), `cancelarTrabajoMT`, `actualizarPagoTrabajoMT`, `verificarGarantiasMT` (idempotente), `removeTrabajoMT` |
| `proyectosMT` | v18→v21 | Planes largo plazo {presupuestoEstimado, plazoMeses → cuota sugerida derivable, `fondoFinanciamientoId?`} | `saveProyectoMT` (v21: valida fondo FI activo con saldo ≥ presupuesto), `removeProyectoMT` |

Consumidores: `app/inventario/recursos/page.tsx` (IR), `app/finanzas/multas/page.tsx` (IN), `app/inventario/proyectos/page.tsx` (MT). Eventos AM: `IR_STOCK_LOW/DELIVERY_EPP/ASSET_REPAIR/COMODIN_ALERTA`; `IN_REG_EVENT/APPLY_FINE/APELACION`; `MT_WORK_CREATED/STARTED/FINISHED/PREVENTIVE_GENERATED/GUARANTEE_EXPIRED`.

### 8. Store + Seed — Sesión 4 NSGC (RA / CV)

#### 8.0 `data/comunidad/plantillas-cv.ts` (seed real de `plantillasCV`, store v20)

| Campo | Detalle |
|-------|---------|
| **Ruta** | `k0mp4ss_fe/apps/web/data/comunidad/plantillas-cv.ts` |
| **Propósito** | Las 4 plantillas rápidas de las categorías NSGC (§2: Falla de Servicios, Control de Acceso, Cortes Programados, Habilitación de Áreas), sembradas en `plantillasCV` vía migrate aditivo. |
| **Export** | `plantillasCVSeed: PlantillaCV[]` (4 registros: hidropack/peligro-15s, porton/advertencia-10s, corte/peligro-20s-pantalla-completa, piscina/exito-10s). Multimedia por URL remota (D1); imagen y video excluyentes. |

Consumido por: `lib/store.ts` (seedData). Dump completo en `36 - MK - Data Dump Comunicación y Solicitudes.md`.

#### 8.1 Colecciones store RA/CV (vacías salvo `plantillasCV`)

| Colección | Store | Contenido | Acciones repository |
|-----------|-------|-----------|---------------------|
| `elementosRA` | v19 | Tipo espacio_fisico/activo_mobiliario, ubicación EF (microSectorId) o IR (activoIRId), franja bloques_horas/dia_completo, tarifa ($0 gratis), garantía, aforo/stock, reglas anticipación/tardía+penalización | `saveElementoRA`, `removeElementoRA` (bloqueado con reservas vigentes) |
| `reservasRA` | v19→v21 | Folio `RA-####`, solicitante MP, fecha + tramo HH:MM, snapshots tarifa/garantía, cancelación {tardia, penalizacion}, retención de garantía, `cargoFIReferencia` = id del cobro del fondo amenities (v21; `"pendiente"` solo legacy) | `saveReservaRA` (overbooking por solape con stock concurrente; gate morosidad FI activo desde v21), `cancelarReservaRA` (crea cobro penalización), `retenerGarantiaRA` (crea cobro garantía) |
| `avisosCV` | v20 | Tipología info/exito/advertencia/peligro, duración ≥3s, expiresAt caducidad, imagen URL D1 XOR video YouTube, pantallaCompleta, tags, ciclo borrador/publicado/archivado, origen manual/plantilla/acta_gd | `saveAvisoCV` (`CV_DRAFT_CREATED`/`CV_EDITED`), `removeAvisoCV` (solo borrador), `publicarAvisoCV` (VB), `archivarAvisoCV`, `caducarAvisosCV` (idempotente) |
| `plantillasCV` | v20 | Seed NSGC (arriba); CRUD administración | `savePlantillaCV`, `removePlantillaCV` (bloqueo si avisos la usan), `activarPlantillaCV` (aviso publicado instantáneo) |

Integraciones: `publicarActaEnCV(actaId)` consume `actasGD.avisoCVReferencia === "pendiente"`, crea el aviso origen `acta_gd` y marca la referencia con el id del aviso. Flags de soporte: `permiteCreacionManualCV` (MP) y `cvRequiereVistoBueno` (CF, default true). Consumidores: `app/operaciones/reservas/page.tsx` (RA), `app/comunidad/visor/page.tsx` (panel CV), `app/visor-mensajes/page.tsx` (carrusel público con próximas reservas RA). Eventos AM: `RA_BOOKING_CREATED/CANCELLED/WARRANTY_RETAINED`; `CV_DRAFT_CREATED/PUBLISHED/EDITED/ARCHIVED`.

### 9. Store + Seed — Sesión 5 NSGC (FI)

#### 9.0 Seed inline de `fondosFI` (store v21)

| Campo | Detalle |
|-------|---------|
| **Ubicación** | `lib/store.ts` → constante `FONDOS_FI_SEED` (no hay archivo en `data/`: el maestro es financiero-operativo, no mock de catálogo) |
| **Propósito** | Los 3 fondos base del NSGC sembrados vía migrate aditivo v20→v21 |
| **Registros** | `fondo-gc` (Fondo de Gasto Común, gasto_comun), `fondo-reserva` (Fondo de Reserva, reserva, porcentajeAporte 5), `fondo-amenities` (Fondo de Amenities, amenities) |

Dump completo en `38 - MK - Data Dump Finanzas.md`.

#### 9.1 Colecciones store FI (vacías salvo `fondosFI`)

| Colección | Store | Contenido | Acciones repository |
|-----------|-------|-----------|---------------------|
| `fondosFI` | v21 | Maestro de cajas {nombre, tipo gasto_comun/reserva/especial/amenities, porcentajeAporte? para reserva, activo}; saldo derivable en base caja | `saveFondoFI` (unicidad nombre), `removeFondoFI` (bloqueado con movimientos imputados) |
| `egresosFI` | v21 | Folio `FE-####`, categoría sueldos/mantencion/servicios/administracion/uso_de_fondo/otro, fondo obligatorio, recurrente flag, comprobante D1, microSectoresIds (gastos diferenciados), aprobacionActaGDId (retiros) | `saveEgresoFI` (`FI_EGRESS_CREATED`), `removeEgresoFI`, `retirarFondoFI` (reserva exige acta GD publicada + saldo; `FI_FUND_WITHDRAWN`) |
| `emisionesGC` | v21 | Periodo `AAAA-MM` único, modo snapshot fijo/variable, gastoTotal, líneas {unidadId, responsablePersonaId, monto, cobroId}, fondoReservaAporte {fondoId, monto} | `emitirGastoComun` (gate "CF no cargado", responsable por unidad, prorrateo = round(gastoTotal × coeficiente), aporte % reserva, `FI_EMISION_GC`) |
| `cobrosFI` | v21 | Libro unificado: concepto gc/cuota_extraordinaria/multa_in/consumo/reserva_ra/penalizacion_ra/garantia_ra, origenModulo FI/IN/RA + origenRef, fondo, montoBase, fechaVencimiento desde diaCortePago, moras[] idempotentes por día, pagos[], diferencias[] inmutables | `aplicarMoraFI` (pro-rata, `FI_MORA_APPLIED`), `registrarPagoFI` (`FI_RECEIVE_PAYMENT` + `FI_MANUAL_DISCOUNT` si ajusta), `enviarCobranzaFI` (`FI_COBRANZA_SENT`) |

Integraciones entrantes (patrón inverso): `aplicarInfraccionIN` crea cobro `multa_in` (% GC resuelto contra último GC emitido de la unidad) y materializa `cargoFIReferencia`; `saveProyectoMT` valida `fondoFinanciamientoId` contra fondosFI y saldo ≥ presupuesto; `saveReservaRA`/`cancelarReservaRA`/`retenerGarantiaRA` crean cobros del fondo amenities y materializan `cargoFIReferencia`; gate de morosidad RA activo vía deuda vencida en unidades vinculadas. Helpers puros en `lib/finanzas-utils.ts`. Consumidores: `app/finanzas/gastos-comunes/page.tsx`, `app/finanzas/pagos/page.tsx`. Eventos AM: los listados arriba.

---

### 10. Store + Seed — Sesión 6 NSGC (PE)

#### 10.1 Nuevos seeds en `admin/maestros.ts` (store v22)

| Maestro | ID pattern | Registros | Consumidor |
|---------|-----------|-----------|------------|
| `ASIGNACION_FAMILIAR` → `maestros.asignacionFamiliar` | `asf-<tramo>` | 4 tramos con monto y rango de rentas | Fichas PE (`asignacionFamiliarId`) |
| `JORNADAS` → `maestros.jornadas` | `j-<slug>` | Mañana / Tarde / Noche | Visitas, contratistas, cierre de turno |
| `COURIERS` → `maestros.couriers` | `cour-<slug>` | Chilexpress, Starken, PedidosYa, Uber Flash, Correos Chile, Otro | Encomiendas |
| `CONTRATISTAS` → `maestros.contratistas` | `cont-<slug>` | 4 empresas autorizadas con rubro/teléfono | Ingresos de contratistas |

Cierra el pendiente D3/MA: la colección legal `asignacionFamiliar` ya referenciable por fichas. `removeMaestro` bloquea estos maestros en uso.

#### 10.2 Colecciones store PE (vacías salvo maestros)

| Colección | Store | Contenido | Acciones repository |
|-----------|-------|-----------|---------------------|
| `bitacoraVisitasPE` | v22 | Visitas con jornada FK, pre-agenda o sin aviso, hora sellada al ingresar | `saveBitacoraVisitaPE`, `ingresarBitacoraVisitaPE`, `removeBitacoraVisitaPE` (bloquea ingresadas) |
| `encomiendasPE` | v22 | Courier FK + evidencia D1 + retiro registrado | `saveEncomiendaPE` (`PE_ENCOMIENDA_RECIBIDA`), `registrarRetiroEncomiendaPE`, `removeEncomiendaPE` |
| `ingresosContratistasPE` | v22 | Contratista FK, motivo obligatorio ≥5, agendadoPor residente/admin | `saveIngresoContratistaPE`, `confirmarIngresoContratistaPE`, `removeIngresoContratistaPE` |
| `proveedoresPE` | v22 | RUT validado, nombre único, rubro, activo | `saveProveedorPE` (dedupe), `removeProveedorPE` (bloqueado con historial) |
| `mantencionesPreventivasPE` | v22 | Ciclo {periodicidadMeses, proximaFecha, alertaDiasAntes} | `saveMantencionPE`, `removeMantencionPE` |
| `visitasTecnicasPE` | v22 | Libro inmutable; reprograma la mantención vinculada | `registrarVisitaTecnicaPE` (`PE_VISITA_TECNICA`) |
| `cierresTurnoPE` | v22 | Protocolo anti-negligencia, checklist snapshot por jornada, historialCambios inmutable | `cerrarTurnoPE` (notify admin + copia trabajador), `editarCierreTurnoPE` (`PE_CIERRE_EDITADO`), `removeCierreTurnoPE` (solo día en curso o TEST) |
| `proyeccionesPE` | v22 | Proyección feriados→costos enviada a FI con `liquidacionPLReferencia:"pendiente"` | `enviarProyeccionCostoFI` (`PE_PROYECCION_ENVIADA`) |

Profundización aditiva de `ExtensionLaboralSchema` dentro de `personas` (FKs legales validadas en `savePersona`; evento `PE_FICHA_SAVED`). Helpers puros en `lib/personal-utils.ts`. Consumidores: `/personas/personal`, `/operaciones/bitacora`, `/operaciones/proveedores`. Dump completo en `39 - MK - Data Dump Personal y Servicios.md`.

---

## 🔗 Mapa de Dependencias

```
maestros.ts (RAÍZ - sin dependencias)
    │
    ├──→ estructura.ts (importa: UnidadEtiqueta de maestros)
    │       └──→ [unidades u-* incluidas las plazas u-E-*]
    │
    ├──→ admin/maestros.ts + admin/configuracion.ts (Rank 0, seed dual MA/CF)
    │
    └──→ comunidad/
            ├──→ personas.ts (importa: ESTADOS_OCUPACION de maestros,
            │                 unidades de inventario)
            └──→ vinculos.ts (importa: personas + unidades + estadosInmobiliarios)

lib/store.ts consume TODOS los seeds anteriores y añade las colecciones
PI/AD/GD vacías por diseño (v13) + CO/GE de la Sesión 2 (v14/v15):
plantillasCO (sembrada), enviosCO, mensajesBuzonCO, documentosCO,
solicitudesGE.
```

---

## 🚀 Hoja de Ruta: Migración a Backend Real

Cuando se conecte cada módulo al backend NestJS, este es el orden sugerido:

| Prioridad | Mock a reemplazar | Endpoint esperado | Módulos afectados |
|-----------|-------------------|--------------------|--------------------|
| 🔴 1 | `maestros.ts` + `admin/` | `GET /api/maestros/*`, `GET /api/configuracion` | **TODOS** (transversales) |
| 🟠 2 | `estructura.ts` | `GET /api/inventario/tipos-unidad`, `GET /api/inventario/sectores`, `GET /api/inventario/unidades` | Inventario, Métricas |
| 🟡 3 | `personas.ts` | `GET /api/comunidad/personas` | Maestro Personas, Directorio, AD |
| 🟢 4 | `vinculos.ts` | `GET /api/comunidad/vinculos` | VU, PI (trigger portal) |
| 🟢 5 | Colecciones store PI/AD/GD | `/api/portal/*`, `/api/admin/controles/*`, `/api/directiva/actas` | Portal, Gestión, Directiva |

> **Regla de oro:** Cuando reemplaces un mock, basta con cambiar el `import` en la página/componente por un `fetch` o `useQuery`. Las interfaces (`TipoUnidad`, `Persona`, etc.) ya están definidas y deberían coincidir con el contrato del API.

---

*Última actualización: 25 de Agosto 2026 — Sesión 6 NSGC (seeds maestros legales/operativos PE + colecciones store PE v22)*
*Generado para trazabilidad del proyecto Compass/NSGC*
