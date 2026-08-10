## ADDED Requirements

### Requirement: CRUD de Identidad Única
El sistema SHALL permitir registrar a una persona utilizando su RUT como identificador único para evitar la duplicidad de registros civiles en el ecosistema.

#### Scenario: Registro exitoso
- **WHEN** el administrador ingresa un RUT nuevo junto con nombre, teléfono y correo
- **THEN** la persona se crea y queda disponible para asignarle roles

#### Scenario: Prevención de duplicados
- **WHEN** el administrador intenta crear una persona con un RUT ya existente en la base de datos
- **THEN** el sistema alerta que la persona ya existe y ofrece redirigir a su ficha actual
