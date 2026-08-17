## Purpose

Reglas transversales de cumplimiento obligatorio para cualquier desarrollo, modificación de módulos o documentación del proyecto SGC: trazabilidad universal con AM, estándares de documentación, plantilla de especificación y consistencia de datos y UX.

## ADDED Requirements

### Requirement: Trazabilidad universal con AM
Toda funcionalidad que implique una acción de usuario o un proceso automático SHALL estar vinculada al módulo AM - Auditoría y Métricas, con un evento identificable, data cuantificable e inmutabilidad de registros.

#### Scenario: Nueva funcionalidad sin vínculo a AM
- **WHEN** se desarrolla o documenta una funcionalidad que no define su evento, métrica o data cuantificable en AM
- **THEN** la funcionalidad se considera incumplida y debe corregirse antes de darse por terminada.

#### Scenario: Registro de acción eliminado
- **WHEN** se intenta eliminar un registro de acción auditada
- **THEN** la eliminación es rechazada, ya que ningún registro de acción puede ser eliminado.

### Requirement: Estándares de documentación
Toda especificación del proyecto SHALL cumplir el formato `AA - Herramienta.md`, estar escrita en español chileno, mantener actualizado `00-index.md`, incluir como última sección "Integración con Auditoría y Métricas", titularse `# AA - Nombre del Módulo` y usar numeración correlativa de secciones sin saltos ni duplicados.

#### Scenario: Documento fuera de estándar
- **WHEN** se crea o modifica una especificación que no sigue el formato, idioma, título o numeración requeridos, o que omite la sección final de AM
- **THEN** el documento debe corregirse para cumplir el estándar antes de integrarse.

### Requirement: Plantilla estándar de especificación (Prisma)
Toda spec nueva o existente SHALL cumplir la estructura Prisma en orden: contexto, funcionalidades principales, reglas de negocio y la sección final "Integración con Auditoría y Métricas (AM)" con los sub-bullets Evento, Data Cuantificable y Métrica.

#### Scenario: Spec sin sección AM completa
- **WHEN** una spec incluye la sección AM sin alguno de los sub-bullets (Evento, Data Cuantificable, Métrica)
- **THEN** la spec se considera incompleta y debe completarse antes de aceptarse.

### Requirement: Claridad visual en formularios
Todo formulario o ingreso de datos del sistema SHALL marcar visualmente los campos obligatorios (por ejemplo, asterisco rojo `*`) y validarlos en tiempo real.

#### Scenario: Formulario con obligatorios sin marcar
- **WHEN** un formulario presenta campos obligatorios sin indicación visual
- **THEN** el formulario debe ajustarse para marcar los obligatorios y validarlos en tiempo real.

### Requirement: Jerarquía de unidades
Toda unidad SHALL depender de un Tipo de Unidad (maestro TU); no se permiten unidades sin tipo asociado.

#### Scenario: Unidad sin tipo de unidad
- **WHEN** se intenta crear o guardar una unidad sin Tipo de Unidad asociado
- **THEN** la operación es rechazada hasta que se asigne un Tipo de Unidad válido.

### Requirement: Validación de configuraciones críticas
Las configuraciones críticas (SMTP, cálculos de gastos comunes) SHALL requerir confirmación del usuario antes de ser guardadas.

#### Scenario: Guardado de configuración crítica sin confirmación
- **WHEN** el usuario guarda una configuración crítica sin confirmar
- **THEN** el sistema solicita la confirmación antes de persistir el cambio.

### Requirement: Capa de datos persistente (ST)
Todo dato del dominio SHALL vivir en el store global `apps/web/lib/store.ts` (Zustand + persist, key `compass-store`). Las páginas y componentes NO SHALL importar entidades desde `apps/web/data/` (los mocks son solo el seed del store) ni usar `useState` local para datos de dominio: leen con `useCompassStore` y mutan solo mediante las acciones CRUD del store (`saveX`/`removeX`, que devuelven `StoreResult` y validan integridad). Toda entidad nueva de un módulo SHALL incorporarse al estado ST con sus acciones y validaciones al eliminar.

#### Scenario: Página que lee mocks directamente
- **WHEN** una página o componente importa entidades desde `apps/web/data/` en lugar del store
- **THEN** la implementación se considera fuera de regla y debe migrar a lecturas del store.

#### Scenario: Estado de dominio en useState local
- **WHEN** una página mantiene datos de dominio en `useState` local
- **THEN** la implementación debe migrar a `useCompassStore` con acciones CRUD del store.

#### Scenario: Entidad nueva sin acciones en el store
- **WHEN** se incorpora una entidad nueva de un módulo
- **THEN** la entidad se agrega al estado ST con sus acciones CRUD y validaciones de integridad al eliminar.
