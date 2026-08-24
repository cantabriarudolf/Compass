# MA-maestros-administrativos Specification

## Purpose
Gestionar las tablas de referencia (maestros) que alimentan la lógica de los demás módulos: etiquetas de estructura e inventario, estados de ocupación, parámetros de personas, finanzas e insumos. Fuente de verdad: `Data/NSGC/docs/especificaciones/MA - Maestros Administrativos.md`.

## Requirements

### Requirement: Colecciones en la capa de datos (ST)
Todos los maestros administrables por este módulo SHALL vivir en `MaestroCollections` del store global, sembrados desde `apps/web/data/`, y SHALL gestionarse exclusivamente con `saveMaestro`/`removeMaestro`.

#### Scenario: Colección nueva en el store
- **WHEN** el módulo MA incorpora un maestro nuevo
- **THEN** la colección se declara en `MaestroCollections` con su seed en `data/`
- **AND** si el estado persistido de versiones anteriores no la incluye, `STORE_VERSION` sube y `migrate` la inyecta desde el seed

### Requirement: Categorías de Estructura e Inventario
El sistema SHALL administrar en `/admin/maestros` las categorías de estructura e inventario:
- **Categorías Macro Sectores** (`categoriasMacro`): Torre, Manzana, Etapa, etc. — definen los tipos de Macro-Sectores que alimentan EF al crear macro-sectores.
- **Categorías Micro Sectores** (`categoriasMicro`): Piso, Nivel, Pasaje, etc. — definen los tipos de Micro-Sectores que alimentan EF al crear micro-sectores.
- **Categorías de Unidad** (`categoriasUnidad`): Depto, Casa, Local, Oficina, Bodega, Estacionamiento — alimentan el campo Categoría de TU y la etiqueta de las unidades en EF.
- **Estados de Ocupación** (`estadosOcupacion`): con badge de color canónico y `hex` derivado para la dona de distribución.
- **Ubicaciones de Estacionamiento** (`ubicacionesEstacionamiento`): deprecado en v8 — absorbido como microsectores `est-*` en EF (ver `ST-capa-datos-persistente`). No crear esta colección en implementaciones nuevas.
- **Estados Inmobiliarios** (`estadosInmobiliarios`): Habitada, Próxima Vacancia, En Arriendo, Arrendada, En Venta — alimentan el campo **Estado Ocupación Propiedad** del módulo VU.

#### Scenario: Categoría de unidad consumida por TU
- **WHEN** el admin crea una categoría de unidad nueva en MA
- **THEN** aparece en el selector de Categoría del formulario de Tipos de Unidad (TU) y en las vistas de Estructura Física (EF) sin cambios de código

#### Scenario: Categorías definen tipos, no sectores reales
- **WHEN** se crea una categoría en MA
- **THEN** NO se crean sectores ni unidades reales: la categoría define un tipo de sector, y el sector concreto se crea en EF usando esa categoría

### Requirement: Selección de Badge Visual con paleta canónica
Los maestros con color visual (Estados de Ocupación, Estados Inmobiliarios, Condiciones Especiales) SHALL ofrecer la paleta canónica `BADGE_OPTIONS` mediante un selector de muestra visual. NO SHALL permitir escribir clases Tailwind manualmente, y los valores legacy SHALL normalizarse con `normalizeBadgeColor`.

#### Scenario: Selector de paleta
- **WHEN** el admin crea un estado de ocupación con color
- **THEN** el selector MUST mostrar la paleta `BADGE_OPTIONS` con preview visual
- **AND** el valor guardado MUST ser un id de la paleta, no una clase Tailwind libre

### Requirement: Gestión con patrón repository
Las páginas SHALL mutar los maestros únicamente mediante `saveMaestro(key, item)` y `removeMaestro(key, id)` del store. NO SHALL existir listas hardcodeadas de opciones en la UI de módulos consumidores.

#### Scenario: Select alimentado desde el store
- **WHEN** un formulario de otro módulo muestra opciones de un maestro (categorías, estados, condiciones)
- **THEN** las opciones se leen de `maestros.*` del store

### Requirement: Integración con Auditoría y Métricas (AM)
Todo cambio sobre un maestro de referencia SHALL quedar trazado, ya que impacta la lógica de múltiples módulos.

#### Scenario: Eventos de maestro
- **WHEN** el admin crea, edita o elimina un registro de maestro
- **THEN** el sistema MUST emitir los eventos `MA_MAESTRO_CREATE`, `MA_MAESTRO_UPDATE`, `MA_MAESTRO_DELETE`
