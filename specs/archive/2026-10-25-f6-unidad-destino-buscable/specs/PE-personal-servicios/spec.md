## ADDED Requirements

### Requirement: Búsqueda de la Unidad Destino en el padrón completo

El registro de visitas SHALL ofrecer la unidad destino con búsqueda en el servidor: el término SHALL viajar a `GET /api/unidades?q=` y las opciones SHALL salir de esa respuesta.

Cada opción SHALL mostrar etiqueta, número y rol SII. Una unidad con etiqueta `Estacionamiento` MUST NOT ser destino, y la pertenencia SHALL decidirse por la etiqueta, nunca por el prefijo del id.

Sin coincidencias, la pantalla SHALL declararlo y MUST NOT bloquear el registro.

#### Scenario: El término de búsqueda viaja al servidor

- **WHEN** el conserje escribe dos o más caracteres en «Unidad destino»
- **THEN** el término se consulta contra `GET /api/unidades?q=` con el debounce declarado y las opciones ofrecidas salen de la respuesta del servidor, no de la lista ya montada
- **AND** una unidad fuera de las primeras `LIMITE_SELECT` de la comunidad se puede encontrar y elegir

#### Scenario: Unidades homónimas se distinguen por rol SII

- **WHEN** la comunidad tiene varias unidades con el mismo número y etiqueta en torres distintas
- **THEN** cada opción muestra su rol SII y la unidad elegida queda registrada con su id propio

#### Scenario: El estacionamiento no es un destino de visita

- **WHEN** el término de búsqueda coincide con una plaza de estacionamiento y con un departamento
- **THEN** solo se ofrece el departamento, aunque ambos compartan el prefijo `u-E-` en su id

#### Scenario: Sin coincidencias no se bloquea el registro

- **WHEN** la búsqueda no devuelve ninguna unidad
- **THEN** la pantalla declara que no hay coincidencias y el conserje puede registrar la visita igual
