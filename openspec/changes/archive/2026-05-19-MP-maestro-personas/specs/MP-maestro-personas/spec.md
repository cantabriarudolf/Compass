## ADDED Requirements

### Requirement: CRUD de Identidad Única
El sistema SHALL permitir registrar a una persona utilizando su RUT como identificador único para evitar la duplicidad de registros civiles en el ecosistema.

#### Scenario: Registro exitoso
- **WHEN** el administrador ingresa un RUT nuevo junto con nombre, teléfono y correo
- **THEN** la persona se crea y queda disponible para asignarle roles

#### Scenario: Prevención de duplicados
- **WHEN** el administrador intenta crear una persona con un RUT ya existente en la base de datos
- **THEN** el sistema alerta que la persona ya existe y ofrece redirigir a su ficha actual

### Requirement: Habilitación dinámica de extensiones
El sistema SHALL mostrar u ocultar paneles de información específica (ej. Datos Laborales, Gobernanza) en la ficha de la persona basándose en los roles vinculados a su identidad.

#### Scenario: Visualización de empleado
- **WHEN** el administrador abre la ficha de una persona con el rol `Personal`
- **THEN** se renderiza la pestaña de "Datos Laborales" (AFP, Previsión)

#### Scenario: Visualización de copropietario puro
- **WHEN** el administrador abre la ficha de una persona que solo tiene el rol `Propietario`
- **THEN** la pestaña de "Datos Laborales" no es visible

### Requirement: Etiquetado de vulnerabilidad
El sistema SHALL permitir asignar múltiples "Condiciones Especiales" (ej. Electrodependiente) a una persona, leyendo las opciones desde el Maestro Administrativo.

#### Scenario: Asignación de condición
- **WHEN** el administrador edita la ficha de un residente y le asigna "Movilidad Reducida"
- **THEN** la etiqueta se guarda en el perfil central del residente

### Requirement: Alerta visual en listados
El sistema SHALL renderizar un indicador de alerta visual en las grillas de datos si la persona posee alguna condición especial.

#### Scenario: Visualización rápida en tabla
- **WHEN** el administrador consulta el listado general de residentes
- **THEN** el residente con vulnerabilidades muestra un icono de alerta (⚠️ o ♿) junto a su nombre

### Requirement: Control de visibilidad financiera por el propietario
El sistema SHALL incluir un control de consentimiento que permita al `Propietario` decidir si el `Residente` actual tiene permiso para visualizar actas y reportes de gastos comunes.

#### Scenario: Ocultamiento por defecto
- **WHEN** un residente (sin rol de propietario) intenta acceder al reporte financiero detallado y el consentimiento está en `false`
- **THEN** el sistema bloquea el acceso y muestra un mensaje de restricción

#### Scenario: Acceso otorgado
- **WHEN** el propietario activa la opción "Permitir acceso a actas y reportes financieros al residente"
- **THEN** el residente puede visualizar dichos reportes

### Requirement: Cambio de estado habitacional
El sistema SHALL permitir al propietario definir la situación de ocupación de su unidad (Habitada, En Arriendo, En Venta) para nutrir al Portal Inmobiliario.

#### Scenario: Marcado de próxima vacancia
- **WHEN** el propietario marca su unidad con el estado "Disponibilidad Próxima"
- **THEN** el sistema registra el estado y lo disponibiliza para que el Portal Inmobiliario lo liste como "Próximamente Disponible"

### Requirement: Trazabilidad de accesos
El sistema SHALL registrar en el módulo de Auditoría (AM) un log cada vez que se cree, modifique o visualice la ficha de una persona, garantizando la trazabilidad.

#### Scenario: Log de visualización
- **WHEN** un conserje abre la ficha detallada de un residente
- **THEN** se dispara un evento `MP_VIEW_FICHA` al módulo de métricas con el ID del usuario y la fecha
