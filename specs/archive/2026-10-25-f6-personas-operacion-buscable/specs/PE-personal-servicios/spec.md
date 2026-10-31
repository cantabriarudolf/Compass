## ADDED Requirements

### Requirement: Identificación de personas en la operación de conserjería

La bitácora digital SHALL resolver la identidad de una persona contra el padrón de su comunidad desde el servidor, tanto al leer el RUN de una cédula como al elegir un residente destino, para lo cual SHALL usar una proyección de solo lectura con el permiso de la bitácora.

La proyección SHALL devolver únicamente identidad (`id`, `rut`, `nombreCompleto`) de la comunidad de la sesión. MUST NOT exponer email, teléfono, fecha de nacimiento ni datos previsionales, y MUST NOT permitir escrituras.

La consulta por RUN SHALL aceptar el documento con o sin puntos y comparar contra sus formas canónicas; un RUN inválido SHALL rechazarse sin consultar el padrón. La consulta de texto SHALL filtrar por nombre y por RUT.

Si el servidor no responde, el registro de la visita MUST NOT bloquearse: la pantalla SHALL declararlo y caer al padrón local.

#### Scenario: El RUN leído de la cédula se resuelve contra el padrón real

- **WHEN** el conserje escanea el QR de una cédula o escribe el RUT a mano
- **THEN** el nombre se resuelve contra el padrón de la comunidad en el servidor y queda a la espera de la confirmación explícita del conserje

#### Scenario: RUN con puntos y sin puntos

- **WHEN** el mismo documento se busca como `15.123.456-9` o como `15123456-9`
- **THEN** ambas consultas devuelven la misma persona

#### Scenario: Un RUN inválido no consulta el padrón

- **WHEN** el RUT no pasa la validación del dígito verificador
- **THEN** la ruta responde 400 y la pantalla lo informa sin consultar la base

#### Scenario: El residente destino se busca en el servidor

- **WHEN** el conserje escribe dos o más caracteres en «Residente destino»
- **THEN** las opciones salen del servidor sobre todo el padrón de la comunidad, sin el recorte de cien que aplicaba el store

#### Scenario: Un rol sin la bitácora no ve el padrón

- **WHEN** un rol distinto de conserjería, mantención o administración consulta la proyección
- **THEN** la ruta responde 403 sin devolver datos de personas

#### Scenario: Una referencia del servidor no se rechaza al guardar

- **WHEN** el conserje registra una visita con una unidad o una persona que el padrón del cliente no tiene, porque se creó después
- **THEN** la visita se guarda igual, con el id que devolvió el servidor
