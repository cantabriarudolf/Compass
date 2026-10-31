# RP-roles-permisos (delta del change PE-personal-servicios)

## ADDED Requirements

### Requirement: Matriz de Permisos del Módulo PE
La matriz de permisos MUST definir el acceso al módulo Personal y Servicios por rol:
- **Administrador Maestro / administración**: ver, crear, editar y eliminar fichas de trabajadores, feriados y proyecciones; gestión completa de proveedores, mantenciones preventivas y libro de visitas técnicas; lectura del reporte diario.
- **Conserjería / Seguridad (personal)**: registrar y editar controles de bitácora (visitas, encomiendas, contratistas), iniciar turno y cerrar su propio turno; consulta del directorio de emergencias; sin acceso a datos previsionales ni bancarios de las fichas.
- **Propietario / Residente**: agendar visitas y contratistas hacia su unidad y consultar el directorio de emergencias; sin acceso a la bitácora global ni a fichas laborales.

Cualquier permiso no listado SHALL denegarse conforme a Menor Privilegio, registrando `RP_PERMISSION_DENIED`.

#### Scenario: Conserje cierra su turno pero no ve remuneraciones
- **WHEN** un usuario con rol personal accede a la bitácora e intenta abrir la ficha previsional de un compañero
- **THEN** puede operar la bitácora y el cierre de turno, pero la sección previsional/bancaria le resulta denegada

#### Scenario: Residente agenda visita a su unidad
- **WHEN** un residente agenda una visita o contratista indicando su unidad
- **THEN** la pre-agenda se registra a la espera del ingreso sellado por conserjería, sin exponerle otros registros
