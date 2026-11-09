# 🧾 13 - Gestión Administrativa (AD)

El panel de trabajo del administrador: desde acá ves los perfiles de toda la comunidad (propietarios, residentes, directiva) y el personal, defines qué puede ver cada uno sobre su propiedad y consultás el **Archivo de Documentos de la Comunidad**, que conserva y pone a disposición el papel legal y comunitario.

## 🚀 Funcionalidad Principal

Centralizar la gestión de personas bajo dos cajones — Comunidad y Recursos Humanos — y dar al propietario controles de privacidad sobre su unidad. El archivo de documentos es la otra mitad: el papel que respalda lo que el panel administra, con su historia y su constancia de entrega.

## 🛠️ Secciones

- **Cajón de Comunidad**: directorio de propietarios, residentes y miembros de directiva, con sus vínculos a unidades y roles.
- **Cajón de Recursos Humanos**: acceso a fichas del personal (conserjería, aseo, administración).
- **Controles por Unidad**: por cada propiedad definís el único control de privacidad vivo, `residenteVeActas`. Si la unidad no tiene registro, aplica el valor por defecto (actas ocultas). Los interruptores de **morosidad** (`residenteVeMorosidad`) y de **alertas a residentes** (`alertasResidentesActivas`) **se retiraron el 2026-11-07** (decisión del owner): ninguna ruta los obedecía, así que la pantalla dejó de prometerlos. La migración `20261113000000_retira_banderas_muertas` retiró esas dos columnas de `controles_propiedad` y de `controles_propiedad_archivados` **sin perder ninguna fila** —se aplicó en dev y en producción (carril `db-prod`, run `42697576526`)—: los seeders dejaron de escribirlas y el `POST` de la ruta no acepta esas claves aunque el cliente las mande. Cada control tiene un estado: `vigente` o `desestimada`. El administrador o el comité pueden desestimar un control, pero **nada se borra**: se copia a la tabla de archivo (`ControlPropiedadArchivada`, con quién y cuándo) y se emite `AD_CONTROL_DESESTIMADO`. El listado excluye los desestimados y al desestimar la unidad queda **liberada** para volver a registrar sus controles.
- **Desestimado no da permisos ni bloquea**: un control desestimado deja de contar — `residenteVeActas` solo suma controles **vigentes** (el archivo no hace visible un acta) y no bloquea eliminar un vínculo de propietario (el bloqueo pasó a mirar solo vigentes).
- **Firma Digitalizada**: los cargos de directiva registran su firma como referencia (URL/metadata) para alimentar el flujo de actas de GD.
- **Archivo de Documentos de la Comunidad (`/comunidad/archivo`)**: la única lista de documentos de la comunidad, con dos naturalezas sobre la misma entidad `Documento` (Ley 21.442 art. 9).
  - **Legal**: lo que la ley manda conservar y poder probar —reglamento de copropiedad y sus modificaciones, actas de asamblea y de comité, Registro de Copropietarios, permiso de edificación y planos, certificado de copropiedad y plano, proveedores y subcontratistas, carpeta de ascensores, manuales de instalaciones, plan de emergencia, pólizas de seguro, contabilidad y rendiciones—. Es **append-only**: editar o borrar responde 409 y la corrección es una versión nueva; el alta exige **referencia auténtica** (fojas, fecha, notaría o Conservador) y sin ella responde 400 con el campo señalado.
  - **Comunitario** (más `otros` para lo que la ley no nombra): se reemplaza y se borra, y reemplazarlo conserva el número de versión.
  - **Versión por tipo**: la asigna el servidor dentro de (comunidad, tipo documental) y el cliente no la manda; dos altas del mismo tipo no comparten número (la segunda responde 409). La tabla marca **Vigente** al legal con la versión más alta de su tipo y **Reemplazado** al resto.
  - **Referencia, no bytes (D1)**: el archivo son metadatos + URL; no hay endpoint de descarga ni columna de contenido, y una URL `data:` o `blob:` se rechaza con 400.
  - **Abrir deja rastro**: el botón *Abrir* resuelve primero el detalle autorizado (`GET /api/documentos/[id]`) y recién después abre la URL; esa lectura emite `AD_DOC_APERTURA` (categoría AD) con el id del documento. Los caminos rojos (401/403/404) no dejan evento, y un fallo de la auditoría no bloquea la apertura.
  - **Envío de lo legal con constancia por destinatario**: `POST /api/documentos/[id]/envio` entrega el documento a N personas en una sola corrida —propietarios, arrendatarios, comité o personas sueltas— por el visor o por correo, y deja una fila por destinatario en `envios_documento`. La clave `documento:persona:canal` es única: repetir la corrida responde `duplicado` sin escribir, y el reenvío explícito agrega una fila nueva marcada `reenvio`. `entregado` solo existe con la notificación del visor creada en la misma transacción o con la aceptación real del servidor de correo; sin emisor configurado queda `pendiente` y un rebote `fallido`, con su motivo. Lo **comunitario no se entrega persona por persona** (409): se publica a la comunidad y su constancia es la publicación.
  - **La constancia de envío es de auditoría**: la lista de entregas de un documento nombra a cada destinatario y pide la misma acción que enviar (`doc` crear). El destinatario ve su entrega en su bandeja: la notificación ES la entrega por el visor, no un resumen de la tabla.
  - **Permiso `doc`**: administración todo, comité `ver` + `crear`, residente `ver`. La pantalla exige el permiso en el servidor y la API lo vuelve a decidir en cada lectura y escritura.
  - **Semilla**: el archivo nace con cuatro documentos de prueba —tres legales con su referencia auténtica y una circular comunitaria— documentados en `28 - MK - Catálogo de Datos Semilla.md` §16.

## 💡 Tips de Oro

- **Privacidad primero**: aunque el residente tenga vínculo vigente, solo ve las actas si el dueño lo autorizó acá. Es el **único** control de privacidad por unidad que el sistema obedece.
- **Firma por referencia**: la firma es una URL/metadato, jamás una imagen incrustada (decisión D1).
- **Un control retirado no se disfraza**: los switches de morosidad y de alertas no se ocultaron ni se dejaron en gris — se quitaron del contrato, de la ruta y del motor. Una bandera que se muestra y nadie obedece enseña a desconfiar de todas las demás.
- **Auditoría**: cambios de configuración, firmas y desestimaciones de controles generan eventos `AD_OWNER_CONFIG_CHANGE`, `AD_DIRECTIVA_SIGN_UPLOAD` y `AD_CONTROL_DESESTIMADO`; la depuración de una ficha de gobernanza al perder el rol `directiva` queda auditada con `AD_DIRECTIVA_DESVINCULADA` por cualquier vía de escritura (API incluida).
- **Alcance actual**: lo contractual/previsional del personal vive en PE; acá solo hay acceso a fichas.
- **Robustez ante extensiones nulas**: las listas de Directiva y Personal excluyen fichas con `datosGobernanza`/`datosLaborales` en `null` (igual que ausente); la página nunca revienta por eso.
- **Ficha atada al período vigente**: la ficha de gobernanza guarda `periodoId`; al guardarla hereda el período de directiva **vigente** (si existe), para que la trazabilidad de quién firmó qué sobreviva a la rotación. Los períodos se gestionan en **GD - Gestión de Directiva**.
- **Ficha editable desde el perfil**: la pestaña **Gobernanza** del perfil de la persona permite crear o editar la ficha (cargo, fecha de asunción, firma por referencia). Si se le quita el rol `directiva` a la persona, la ficha se **depura** — no queda una ficha fantasma sin cargo que la respalde.
- **Un legal se corrige con otra versión**: el 409 no es un defecto de la pantalla, es la regla. Subí el documento corregido como versión nueva y el anterior queda como «Reemplazado», que es la historia que se puede probar.
- **La constancia no se declara, se prueba**: por el visor, `entregado` solo si la notificación existe; por correo, solo si el servidor aceptó el mensaje. Sin emisor SMTP (F4) el correo queda `pendiente` y no se reporta como enviado.
- **Una sola lista de documentos**: la pestaña «Biblioteca» de Comunicación se retiró y lo comunitario se publica desde el Archivo con la naturaleza `comunitario`.

## 🔗 Dependencias

- Lee identidades de **MP - Maestro de Personas** y vínculos de **VU - Vinculación de Unidades**.
- Sus controles gobiernan la visibilidad de actas en **GD - Gestión de Directiva**.
- Las alertas usan la bandeja simulada transversal (**ST - Capa de Datos Persistente**, D3); el envío no tiene opt-out por unidad desde el retiro de `alertasResidentesActivas` (2026-11-07; su columna ya no existe en la base).
- El archivo respalda la versión del reglamento que rige el cobro en **FI - Finanzas y Morosidad** (`VersionReglamento.documentoId`): el alta exige un documento **legal** de la misma comunidad.
- Las entregas de documentos legales usan la notificación interna del visor (**CV/ST**, D3) y el mismo emisor SMTP que el aviso de cobro (**FI**).
- La biblioteca documental de **CO - Comunicación Vecinos** se fusionó acá y la tabla vieja ya no existe: `documentos_co`, `DocumentoCO`, `/api/co/documentos` y el hook `useDocumentosCO` se retiraron en el commit `9f9c363` después de mover sus filas a `documentos` (mapeo columna por columna, versionado corrido por el `MAX(version)` existente de cada comunidad y tipo). `Documento` es la única entidad documental.
