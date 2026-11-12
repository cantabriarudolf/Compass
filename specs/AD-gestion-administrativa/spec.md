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
El sistema MUST mantener una colección `controlesPropiedad` por unidad con el único flag de privacidad vivo, `residenteVeActas`, editable por el propietario de la unidad y por administración mediante `saveControlPropiedad` (validando FK a `unidades` y retornando `StoreResult`). Por defecto el flag de visibilidad está desactivado. Todo cambio emite el evento AM `AD_OWNER_CONFIG_CHANGE`. Los flags `residenteVeMorosidad` y `alertasResidentesActivas` se retiraron de la superficie el 2026-11-07 porque ninguna ruta los obedecía: dejan de aceptarse en el contrato de escritura (`ControlPropiedadSchema` y la lista blanca de `app/api/controles-propiedad`), desaparecen de `/admin/gestion` y de `REGLAS_ABAC`, y la migración `20261113000000_retira_banderas_muertas` retiró sus columnas de `controles_propiedad` y de `controles_propiedad_archivados` sin perder ninguna fila —aplicada en dev y en producción, carril `db-prod`, run `42697576526`—; los seeders y el contrato de escritura ya no las mencionan.

#### Scenario: Notificar a Residentes
- **WHEN** el propietario activa "Notificar a Residentes" para su unidad
- **THEN** `residenteVeActas` se persiste en `controlesPropiedad`
- **AND** GD consulta ese flag antes de mostrar actas al residente; la morosidad ya no tiene control por unidad porque `residenteVeMorosidad` se retiró el 2026-11-07 (ninguna ruta la leía) y su columna ya no existe en la base

#### Scenario: Gestión de Alertas Residentes
- **WHEN** el propietario busca silenciar "Gestión de Alertas Residentes" (visitas, encomiendas, reservas) en `/admin/gestion`
- **THEN** no encuentra ese control —se retiró el 2026-11-07— y `notify()` no consulta ninguna bandera de alertas por unidad para decidir si notifica al residente
- **AND** la columna `alertasResidentesActivas` se retiró de `controles_propiedad` y de `controles_propiedad_archivados` con la migración `20261113000000_retira_banderas_muertas` —dev y producción, run `42697576526`, sin perder ninguna fila— y quedó fuera del contrato de escritura, de los seeders y de toda lectura

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
El switch de privacidad por unidad —hoy `residenteVeActas`, el único vivo; el de
morosidad se retiró con su bandera el 2026-11-07— es controlado por la lista SWR y
la revalidación tarda segundos bajo carga dev (el assert a 600ms fallaba). SHALL aplicar
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

### Requirement: Vigencia del Registro de Copropietarios
El sistema SHALL registrar la vigencia del Registro de Copropietarios **por unidad**, nunca por persona: el deber del art. 9 de la Ley 21.442 se refiere a la unidad y a quien la posee. Cada unidad SHALL tener a lo sumo un caso de vigencia por comunidad (`comunidadId + unidadId` único) con dos hechos: la fecha de la última declaración o revalidación —`null` cuando no consta— y la fecha del acto de requerir vigente. El estado (`al_dia`, `por_vencer`, `requerido`, `habilitado_para_multa`, `sin_declaracion`) SHALL derivarse en el servidor con `lib/vigencia-registro.ts` y NO SHALL persistirse: guardarlo crearía una segunda verdad que se separa del calendario. Los 60 días corridos SHALL contarse desde el acto de requerir, no desde el cumpleaños del dato; sin requerimiento el estado tope SHALL ser `requerido` y nunca `habilitado_para_multa`. Una unidad sin declaración SHALL reportarse `sin_declaracion` y NO SHALL habilitar multa. El acto de requerir SHALL escribir evidencia append-only con el vencimiento congelado, el usuario que lo registró y su fundamento; un segundo requerimiento sobre un ciclo abierto SHALL responder 409 sin escribir evidencia nueva. La lectura completa del registro SHALL exigir `ad` con acción `editar`: la acción `ver` no alcanza porque el rol `residente` la posee y vería el registro de todas las unidades. Confirmar que el registro sigue igual SHALL ser tan válido como editarlo (S3): una revalidación SHALL aceptar la unidad con un `detalle` obligatorio y con contenido que diga qué se confirmó, SHALL escribir su propia evidencia append-only con la fecha y el usuario que la hizo, SHALL fijar la fecha de la última declaración en el acto y SHALL limpiar el requerimiento vigente **sin borrar** las filas de `RequerimientoVigencia`, que son la prueba de que la administración cumplió su deber del art. 9. El acto de revalidar SHALL exigir `ad` con acción `editar`, SHALL responder 404 sin revelar unidades de otra comunidad y SHALL dejar un evento `AD_VIGENCIA_REVALIDACION`. Una revalidación exitosa SHALL dejar el caso en estado `al_dia`, y una unidad sin caso previo SHALL quedar creada ya al día. La evidencia de multa de un requerimiento no respondido NO SHALL desaparecer por una revalidación posterior: la historia se conserva completa. Los avisos SHALL decidirse en `lib/vigencia-avisos.ts` a partir del veredicto derivado: `por_vencer` con propietario vigente SHALL avisar al propietario con el requerimiento anual como hito; `requerido` sin requerimiento abierto SHALL avisar al administrador y al Comité que corresponde requerir, sin avisar al propietario; `habilitado_para_multa` SHALL avisar al administrador, al Comité y al propietario vigente si lo hay; `sin_declaracion` SHALL avisar al administrador y al Comité como incidente de datos; y una unidad sin propietario vigente SHALL notificarse como incidente al administrador y al Comité, nunca al vacío. La emisión SHALL ser un acto administrativo explícito e idempotente (`POST /api/vigencia-registro/avisos`, `ad` con acción `editar`): cada aviso SHALL escribir su notificación y su constancia en `avisos_vigencia` en una sola transacción, y una segunda corrida con los mismos hechos NO SHALL duplicar avisos ni notificaciones —el choque contra el índice único `(comunidadId, unidadId, tipo, destinatario, hito)` SHALL contarse como omitido, nunca como error—. Cada corrida SHALL dejar un único evento `AD_VIGENCIA_AVISOS` con cuántos avisos emitió y cuántos omitió. La programación automática del barrido queda fuera del contrato de esta capacidad: emitir es un acto de la administración, y decidir un job programado es una decisión aparte.

El permiso del arrendatario para declarar el registro SHALL ser un atributo del **vínculo** (`VinculoUnidad.puedeDeclararRegistro`), con valor por omisión `false`: nadie obtiene el permiso sin un acto deliberado del propietario, y la obligación legal de mantener el registro actualizado sigue siendo del propietario. El propietario vigente SHALL poder declarar el registro de su unidad siempre; el arrendatario vigente SHALL poder declararlo sólo cuando ese atributo esté en `true`; cualquier otro rol (`copropietario`, `ocupante`) NO SHALL poder declarar. Toda declaración SHALL guardar su procedencia en la evidencia (`origen`: `administrador`, `propietario` o `arrendatario`), derivada del vínculo del usuario de sesión y NO SHALL aceptarse del cuerpo del request. La declaración por la cuenta propia (`POST /api/vigencia-registro/mi-declaracion`) SHALL exigir un vínculo vigente con la unidad en la comunidad de la sesión y SHALL responder 404 «Unidad no encontrada.» a cualquier otra unidad —incluida una de otra comunidad—, sin revelar que existe, y NO SHALL escribir nada cuando rechaza. Una declaración aceptada SHALL ejecutar la misma transacción del acto administrativo —fecha de la última declaración en el acto y limpieza del requerimiento vigente **sin borrar** las filas de `RequerimientoVigencia`— y SHALL dejar un evento `AD_VIGENCIA_DECLARACION_PROPIA` con el número de la unidad y el origen. La vista del residente SHALL ser auto-acotada (`GET /api/vigencia-registro/mi-unidad`): resuelta desde la persona del usuario de sesión y sus vínculos vigentes de la comunidad en sesión, sin aceptar `unidadId` ni `comunidadId` del cliente, devolviendo sólo las unidades propias con el estado derivado y el permiso del vínculo, y SHALL devolver una lista vacía —nunca 404— cuando la cuenta no tiene persona en el Maestro de Personas o no tiene vínculos, porque no tener unidades es un estado legítimo. La procedencia por omisión de una declaración escrita sin origen explícito SHALL ser `administrador`, para que el acto administrativo anterior a este campo conserve su rótulo.

El monto de la multa por el Registro no actualizado SHALL salir del maestro de infracciones de la propia comunidad (`TipoInfraccionIN`), con el nombre canónico `Registro de Copropietarios no actualizado` y el valor que fije *su* reglamento; NO SHALL existir un segundo maestro de multas, un monto por defecto ni un valor en el código. El tipo SHALL poder declarar su ancla legal en `referenciaLegal` —el artículo del reglamento o el acta que fija el monto—, que documenta la procedencia del número y NO SHALL habilitar nada por sí misma. La disponibilidad SHALL decidirse con la regla pura `multaDisponible` de `lib/vigencia-registro.ts` y traducirse desde la base en `lib/vigencia-multa.ts`; sin la fila del tipo, o con un valor no positivo, la multa NO SHALL estar disponible y el sistema SHALL declararlo con su motivo, sin inventar un número. `GET /api/vigencia-registro` SHALL informar esa disponibilidad en un campo `multa` —`disponible` con su `monto` y su `referenciaLegal`, o `disponible` en `false` con el `motivo`—, calculado una vez por comunidad, sin alterar el estado, el resumen ni el total de las unidades.

La multa SHALL proponerla el sistema con un acto explícito de la administración (`POST /api/vigencia-registro/multa`, `ad` con acción `crear`), sin cron ni disparo programado: el caso `habilitado_para_multa` habilita la propuesta, y la decisión SHALL resolverse con la regla pura `propuestaDeMultaPermitida` de `lib/vigencia-multa.ts` a partir del veredicto, de la disponibilidad del monto y de si el ciclo ya tiene propuesta, sin consultar la base. La propuesta SHALL congelar en el acto el monto, su `referenciaLegal` y la fila del maestro de la que salen, junto con la unidad y el acto de requerir que abrió el ciclo; cambiar el maestro después NO SHALL mover la propuesta ya escrita, y la diferencia entre lo congelado y lo vigente queda como evidencia. NO SHALL proponerse multa cuando el caso no está `habilitado_para_multa` ni cuando la comunidad no declaró el monto: el rechazo SHALL decir el motivo y NO SHALL escribir fila ni evento. SHALL haber a lo sumo una propuesta por ciclo —unidad más acto de requerir, único en `propuestas_multa_vigencia`—: una segunda propuesta del mismo ciclo SHALL responder 409 sin escribir una segunda fila. Aplicar SHALL ser un acto del Comité o de la administración —cuyo usuario queda registrado igual— y SHALL exigir `acuerdoReferencia`, el acta o el número de acuerdo que aprobó la multa: sin ese texto NO SHALL aplicarse. Aplicar SHALL crear UNA `InfraccionIN` para la unidad con el monto congelado en la propuesta —nunca el monto vigente del maestro— y SHALL cerrar la propuesta como `aplicada` con quién, cuándo y con qué acuerdo en la misma transacción, dejando un evento `AD_VIGENCIA_MULTA_APLICADA`. NO SHALL crearse un `CargoFI` en este acto: la materialización financiera queda en el módulo IN. Desestimar SHALL exigir un `motivo`, SHALL cerrar la propuesta como `desestimada` sin crear ninguna infracción y SHALL dejar un evento `AD_VIGENCIA_MULTA_DESESTIMADA`. Una propuesta resuelta NO SHALL volverse a resolver: el segundo intento SHALL responder 409 sin escribir una segunda infracción ni un segundo evento. Toda resolución SHALL responder 404 sin revelar propuestas de otra comunidad, y NO SHALL aceptar `comunidadId` del cliente.

La administración SHALL contar con la pantalla `/admin/gestion/vigencia-registro`, que SHALL mostrar el estado derivado de cada unidad con su resumen por estado y SHALL ofrecer por fila sólo los actos que ese estado admite —requerir cuando el calendario lo pide y no hay ciclo abierto, revalidar siempre, y el barrido de avisos como acto explícito de la administración—, mostrando los errores de la API con su mensaje y una comunidad sin unidades como tal, nunca como una tabla vacía.

#### Scenario: Unidad sin declaración
- **WHEN** una unidad no tiene caso de vigencia o su última actualización es `null`
- **THEN** el estado es `sin_declaracion`, el sistema no habilita multa y la unidad se reporta como incidente de datos

#### Scenario: Requerimiento anual
- **WHEN** la administración requiere la actualización de una unidad sin requerimiento abierto
- **THEN** se congelan la fecha del acto y su vencimiento a 60 días corridos en la evidencia, y el estado pasa a `requerido`

#### Scenario: Vencimiento del plazo
- **WHEN** pasan los 60 días corridos desde el requerimiento sin declaración ni revalidación
- **THEN** el estado derivado es `habilitado_para_multa` con la fecha de vencimiento congelada en la evidencia

#### Scenario: Segundo requerimiento sin declaración
- **WHEN** se intenta requerir de nuevo una unidad que ya tiene un requerimiento abierto
- **THEN** la respuesta es 409 y no se escribe una segunda evidencia

#### Scenario: El residente no ve el registro ajeno
- **WHEN** un usuario con rol `residente` pide el listado completo del registro
- **THEN** la respuesta es 403

#### Scenario: Revalidar cierra el ciclo y deja el caso al día
- **WHEN** la administración revalida una unidad que tenía un requerimiento abierto
- **THEN** la respuesta es 200 con estado `al_dia`, la fecha de la última declaración queda en el acto y el requerimiento vigente queda limpio

#### Scenario: La evidencia del requerimiento anterior sigue existiendo
- **WHEN** se revalida una unidad que tenía un requerimiento con su vencimiento congelado
- **THEN** las filas de `RequerimientoVigencia` siguen ahí con sus fechas intactas y no se borra ninguna

#### Scenario: Una revalidación deja su propio registro con quién y qué se confirmó
- **WHEN** la administración revalida una unidad con un detalle de lo que se confirmó
- **THEN** se escribe una fila append-only en `revalidaciones_vigencia` con la fecha, el usuario de sesión y el detalle, y un evento `AD_VIGENCIA_REVALIDACION`

#### Scenario: Aviso al propietario en el mes 10
- **WHEN** una unidad está `por_vencer` y tiene propietario vigente
- **THEN** el barrido emite un aviso al propietario con el requerimiento anual como hito y deja su constancia en `avisos_vigencia`

#### Scenario: La administración y el Comité se enteran de que corresponde requerir
- **WHEN** una unidad está `requerido` sin requerimiento abierto
- **THEN** el barrido emite un aviso al administrador y otro al Comité, y ninguno al propietario

#### Scenario: Plazo vencido
- **WHEN** una unidad está `habilitado_para_multa`
- **THEN** el barrido avisa al administrador y al Comité, y también al propietario vigente si lo hay, con la fecha de vencimiento congelada como hito

#### Scenario: Unidad sin propietario vigente
- **WHEN** una unidad no tiene ningún vínculo `propietario` con `fechaFin` `null`
- **THEN** el barrido emite el incidente `sin_propietario` al administrador y al Comité y no escribe ninguna notificación al propietario

#### Scenario: Emitir dos veces no duplica avisos
- **WHEN** la administración corre el barrido dos veces con los mismos hechos
- **THEN** la segunda corrida no escribe notificaciones ni constancias nuevas y las cuenta como omitidas

#### Scenario: El residente no emite avisos
- **WHEN** un usuario con rol `residente` llama al barrido de avisos
- **THEN** la respuesta es 403 y no se escribe ninguna notificación, constancia ni evento

#### Scenario: La pantalla muestra el estado por unidad y sólo el acto que le toca
- **WHEN** la administración abre `/admin/gestion/vigencia-registro`
- **THEN** ve una fila por unidad con su estado derivado y su resumen por estado, y la fila de una unidad con un requerimiento abierto ofrece revalidar pero no volver a requerir

#### Scenario: El propietario vigente declara su propia unidad
- **WHEN** el propietario vigente de una unidad declara el registro desde su cuenta
- **THEN** la respuesta es 200 con estado `al_dia`, la evidencia guarda `origen` `propietario` con el usuario de sesión y se registra el evento `AD_VIGENCIA_DECLARACION_PROPIA`

#### Scenario: El arrendatario sin la habilitación del propietario
- **WHEN** un arrendatario vigente declara el registro de su unidad sin que el propietario haya habilitado `puedeDeclararRegistro` en el vínculo
- **THEN** la respuesta es 403 con el motivo —falta la habilitación del propietario— y no se escribe ninguna fila de revalidación, ningún evento y el caso queda intacto

#### Scenario: El arrendatario habilitado declara con su procedencia
- **WHEN** el propietario habilita `puedeDeclararRegistro` en el vínculo y el arrendatario declara el registro de esa unidad
- **THEN** la respuesta es 200 con estado `al_dia` y la evidencia guarda `origen` `arrendatario` con el usuario de sesión del arrendatario

#### Scenario: Una declaración no alcanza la unidad de otro
- **WHEN** un arrendatario habilitado intenta declarar una unidad de su comunidad con la que no tiene vínculo, o una unidad de otra comunidad
- **THEN** la respuesta es 404 «Unidad no encontrada.» y no se escribe ninguna fila de revalidación, ningún evento ni ningún caso

#### Scenario: La vista propia del residente
- **WHEN** un usuario con vínculos vigentes consulta `GET /api/vigencia-registro/mi-unidad`
- **THEN** recibe sólo sus unidades con el estado derivado y el permiso del vínculo, y una cuenta sin persona o sin vínculos recibe la lista vacía, nunca un 404

#### Scenario: Una declaración administrativa conserva su procedencia
- **WHEN** la administración revalida el registro de una unidad con el acto administrativo existente
- **THEN** la evidencia queda rotulada con `origen` `administrador` sin cambiar el resto de su comportamiento

#### Scenario: La multa sale del maestro de la comunidad
- **WHEN** la comunidad declaró «Registro de Copropietarios no actualizado» en su maestro de infracciones con un monto positivo y su ancla legal
- **THEN** el listado informa la multa disponible con ese monto y esa `referenciaLegal`, sin tomar ningún valor del código

#### Scenario: Sin el tipo declarado no se multa
- **WHEN** la comunidad no declaró el tipo en su maestro de infracciones
- **THEN** el listado informa la multa como no disponible con el motivo que nombra el tipo faltante y dice que no se multa, y no se inventa ningún monto

#### Scenario: Un monto en cero no habilita la multa
- **WHEN** el tipo existe en el maestro de la comunidad con valor cero
- **THEN** la multa no está disponible y el listado lo declara con su motivo

#### Scenario: La multa de una comunidad no alcanza a otra
- **WHEN** otra comunidad declaró el tipo con su propio monto
- **THEN** cada comunidad informa la disponibilidad de su propio maestro y ninguna hereda el monto de la otra

#### Scenario: La propuesta congela el monto del maestro
- **WHEN** la administración propone la multa de una unidad `habilitado_para_multa` y la comunidad declaró el tipo con un monto positivo y su ancla legal
- **THEN** la respuesta es 200 con ese monto y esa `referenciaLegal` congelados en la propuesta, y se registra el evento `AD_VIGENCIA_MULTA_PROPUESTA`

#### Scenario: Sin el monto declarado no se propone multa
- **WHEN** la administración propone la multa de una unidad `habilitado_para_multa` en una comunidad que no declaró el tipo en su maestro
- **THEN** la respuesta rechaza con el motivo que nombra el tipo faltante y dice que no se multa, y no se escribe ninguna propuesta

#### Scenario: Un caso que no está habilitado no admite propuesta
- **WHEN** la administración intenta proponer la multa de una unidad `al_dia`, `por_vencer`, `requerido` o `sin_declaracion`
- **THEN** la respuesta rechaza nombrando el estado del caso y no se escribe ninguna propuesta ni ningún evento

#### Scenario: Una propuesta por ciclo
- **WHEN** se propone por segunda vez la multa de la misma unidad en el mismo ciclo abierto por el requerimiento
- **THEN** la respuesta es 409 y sigue existiendo una sola propuesta

#### Scenario: La multa se aplica con el acuerdo del Comité
- **WHEN** un usuario del Comité aplica una propuesta con la referencia del acta o del acuerdo que la aprobó
- **THEN** la respuesta es 200, la propuesta queda `aplicada` con quién y cuándo, se crea UNA `InfraccionIN` para la unidad con el monto congelado, se registra el evento `AD_VIGENCIA_MULTA_APLICADA` y no se crea ningún `CargoFI`

#### Scenario: Sin el acuerdo del Comité no hay multa
- **WHEN** se intenta aplicar una propuesta sin `acuerdoReferencia`
- **THEN** la respuesta es 400 y la propuesta, la infracción y la auditoría quedan intactas

#### Scenario: El maestro cambia después de proponer
- **WHEN** la comunidad cambia el monto o el ancla legal de su maestro después de que la multa fue propuesta
- **THEN** la propuesta conserva el monto y la `referenciaLegal` congelados en el acto de proponer

#### Scenario: Desestimar la propuesta no crea infracción
- **WHEN** el Comité o la administración desestima una propuesta con su motivo
- **THEN** la propuesta queda `desestimada` con ese motivo, no se crea ninguna infracción y se registra el evento `AD_VIGENCIA_MULTA_DESESTIMADA`

#### Scenario: El residente no propone ni aplica la multa
- **WHEN** un usuario con rol `residente` llama a la propuesta o a su aplicación
- **THEN** la respuesta es 403 y no se escribe ninguna propuesta, ninguna infracción ni ningún evento

#### Scenario: Una propuesta resuelta no se resuelve dos veces
- **WHEN** se intenta aplicar o desestimar una propuesta que ya está `aplicada` o `desestimada`
- **THEN** la respuesta es 409 y no se escribe una segunda infracción ni un segundo evento

#### Scenario: La propuesta de otra comunidad no se ve
- **WHEN** se intenta proponer la multa de una unidad de otra comunidad, o resolver una propuesta de otra comunidad
- **THEN** la respuesta es 404 y la propuesta y la infracción ajenas quedan intactas
