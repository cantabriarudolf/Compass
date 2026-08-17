# 🧪 MK - Catálogo de Mocks

> Documento de trazabilidad para saber **qué datos mockeados existen**, **dónde viven**, **qué contienen** y **quién los consume**.
> Cuando un módulo se conecte a backend real, este documento sirve de checklist para saber qué reemplazar.

---

## 📍 Ubicación Base

Todos los mocks viven en:
```
k0mp4ss_fe/apps/web/data/
├── maestros.ts                    ← Parámetros globales del sistema
├── comunidad/
│   └── personas.ts                ← Maestro de Personas (identidades + roles)
└── inventario/
    ├── estructura.ts              ← Tipos de unidad, sectores, unidades
    └── estacionamientos.ts        ← Plazas de estacionamiento + historial
```

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

### 3. `data/inventario/estacionamientos.ts`

| Campo | Detalle |
|-------|---------|
| **Ruta** | `k0mp4ss_fe/apps/web/data/inventario/estacionamientos.ts` |
| **Propósito** | 100 plazas de estacionamiento con asignación a unidades y historial de rotación. |
| **Líneas** | ~85 |
| **Depende de** | `estructura.ts` → importa `unidades` para vincular plazas a deptos |

#### Interfaces definidas:

| Interface | Campos clave |
|-----------|-------------|
| `AsignacionHistorica` | `id`, `unidadId`, `fechaInicio`, `fechaFin?`, `asignadoA` |
| `Estacionamiento` | `id`, `numero`, `ubicacion`, `metraje`, `prorrateo`, `unidadId?`, `macroSectorId?`, `asignadoA?`, `estadoId`, `historial[]` |

#### Contenido exportado:

| Export | Cantidad | Cómo se genera |
|--------|----------|----------------|
| `estacionamientos` | 100 registros | **Generados algorítmicamente** con `Array.from({ length: 100 })` |

#### Lógica de generación:

| Rango | Comportamiento | Propósito del mock |
|-------|---------------|-------------------|
| Plaza 1 | Historial con 3 rotaciones (Constructora → Ex-Dueño → Local Ancla) | Simular caso de alta rotación |
| Plazas 15 y 30 | Historial con 1 dueño anterior + actual | Caso de rotación moderada |
| Plazas 2-8 | Asignadas a locales comerciales | Estacionamientos de clientes/empleados |
| Plazas 9-88 | Asignadas a unidades residenciales (en orden) | Ocupación estándar |
| Plazas 89-100 | Sin asignar (`Disponible`) | Pool de plazas libres |

#### Consumido por:

| Página/Componente | Qué importa |
|-------------------|-------------|
| `app/admin/metricas/page.tsx` | `estacionamientos` |
| `app/inventario/estacionamientos/page.tsx` | `estacionamientos`, `Estacionamiento`, `AsignacionHistorica` |
| `components/inventario/formulario-estacionamiento.tsx` | `Estacionamiento` (solo la interface) |

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
| `p-10` | Esteban Dido | 16.777.888-9 | residente | **Bloqueado:** moroso extremo, cuenta bloqueada |

#### Consumido por:

| Página/Componente | Qué importa |
|-------------------|-------------|
| `app/comunidad/personas/page.tsx` | `personas`, `Persona` |
| `app/comunidad/personas/[id]/page.tsx` | `personas` |
| `components/comunidad/formulario-persona.tsx` | `Persona` (solo la interface) |

---

## 🔗 Mapa de Dependencias

```
maestros.ts (RAÍZ - sin dependencias)
    │
    ├──→ estructura.ts (importa: UnidadEtiqueta de maestros)
    │       │
    │       ├──→ estacionamientos.ts (importa: unidades de estructura)
    │       │
    │       └──→ personas.ts (importa: ESTADOS_OCUPACION de maestros,
    │                                   unidades y estacionamientos de inventario)
    │
    └──→ [Prácticamente TODA la app importa maestros.ts]
```

---

## 🚀 Hoja de Ruta: Migración a Backend Real

Cuando se conecte cada módulo al backend NestJS, este es el orden sugerido:

| Prioridad | Mock a reemplazar | Endpoint esperado | Módulos afectados |
|-----------|-------------------|--------------------|--------------------|
| 🔴 1 | `maestros.ts` | `GET /api/maestros/*` | **TODOS** (es transversal) |
| 🟠 2 | `estructura.ts` | `GET /api/inventario/tipos-unidad`, `GET /api/inventario/sectores`, `GET /api/inventario/unidades` | Inventario, Métricas, Estacionamientos |
| 🟡 3 | `estacionamientos.ts` | `GET /api/inventario/estacionamientos` | Estacionamientos, Métricas |
| 🟢 4 | `personas.ts` | `GET /api/comunidad/personas` | Maestro Personas, Directorio |

> **Regla de oro:** Cuando reemplaces un mock, basta con cambiar el `import` en la página/componente por un `fetch` o `useQuery`. Las interfaces (`TipoUnidad`, `Persona`, etc.) ya están definidas y deberían coincidir con el contrato del API.

---

*Última actualización: 09 de Mayo 2026*
*Generado para trazabilidad del proyecto Compass/NSGC*
