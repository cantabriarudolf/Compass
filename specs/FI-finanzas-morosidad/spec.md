# FI-finanzas-morosidad Specification

## Purpose
Centralizar la salud financiera de la comunidad: maestro de fondos con imputación, egresos categorizados con comprobante D1, emisión mensual del Gasto Común en la forma de contribución que la comunidad declare, cobro con conceptos y recargo al fondo de reserva como cargo real, control de morosidad con corte de servicios y cobranza activa, y pagos con ajuste manual auditado. Fuente de verdad: `Data/NSGC/docs/especificaciones/FI - Finanzas y Morosidad.md`.
## Requirements
### Requirement: Maestro de Fondos con Imputación
El sistema MUST mantener N fondos (cajas) mediante `saveFondoFI` (store) y la API REST `/api/fondos-fi` (POST upsert idempotente; PUT/DELETE en `/[id]`), retornando `StoreResult` cuando aplica, con nombre, tipo (`gasto_comun`|`reserva`|`especial`|`amenities`), descripción opcional, `porcentajeAporte` para fondos de reserva y flag activo. Todo egreso y todo cobro MUST imputarse a un fondo existente y activo. La eliminación de un fondo con movimientos asociados MUST bloquearse. El saldo de cada fondo SHALL ser derivable en base caja: pagos recibidos en cobros del fondo más aportes de reserva registrados, menos egresos del fondo.

#### Scenario: Fondo con movimientos no eliminable
- **WHEN** se intenta eliminar un fondo con egresos o cobros imputados
- **THEN** la eliminación se rechaza (409 en la API y `{ok:false}` en el store) citando la cantidad de movimientos asociados

#### Scenario: Saldo derivable por fondo
- **WHEN** se consultan los fondos tras emitir GC y registrar pagos
- **THEN** cada fondo reporta su saldo calculado desde sus movimientos sin almacenarlo

### Requirement: Egresos Categorizados con Comprobante D1
El sistema MUST registrar salidas de dinero mediante `saveEgresoFI` (store) y la API REST `/api/egresos-fi` (POST upsert idempotente; PUT/DELETE en `/[id]`), retornando `StoreResult` cuando aplica, con folio FE-*, fecha, categoría (sueldos, mantención, servicios, administración, uso_de_fondo, otro), monto mayor a cero, fondo de imputación obligatorio (por defecto el de gasto común), marca recurrente/fijo que alimenta el termómetro de presupuesto, comprobante digitalizado como metadatos D1 (nombre/tipoMime/tamañoKB/URL, jamás base64/Blob) y gastos diferenciados opcionales por micro sectores.

#### Scenario: Egreso recurrente con comprobante
- **WHEN** se registra "Sueldo conserje" categoría Sueldos, recurrente, con boleta por URL e imputado al Fondo de Gasto Común
- **THEN** persiste con folio FE-* y evento `FI_EGRESS_CREATED`

#### Scenario: Egreso sin fondo o con comprobante embebido rechazado
- **WHEN** falta el fondo de imputación o el comprobante llega como data-URL/base64
- **THEN** retorna `{ok:false}` sin mutar el estado

### Requirement: Emisión de Gasto Común Modalidad Fija y Prorrateo
El sistema MUST generar la deuda mensual mediante `emitirGastoComun({periodo, gastoTotal?})` retornando `StoreResult`, leyendo la forma de contribución de la **versión vigente del reglamento de la comunidad** (ver requirement «Versión del Reglamento del Cobro por Comunidad»): en modo fijo consulta el Monto Fijo (`montoBaseGc`) del tipo de unidad; en modo prorrateo exige un gasto total a recaudar mayor a cero —el **gasto devengado** del período— y calcula `(Gasto Total × % prorrateo de la unidad)`. El **presupuesto aprobado del año es estimativo y NO SHALL reemplazar el monto a cobrar** (Ley 21.442 art. 22: se cobran los gastos efectivamente incurridos, no la proyección anual): cuando existe un presupuesto `vigente` del año del período, la emisión MUST contrastar el total emitido contra su **doceavo mensual** (`total aprobado / 12`, comparado en centavos enteros) y, si lo supera, MUST declarar el desvío con AMBOS montos —el emitido y la referencia mensual, expuestos como `exceso` en la respuesta— en la respuesta y en la bitácora, **sin bloquear la emisión**, porque un gasto urgente o imprevisto es lícito; cuando NO existe presupuesto aprobado del año, la emisión MUST correr igual y MUST declarar la advertencia «no hay presupuesto aprobado para el año, la emisión no puede contrastarse». En ambos casos la emisión SHALL persistir el `presupuestoId` del presupuesto usado para el contraste (`NULL` si no hubo ninguno) y SHALL auditar el contraste en `FI_EMISION_GC_CREADA`. Debe validar antes de emitir y sin escribir nada: versión vigente para el período, fuente de instrumento real (reglamento de copropiedad o acta de asamblea; una migración automática NO habilita emitir), parámetros válidos en esa versión, período no procesado previamente y todas las unidades elegibles con responsable de cobro asignado (propietario vigente). Si la versión declara un recargo al fondo de reserva mayor a cero y no existe un fondo de reserva activo donde imputarlo, la emisión MUST rechazarse nombrando el porcentaje declarado. El vencimiento de cada cobro SHALL derivarse de los días de pago declarados en la versión (`diasPagoGc`), no de una constante. La emisión materializa una emisión con líneas por unidad y crea un cobro por unidad con su detalle de conceptos.

#### Scenario: Emisión fija usa el monto base del tipo
- **WHEN** se emite el periodo en modo fijo con unidades de tipos de $80.000 y $120.000
- **THEN** cada cobro queda por el monto base de su tipo de unidad

#### Scenario: Emisión prorrateo reparte el gasto total
- **WHEN** se emite en modo variable un gasto total de $1.000.000 con unidades de coeficientes 50% y 25% y una versión que declara 0% de recargo al fondo de reserva
- **THEN** los cobros quedan en $500.000 y $250.000 respectivamente

#### Scenario: Periodo repetido rechazado
- **WHEN** se intenta emitir un periodo ya procesado
- **THEN** retorna `{ok:false}` sin duplicar cobros

#### Scenario: Unidad sin responsable de cobro bloquea la emisión
- **WHEN** existe una unidad elegible sin propietario vigente al momento de emitir
- **THEN** retorna `{ok:false}` indicando la unidad, sin crear la emisión

#### Scenario: CF sin carga bloquea FI
- **WHEN** se intenta emitir con `configuracion.modoCalculoGC` undefined
- **THEN** retorna `{ok:false}` con "CF no cargado" y no muta colecciones financieras

#### Scenario: Emisión bloqueada sin versión del reglamento
- **WHEN** la comunidad no declaró una versión vigente para el período, o la única versión es una migración automática
- **THEN** retorna 400 nombrando el motivo y la comunidad, y no crea emisión ni cobros

#### Scenario: El vencimiento sale de los días declarados
- **WHEN** la versión vigente declara 10 días de pago y se emite el período
- **THEN** cada cobro vence a los 10 días de la fecha de emisión

#### Scenario: Recargo declarado sin fondo de destino
- **WHEN** la versión declara un porcentaje de reserva mayor a cero y no hay fondo de reserva activo
- **THEN** retorna 400 nombrando el porcentaje declarado, sin crear emisión ni cobros

#### Scenario: Sin presupuesto aprobado la emisión corre con su advertencia
- **WHEN** se emite el gasto común de 2029-01 y la comunidad no tiene un presupuesto `vigente` de 2029 —aunque tenga los de 2026 y 2027—
- **THEN** responde 201 con la emisión y sus cobros escritos, guarda `presupuestoId` en `NULL` y declara en la respuesta y en la bitácora la advertencia «no hay presupuesto aprobado para el año, la emisión no puede contrastarse»

#### Scenario: El monto emitido es el gasto devengado, nunca el presupuesto
- **WHEN** el presupuesto vigente de 2026 suma $12.000.000 y se emite 2026-02 en modo prorrateo con un gasto total de $900.000
- **THEN** la emisión queda por $900.000 repartido por prorrateo —nunca por los $12.000.000 del presupuesto— y guarda el `presupuestoId` con el que se contrastó

#### Scenario: Un mes bajo el doceavo mensual no reporta desvío
- **WHEN** el presupuesto anual vigente suma $12.000.000 (doceavo mensual $1.000.000) y se emite el mes por $500.000
- **THEN** responde 201 y no declara desvío: la emisión queda por debajo de la referencia mensual

#### Scenario: Un mes sobre el doceavo mensual reporta el desvío y no se bloquea
- **WHEN** el presupuesto anual vigente suma $1.200.000 (doceavo mensual $100.000) y se emite el mes por $250.000
- **THEN** responde 201 con la emisión y sus cobros escritos y declara el desvío con los DOS montos —$250.000 emitido contra $100.000 de referencia mensual, en el campo `exceso` de la respuesta y en la bitácora— sin rechazar la emisión: el presupuesto es estimativo y un gasto urgente o imprevisto es lícito

#### Scenario: Con dos versiones contrasta la vigente
- **WHEN** el período tiene la versión 1 en estado `reemplazado` y la versión 2 en estado `vigente`
- **THEN** el contraste y el `presupuestoId` son los de la versión 2, y nunca los de la reemplazada

#### Scenario: La emisión queda trazada al presupuesto usado en la bitácora
- **WHEN** se emite el gasto común contra el presupuesto vigente de 2026 versión 1 aprobado por el acuerdo `AD-2026-7`
- **THEN** la emisión guarda el `presupuestoId` y audita `FI_EMISION_GC_CREADA` nombrando el período, la versión y el folio `AD-2026-7`, con el desvío (o su ausencia), en la misma transacción que la emisión y sus cobros

### Requirement: Fondo de Reserva con Aporte Automático y Retiros Documentados
El recargo al fondo de reserva MUST cobrarse como **línea real del cobro de cada unidad**, con el porcentaje declarado en la versión vigente del reglamento (`porcentajeReserva`) y una fuente de la que nadie más sea dueño. La versión declara además si el recargo va **encima** del presupuesto aprobado (`reservaIncluidaEnPresupuesto: false`, lectura del art. 39 de la Ley 21.442: recargo sobre los gastos comunes) o **dentro** de él (`true`, cuando la asamblea presupuestó con el incluido): encima se suma al gasto común del mes; dentro se desagrega sin cambiar el total que paga la unidad. En ambos casos la suma de las líneas MUST dar exactamente el monto del cobro y el aporte de la emisión SHALL derivarse de las líneas de reserva, no de un cálculo paralelo. Los retiros de fondo de reserva MUST registrarse mediante `retirarFondoFI` como egreso `uso_de_fondo` con aprobación documentada referenciando un acta GD publicada y validación de saldo suficiente; el saldo disponible SHALL salir de las líneas que nombran el fondo (más saldo inicial e ingresos manuales, menos egresos), de modo que la caja real del fondo sea visible; audita `FI_FUND_WITHDRAWN`.

#### Scenario: Aporte automático al emitir
- **WHEN** se emite un periodo por $2.000.000 con un recargo declarado del 5% encima del presupuesto
- **THEN** cada cobro lleva su línea de reserva y la emisión registra un aporte de $100.000 al fondo de reserva

#### Scenario: Retiro sin acta publicada rechazado
- **WHEN** se retira del fondo de reserva sin acta GD publicada de respaldo o superando el saldo
- **THEN** retorna `{ok:false}` y no genera el egreso

#### Scenario: Recargo encima del presupuesto
- **WHEN** la versión declara 10% encima y la unidad tiene un gasto común de $60.000
- **THEN** el cobro suma $66.000 con una línea de $6.000 al fondo de reserva

#### Scenario: Recargo incluido en el presupuesto
- **WHEN** la versión declara el recargo dentro del presupuesto y la unidad tiene un gasto común de $100.000 con 10%
- **THEN** el cobro sigue en $100.000, desagregado en $90.909 de gasto común y $9.091 al fondo de reserva

#### Scenario: Retiro ve la caja real del fondo
- **WHEN** un cobro con línea de reserva está pagado y se retira del fondo de reserva
- **THEN** el saldo disponible incluye lo efectivamente pagado por esa línea

### Requirement: Versión del Reglamento del Cobro por Comunidad
El sistema MUST mantener, por comunidad, versiones **append-only** del reglamento del cobro, cada una con `vigenteDesde` (período AAAA-MM), `fuenteInstrumento` (`reglamento_copropiedad` | `acta_asamblea` | `migracion_automatica`), `actaRef`, `formaContribucion` (`coeficiente` | `partes_iguales` | `monto_por_tipo` | `mixto`) y los parámetros del cobro (`porcentajeReserva`, `diasPagoGc`, `tasaMoraMensualPct`, `topeMoraPct`, `cuotasCorte`, `diasPreavisoCorte`, `ipcActivo`, `reservaIncluidaEnPresupuesto`). Ningún número del reglamento MUST vivir en el código: todos son configuración de la versión. La versión que rige un período SHALL ser la de `vigenteDesde` más alto que no lo supere, y las versiones futuras no aplican. El alta se hace por `GET|POST /api/reglamento` con permiso `fi:gasto_comun` (administración escribe, comité lee), sin PUT ni DELETE; `version` la asigna el servidor y el alta audita `FI_REG_VERSION`. Una emisión MUST guardar copia de los parámetros con los que calculó, de modo que declarar una versión nueva no altere lo ya emitido.

#### Scenario: Forma de contribución declarada
- **WHEN** una comunidad declara su forma de contribución con su instrumento y su fecha de vigencia
- **THEN** la emisión de los períodos alcanzados usa esa declaración sin consultar constantes del código

#### Scenario: Fuente real obligatoria
- **WHEN** la única versión vigente es una migración automática
- **THEN** la emisión se rechaza indicando que la forma de contribución debe declararse por reglamento de copropiedad o acta de asamblea

#### Scenario: Versión futura no aplica
- **WHEN** existe una versión con `vigenteDesde` posterior al período que se emite
- **THEN** la emisión usa la versión anterior que sí lo alcanza

#### Scenario: Versión usada no se edita
- **WHEN** se intenta modificar o eliminar una versión ya declarada
- **THEN** la API no lo permite: solo se agrega una versión nueva

### Requirement: Contrato de Escritura del Cobro FI
Cada cobro MUST poder expresar su detalle como líneas por concepto (`concepto`, `monto`, `fondoId` opcional). En **lectura** las líneas MAY ser nulas (cobros anteriores al detalle, que se leen como una línea implícita con su concepto y su monto y se imputan a su propio fondo). En **escritura** un detalle nulo MUST rechazarse —solo la ausencia significa cobro de una línea— y, si está presente, no puede estar vacío y su suma MUST ser exactamente el monto base del cobro. Toda escritura MUST validarse contra el registro **fusionado**, no solo contra el parche recibido, para que una edición parcial no pueda descuadrar el detalle. Todo camino que crea o modifica un cobro (emisión, multas, reservas y alta genérica) MUST validar con el contrato de escritura completo. La imputación de pagos a fondos SHALL hacerse por las líneas de cada cobro, de modo que un cobro con detalle acredite a cada fondo lo suyo y ninguno se cuente dos veces.

#### Scenario: Detalle que no suma se rechaza
- **WHEN** un cobro llega con líneas cuya suma difiere de su monto base
- **THEN** la escritura se rechaza sin persistir nada

#### Scenario: Edición parcial descuadrada rechazada
- **WHEN** se edita solo el monto base de un cobro que ya tiene detalle
- **THEN** se rechaza nombrando que las líneas deben sumar el monto base y la fila queda intacta

#### Scenario: Detalle nulo rechazado en escritura
- **WHEN** un alta o edición envía las líneas en nulo
- **THEN** se rechaza indicando que, si el cobro no tiene detalle, se omitan las líneas

#### Scenario: Cobro anterior al detalle sigue válido
- **WHEN** se edita un cobro cuyas líneas son nulas en la base
- **THEN** la escritura se acepta y se sigue leyendo como cobro de una línea imputado a su propio fondo

#### Scenario: El pago se imputa por línea
- **WHEN** un cobro con líneas de gasto común y de reserva se paga complete o parcialmente
- **THEN** cada fondo recibe la parte de su línea y el fondo de reserva no cobra dos veces el mismo dinero

### Requirement: Aviso de Cobro Congelado por Unidad y Período
El sistema MUST emitir el aviso de cobro de un período mediante `POST /api/avisos-cobro` (permiso `fi:gasto_comun`: administración emite, comité lee), para una unidad o para todas las unidades con cobro en el período, y el aviso MUST nacer congelado: folio `AC-####` correlativo **por comunidad**, código de verificación, fecha de emisión y `contenido` guardado tal como se emitió, con folio y código asignados por el servidor dentro de la transacción y protegidos por el índice único `(comunidadId, folio)`. El contenido SHALL llevar lo que exige el artículo 31 de la Ley 21.442: la proporción de la unidad al gasto común y al fondo de reserva con los términos del reglamento vigente que la fijaron, el desglose por concepto (gasto común, recargo al fondo de reserva, multas y los demás conceptos, cada uno con su nombre y su monto), los intereses y multas adeudados a la fecha de emisión, lo pagado a esa fecha, el total adeudado y, a nivel comunidad, el detalle de ingresos, egresos mensuales y saldo de caja al cierre del período. Un aviso emitido NO SHALL poder editarse (no hay PUT) ni borrarse (DELETE responde siempre 409) y un par unidad-período ya avisado rechaza una segunda emisión (409). Cuando una cifra que la ley exige no se puede computar, el documento MUST declararla por su nombre y con su motivo en `contenido.noComputables` en vez de imprimir un cero, y la cifra correspondiente queda en `null`; los totales de comunidad son la excepción que bloquea: sin fondos de caja no son computables y el aviso no se emite (400). Un período sin emisión de gasto común no admite aviso (409) y una unidad sin cobro en el período no recibe aviso (400 si se la pide, omitida cuando se emite para todas).

#### Scenario: Aviso con el contenido que exige la ley
- **WHEN** se emite el aviso de una unidad con cobro en el período
- **THEN** el contenido lleva la proporción al gasto común y al fondo de reserva, el desglose por concepto, los intereses y multas a la fecha de emisión, lo pagado, el total adeudado y los tres totales de la comunidad del mes, y el aviso queda persistido con su folio `AC-####` y su código de verificación

#### Scenario: Folio correlativo por comunidad asignado por el servidor
- **WHEN** se emiten avisos en dos comunidades
- **THEN** cada folio sigue la secuencia de su propia comunidad y es el servidor quien lo asigna, no el cliente

#### Scenario: Aviso emitido no se borra
- **WHEN** se intenta eliminar un aviso emitido
- **THEN** la API responde 409 nombrando el documento con el que se cobra y la fila sigue intacta

#### Scenario: Cambiar el cargo no cambia el aviso
- **WHEN** el cargo, sus moras, sus pagos o los egresos de la comunidad se modifican después de emitido el aviso
- **THEN** el contenido congelado sigue diciendo exactamente lo mismo que decía al emitirse

#### Scenario: Dato que la ley pide y no se puede computar se declara con su nombre
- **WHEN** la unidad no declara coeficiente o la comunidad no tiene versión vigente del reglamento para el período
- **THEN** el contenido lo declara en `noComputables` con su campo y su motivo, la cifra queda en `null` y el monto del cargo que sí se conoce se imprime igual

#### Scenario: Sin fondos de caja no hay aviso
- **WHEN** la comunidad no tiene fondos de caja registrados, así que el saldo al cierre del período no es computable
- **THEN** la emisión responde 400 nombrando lo que no se puede computar y no crea ningún aviso

### Requirement: Documento Firmado con la Huella del Contenido
El documento del aviso SHALL armarse **solo desde la fila guardada**: cada cifra sale del `contenido` congelado y ninguna se recalcula desde los cargos, el reglamento ni el resumen del mes, de modo que el papel no pueda contradecir al aviso firmado. El documento MUST llevar la firma digitalizada configurada en CF resuelta a imagen (sin firma configurada el bloque queda en blanco y sigue nombrando al administrador responsable) y la huella determinista del contenido: SHA-256 del JSON canónico del contenido —claves ordenadas recursivamente, sin espacios, UTF-8— en hexadecimal, de la que se imprimen los primeros 16 caracteres, impresa en el documento y en el pie de cada página, de modo que el papel se pueda verificar contra lo que el sistema emitió. Lo que la fila no trae MUST imprimirse como «No disponible», nunca como cero.

#### Scenario: El documento no recalcula ninguna cifra
- **WHEN** el contenido guardado no trae un monto del desglose
- **THEN** el documento imprime «No disponible» y no lo deduce de otros campos del aviso ni imprime cero

#### Scenario: La huella del contenido se imprime
- **WHEN** se arma el documento de un aviso emitido
- **THEN** lleva el hash del contenido congelado impreso, en el cuerpo y en el pie de cada página

#### Scenario: Huella reproducible y sensible al contenido
- **WHEN** se calcula la huella del mismo contenido dos veces, o de dos contenidos que solo difieren en un monto, en el período o en el orden de una lista
- **THEN** el mismo contenido da siempre el mismo hash de 16 caracteres hexadecimales en mayúscula, el orden de las claves no lo altera, y cualquier cambio en un dato o en el orden de un array da otro hash

#### Scenario: Firma configurada embebida
- **WHEN** la comunidad tiene firma digitalizada configurada y se arma el documento del aviso
- **THEN** la firma se embebe en el bloque de firma junto al administrador responsable

### Requirement: Entrega del Aviso con Prueba
La entrega del aviso MUST ser una acción explícita (`POST /api/avisos-cobro/[id]/entrega`, permiso `fi:gasto_comun`) y no un efecto de la emisión. El destinatario SHALL ser el propietario **vigente** de la unidad del aviso; una unidad sin propietario vigente MUST rechazar la entrega nombrando la unidad y el folio, sin escribir nada. La entrega por el visor MUST materializarse en la notificación que el residente ve, creada en la misma transacción, y el registro de la entrega SHALL guardar el id de esa notificación como prueba de que se entregó. El canal email SHALL intentar el envío real por el emisor SMTP (F4) y su estado MUST ser el desenlace observado, sin confundirse con el del visor: `enviado` sólo cuando el servidor aceptó el mensaje, guardando en el registro el id de mensaje que devolvió el servidor; `fallido` con el motivo redactado cuando el envío se intentó y rebotó (autenticación rechazada, conexión rechazada, timeout, o propietario sin correo registrado); y `pendiente` con su motivo del outbox cuando la comunidad no tiene emisor configurado (falta la configuración global o la variable `SMTP_PASSWORD`), que es una condición de configuración y no un envío fallido. El canal email NUNCA SHALL registrarse `entregado` y el canal visor NUNCA SHALL registrarse `enviado`: el visor se prueba con su notificación y el correo con la aceptación del servidor. La contraseña SMTP NUNCA SHALL aparecer en el registro ni en la respuesta: se redacta antes de armar cualquier motivo. Los interruptores de canal de la cobranza NO SHALL gobernar la entrega del aviso: apagan recordatorios de deuda, y el aviso arranca el plazo de pago, así que no puede quedar sin entregar en silencio. Reentregar el mismo aviso a la misma persona por el mismo canal no SHALL duplicar el registro; el reenvío explícito agrega una fila nueva marcada como reenvío.

#### Scenario: Entrega por el visor con la notificación como prueba
- **WHEN** la administración entrega el aviso de una unidad con propietario vigente
- **THEN** se crea la notificación del residente con el folio y el período, el registro de la entrega la referencia por su id y el canal visor queda `entregado`

#### Scenario: El correo queda en cola y nunca se reporta como enviado
- **WHEN** se entrega un aviso de una comunidad sin emisor SMTP configurado (sin configuración global o sin `SMTP_PASSWORD`)
- **THEN** el canal email queda `pendiente` con el motivo del outbox, no se abre ninguna conexión SMTP y ningún estado del registro dice enviado

#### Scenario: El correo aceptado por el servidor queda enviado con su id
- **WHEN** el servidor SMTP acepta el mensaje del aviso
- **THEN** el canal email queda `enviado`, el registro guarda el id de mensaje que devolvió el servidor y el canal visor sigue `entregado` con su notificación, sin que un estado se use por el otro

#### Scenario: El correo rechazado queda fallido sin la contraseña
- **WHEN** el servidor SMTP rechaza la autenticación o el mensaje, o el propietario vigente no tiene correo registrado
- **THEN** el canal email queda `fallido` con el motivo redactado y la contraseña SMTP no aparece ni en el registro ni en la respuesta

#### Scenario: Unidad sin propietario vigente no se entrega
- **WHEN** se intenta entregar el aviso de una unidad sin propietario vigente
- **THEN** la entrega se rechaza nombrando la unidad y el folio, y no se escribe registro de entrega, notificación ni evento

### Requirement: Plazo de Pago desde la Emisión del Aviso
El vencimiento del aviso SHALL derivarse de su **fecha de emisión** más los `diasPagoGc` de la versión del reglamento que rige el período —nunca la última versión declarada—, contados como días corridos en UTC (Ley 21.442 art. 7), y el aviso MUST persistir ese vencimiento en su propio campo. Como la mora corre desde el `fechaVencimiento` del cargo, la emisión MUST alinear la fecha de vencimiento del cargo del período a la del aviso dentro de la misma transacción, y la copia congelada del cargo dentro del contenido SHALL decir la misma fecha. Sin versión vigente para el período no hay plazo que derivar: el aviso MUST quedar con vencimiento `null` y no tocar el cargo, en vez de inventar una fecha.

#### Scenario: El vencimiento es la emisión más los días declarados
- **WHEN** la versión que rige el período declara 10 días de pago y se emite el aviso
- **THEN** el vencimiento del aviso es su fecha de emisión más 10 días corridos y no la fecha que traía el cargo

#### Scenario: Rige la versión del período, no la última
- **WHEN** existe una versión posterior que declara otros días y una anterior que alcanza el período
- **THEN** el vencimiento usa los días de la versión que rige el período y queda congelada esa versión en el contenido

#### Scenario: El cargo se alinea al papel
- **WHEN** se emite el aviso de un período y el cargo traía otra fecha de vencimiento o ninguna
- **THEN** el cargo queda con la fecha de vencimiento del aviso en la misma transacción y su copia congelada en el contenido dice lo mismo

#### Scenario: Sin versión vigente no se inventa el plazo
- **WHEN** la comunidad no declara una versión del reglamento vigente para el período
- **THEN** el aviso queda con vencimiento `null`, declara lo no computable y el cargo conserva su fecha

### Requirement: Control de Morosidad y Cobranza Activa
El sistema SHALL calcular la mora sobre cobros vencidos usando `diaCortePago` (CF) como referencia de vencimiento: `aplicarMoraFI(cobroId, tasaMensualPct?)` propone y aplica la mora pro-rata por días de atraso (idempotente por día) auditando `FI_MORA_APPLIED`. El dashboard de corte de servicios SHALL resaltar exclusivamente las unidades cuya cantidad de periodos vencidos alcanza o supera `limiteMesesAvisoCorte` (CF), y `enviarCobranzaFI(unidadId)` MUST registrar gestiones notificando al responsable de cobro con canal email_simulado y auditando `FI_COBRANZA_SENT`.

#### Scenario: Mora propuesta tras el día de corte
- **WHEN** un cobro de $200.000 acumula 15 días de atraso y se aplica mora al 1% mensual
- **THEN** se registra una mora de $1.000 lista para el cobro y el evento `FI_MORA_APPLIED`

#### Scenario: Panel de corte de servicios
- **WHEN** una unidad arrastra tantos periodos vencidos como el límite configurado
- **THEN** aparece destacada en el panel de corte de suministro

#### Scenario: Gestión de cobranza auditada
- **WHEN** la administración envía la gestión de cobranza a una unidad morosa
- **THEN** el responsable recibe notificación email_simulado y queda registrado `FI_COBRANZA_SENT`

### Requirement: Convenio de Pago de Deuda
El sistema SHALL permitir a la administración suscribir un convenio de pago de la deuda de gastos comunes de una unidad (Ley 21.442 art. 6) mediante `POST /api/convenios` (guard `fi:cobranza` crear). El convenio MUST quedar autorizado por un **acuerdo del Comité en estado `aprobado` de la misma comunidad**, leído de la tabla `Acuerdo` —nunca declarado por el cliente—: sin esa fila la ruta MUST responder 400 con el motivo (acuerdo inexistente en la comunidad, acuerdo de cuerpo distinto del Comité o acuerdo no aprobado) y no escribe ninguna fila. La **primera cuota** MUST pagarse al suscribir: se registra como `CuotaConvenio` número 0 en estado `pagada`, con su fecha y el usuario que la registró, y NUNCA se genera como deuda. El saldo `montoTotal − primeraCuota` SHALL repartirse en `numeroCuotas` cuotas mensuales de al menos un centavo, con el residuo del redondeo en la **última** cuota para que la suma cierre exacta al centavo, y con vencimientos mensuales derivados de la fecha de suscripción que conservan el día del mes (acotado al último día cuando el mes destino no lo tiene, sin arrastrar el día hacia los meses siguientes). La regla que arma las cuotas SHALL ser pura (`cuotasDelConvenio` en `lib/convenios.ts`: no consulta base ni lee reloj) y `numeroCuotas` MUST ser al menos 1, con `0 < primeraCuota <= montoTotal`. Una unidad MUST NOT tener dos convenios en estado `vigente`: el alta MUST responder 409 y no dejar filas, verificándolo dentro de la transacción que escribe. El pago de una cuota SHALL registrarse con `POST /api/convenios/pago` (guard `fi:cobranza` editar) guardando `pagadaEn` y el usuario, MUST rechazar con 409 una cuota ya pagada sin reescribir la fila, y al pagarse la última cuota pendiente el convenio MUST quedar `saldado` en la misma transacción. La lectura (`GET /api/convenios`, guard `fi:cobranza` ver) SHALL devolver los convenios de la comunidad de la sesión con sus cuotas y los totales **pagado** y **pendiente** derivados en memoria —sin una consulta por cuota— y NUNCA SHALL devolver convenios de otra comunidad. Toda escritura SHALL auditar `FI_CONVENIO_CREADO` / `FI_CONVENIO_PAGO` con el monto, la unidad y el folio del acuerdo que autoriza, en la misma transacción que escribe.

La contabilidad del convenio SHALL integrarse mediante `CobroFI`: el alta MUST crear **exactamente un cargo por cada cuota 1..N** —NUNCA por la cuota 0, que ya se pagó al suscribir y volvería a cobrar el mismo dinero— con el monto y el vencimiento de la cuota, `origenRef = convenioId`, `origenModulo = FI`, concepto `gasto_comun`, período `AAAA-MM` del vencimiento y `fondoId` del **fondo de gasto común activo** de la comunidad, resuelto en el servidor como en la emisión de gasto común. Sin ese fondo el alta MUST responder 400 con un mensaje que lo declare y NUNCA escribir fila alguna (ni convenio, ni cuota, ni cargo, ni evento): no se inventa un fondo. Los cargos y el evento `FI_CONVENIO_CARGOS` —que audita el **conteo** de cargos creados, no los montos— SHALL escribirse en la MISMA transacción que el convenio y sus cuotas, de modo que un fallo al crear los cargos revierta todo. El pago de una cuota SHALL reflejarse además en el `CobroFI` que le corresponde —resuelto por `origenRef` del convenio y período de vencimiento— como la entrada de pago del módulo FI (el arreglo `pagos` del cobro), NUNCA como un segundo registro de pago; sin ese cargo la cuota MUST NOT marcarse pagada y la ruta MUST responder 409. El ARCHIVO del convenio firmado SHALL integrarse como `Documento` de naturaleza `legal` del archivo de la comunidad, porque el instrumento vale por la FIRMA del deudor y el sistema NO SHALL generarlo: el papel se firma a mano y la administración lo escanea. `POST /api/convenios/documento` (guard `fi:cobranza` editar) SHALL recibir `{ convenioId, nombreArchivo, contenidoBase64 }` —el binario no se persiste: en la base viven los metadatos y la ruta (D1)—, resolver el convenio EN la comunidad de la sesión (404 si no existe) y MUST responder 409 si ese convenio YA tiene documento, porque el papel firmado se sube una sola vez y no se reemplaza. MUST rechazar con 400, sin escribir ninguna fila y sin tocar el depósito, un archivo cuyos BYTES no empiecen con la cabecera `%PDF-`: un escaneo en otro formato no se puede abrir como el papel firmado. El binario SHALL guardarse en el depósito PRIVADO de la plataforma con acceso privado y un pathname que decida el SERVIDOR (`convenios/<comunidad>/<convenio>/<documento>.pdf`), NUNCA en la base ni en base64, y el `Documento` SHALL guardar los metadatos del archivo REAL —nombre saneado, MIME `application/pdf`, tamaño y hash SHA-256 calculados de los bytes, y `archivoUrl` = el pathname del depósito, NUNCA una URL pública—, con `referenciaAutentica` del acuerdo del Comité que autoriza el convenio y `vigenteDesde` = la fecha de suscripción del convenio; `ConvenioPago.documentoId` (aditivo y nullable, sin backfill) SHALL quedar apuntando a ese documento. La subida SHALL ocurrir ANTES de la transacción que escribe: si la subida falla NO SHALL escribirse documento, vínculo, constancia ni evento, y si la transacción falla después de subir, el archivo subido SHALL borrarse del depósito. Esa misma transacción SHALL registrar la constancia de entrega al DEUDOR en `EnvioDocumento` en estado `pendiente` con su motivo —el contrato de los envíos admite `entregado` sólo si el servidor aceptó el mensaje, y esta unidad no cursa ningún envío— y el evento `FI_CONVENIO_DOCUMENTO_SUBIDO`. `GET /api/convenios/documento?convenioId=` (guard `fi:cobranza` ver) SHALL servir los bytes descargados del depósito con el token del servidor, con el MIME y el nombre ARCHIVADOS y `no-store`; el residente NO SHALL leerlo (403), porque el documento lleva el nombre del deudor y su deuda. Las dos rutas SHALL ser ESTÁTICAS —el convenio viaja en el cuerpo y en la query, sin segmento dinámico— y SHALL compartir la compuerta del convenio, no una clave nueva. La constancia del convenio en el aviso de cobro y la anulación del convenio NO son parte de esta capacidad todavía.

#### Scenario: Alta con el acuerdo del Comité
- **WHEN** la administración suscribe un convenio de $1.000.000 en 3 cuotas con primera cuota de $333.333, citando un acuerdo del Comité aprobado
- **THEN** responde 201, la cuota 0 queda `pagada` en la fecha de suscripción con $333.333 y las cuotas 1 a 3 quedan `pendientes` sumando exactamente $666.667, con evento `FI_CONVENIO_CREADO` que cita el folio del acuerdo

#### Scenario: Los cargos FI nacen con el convenio
- **WHEN** el alta de un convenio de 3 cuotas termina bien en una comunidad con fondo de gasto común activo
- **THEN** existen exactamente 3 `CobroFI` ligados al convenio por `origenRef`, uno por cada cuota 1..3 —ninguno por la cuota 0—, con el monto y el vencimiento de su cuota y la suma exacta del saldo, imputados al fondo activo, y un solo evento `FI_CONVENIO_CARGOS` que cuenta los 3 cargos

#### Scenario: Sin fondo de gasto común activo no hay convenio
- **WHEN** se intenta suscribir un convenio en una comunidad que no tiene un fondo de gasto común activo
- **THEN** responde 400 con un mensaje que declara la falta de fondo y la base no gana convenio, cuota, cargo ni evento

#### Scenario: Un fallo al crear los cargos revierte el convenio
- **WHEN** la escritura de los cargos FI falla en medio de la transacción del alta
- **THEN** no queda escrito el convenio, ni sus cuotas, ni ningún cargo, ni el evento de auditoría

#### Scenario: Sin acuerdo aprobado del Comité no hay convenio
- **WHEN** se suscribe un convenio citando un acuerdo inexistente, uno que no es del Comité o uno que sigue `abierto`
- **THEN** cada intento responde 400 con su motivo y la base no gana ni un convenio ni una cuota

#### Scenario: Un solo convenio vigente por unidad
- **WHEN** se intenta suscribir un segundo convenio vigente para la misma unidad
- **THEN** responde 409, la unidad conserva un único convenio y no se crean cuotas nuevas

#### Scenario: El reparto del saldo cierra al centavo
- **WHEN** el saldo a financiar no es divisible por el número de cuotas
- **THEN** las cuotas quedan iguales salvo la última, que absorbe el residuo del redondeo, y su suma es exactamente el saldo

#### Scenario: Vencimientos mensuales desde la suscripción
- **WHEN** se suscribe un convenio un 31 de enero
- **THEN** las cuotas vencen el 28 de febrero, el 31 de marzo y el 30 de abril: el día sale de la suscripción y un mes corto no lo arrastra

#### Scenario: Pagar la última cuota cierra el convenio
- **WHEN** se registra el pago de la última cuota pendiente
- **THEN** la cuota queda `pagada` con su fecha y su usuario, el convenio queda `saldado` en la misma transacción y el evento `FI_CONVENIO_PAGO` queda auditado

#### Scenario: El pago de la cuota se refleja en su cargo FI
- **WHEN** se registra el pago de una cuota del convenio
- **THEN** el `CobroFI` de esa cuota queda con una sola entrada de pago por el monto de la cuota, sin una segunda fila ni un segundo registro de pago

#### Scenario: Una cuota no se paga dos veces
- **WHEN** se registra el pago de una cuota que ya estaba `pagada`
- **THEN** responde 409 sin mover la fecha de pago ni agregar un evento

#### Scenario: La lectura no cruza comunidades
- **WHEN** se leen los convenios con un `?comunidadId=` de otra comunidad en la URL
- **THEN** la respuesta trae sólo los convenios de la comunidad de la sesión, con sus cuotas y los totales pagado y pendiente derivados de ellas

#### Scenario: Sin sesión y sin la clave financiera
- **WHEN** se llaman las tres rutas sin sesión, o con un rol que no tiene `fi:cobranza`
- **THEN** responden 401 y 403 respectivamente, y el intento rechazado no deja convenios ni cuotas

#### Scenario: El papel firmado entra al archivo legal
- **WHEN** la administración sube el PDF escaneado del convenio
- **THEN** responde 201 con el id del documento, su hash y su tamaño, el `Documento` legal queda con el tamaño y el hash REALES de los bytes y con el pathname del depósito privado como URL, el convenio apunta a él, la constancia de entrega al deudor queda `pendiente` con su motivo y el evento `FI_CONVENIO_DOCUMENTO_SUBIDO` queda auditado

#### Scenario: El archivo servido es el que se archivó
- **WHEN** se descarga el papel firmado de un convenio que lo tiene
- **THEN** la respuesta trae los MISMOS bytes que se archivaron, con el MIME y el nombre archivados y `no-store`, y el SHA-256 de lo servido es el hash que el documento declara

#### Scenario: Un archivo que no es PDF no entra
- **WHEN** se sube un archivo cuyos bytes no empiezan con `%PDF-`
- **THEN** responde 400 con el motivo y no se escribe ni documento, ni vínculo, ni constancia, ni evento, y el depósito no recibe la subida

#### Scenario: El papel firmado se sube una sola vez
- **WHEN** se sube un segundo papel para un convenio que ya tiene documento
- **THEN** responde 409 y el documento archivado conserva su id, su hash, su versión y sus bytes

#### Scenario: Ni otra comunidad ni el residente alcanzan el papel
- **WHEN** se sube o se descarga el papel de un convenio de otra comunidad, o un residente llama a las dos rutas
- **THEN** el convenio ajeno responde 404 en las dos rutas y el residente 403, sin escribir filas ni tocar el depósito

#### Scenario: Sin archivo no hay documento, y sin transacción no queda archivo
- **WHEN** la subida al depósito falla, o la transacción que archiva el documento no se puede aplicar después de subir
- **THEN** el primer caso no escribe ninguna fila, y en el segundo el archivo subido se borra del depósito: no quedan documentos sin bytes ni bytes sin documento

### Requirement: Presupuesto por Partidas
El sistema SHALL registrar el presupuesto por partidas de un período (AAAA) aprobado por **el cuerpo que el reglamento de la comunidad defina**. La Ley 21.442 faculta al **Comité** a aprobar presupuestos estimativos de gastos comunes (art. 17) y reserva materias a la **Asamblea** (art. 15): cuál de los dos aprueba las partidas NO SHALL elegirlo el sistema. El alta (`POST /api/presupuestos`, guard `fi:gasto_comun` crear) SHALL exigir un **acuerdo de esta comunidad en estado `aprobado`** —leído de la tabla `Acuerdo`, nunca declarado por el cliente—, MUST responder 400 con el motivo si el acuerdo no existe en la comunidad, no está aprobado o su cuerpo no es `comite` ni `asamblea`, y en ese caso NO SHALL escribir ninguna fila. El `cuerpo` del presupuesto SHALL **copiarse del acuerdo** que lo aprueba, de modo que el registro conserve quién aprobó y no lo asuma.

El presupuesto SHALL persistirse en el modelo aditivo `Presupuesto` (tabla `presupuestos`: período, cuerpo `comite|asamblea`, acuerdo que lo aprueba, versión, estado `vigente|reemplazado`, total, quién lo registró) con sus `PartidaPresupuesto` (tabla `partidas_presupuesto`: nombre, categoría del catálogo de egresos FI —el desglose por concepto del Reglamento art. 24—, monto y orden único por presupuesto), con índice único `(comunidadId, periodo, version)`. Las **partidas vacías o con monto negativo** NO SHALL constituir presupuesto (400 y ninguna fila). El `total` SHALL ser la suma **exacta** de las partidas en centavos enteros y SHALL persistirse como **snapshot** de lo aprobado: una partida que cambie después no reescribe el presupuesto. La regla que decide el total, la habilitación y la validez de las partidas SHALL ser pura (`totalDePartidas`, `presupuestoPermitido`, `validarPartidas` en `lib/presupuesto.ts`: sin base ni reloj).

Una comunidad MUST NOT tener dos presupuestos `vigente` del mismo período: un alta nueva del mismo período SHALL ser la **versión siguiente** y el vigente anterior SHALL quedar `reemplazado` en la MISMA transacción que escribe el nuevo, conservando sus partidas y su total para que la historia siga legible. La versión y el reemplazo se resuelven dentro de la transacción (el índice único es la garantía dura contra la carrera) y NO SHALL existir una ruta separada de reemplazo. La lectura (`GET /api/presupuestos`, guard `fi:gasto_comun` ver) SHALL devolver todas las versiones de la comunidad de la sesión con sus partidas ordenadas, su estado y su total persistido, en un número FIJO de consultas, y NUNCA SHALL devolver presupuestos de otra comunidad. Toda escritura SHALL auditar `FI_PRESUPUESTO_CREADO` con el período, la versión, el cuerpo aprobador, el total y el folio del acuerdo, en la misma transacción. NO SHALL existir PUT ni DELETE: un presupuesto aprobado es evidencia y se cambia aprobando otro.

Frontera deliberada: el presupuesto NO SHALL ser la fuente del monto de la emisión —la emisión cobra el gasto devengado y el presupuesto es estimativo (Ley 21.442 art. 22)—; con presupuesto `vigente` del año la emisión sólo se contrasta contra su doceavo mensual y declara el desvío sin bloquearse, y sin presupuesto aprobado corre con su advertencia. La **imputación del gasto a cada partida** (comparar egresos partida por partida y mostrar el saldo por concepto) NO es parte de esta capacidad y queda declarado como deuda en `specs/PENDIENTES-FUNCIONALIDAD.md`.

#### Scenario: El cuerpo aprobador sale del acuerdo
- **WHEN** la asamblea aprueba el presupuesto de 2026 y después el comité aprueba la versión revisada del mismo período
- **THEN** la primera versión queda con cuerpo `asamblea` y la segunda con cuerpo `comite`: el sistema copia el cuerpo de cada acuerdo y nunca lo asume

#### Scenario: Sin acuerdo aprobado no hay presupuesto
- **WHEN** se intenta crear un presupuesto citando un acuerdo inexistente en la comunidad, uno que sigue `abierto` o uno de cuerpo `consejo`
- **THEN** cada intento responde 400 con el motivo que falta y la base no gana ni presupuesto ni partidas

#### Scenario: El total exacto queda como snapshot
- **WHEN** se aprueba un presupuesto de partidas $333.333,33 + $333.333,33 + $333.333,34
- **THEN** el total persistido es exactamente $1.000.000, igual a la suma en centavos de las partidas, y la respuesta lo devuelve junto con el folio del acuerdo que lo aprueba

#### Scenario: Una sola versión vigente por período
- **WHEN** se registra un segundo presupuesto del mismo período
- **THEN** queda como versión 2 en estado `vigente`, la versión 1 pasa a `reemplazado` en la misma transacción y sólo una versión del período queda vigente

#### Scenario: El reemplazo conserva la historia
- **WHEN** se lee el presupuesto después de un reemplazo
- **THEN** las dos versiones aparecen con su estado y su cuerpo, y las partidas y el total de la versión reemplazada no se borraron ni se reescribieron

#### Scenario: Partidas vacías o monto negativo rechazados
- **WHEN** el alta envía una lista de partidas vacía o una partida con monto negativo
- **THEN** responde 400 y no queda ninguna fila del período

#### Scenario: La lectura del presupuesto no cruza comunidades
- **WHEN** se leen los presupuestos con un `?comunidadId=` de otra comunidad en la URL
- **THEN** la respuesta trae sólo las versiones de la comunidad de la sesión, con sus partidas ordenadas y su total persistido, y ningún presupuesto ajeno

#### Scenario: Sin sesión y sin la clave del gasto común
- **WHEN** se llaman las dos rutas sin sesión, o con un rol que no tiene `fi:gasto_comun`
- **THEN** responden 401 y 403 respectivamente, y el intento rechazado no deja presupuestos ni partidas

### Requirement: Pagos con Ajuste Manual e Informe de Diferencia Inmutable
Al recibir un pago, el sistema MUST cargar el monto exigible exacto (deuda base + moras − pagos previos) mediante `registrarPagoFI(cobroId, pago)`. Si el administrador ingresa un monto distinto (descuento a favor del residente o recargo a favor de la comunidad), el sistema MUST exigir justificación obligatoria, procesar el pago y generar un informe de diferencia inmutable (sin acciones de edición ni borrado) que registra esperado, recibido, diferencia, tipo y justificación; audita `FI_RECEIVE_PAYMENT` y, ante ajuste, también `FI_MANUAL_DISCOUNT`.

#### Scenario: Pago exacto cierra el cobro
- **WHEN** se registra un pago igual al exigible de un cobro vencido con mora
- **THEN** el cobro queda pagado con deuda base y mora cubiertas

#### Scenario: Descuento sin justificación rechazado
- **WHEN** se registra un pago menor al exigible sin texto justificativo
- **THEN** retorna `{ok:false}` exigiendo la justificación del ajuste

#### Scenario: Informe de diferencia inmutable
- **WHEN** se procesa un pago ajustado con justificación
- **THEN** la diferencia queda registrada de forma inmutable con tipo descuento/recargo, montos y fecha, junto a los eventos de auditoría

### Requirement: Integración con Auditoría y Métricas (AM)
El módulo SHALL emitir `FI_EMISION_GC`, `FI_EGRESS_CREATED`, `FI_MORA_APPLIED`, `FI_RECEIVE_PAYMENT`, `FI_MANUAL_DISCOUNT`, `FI_COBRANZA_SENT`, `FI_FUND_WITHDRAWN`, `FI_CONVENIO_CREADO`, `FI_CONVENIO_CARGOS` y `FI_CONVENIO_PAGO` como eventos inmutables con data cuantificable: montos emitidos vs recaudados, diferencias por ajustes manuales, gestiones de cobranza realizadas, convenios suscritos y cobrados, cargos creados por convenio, índice de morosidad y recaudación por fondo derivables de las colecciones.

#### Scenario: Auditoría completa del ciclo
- **WHEN** ocurren emisión, egreso, mora, pago ajustado y cobranza
- **THEN** cada acción registra su evento con montos legibles sin mutar colecciones históricas

### Requirement: Ingreso manual a fondo
El sistema SHALL permitir registrar ingresos directos a un fondo mediante `POST /api/ingresos-fi` (upsert idempotente por id, admin), con campos `fecha` (ISO AAAA-MM-DD), `monto` mayor a cero, `concepto` no vacío, `fondoId` existente y `familia` opcional, sin origen en cobros. El ingreso se persiste con id `fi-ing-*`, se valida por zod y por existencia y vigencia del fondo, y audita `FI_INGRESO_REGISTRADO` categoría FI. La ruta SHALL rechazar fondo inexistente o inactivo, monto ≤0 o concepto vacío.

#### Scenario: Registro válido de ingreso manual
- **WHEN** se invoca `POST /api/ingresos-fi` con `{fecha:"2026-09-01", monto:50000, concepto:"Aporte extraordinario", fondoId:"fondo-gc"}` y el fondo existe
- **THEN** responde 201, el ingreso queda persistido con id `fi-ing-*` y se registra evento `FI_INGRESO_REGISTRADO`

#### Scenario: Fondo inexistente rechazado
- **WHEN** se intenta registrar un ingreso con `fondoId` que no existe en `fondosFI`
- **THEN** responde 400 con error que cita fondo inexistente y no crea el ingreso

#### Scenario: Monto no positivo o concepto vacío rechazado
- **WHEN** se envía `monto <=0` o `concepto` vacío
- **THEN** responde 400 por validación zod y no crea el ingreso

#### Scenario: Ingreso manual contribuye al saldo del fondo
- **WHEN** un fondo tiene ingresos manuales registrados
- **THEN** `saldoFondo(fondoId)` los incluye como ingresos junto a cobros y aportes menos egresos

### Requirement: Saldo de apertura de fondo
Los fondos MAY tener campo opcional `saldoInicial` (number, default 0) editable en UI que `saldoFondo(fondoId, ctx)` SHALL sumar como `(ctx.saldoInicialPorFondo?.[fondoId] ?? 0)` a `ingresosCobros + aportes − egresos`. Con `saldoInicial` 0 el saldo es fiel al flujo; con valor ajustado cuadra contra el libro. El cálculo con el nuevo parámetro opcional NO SHALL cambiar resultados existentes cuando no se provee mapa.

#### Scenario: Saldo con apertura cuadrada
- **WHEN** un fondo tiene `saldoInicial = 17082694` y movimientos netos −17082694
- **THEN** `saldoFondo` retorna 0

#### Scenario: Compatibilidad hacia atrás sin saldoInicial
- **WHEN** se calcula saldo sin proveer `saldoInicialPorFondo` o con fondo sin `saldoInicial`
- **THEN** el resultado coincide con el cálculo previo (default 0) y los 462 tests existentes siguen verdes

#### Scenario: Edición de saldo de apertura en UI
- **WHEN** el usuario edita el campo "Saldo de apertura" de un fondo y guarda
- **THEN** `saveFondoFI` persiste `saldoInicial` validado por zod y el saldo derivado refleja el nuevo valor

### Requirement: Punto cero histórico 2023-2024
La comunidad SHALL arrancar con la historia real de ingresos y egresos 2023-2024 cargada como línea base: el sistema SHALL exponer el fixture `k0mp4ss_fe/apps/web/data/finanzas/punto-cero-2324.json` (derivado de `Data/NSGC/ingresosvsegresos.23y24/INGvsEGR.xlsx` sin leer el xlsx en runtime) con fondo `fondo-cc-punto-cero` (Cuenta Corriente, tipo gasto_comun, saldoInicial 17082694), 186 egresos (monto, fecha ISO, concepto, familia, categoria mapeada sueldos/mantencion/servicios/administracion/otro, esRecurrente solo "Pago Administración") y 45 ingresos (fecha ISO, monto, concepto, familia). La migración `STORE_VERSION 26→27` SHALL poblar estos datos de forma aditiva e idempotente por IDs deterministas `fondo-cc-punto-cero`, `fi-egr-hist-001..186` (orden fecha ascendente, folio `FE-####` continuo respetando el contador existente sin chocar con seed ni TEST-*) y `fi-ing-hist-001..045`; re-ejecutar la migración NO SHALL duplicar. Tras migrar, `saldoFondo("fondo-cc-punto-cero")` con `saldoInicial` SHALL ser 0 y los totales por año SHALL coincidir con el libro. La fixture y la migración SHALL convivir con el seed NSGC y con datos `TEST-*` sin romper dashboards FI.

#### Scenario: Fixture canónico versionado
- **WHEN** se inspecciona `data/finanzas/punto-cero-2324.json`
- **THEN** contiene `fondoCC` {id:"fondo-cc-punto-cero", nombre:"Cuenta Corriente", tipo:"gasto_comun", saldoInicial:17082694}, 186 egresos y 45 ingresos con fechas ISO, categorías mapeadas según familia y `esRecurrente` solo en "Pago Administración", y 24 entradas `saldoCC`; totales $62.491.011 egresos / $45.408.317 ingresos validados en ETL

#### Scenario: Migración v26→v27 puebla el punto cero de forma idempotente
- **WHEN** `migrate(persistedV26, 26)` corre sobre un store v26 sin el fondo histórico
- **THEN** crea `fondo-cc-punto-cero` con saldoInicial 17082694, inserta 186 egresos con folios `FE-####` únicos y continuos y 45 ingresos con ids `fi-ing-hist-*`; una segunda ejecución no crea duplicados ni nuevos folios

#### Scenario: Folios históricos continúan secuencia sin chocar con seed ni TEST-*
- **WHEN** el store v26 ya contiene egresos con folios `FE-*` (seed o TEST-*)
- **THEN** los 186 históricos usan el rango siguiente del contador `siguienteFolioFE` (max existente +1 .. max+186) sin colisionar y el decision log lo documenta

#### Scenario: Saldo del fondo Cuenta Corriente cuadra con el libro
- **WHEN** se calcula `saldoFondo("fondo-cc-punto-cero", {cobros:[], egresos:egresosHist, emisiones:[], ingresosFI:ingresosHist, saldoInicialPorFondo:{"fondo-cc-punto-cero":17082694}})` sobre el store migrado
- **THEN** retorna 0

#### Scenario: Totales por año coinciden con el libro
- **WHEN** se suman los montos migrados por año
- **THEN** egresos 2023 = 19.506.242, egresos 2024 = 42.984.769, ingresos 2023 = 13.309.017, ingresos 2024 = 32.099.300

#### Scenario: Dashboards FI no rompen tras el punto cero
- **WHEN** se renderizan morosidad/reportes y el store contiene el punto cero
- **THEN** los componentes consumen `fondosFI/egresosFI/ingresosFI` sin error y reflejan los montos históricos en sus agregados

### Requirement: Espejo BD de Finanzas (sync ST)
El sistema SHALL mantener en BD (Prisma/SQLite) un espejo de retención de las colecciones FI `fondosFI` (con `saldoInicial`), `egresosFI` e `ingresosFI` mediante `POST /api/fi/sync`: ingesta batch idempotente (upsert por id, máximo 500 elementos por petición) autenticada, scoped a una comunidad donde el usuario tenga membresía, sin operaciones de delete ni de actualización cruzada de comunidades. El cliente SHALL enviar solo el delta no persistido (Set de ids ya enviados) con debounce de 2 segundos tras el último cambio, sin bloquear la UI; ante respuesta 401 SHALL marcar los ids del batch como fallidos sin reintento en bucle. El sistema SHALL exponer `GET /api/fi` (paginado, filtros `fondoId` y `q`) para verificar el espejo, y un panel read-only en `/finanzas` que muestre totales BD vs store (egresos, ingresos, saldo por fondo) de modo que el punto cero 2023-2024 sea verificable en BD. El store SHALL seguir siendo la fuente de la UI; la BD actúa como espejo de retención.

#### Scenario: Sync batch idempotente del punto cero
- **WHEN** el cliente envía `POST /api/fi/sync` con fondos, egresos e ingresos del punto cero (182 egresos, 44 ingresos, fondo CC con saldoInicial 17082694) y repite el mismo batch
- **THEN** la BD contiene exactamente 182 egresos y 44 ingresos sin duplicados y el fondo Cuenta Corriente conserva su `saldoInicial`

#### Scenario: Cliente sync con debounce y delta
- **WHEN** se registran varios cambios FI consecutivos en menos de 2 segundos
- **THEN** el cliente envía una sola petición con los ids aún no persistidos a los 2 segundos del último cambio, sin bloquear la UI

#### Scenario: Rechazo sin pertenencia a la comunidad
- **WHEN** un usuario autenticado envía `POST /api/fi/sync` con `x-comunidad-id` de una comunidad donde no tiene membresía
- **THEN** la API responde 403 y no persiste ningún elemento del batch

#### Scenario: Batch inválido o excesivo
- **WHEN** el batch supera 500 elementos o ningún elemento tiene forma válida
- **THEN** la API responde 400 sin persistir nada

#### Scenario: 401 sin bucle de reintento
- **WHEN** el POST responde 401 (sesión expirada)
- **THEN** el cliente marca el batch como fallido y no reintenta en bucle; espera el próximo cambio FI

#### Scenario: Verificación del espejo desde /finanzas
- **WHEN** un usuario con sesión consulta el panel "Espejo BD (ST)" en `/finanzas`
- **THEN** ve los totales leídos de BD vía `GET /api/fi` (egresos, ingresos, saldo por fondo) comparados con el store, sin botones de mutación

### Requirement: Setup de pagos TEST vía helper compartido
El spec de pagos SHALL crear su dato TEST vía `e2e/helpers/datos-test`
(`crearUnidadTEST` + `crearCobroTEST` con fondo del seed) y limpiarlo al
final (`limpiarCobroTEST` con reset vía PUT + `limpiarUnidadTEST`), sin setup
inline duplicado. El flujo UI (Libro de cobros, Registrar pago, fila pagada)
queda idéntico.

#### Scenario: Cobro TEST pendiente se paga en la UI
- **WHEN** existe un cobro pendiente TEST creado vía el helper
- **THEN** la fila aparece en el Libro de cobros, Registrar pago lo marca
  pagado y el cleanup no deja residuos TEST.

### Requirement: GATED pagos con dato TEST propio vía API
El spec GATED de pagos SHALL crear su cobro pendiente TEST vía API REST
(POST `/api/unidades` + POST `/api/cobros-fi`, fondo del seed vía GET
`/api/fondos-fi`) y limpiarlo al final (PUT reset de pagos + DELETE), sin
depender de QA-Lab "Poblar todo" ni de inyección localStorage.

#### Scenario: Cobro TEST pendiente se paga en la UI
- **WHEN** existe un cobro pendiente TEST creado vía API
- **THEN** la fila aparece en el Libro de cobros, Registrar pago lo marca
  pagado y el cleanup no deja residuos TEST.

#### Scenario: Cleanup con cobro pagado
- **WHEN** el cobro TEST ya tiene pagos (DELETE bloqueado 409)
- **THEN** el spec resetea pagos vía PUT antes del DELETE.

### Requirement: Scope canónico único (última membresía) en resolvers legacy
Los resolvers que no usan `withComunidadScope` SHALL resolver la ÚLTIMA
membresía (`createdAt desc, id desc`), no la primera: `fi/sync`, `fi`,
`auditoria/sync`, `auditoria` y `comunidadAncla` (mis-datos). El orden
asc movía fondos/egresos/ingresos a `comunidad-b` en cada sync del layout
(admin), vaciando el scope A (causa raíz del spec punto-cero en rojo:
`GET /api/fondos-fi` devolvía `total: 0` en A).

#### Scenario: Sync no migra datos de comunidad
- **WHEN** el layout dispara `POST /api/fi/sync` como admin (scope A)
- **THEN** los upserts conservan `comunidadId = comunidad-a`.

#### Scenario: Punto cero visible en scope A
- **WHEN** se corre `migrate-punto-cero-a-db --comunidad-id=comunidad-a`
- **THEN** fondo CC + 182 egresos + 44 ingresos quedan en A y el tab
  Fondos muestra "Cuenta Corriente".

### Requirement: Estado de cuenta propio del residente
El residente MUST ver su propia deuda **siempre y sólo la suya**, mediante
`GET /api/cobros-fi/mi-estado-cuenta` (compuerta `fi:aviso:propio` ver) y la
pantalla `/comunidad/mi-estado-cuenta`. La ruta SHALL ser auto-acotada: resuelve
la persona del usuario y sus unidades con vínculo **vigente** en la base
(`personaIdDelUsuarioDb` + `unidadesVinculadasDb` con `fechaFin: null`) y arma
el `where` con el `comunidadId` del scope más esas unidades; NUNCA SHALL leer un
`unidadId` ni otro identificador del cliente —un query con un id ajeno se ignora
y no ensancha la respuesta—. Por unidad y período SHALL devolver el monto del
cargo (`montoBase`), lo pagado, las moras devengadas, el saldo pendiente y el
estado, calculados con `saldoPendiente` y `estadoDeCobro` de
`lib/finanzas-utils.ts` —los mismos helpers que usa el resto de FI, sin una
segunda definición de la deuda—, más el `avisoId` del período cuando el papel
está emitido. El saldo total SHALL calcularlo el servidor. La ruta NO SHALL
exponer ids de personas ni filas fuera del alcance: la unidad ajena, la de
vínculo cerrado y la de otra comunidad no aparecen. Sin sesión responde 401 y un
rol sin la clave 403; en cambio, sin ficha en el Maestro de Personas o sin
vínculo vigente la respuesta SHALL ser **200 con lista vacía**, no 403, porque un
403 confirmaría que existe la deuda de una unidad que no es la propia. La
bandera `residenteVeMorosidad` NO SHALL gobernar esta lectura —el residente ve su
deuda siempre, y lo que impide ver la del vecino es el filtro por fila, no un
interruptor que alguien pueda apagar—; la columna se retiró de la base con la migración `20261113000000_retira_banderas_muertas`, aplicada en dev y en producción (run `42697576526`). La
pantalla SHALL ser de **consulta**: muestra el saldo total y una fila por unidad y
período con su estado, enlaza el PDF del aviso cuando existe, y declara «al día»
cuando el saldo es cero conservando el historial; no emite ni reemplaza el
estado de cuenta **certificado** ni el «al día», que son acto del administrador
(CT). El menú SHALL ofrecer la entrada a residente y administrador, nunca a
comité, conserjería ni mantención.

#### Scenario: La deuda propia se arma con lo que el servidor resuelve
- **WHEN** un residente con vínculo vigente en dos unidades abre
  `/comunidad/mi-estado-cuenta`
- **THEN** ve una fila por unidad y período con cargo, pagos, moras, saldo y
  estado, y el saldo total que calculó el servidor

#### Scenario: La unidad ajena no aparece aunque se pida
- **WHEN** un residente consulta
  `GET /api/cobros-fi/mi-estado-cuenta?unidadId=<unidad de otro residente>`
- **THEN** esa fila no aparece y la respuesta sigue trayendo sólo las unidades
  de sus vínculos vigentes

#### Scenario: El vínculo cerrado y la otra comunidad quedan fuera
- **WHEN** la persona tuvo un vínculo con `fechaFin` y existe un cobro de esa
  unidad, o un cobro de otra comunidad apuntando a una unidad propia
- **THEN** ninguna de las dos filas aparece en su estado de cuenta

#### Scenario: Sin vínculo vigente responde 200 con lista vacía
- **WHEN** una sesión sin ficha en el Maestro de Personas, o sin vínculo vigente
  en la comunidad, consulta el endpoint
- **THEN** responde 200 con `data: []` y `saldoTotal: 0`, no 403

#### Scenario: El saldo y el estado salen de los helpers de FI
- **WHEN** un cobro tiene pagos parciales y una mora devengada
- **THEN** el saldo es el cargo más las moras menos lo pagado (nunca negativo) y
  el estado es el que `estadoDeCobro` calcula para el resto de la app, sin una
  regla propia en la pantalla

#### Scenario: Consultar no es certificar
- **WHEN** el residente lee su saldo en esta pantalla
- **THEN** obtiene su deuda con el aviso del período cuando existe, y el
  certificado de estado de cuenta y el «Unidad Al Día» siguen siendo del
  administrador (CT): esta pantalla no los emite

#### Scenario: La bandera retirada no abre ni cierra la pantalla
- **WHEN** el residente abre la pantalla con `residenteVeMorosidad` en `false` o
  en `true`
- **THEN** ve lo mismo en los dos casos, porque lo que decide qué filas ve es el
  filtro por fila de la ruta; el comité queda fuera por la matriz, no por la
  bandera


### Requirement: Corte de Servicios por Morosidad
El sistema SHALL implementar el trámite del corte de servicios de la Ley 21.442
art. 20 N°9, que faculta al administrador a suspender —o requerir a las empresas
que suspendan— la **electricidad, las telecomunicaciones o la calefacción** de las
unidades que adeuden **tres o más cuotas, continuas o discontinuas**. El trámite
SHALL exigir **acuerdo del Comité** y **aviso al deudor con cinco días corridos de
anticipación**, y NO SHALL permitir el corte en una unidad donde resida una persona
**electrodependiente** ni por deudas devengadas bajo **estado de catástrofe**, ni
sobre un **segundo servicio mientras otro esté suspendido**. La decisión SHALL vivir
en la regla pura `lib/cortes-servicio.ts` (`cortePermitido`,
`fechaHabilitadaDelCorte`, `puedeEjecutarse`), sin base ni reloj: las fechas entran
por parámetro y la unidad entra ya resuelta, de modo que el preaviso y la ejecución
no puedan decidir distinto.

El trámite SHALL persistirse en el modelo aditivo `CorteServicio` (tabla
`cortes_servicio`: servicio, acuerdo que autoriza, cuotas impagas, monto adeudado,
`fechaPreaviso`, `fechaHabilitada` = preaviso + 5 días corridos, estado
`preaviso|ejecutado|revocado`, quién y cuándo ejecutó o revocó, motivo de la
revocación y quién cursó el preaviso) y la unidad SHALL llevar el hecho
`electrodependiente` (default `false`), que se LEE de la unidad y nunca del cuerpo
de la petición: una prohibición legal no se declara desde el cliente. El estado
inicial, la fecha del preaviso y la fecha habilitada los SHALL decidir el servidor.

Las **cuotas impagas y el monto adeudado NO SHALL venir del cuerpo de la
petición**: las SHALL derivar el servidor de los `CobroFI` de la unidad con
`morosidadPorUnidad` (`lib/finanzas-utils.ts`, el mismo cálculo con el que el
dashboard de morosos decide qué unidad está atrasada), en una sola consulta para
la unidad, y SHALL persistir esos dos números DERIVADOS como snapshot de por qué se
autorizó el corte —la ejecución los vuelve a juzgar—. Un cuerpo que envíe
`cuotasImpagas` o `montoAdeudado` NO SHALL alterar el dictamen ni la fila: los
campos se descartan, porque la deuda que habilita el corte es un hecho de la base
y no una declaración de quien pide el corte.

Las cuatro rutas de `/api/cortes-servicio` SHALL exigir el recurso `fi:cobranza` de
la matriz —el corte es el último acto de la cobranza: la administración lo ejecuta,
el Comité lo audita— y SHALL resolver SIEMPRE la comunidad desde la sesión, nunca
desde el cliente. `POST /api/cortes-servicio` (crear) SHALL exigir un acuerdo de
esta comunidad, del cuerpo `comite` y en estado `aprobado` (400 con el motivo si
falta alguna condición), SHALL derivar los PERÍODOS VENCIDOS de la unidad —el
número que juzga el dictamen, nunca uno declarado en el cuerpo—, SHALL devolver 404
para la unidad de otra comunidad, 400 para el dictamen de la regla pura y 409 si la
unidad ya tiene un corte vigente del mismo servicio o si otro servicio está
suspendido. `POST /api/cortes-servicio/ejecutar`
(editar) SHALL releer la unidad y el acuerdo, volver a aplicar el dictamen con los
datos del momento del corte —el `electrodependiente` puede haberse registrado
después del preaviso— y cambiar el estado con una actualización CONDICIONAL
(`estado = preaviso`), de modo que una segunda ejecución concurrente responda 409 en
vez de suspender dos veces. `POST /api/cortes-servicio/revocar` (editar) SHALL dejar
el corte en `revocado` con motivo obligatorio, tanto desde `preaviso` como desde
`ejecutado`: **la reposición del servicio procede al día hábil siguiente de
regularizada la deuda** (Ley 21.442 art. 20 N°9), y el sistema registra el hecho
administrativo, no la reconexión. La revocación de un corte `ejecutado` SHALL
guardar ese día en `fechaReposicion` (aditivo y nullable, sin backfill) y SHALL
devolverlo en la respuesta y registrarlo en el evento `FI_CORTE_REVOCADO`: la
administración es la que le comunica al deudor cuándo vuelve el servicio. La
revocación desde `preaviso` NO SHALL inventar esa fecha —la columna queda NULL—
porque el servicio nunca se cortó. `GET /api/cortes-servicio` (ver) SHALL devolver los
cortes de la comunidad de la sesión con su estado y sus fechas en un número FIJO de
consultas. El sistema SHALL auditar `FI_CORTE_PREAVISO`, `FI_CORTE_EJECUTADO` y
`FI_CORTE_REVOCADO` en la misma transacción que escribe el hecho.

El trámite NO SHALL quedarse en el registro del acto: cursar la orden SHALL emitir el
**requerimiento escrito** como `Documento` de naturaleza `legal` del archivo de la
comunidad (`POST /api/cortes-servicio`), en la MISMA transacción del alta y con los
campos de archivo reales —nombre, tipo MIME, tamaño, hash y URL que responde—
calculados del PDF que el motor del repo compila al emitirlo, una glosa que nombra la
unidad y una `referenciaAutentica` que apunta al trámite del corte; el corte SHALL
quedar vinculado a ese documento (`documentoId`, aditivo y nullable, sin backfill:
los cortes anteriores no tienen un escrito que no se cursó). El papel SHALL imprimir
la unidad, el servicio afectado, las cuotas impagas y el monto adeudado, la fecha
desde la cual la suspensión es posible y la base legal, y SHALL servirse por
`GET /api/cortes-servicio/requerimiento` (guard `fi:cobranza` ver, acotado a la
comunidad de la sesión) desde la fila congelada del corte: D1 sigue vigente y el
binario NO se persiste, se recomienda por la misma definición determinista y el hash
guardado lo identifica.

El trámite SHALL registrar además la **constancia de entrega** al deudor en
`EnvioDocumento` para el propietario VIGENTE de la unidad —el mismo criterio de
`propietarioVigenteDeUnidad` que usa la cobranza—, en estado `pendiente` mientras no
exista un envío real: el contrato de los envíos admite `entregado`/`enviado` SÓLO si
el servidor aceptó el mensaje, así que el alta de esta unidad NO SHALL declarar una
entrega que no ocurrió. Sin propietario vigente el preaviso SHALL cursarse igual —la
ley exige avisar—, NO SHALL crearse una fila de entrega sin destinatario, y la
respuesta y la bitácora SHALL nombrar por qué la constancia no existe. La respuesta
del alta SHALL devolver el `documentoId` y la constancia, y el evento
`FI_CORTE_PREAVISO` SHALL registrar los dos.

El **día hábil siguiente** de la reposición (art. 20 N°9) SHALL derivarse del
calendario por la regla pura `siguienteDiaHabil` (`lib/dias-habiles.ts`, sin base y
sin reloj), que salta sábados y domingos y los feriados que recibe por parámetro —la
fuente del repo es el maestro `Feriado` de la comunidad— y NO SHALL tipearse a mano.

Frontera deliberada: la **suspensión material la hace la empresa proveedora**, así
que `ejecutado` es la constancia de que la orden se cursó, no una señal enviada
—este requirement NO SHALL integrar un proveedor—. La prohibición por estado de
catástrofe está implementada en la regla pura y hoy **no tiene fuente en el
sistema** (no existe el dato en la unidad, en el acuerdo ni en la configuración de
la comunidad): queda declarada como deuda en `specs/PENDIENTES-FUNCIONALIDAD.md` y
la ruta no la inventa leyendo el cuerpo de la petición.

#### Scenario: Tres cuotas impagas habilitan el preaviso
- **WHEN** la administración cursa el preaviso de un servicio sobre una unidad sin
  prohibiciones que registra tres o más cuotas vencidas, continuas o discontinuas,
  en sus `CobroFI` (la deuda la deriva el servidor; el cuerpo no la declara)
- **THEN** el alta responde 201, la fila queda en `preaviso` con el número de
  cuotas y el monto DERIVADOS persistidos y la `fechaHabilitada`
  es el quinto día corrido contado desde el día del preaviso

#### Scenario: Menos de tres cuotas no habilita el corte
- **WHEN** la unidad registra cero, una o dos cuotas vencidas en sus `CobroFI`
- **THEN** responde 400 con el motivo de la regla pura y no queda ninguna fila

#### Scenario: La deuda se deriva de los cobros y no del cuerpo
- **WHEN** el preaviso de una unidad con UNA sola cuota vencida envía
  `cuotasImpagas: 3` en el cuerpo, o el de una unidad con cuatro cuotas vencidas
  envía `cuotasImpagas: 99` y `montoAdeudado: 1`
- **THEN** el primero responde 400 con el motivo de las tres cuotas y no deja
  ninguna fila (el campo se descarta), y el segundo responde 201 con el número de
  cuotas y el monto DERIVADOS de la base persistidos en la fila y en la auditoría;
  una unidad con tres cuotas emitidas de las que una está pagada tampoco habilita
  el corte, porque esa cuota no está vencida

#### Scenario: Sin acuerdo aprobado del Comité no hay preaviso
- **WHEN** el acuerdo no existe en la comunidad, es de asamblea o sigue `abierto`
- **THEN** responde 400 con el motivo que falta y no queda ninguna fila

#### Scenario: La electrodependencia bloquea siempre
- **WHEN** la unidad tiene registrada una persona electrodependiente, aunque adeude
  diez cuotas
- **THEN** el preaviso responde 400 con el motivo y no queda ninguna fila, y una
  electrodependencia registrada DESPUÉS del preaviso impide ejecutar el corte

#### Scenario: La deuda devengada en catástrofe bloquea el corte
- **WHEN** la deuda se devengó bajo estado de catástrofe
- **THEN** la regla pura niega el corte con su motivo, sin mirar el número de cuotas

#### Scenario: Un solo servicio a la vez
- **WHEN** la unidad ya tiene un servicio suspendido y se intenta preavisar otro, o
  se repite el mismo servicio
- **THEN** responde 409 y no queda ninguna fila nueva

#### Scenario: El corte no se adelanta al quinto día
- **WHEN** se intenta ejecutar el corte el mismo día del preaviso o el cuarto día
- **THEN** responde 400 con el motivo, la fila sigue en `preaviso` y no se emite
  `FI_CORTE_EJECUTADO`

#### Scenario: Cumplido el plazo el corte se ejecuta y se re-ejecuta una sola vez
- **WHEN** se ejecuta el corte el quinto día y después se lo intenta ejecutar de
  nuevo
- **THEN** la primera ejecución responde 200 con estado `ejecutado` y audita
  `FI_CORTE_EJECUTADO`, y la segunda responde 409 sin volver a escribir la fila

#### Scenario: La revocación deja la unidad habilitada
- **WHEN** la administración revoca el corte por pago de la deuda o por error, con
  su motivo
- **THEN** responde 200 con estado `revocado`, audita `FI_CORTE_REVOCADO` y no se
  puede revocar una segunda vez (409); la reposición del servicio corre desde el
  día hábil siguiente de regularizada la deuda

#### Scenario: La revocación de un corte ejecutado fija el día de reposición
- **WHEN** la administración revoca un corte `ejecutado` un viernes o la víspera de
  un feriado del maestro de la comunidad, o revoca uno que sólo estaba en `preaviso`
- **THEN** en los dos primeros casos la respuesta y la fila traen `fechaReposicion`
  en el primer día hábil posterior —el lunes, o el siguiente al feriado— y el evento
  `FI_CORTE_REVOCADO` registra esa fecha, y en el tercero `fechaReposicion` es NULL
  porque el servicio nunca se cortó y no hay nada que reponer

#### Scenario: La lectura está acotada a la comunidad de la sesión
- **WHEN** el Comité consulta `GET /api/cortes-servicio`, incluso con un
  `?comunidadId=` de otra comunidad en la URL
- **THEN** recibe sólo los cortes de la comunidad de la sesión, con su estado y sus
  fechas, y ningún corte de otra comunidad aparece

#### Scenario: La suspensión material no la hace el sistema
- **WHEN** el corte queda `ejecutado`
- **THEN** lo que existe es la constancia de la orden cursada y su auditoría, no una
  señal enviada a la empresa proveedora

#### Scenario: El preaviso emite el requerimiento escrito y lo vincula al corte
- **WHEN** la administración cursa el preaviso de un corte que procede
- **THEN** queda un `Documento` de naturaleza `legal` en el archivo de la comunidad,
  con glosa que nombra la unidad, `referenciaAutentica` que apunta al trámite, los
  campos de archivo con el nombre, el MIME, el tamaño y el hash del PDF REAL y una
  URL que devuelve esos bytes (un PDF de verdad); el corte queda apuntando a ese
  documento con `documentoId`, y la respuesta del alta y el evento
  `FI_CORTE_PREAVISO` registran su id

#### Scenario: La constancia de entrega nace pendiente y no declara un envío que no ocurrió
- **WHEN** la unidad tiene propietario vigente y el preaviso se cursa
- **THEN** queda una sola fila de `EnvioDocumento` para esa persona, acotada a la
  comunidad de la sesión, en estado `pendiente` y con su motivo: no hay entrega
  declarada sin un envío que el servidor haya aceptado, y la respuesta devuelve el id
  de la constancia

#### Scenario: Sin propietario vigente el preaviso se cursa y la constancia no se inventa
- **WHEN** la unidad no tiene propietario vigente en el Registro de Copropietarios y
  la morosidad habilita el corte
- **THEN** el preaviso responde 201 con su requerimiento escrito, no se crea ninguna
  fila de `EnvioDocumento` y la respuesta y la bitácora dicen que la constancia no se
  creó porque la unidad no tiene propietario vigente

#### Scenario: El día hábil de reposición se deriva del calendario
- **WHEN** la deuda se regulariza un viernes, un sábado o un feriado
- **THEN** el día hábil siguiente que devuelve la regla pura es el primer día hábil
  posterior (el lunes, o el siguiente al feriado), nunca un día tipeado

### Requirement: Conciliación de Cartola Bancaria
El sistema SHALL conciliar la cartola que el banco exporta contra los registros de
la comunidad, bajo la decisión D1 del plan: NO SHALL integrarse al banco por API ni
por scraping. La importación entra por `POST /api/conciliacion/importar` (guard
`fi:cobranza` crear) con el nombre del archivo y su contenido como texto. El
sistema NO SHALL guardar el binario: guarda las filas que pudo leer y su estado de
conciliación, y el nombre del archivo es lo único que conserva el origen del dato.
El reglamento de la ley exige llevar las cuentas e inversiones «debidamente
conciliadas» (art. 24) y el reglamento de la comunidad pide vincular el ingreso
bancario con la unidad: eso es lo que esta capacidad deja medible.

El lector SHALL ser una regla pura (`parsearCartola` en `lib/conciliacion.ts`: sin
base y sin reloj) y SHALL tolerar el separador `,` y `;`, el monto con punto o coma
decimal —con o sin separador de miles— y las fechas `AAAA-MM-DD` y `DD/MM/AAAA`,
con el encabezado en castellano y sus alias habituales. Cada fila ilegible MUST
producir su error con el número de línea del archivo y el dato que no se pudo leer;
la ruta MUST responder 400 con esas filas y NO SHALL importar ninguna: ni la
cartola, ni los movimientos, ni los contadores. Una cartola parcial es un número que
no cuadra y nadie sabe por qué.

Importación y enlace SHALL persistirse en los modelos aditivos `CartolaImportada`
(tabla `cartolas_importadas`: archivo, quién importó, filas, conciliadas y
noConciliadas) y `MovimientoCartola` (tabla `movimientos_cartola`: fecha,
descripción, referencia, contraparte, monto, tipo `cargo|abono`, estado
`conciliado|no_conciliado|resuelto_manual`, origen `autorresuelto|manual`, quién y
cuándo resolvió, y la referencia del cargo con el que quedó atado), con índice
`(comunidadId, estado)` para la cola. La cartola, sus movimientos y el evento de
auditoría SHALL escribirse en UNA transacción, y los contadores MUST cumplir
`filas = conciliadas + noConciliadas`, contando como conciliadas las resueltas a
mano.

El enlace SHALL decidirse con la regla pura `enlazarMovimiento`, en este orden:
(1) referencia exacta y monto exacto; (2) contraparte —RUT o nombre, normalizados,
sin acentos ni puntuación— con monto exacto y fecha dentro de ±5 días; (3) monto
exacto con UN único candidato compatible. El monto SHALL compararse en centavos
enteros. Los candidatos SHALL ser los de la comunidad de la sesión: los
`IngresoFI` (candidato `ingreso`), los `EgresoFI` (candidato `egreso`, con su folio
como referencia y su proveedor como contraparte) y cada pago de un `CobroFI`
(candidato `pago`, con la referencia del aviso y el número de unidad como
contraparte). Un movimiento `cargo` MUST NOT enlazarse con un ingreso ni con un
pago, y un `abono` MUST NOT enlazarse con un egreso. Cuando más de un candidato
coincide por la misma regla, el movimiento MUST NOT enlazarse: queda en la cola de
`no_conciliado`, porque un enlace que adivina es peor que uno sin conciliar.

La cola SHALL resolverse con `POST /api/conciliacion/resolver` (guard
`fi:cobranza` editar) con el movimiento y la referencia del cargo: MUST responder
404 para el movimiento de otra comunidad, 409 si ya estaba `conciliado` o
`resuelto_manual`, y SHALL dejar el movimiento en `resuelto_manual` con `origen`
`manual`, el usuario y la fecha de la resolución y la referencia recibida,
recalculando los contadores de la cartola en la misma transacción con una
actualización CONDICIONAL (`estado = no_conciliado`), de modo que dos resoluciones
concurrentes no se pisen. La lectura (`GET /api/conciliacion`, guard `fi:cobranza`
ver) SHALL devolver las cartolas de la comunidad de la sesión con sus movimientos y
su estado en un número FIJO de consultas, y NUNCA SHALL devolver las de otra
comunidad. Toda escritura SHALL auditar `FI_CARTOLA_IMPORTADA` —con el archivo y
sus contadores— o `FI_MOVIMIENTO_CONCILIADO` —con el movimiento y la referencia— en
la misma transacción.

Frontera deliberada: la conciliación NO SHALL crear asientos contables. Lee
`IngresoFI`, `EgresoFI` y `CobroFI` como candidatos y guarda la referencia con la que
quedó atado cada movimiento; imputar a un fondo o emitir el cargo es trabajo del
trámite que cobra. La importación tampoco SHALL deduplicar por contenido —la tabla
no guarda la huella del archivo—: reimportar el mismo archivo crea otra cartola, y
el operador ve las dos con su nombre y su fecha. La pantalla de la cola NO es parte
de esta capacidad.

#### Scenario: La cartola del banco se lee con sus formatos
- **WHEN** se importa un CSV separado por `;` con fechas `DD/MM/AAAA` y montos como
  `1.234,56`, y otro separado por `,` con fechas `AAAA-MM-DD` y montos como
  `1234.56`
- **THEN** las dos cartolas se leen con el mismo monto y la misma fecha, el tipo de
  cada fila sale del signo —o de la columna `tipo` cuando existe— y la respuesta
  devuelve los importados, los conciliados y los que quedaron en la cola

#### Scenario: Una fila ilegible rechaza el archivo completo
- **WHEN** una cartola trae una fila con fecha inexistente, monto ilegible o
  columnas corridas junto a filas legibles
- **THEN** responde 400 nombrando cada fila inválida y no queda ni la cartola ni el
  movimiento legible que venía en el mismo archivo

#### Scenario: El enlace por referencia y monto
- **WHEN** un movimiento de la cartola trae la referencia de un egreso de la
  comunidad y su monto exacto
- **THEN** el movimiento queda `conciliado`, con `origen` `autorresuelto` y el id
  del egreso como referencia del cargo, y el contador de la cartola lo cuenta

#### Scenario: La ambigüedad queda en la cola
- **WHEN** dos egresos de la comunidad tienen el mismo monto y el movimiento de la
  cartola no trae una referencia que los distinga
- **THEN** el movimiento queda `no_conciliado`, sin referencia de cargo, para que
  una persona decida cuál es

#### Scenario: Un cargo no paga un ingreso
- **WHEN** un cargo de la cartola coincide en monto con un ingreso registrado, o un
  abono coincide con un egreso
- **THEN** el movimiento no se enlaza con ese registro y queda en la cola

#### Scenario: La resolución manual deja rastro y la cartola sigue cerrando
- **WHEN** la administración resuelve a mano un movimiento de la cola con su
  referencia de cargo
- **THEN** el movimiento queda `resuelto_manual` con su autor, su fecha y su
  referencia, el evento `FI_MOVIMIENTO_CONCILIADO` queda auditado y los contadores
  de la cartola se recalculan: `filas` sigue siendo `conciliadas + noConciliadas`

#### Scenario: Un movimiento ya resuelto no se resuelve dos veces
- **WHEN** se intenta resolver un movimiento que ya estaba `conciliado` o
  `resuelto_manual`
- **THEN** responde 409 con su motivo y la fila conserva su autor, su fecha y su
  referencia originales

#### Scenario: Reimportar el mismo archivo no rompe
- **WHEN** se importa dos veces el mismo archivo con el mismo nombre
- **THEN** quedan dos cartolas independientes con sus propios movimientos y sus
  contadores coherentes, porque la importación no deduplica por contenido

#### Scenario: La lectura y los candidatos no cruzan comunidades
- **WHEN** se leen las cartolas con la sesión de una comunidad, o se importa una
  cartola cuyo monto coincide con un egreso de otra comunidad
- **THEN** la lectura sólo devuelve las cartolas de la comunidad de la sesión y el
  egreso ajeno no enlaza nada

#### Scenario: Sin sesión y sin la clave financiera
- **WHEN** se llaman las tres rutas sin sesión, o con un rol que no tiene
  `fi:cobranza` —el comité sólo tiene la lectura— y se intenta importar o resolver
- **THEN** responden 401 y 403 respectivamente, y el intento rechazado no deja
  cartolas ni movimientos

### Requirement: Reparto del Gasto de un Sector por Avalúo Fiscal
El sistema SHALL registrar el reparto de un gasto entre las unidades de UN sector,
en proporción al **avalúo fiscal** de cada una, porque el reglamento de la comunidad
manda que los gastos de bienes o servicios que sirven sólo a un sector se carguen
sólo a ese sector. La emisión mensual de gasto común reparte entre todas las
unidades de la comunidad y no puede expresar esa carga diferenciada: el reparto es
un documento propio, con su propia emisión.

El avalúo fiscal SHALL ser un hecho de la unidad (`Unidad.avaluoFiscal`, columna
aditiva y opcional) y NO SHALL declararse en el cuerpo de la petición: se lee de la
base, porque un avalúo que declara quien pide el reparto le permite moverle la carga
a otra unidad. `NULL` significa **no declarado**. La unidad sin avalúo SHALL quedar
**fuera** del reparto y NO SHALL compensarse repartiendo el monto en partes iguales
entre las demás: el dato que falta no se inventa ni se diluye.

La emisión SHALL congelar, junto con las cuotas, la **lista de las unidades que
quedaron fuera** (`RepartoSector.unidadesExcluidas`), y esa lista SHALL leerse de la
fila persistida, nunca recalcularse contra el padrón del sector: una unidad dada de
alta en el sector después de la emisión no existía cuando se emitió, así que no
puede aparecer como excluida de un reparto anterior. La pantalla SHALL mostrar esa
lista con el número de cada unidad y su motivo, porque una unidad que deja de pagar
en silencio es un error de carga que alguien tiene que ver. El campo vive en el modelo de la
unidad, pero la capacidad es de FI: TU gobierna el maestro de tipos de unidad (las
plantillas), no los hechos catastrales de cada unidad, así que el contrato del
reparto se especifica acá.

La regla que reparte SHALL ser pura (`repartirPorAvaluo` en `lib/reparto-sector.ts`:
sin base y sin reloj) y SHALL sostener cinco reglas:

1. el monto SHALL repartirse en proporción al avalúo de cada unidad que lo tenga
   declarado;
2. la unidad con avalúo `null` (o con un avalúo no positivo) MUST quedar FUERA del
   reparto: NO SHALL asignársele cero, NO SHALL usársela para compensar y NO SHALL
   repartirse el total en partes iguales;
3. si NINGUNA unidad del sector tiene avalúo, el reparto NO SHALL emitirse y la
   respuesta MUST decir el motivo;
4. el dinero SHALL operarse en **centavos enteros** y la suma de las cuotas SHALL
   ser **exactamente** el monto total; el residuo del redondeo SHALL asignarse a la
   unidad de **mayor avalúo** (con empate, a la primera del orden recibido, para que
   el resultado sea determinístico);
5. un monto total que no sea un número finito mayor o igual a un centavo NO SHALL
   repartirse.

La emisión (`POST /api/repartos-sector`, guard `fi:gasto_comun` crear) SHALL
persistir en los modelos aditivos `RepartoSector` (tabla `repartos_sector`:
`microSectorId`, período `AAAA-MM`, concepto, `montoTotal`, `avaluoTotal`, estado
`emitido`, quién lo emitió) y `CuotaRepartoSector` (tabla `cuotas_reparto_sector`:
unidad, `avaluoUsado` y monto, con índice único `(repartoSectorId, unidadId)`), con
`montoTotal` y `avaluoTotal` como **snapshot** y el avalúo de cada cuota
**congelado**: una revalorización posterior de la unidad NO SHALL reescribir un
reparto emitido. El sector MUST ser de la comunidad de la sesión (400 con el motivo
si no existe para ese scope) y, si el reparto no se puede emitir, NO SHALL
escribirse ninguna fila. La emisión, sus cuotas y el evento de auditoría
`FI_REPARTO_SECTOR_EMITIDO` SHALL escribirse en UNA transacción.

La lectura (`GET /api/repartos-sector`, guard `fi:gasto_comun` ver) SHALL devolver
los repartos de la comunidad de la sesión con sus cuotas en un número FIJO de
consultas y NUNCA SHALL devolver los de otra comunidad. NO SHALL existir PUT ni
DELETE: un reparto emitido es la evidencia de lo que se le cargó a cada unidad y con
qué avalúo, y se corrige emitiendo otro.

La emisión SHALL dejar el reparto como **deuda cobrable del período**, no sólo como
documento (S7): por cada unidad INCLUIDA SHALL crearse un `CobroFI` con el monto de
su cuota, el período del reparto, el concepto `gasto_comun` del catálogo FI, el
`origenRef` del reparto y el fondo de gasto común **activo** de la comunidad, en la
MISMA transacción que el reparto y sus cuotas; y la cuota SHALL registrar el cobro
que produjo (`CuotaRepartoSector.cobroId`), de modo que el documento y la deuda se
señalen mutuamente. La suma de las deudas SHALL ser exactamente el monto total del
reparto. La cuota que queda en CERO por el prorrateo NO SHALL producir un cobro: un
cargo de monto base cero no es una deuda que se cobre, y su `cobroId` queda nulo.
Todos los cobros SHALL llevar la misma fecha de cargo —el día de la emisión— y un
vencimiento derivado del día de corte de pago de la comunidad, porque una deuda sin
vencimiento no entra en mora.

La unidad EXCLUIDA por falta de avalúo NO SHALL recibir deuda de ese reparto: no
tiene cuota y no tiene cobro. La lista de `unidadesExcluidas` SHALL ser, por lo
tanto, la lista de a quién no se le cobró ese gasto.

Sin un fondo de gasto común activo la emisión NO SHALL escribir ninguna fila —ni el
reparto, ni sus cuotas, ni las deudas, ni el evento— y SHALL responder 400 con el
motivo: el fondo de imputación no se inventa y NO SHALL tomarse el de reserva.

La emisión SHALL ser idempotente por la identidad del gasto repartido —comunidad,
sector, período y concepto—: si ya existe un reparto con esa identidad, NO SHALL
crearse otro ni otra deuda y la respuesta SHALL ser 409. Corregir un reparto es
emitir otro con su propio concepto. `EmisionGC` NO SHALL modificarse: el reparto
sigue siendo su propia emisión y las deudas del reparto se suman a la cobranza por
sus propios `CobroFI`.

Los repartos emitidos antes de que existiera la deuda NO SHALL reconstruirse hacia
atrás: no tienen cobro y esa es la verdad de lo que pasó. La carga del avalúo por el
maestro de unidades y la pantalla del reparto quedan declaradas como deuda en
`specs/PENDIENTES-FUNCIONALIDAD.md` (F32).

#### Scenario: El gasto del sector se reparte en proporción al avalúo
- **WHEN** se emite el reparto de $1.000.000 en un sector cuyas unidades declararon
  avalúos de $60.000.000 y $40.000.000
- **THEN** las cuotas quedan en $600.000 y $400.000, con el avalúo usado congelado
  en cada una y el avalúo total del reparto en $100.000.000

#### Scenario: La unidad sin avalúo queda fuera y no se reparte en partes iguales
- **WHEN** el sector tiene una tercera unidad con `avaluoFiscal` `NULL` y se emite el
  reparto
- **THEN** esa unidad no aparece en las cuotas —ni con $0—, el total se reparte sólo
  entre las que declararon avalúo y la suma de las cuotas sigue siendo el monto total

#### Scenario: Sin ningún avalúo no se reparte
- **WHEN** se emite un reparto en un sector donde ninguna unidad declaró avalúo (o
  donde los avalúos declarados son cero)
- **THEN** responde 400 con el motivo y no queda ni el reparto ni sus cuotas

#### Scenario: La suma de las cuotas es exactamente el monto total
- **WHEN** se emite un reparto de $1.000.000 con avalúos que dan dos tercios y un
  tercio ($48.000.000 y $24.000.000)
- **THEN** la suma de las cuotas es exactamente $1.000.000 en centavos enteros: el
  centavo del redondeo lo absorbe la unidad de mayor avalúo, que queda en $666.666,67

#### Scenario: Un monto que no llega a un centavo no se reparte
- **WHEN** el alta envía un monto total de cero, negativo o menor a un centavo
- **THEN** responde 400 por el contrato del cuerpo y no queda ninguna fila

#### Scenario: El reparto emitido no se reescribe
- **WHEN** una unidad del sector cambia su avalúo después de emitido el reparto
- **THEN** el reparto conserva su monto total, su avalúo total y el `avaluoUsado` de
  cada cuota tal como se emitieron

#### Scenario: La lectura no cruza comunidades
- **WHEN** se leen los repartos con la sesión de una comunidad, incluso con un
  `?comunidadId=` de otra en la URL
- **THEN** sólo aparecen los repartos de la comunidad de la sesión, con sus cuotas y
  el número de unidad de cada una, y ninguno de la otra comunidad

#### Scenario: Sin sesión y sin la clave del gasto común
- **WHEN** se llaman las dos rutas sin sesión, o con un rol que no tiene
  `fi:gasto_comun` —el residente no la tiene y el comité sólo lee—
- **THEN** responden 401 y 403 respectivamente, y el intento rechazado no deja
  repartos ni cuotas

#### Scenario: El reparto emitido queda como deuda cobrable del período
- **WHEN** se emite el reparto de $1.000.000 de un sector con dos unidades incluidas
  cuyas cuotas son $600.000 y $400.000
- **THEN** quedan dos `CobroFI` del período, por $600.000 y $400.000, imputados al
  fondo de gasto común activo de la comunidad y con `origenRef` al reparto, cada
  cuota registra el cobro que produjo y la suma de las deudas es exactamente
  $1.000.000

#### Scenario: La unidad excluida no recibe deuda del reparto
- **WHEN** el sector tiene una unidad sin avalúo declarado y se emite el reparto
- **THEN** esa unidad no tiene cuota ni `CobroFI` de ese reparto: la lista de
  excluidas es la lista de a quién no se le cobró

#### Scenario: Sin fondo de gasto común activo no se emite ni se escribe
- **WHEN** la comunidad no tiene un fondo de gasto común activo —o lo tiene
  inactivo— y se intenta emitir el reparto
- **THEN** responde 400 con el motivo y no queda reparto, ni cuota, ni cobro, ni
  evento de auditoría

#### Scenario: Emitir dos veces el mismo reparto no cobra dos veces
- **WHEN** se emite otra vez un reparto con la misma comunidad, sector, período y
  concepto que uno ya emitido
- **THEN** responde 409, no se crea un segundo reparto ni una segunda deuda, y otro
  concepto del mismo sector y período sí se emite con su propia deuda

#### Scenario: Si la deuda no se puede escribir no queda el reparto
- **WHEN** la escritura de los `CobroFI` falla dentro de la transacción de emisión
- **THEN** no queda ni el reparto, ni sus cuotas, ni las deudas, ni el evento: la
  emisión es todo o nada
