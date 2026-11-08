# AD-gestion-administrativa Specification

## Purpose
Centralizar el panel de administración: perfiles comunitarios, controles de privacidad/comunicación por unidad, gobernanza con firma digitalizada y acceso de lectura al personal (RRHH). Fuente de verdad: `Data/NSGC/docs/especificaciones/AD - Gestión Administrativa.md`.

## Requirements

### Requirement: Perfiles de Identidad Comunitarios
El panel del administrador SHALL presentar los perfiles de propietarios, residentes y directiva a partir de `personas` y sus vínculos (VU), mostrando nombre, apellidos, RUT, teléfono, email y fotografía. La fotografía SHALL manejarse por referencia (metadatos + URL) conforme a ST; el panel NO SHALL duplicar datos de identidad fuera del store.

#### Scenario: Agrupación por rol comunitario
- **WHEN** la administración abre el Cajón de Comunidad
- **THEN** ve las personas agrupadas según su rol en `personas.roles` y sus vínculos vigentes (propietario, arrendatario/residente, directiva vía `datosGobernanza`)

#### Scenario: Fotografía por referencia (D1)
- **WHEN** se guarda o edita la fotografía de un perfil
- **THEN** se persiste solo como URL/referencia con metadatos, nunca base64/Blob

### Requirement: Controles de Privacidad y Comunicación del Propietario
El sistema MUST mantener una colección `controlesPropiedad` por unidad con el único flag de privacidad vivo, `residenteVeActas`, editable por el propietario de la unidad y por administración mediante `saveControlPropiedad` (validando FK a `unidades` y retornando `StoreResult`). Por defecto el flag de visibilidad está desactivado. Todo cambio emite el evento AM `AD_OWNER_CONFIG_CHANGE`. Los flags `residenteVeMorosidad` y `alertasResidentesActivas` se retiraron de la superficie el 2026-11-07 porque ninguna ruta los obedecía: dejan de aceptarse en el contrato de escritura (`ControlPropiedadSchema` y la lista blanca de `app/api/controles-propiedad`), desaparecen de `/admin/gestion` y de `REGLAS_ABAC`, y sus columnas persisten en la base marcadas `@deprecated` hasta una migración con datos que las elimine; al crear un control el servidor las escribe con su valor histórico (`false` / `true`), nunca con lo que mande el cliente.

#### Scenario: Notificar a Residentes
- **WHEN** el propietario activa "Notificar a Residentes" para su unidad
- **THEN** `residenteVeActas` se persiste en `controlesPropiedad`
- **AND** GD consulta ese flag antes de mostrar actas al residente; la morosidad ya no tiene control por unidad porque `residenteVeMorosidad` se retiró el 2026-11-07 (ninguna ruta la leía)

#### Scenario: Gestión de Alertas Residentes
- **WHEN** el propietario busca silenciar "Gestión de Alertas Residentes" (visitas, encomiendas, reservas) en `/admin/gestion`
- **THEN** no encuentra ese control —se retiró el 2026-11-07— y `notify()` no consulta ninguna bandera de alertas por unidad para decidir si notifica al residente
- **AND** la columna `alertasResidentesActivas` permanece `@deprecated` en `controlesPropiedad` como valor histórico, fuera del contrato de escritura y de toda lectura

#### Scenario: Cambio auditado
- **WHEN** cualquier flag cambia
- **THEN** AM registra `AD_OWNER_CONFIG_CHANGE` con el estado anterior y nuevo

### Requirement: Directiva y Firma Digitalizada
El panel SHALL administrar los miembros de la directiva con cargo (`presidente|tesorero|secretario|director` vía `datosGobernanza`) y firma digitalizada cargada como referencia (URL/metadata, sin payload binario). Cada carga o reemplazo de firma emite `AD_DIRECTIVA_SIGN_UPLOAD`. La firma queda disponible para la aprobación formal de actas de GD. La ficha `datosGobernanza` SHALL declarar además, de forma opcional, el `periodoId` del período de directiva al que pertenece el miembro y `fechaTermino`/`motivoTermino` (`renuncia|remocion|fin_periodo`) para dejar constancia del término del cargo. Al guardar una persona con rol `directiva` cuya ficha no declara `periodoId`, `savePersona` SHALL heredar automáticamente el `periodoId` del período vigente registrado. El perfil de la persona SHALL ofrecer la administración de esa ficha: un diálogo de alta/edición con cargo (enum), fecha de asunción (ISO) y firma digitalizada opcional por URL, validado con `ExtensionGobernanzaSchema` y con id estable `g-<personaId>` al crear. Si un guardado deja la fila persistida con `roles` sin `directiva` cuando esa fila conservaba `datosGobernanza` —o el payload porta una ficha—, la ficha SHALL depurarse para no dejar miembros fantasma en el quórum y SHALL emitirse el evento `AD_DIRECTIVA_DESVINCULADA`. La decisión de poda SHALL tomarse contra el estado persistido (los roles resultantes del merge), no contra la mera presencia de la clave `datosGobernanza` en el payload, de modo que un `PUT` o `POST` que **omite la ficha** también la depure. Esa poda y su emisión SHALL ocurrir en **todos** los caminos de escritura de la API que la UI usa (`POST`/`PUT /api/personas`), además del store legacy `savePersona`, y el evento SHALL registrarse solo cuando la poda quedó persistida, a lo sumo una vez por request.

#### Scenario: Carga de firma por referencia (D1)
- **WHEN** un miembro de la directiva (o administración) sube su firma digitalizada
- **THEN** `datosGobernanza.firmaDigital` guarda solo la URL/referencia de la imagen
- **AND** AM registra `AD_DIRECTIVA_SIGN_UPLOAD`

#### Scenario: Intento de firma embebida rechazado
- **WHEN** una acción recibe la firma como data-URL/base64
- **THEN** retorna `{ok:false}` con error D1 y no muta el estado

#### Scenario: Ficha de directiva hereda el período vigente
- **WHEN** `savePersona` recibe una persona con rol `directiva` y `datosGobernanza` sin `periodoId`, existiendo un período de directiva vigente
- **THEN** la ficha persistida guarda el `periodoId` de ese período vigente sin alterar su cargo ni su firma

#### Scenario: Ficha de gobernanza editable desde el perfil
- **WHEN** la administración abre la pestaña Gobernanza del perfil de una persona con rol `directiva`
- **THEN** ve la ficha vigente (cargo, fecha de asunción, firma digitalizada) con acción de edición, o un estado vacío con acción para registrar la ficha
- **AND** ambas acciones abren un diálogo que persiste `cargoDirectiva` del enum, `fechaAsuncion` en ISO y `firmaDigital` opcional por URL, validado con `ExtensionGobernanzaSchema`
- **AND** al crear, la ficha toma el id estable `g-<personaId>`

#### Scenario: Ficha sin rol directiva se depura y audita
- **WHEN** un camino de escritura (`savePersona` del store legacy o `POST`/`PUT /api/personas`) deja a una persona con `roles` sin `directiva` cuando su fila persistida tenía `datosGobernanza` —aunque el payload omita esa clave o porte la ficha—
- **THEN** la persona persistida queda sin `datosGobernanza`, de modo que no cuenta para el quórum de la directiva vigente
- **AND** AM registra `AD_DIRECTIVA_DESVINCULADA` referenciando a esa persona

#### Scenario: Rol directiva sin ficha queda como ficha pendiente
- **WHEN** `savePersona` recibe una persona con rol `directiva` y sin `datosGobernanza`
- **THEN** el guardado se acepta y la persona no cuenta para el quórum hasta registrar su ficha

### Requirement: Acceso Centralizado al Personal (RRHH)
El panel SHALL ofrecer un Cajón de Recursos Humanos que liste las fichas de trabajadores desde `personas.datosLaborales` (conserjes, aseoo, seguridad, mantención). Es un acceso de lectura centralizado: los requerimientos contractuales y previsionales detallados pertenecen a PE y NO SHALL duplicarse aquí.

#### Scenario: Listado de personal
- **WHEN** la administración abre el Cajón de Recursos Humanos
- **THEN** ve las personas con extensión laboral vigente agrupadas por función, leyendo exclusivamente del store

### Requirement: Integración con Auditoría y Métricas (AM)
El módulo SHALL emitir `AD_OWNER_CONFIG_CHANGE` y `AD_DIRECTIVA_SIGN_UPLOAD` como eventos inmutables con data cuantificable (número de propietarios que comparten información, firmas subidas). El archivo de documentos SHALL emitir además `AD_DOC_APERTURA` cada vez que se abre un documento autorizado: la lectura del archivo es un acto auditable, y al retirarse la Biblioteca de CO su evento `CO_DOC_DOWNLOAD` no puede quedar como el único testigo de que alguien miró un papel.

#### Scenario: Métrica de rotación de cargos
- **WHEN** la reportería consulta gobernanza
- **THEN** puede derivar rotación de cargos de directiva a partir de `datosGobernanza.fechaAsuncion` y los eventos AM

### Requirement: Switch de privacidad con reflejo inmediato
El switch de morosidad es controlado por la lista SWR y la revalidación
tarda segundos bajo carga dev (el assert a 600ms fallaba). SHALL aplicar
override optimista local al instante, esperar la revalidación tras el PUT y
conciliar después (igual que proyectos/reservas con `mutateGlobal`).

#### Scenario: Toggle flippea y persiste
- **WHEN** se clickea el switch y se recarga
- **THEN** `aria-checked` cambia al instante y persiste tras reload.

### Requirement: Archivo de Documentos de la Comunidad
El sistema MUST conservar y poner a disposición el archivo de la comunidad en una sola entidad `Documento` con dos naturalezas: `legal` y `comunitario` (Ley 21.442 art. 9). Cada documento SHALL declarar `comunidadId`, `naturaleza`, `tipoDocumental` de una lista cerrada (reglamento de copropiedad y sus modificaciones, actas de asamblea, actas de comité, Registro de Copropietarios, permiso de edificación y planos, certificado de copropiedad y plano, proveedores y subcontratistas, carpeta de ascensores, manuales de instalaciones, plan de emergencia, pólizas de seguro, contabilidad y rendiciones, más `otros` para lo comunitario), `glosa`, la referencia del archivo (nombre, tipo MIME, tamañoKB y URL — media por referencia, jamás base64/Blob), `version`, `vigenteDesde` como fecha calendario AAAA-MM-DD, `hash` SHA-256 opcional, `subidoPorPersonaId` y `createdAt`. La `version` la asigna el servidor dentro de (comunidad, tipo documental) y el cliente NO SHALL enviarla. Los documentos `legal` son append-only: exigen `referenciaAutentica` (fojas, fecha, notaría o Conservador) y su PUT o DELETE responde 409, porque la corrección es una versión nueva. Los `comunitario` SHALL poder reemplazarse y borrarse. Rutas `GET`/`POST /api/documentos` y `GET`/`PUT`/`DELETE /api/documentos/[id]` con la clave de permiso `doc` (administración todo, comité ver y crear, residente ver).

#### Scenario: Documento legal inmutable
- **WHEN** se intenta editar o eliminar un documento con `naturaleza` `legal`
- **THEN** la respuesta es 409 y la fila original queda intacta en la base

#### Scenario: Legal sin referencia auténtica
- **WHEN** se da de alta un documento legal sin `referenciaAutentica`
- **THEN** la respuesta es 400 con `campo: "referenciaAutentica"` y no queda fila creada

#### Scenario: Comunitario reemplazable
- **WHEN** se reemplaza o se borra un documento `comunitario` con la clave `doc`
- **THEN** la operación se aplica y la versión del documento se conserva

#### Scenario: Versión asignada por el servidor
- **WHEN** se sube una segunda acta del mismo `tipoDocumental` en la misma comunidad
- **THEN** queda con `version` 2, aunque el payload traiga otro número

#### Scenario: Archivo por referencia
- **WHEN** se intenta guardar el archivo con una URL `data:` o `blob:`
- **THEN** la respuesta es 400 por la regla D1 (media por referencia)

### Requirement: Envío de Documentos Legales con Constancia
Los documentos `legal` del archivo SHALL poder enviarse a destinatarios (propietario, arrendatario, comité o personas sueltas) en una sola corrida, con una clave de idempotencia por documento, destinatario y canal, y con un registro de entrega por destinatario. La constancia SHALL decir `entregado` solo cuando exista la notificación del visor o el servidor de correo haya aceptado el mensaje; cuando no, `pendiente` o `fallido` con su motivo. Un reenvío explícito SHALL agregar una constancia nueva con sufijo, sin duplicar ni sobrescribir la anterior. Los documentos `comunitario` NO SHALL generar entregas por persona: se publican a toda la comunidad y su constancia es la publicación. El registro de entregas es vista de auditoría (nombra destinatarios), no del residente.

#### Scenario: Dos corridas iguales no duplican
- **WHEN** se envía el mismo documento al mismo destinatario por el mismo canal dos veces sin pedir reenvío
- **THEN** existe una sola constancia, y el índice único de la clave de envío es lo que lo garantiza

#### Scenario: Reenvío explícito con sufijo
- **WHEN** se pide reenviar a un destinatario que ya tenía constancia
- **THEN** se agrega una fila nueva con sufijo de reenvío y la anterior queda intacta

#### Scenario: Entregado exige prueba en el visor
- **WHEN** se entrega un documento por el visor
- **THEN** la constancia queda `entregado` con el id de la notificación creada en la misma operación

#### Scenario: El correo no aceptado no es entrega
- **WHEN** el servidor de correo no acepta el mensaje o no hay emisor configurado
- **THEN** la constancia queda `pendiente` o `fallido` con su motivo y nunca `entregado`

#### Scenario: Lo comunitario no se entrega
- **WHEN** se intenta enviar un documento `comunitario` a destinatarios
- **THEN** la respuesta es 409 y no se escribe ninguna constancia por persona

### Requirement: La Versión del Reglamento Apunta a su Acta
La versión del reglamento que rige el cobro NO SHALL guardar la referencia del acta como texto libre. Cada versión nueva SHALL apuntar al `Documento` `legal` del archivo que la respalda (`documentoId`), de la misma comunidad, con `onDelete: Restrict` porque un documento legal se corrige con una versión nueva y nunca se borra. El campo `actaRef` queda `@deprecated`: sobrevive solo como referencia histórica de las versiones ya declaradas y no se reescribe. Una versión nueva sin documento, con un documento de otra comunidad o con un documento `comunitario` SHALL rechazarse con 400 y un mensaje que diga cuál de los tres casos es.

#### Scenario: Versión nueva sin acta respaldante
- **WHEN** se declara una versión del reglamento sin `documentoId`
- **THEN** la respuesta es 400 con `campo: "documentoId"` y no se escribe la versión

#### Scenario: Acta de otra comunidad o comunitaria
- **WHEN** se apunta a un documento de otra comunidad o a uno de naturaleza `comunitario`
- **THEN** la respuesta es 400 sin confirmar la existencia del documento ajeno, y no se escribe la versión

#### Scenario: La versión vieja se sigue leyendo
- **WHEN** se lee una versión histórica que solo tiene `actaRef`
- **THEN** la lectura devuelve esa referencia y la pantalla la muestra marcada como histórica
