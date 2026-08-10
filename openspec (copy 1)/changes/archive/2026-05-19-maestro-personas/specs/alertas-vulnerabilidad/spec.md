## ADDED Requirements

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
