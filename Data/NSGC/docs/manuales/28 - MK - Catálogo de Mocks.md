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
│   └── vinculos.ts                ← Vínculos persona ↔ unidad (VU)
└── inventario/
    └── estructura.ts              ← Tipos de unidad, sectores y unidades (incluye plazas u-E-*)
```

> **⚠️ Desde ST**, casi todo vive en el store `compass-store` (`lib/store.ts`) con migraciones versionadas. Las colecciones PI/AD/GD (Sesión 1 NSGC) nacen **vacías por diseño** dentro del store — ver sección 5.

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
| `avisoCVReferencia?` | `"pendiente"` (literal) | Hasta que exista CV |

Consumidor: `app/comunidad/directiva/page.tsx`. Acciones: `saveActaGD`, `removeActaGD`, `aprobarActaGD`.

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
PI/AD/GD vacías por diseño: publicacionesPortal, leadsPortal,
notificaciones, controlesPropiedades, actasGD (store v13).
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

*Última actualización: 25 de Agosto 2026 — Sesión 1 NSGC (colecciones store PI/AD/GD, ES eliminado/absorbido en EF)*
*Generado para trazabilidad del proyecto Compass/NSGC*
