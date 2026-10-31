# RP-roles-permisos (delta del change CT-certificados)

## ADDED Requirements

### Requirement: Matriz de Permisos del Módulo CT
La matriz de permisos MUST definir el acceso a Certificados por rol:
- **Administrador Maestro / administración**: generar cualquier tipología para cualquier unidad/persona; consultar y exportar el historial completo.
- **Propietario / Residente**: solicitar certificado de residencia, estado de cuenta y al día de SU unidad; sin acceso al historial global.
- **Conserjería / Seguridad (personal)**: descargar únicamente sus certificados de liquidación de sueldo confirmados.
- **Directiva / Comité**: lectura del historial de emisión.

Cualquier permiso no listado SHALL denegarse conforme a Menor Privilegio, registrando `RP_PERMISSION_DENIED`.

#### Scenario: Residente solicita solo lo suyo
- **WHEN** un residente solicita un certificado Al Día
- **THEN** solo puede seleccionar unidades donde mantiene vínculo vigente

#### Scenario: Trabajador descarga su liquidación certificada
- **WHEN** un trabajador accede a Certificados tras el cierre del mes
- **THEN** puede descargar el PDF firmado de su liquidación confirmada, sin ver documentos de terceros
