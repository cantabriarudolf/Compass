# RP-roles-permisos (delta del change PL-liquidaciones-remuneraciones)

## ADDED Requirements

### Requirement: Matriz de Permisos del Módulo PL
La matriz de permisos MUST definir el acceso a Liquidaciones y Remuneraciones por rol:
- **Administrador Maestro / administración**: ver, crear, confirmar y eliminar liquidaciones; registrar adelantos; editar parámetros legales CF; generar el PDF oficial.
- **Conserjería / Seguridad (personal)**: consultar sus propios documentos remuneratorios emitidos (PDF de su liquidación); sin acceso a liquidaciones de terceros ni a parámetros legales.
- **Propietario / Residente**: sin acceso al módulo.

Cualquier permiso no listado SHALL denegarse conforme a Menor Privilegio, registrando `RP_PERMISSION_DENIED`.

#### Scenario: Trabajador consulta su liquidación
- **WHEN** un usuario con rol personal accede a Remuneraciones
- **THEN** puede descargar únicamente sus propias liquidaciones confirmadas

#### Scenario: Rol sin permiso intenta editar parámetros legales
- **WHEN** un rol distinto de administración intenta cambiar `ufMensual`
- **THEN** la edición queda bloqueada según RP
