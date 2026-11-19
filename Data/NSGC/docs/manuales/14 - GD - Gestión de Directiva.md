# 📜 14 - Gestión de Directiva (GD)

La memoria formal de la comunidad: registro de reuniones de directiva con asistencia, redacción de actas, aprobación con firmas y publicación controlada.

## 🚀 Funcionalidad Principal

Llevar el ciclo completo del acta: se crea como borrador, los miembros de la directiva vigente la aprueban hasta quórum 100%, y al completarse se publica notificando formalmente a todos los propietarios.

## 🛠️ Secciones

- **Reuniones y Actas**: fecha, hora, lugar, tabla de temas y minuta de cada sesión.
- **Asistencia**: presentes y ausentes (miembros con cargo de directiva) más invitados puntuales.
- **Flujo de Aprobación**: monitor de firmas pendientes; el acta pasa de "Borrador" a "Publicada" solo cuando aprueba el 100% de la directiva vigente.
- **Adjuntos**: soporte documental por referencia (acta escaneada, imágenes) sin incrustar archivos (decisión D1).
- **Desestimación (borrado lógico)**: el administrador o el comité pueden desestimar un acta de borrador, pero **nada se borra**: queda en estado `desestimada` y se guarda una copia íntegra en el archivo de actas (`ActaGDArchivada`) con el motivo (opcional), quién la desestimó y cuándo, todo en una transacción (evento `GD_ACTA_DESESTIMADA`). Un acta **publicada no se desestima** (409): forma parte del libro de actas. El listado ya no muestra las desestimadas, y desestimar de nuevo da 404.
- **Libro de Acuerdos** (`/comunidad/directiva/acuerdos`): el registro de los acuerdos del comité y de la asamblea con folio `AD-<año>-####`, materia, la regla de quórum **aplicada** (`quorumRequerido`, en texto: el registro la conserva tal como se declaró, no la asume) y el acta que respalda la sesión. Cada acuerdo declara su **modalidad**:
  - **Electrónica** (por defecto, el camino de siempre): se resuelve sumando los votos por persona — `VotoAcuerdo` es evidencia inmutable, con el peso de prorrateo de la unidad en la asamblea y un voto por miembro en el comité. El resultado se deriva de los votos y nadie lo edita.
  - **Presencial**: el resultado se **proclama en la sala** y se registra como se proclamó — a favor, en contra, abstenciones, presentes y si la sala declaró que se alcanzó el quórum. No hay votos por persona (la tabla queda vacía **a propósito**: es el modelo) y votar un acuerdo presencial responde **409 «El acuerdo presencial no admite votos: el resultado se proclama en la sala y se registra con su acta.»** El sistema **contrasta** esa proclama con la regla registrada; **no recalcula** mayorías — recomputar la aritmética de la sala exigiría inventar unidades y bases que el acta no declara. El desenlace es final (`aprobado` o `rechazado`, nunca `pendiente`): la sala ya sesionó, y una proclama sin mayoría queda registrada como rechazado igual — es evidencia de lo que ocurrió.
  - **Sin papel no hay acuerdo presencial**: el cierre exige las dos piezas del acta, cada falta con su propio 409 — el acta del libro **publicada y con folio**, y el acta firmada **escaneada y subida** al archivo legal (PDF al depósito privado, con su hash; nunca una URL). Un acuerdo ya resuelto no se reescribe: 409 a cualquier intento de cerrarlo de nuevo o de subirle papeles — el acta archivada con folio es lo que congela lo declarado.
  - **Los papeles** (`POST /api/acuerdos/[id]/documento`, guard `gd` crear): el acta firmada es **obligatoria**; la lista de asistencia y los poderes se archivan cuando existen. Cada papel se sube **una sola vez** (el segundo intento responde 409 sin tocar lo archivado: una firma nueva es otro acto, no una edición), lo que entra tiene que ser un PDF de verdad (se miran los bytes, no el nombre: 400 con otro formato) y el binario se sube antes de la transacción y se borra del depósito si la transacción falla — no quedan huérfanos. Cada papel queda en el **Archivo de Documentos** (ver 13 - AD) como documento legal con la referencia auténtica que cita el folio del acuerdo.
  - **La consola**: el alta declara la modalidad (la electrónica no manda el campo: la fila nace por el default de la base); el cierre pide los cuatro conteos, el acta del libro y los papeles; el botón de cierre sólo se habilita si el servidor dice que el acta firmada está archivada (`actaDocumentoId` leído de la fila, no del click), y los rechazos se muestran con su texto tal cual, sin relectura.
  - **La habilidad del copropietario no se programa**: el sistema no tiene concepto de quién puede votar o ser elegido, y no lo va a inventar — se acredita en el acto con la lista de asistencia y los poderes archivados. Registrar eso es el punto del libro (F29).
  - **Auditoría**: el cierre y cada papel archivado generan eventos `AD_ACUERDO_CERRADO` y `AD_ACUERDO_DOCUMENTO_SUBIDO` (categoría AD).
- **Privacidad**: actas visibles para propietarios y administración; los residentes acceden solo si el dueño activó `residenteVeActas` en **AD - Gestión Administrativa**.
- **Ficha de Gobernanza**: en el perfil de cada directivo (pestaña Gobernanza) se registra cargo, fecha de asunción y firma por URL; sin rol `directiva` la ficha se depura sola.
- **Períodos de Directiva** (`/comunidad/directiva`, sección Períodos): la vigencia que fija la asamblea (art. 17 Ley 21.442, máximo 36 meses, reelegible). Un solo período vigente; al registrar uno nuevo el anterior se **cierra archivando su nómina** (libro: nunca se borra). Composición al activar: impar de 3 a 5 (bloqueo con fundamento). La nómina se arma **buscando personas en el servidor** (por nombre o RUT sobre todas las cuentas activas de la comunidad; el email no es criterio desde T21 —`_` es legítimo en una dirección— y un término con `%` o `_` responde 400 «El parámetro q no acepta los comodines % y _.», el mismo rechazo de F39): ya no depende de la primera página del directorio, así que una persona legalmente nombrable que quede fuera de las primeras cien filas del padrón se puede nombrar igual. La búsqueda exige al menos dos caracteres y admite **60 consultas por minuto por usuario**: al pasarse responde **429 «Demasiadas solicitudes.»** y el rechazo queda en el registro de eventos como `RP_VOLUME_LIMITED` con emisor propio (`0c28c79`), igual que en certificados y comunicación — un techo que no deja rastro no se puede diagnosticar después—. Alertas informativas de vencimiento (90/30 días) + badge de fechas estimadas cuando falta pasar el libro físico.

## 💡 Tips de Oro

- **Quórum 100%**: una sola firma faltante mantiene el acta en borrador; usa el monitor para recordar quién falta.
- **Nómina sin techo**: si no aparece un vecino en el buscador del período, verificá que tenga cuenta activa en el Directorio — la búsqueda cubre la comunidad entera. Buscar de nuevo a quien ya está en la nómina no le pisa el cargo elegido.
- **Aviso al Visor materializado**: la publicación nace con `avisoCVReferencia="pendiente"`; cuando el **CV - Visor de Mensajes** difunde el acta, la referencia se marca con el id del aviso creado (sin republicaciones duplicadas). La notificación simulada a propietarios es inmediata (D3).
- **PDF futuro**: la generación del PDF del acta quedó reservada para **CT - Certificados** (pdfmake, decisión D2); hoy el contenido vive en el sistema.
- **Auditoría**: creación, asistencia, aprobación y desestimación generan eventos `GD_ACTA_CREATED`, `GD_ASISTENCIA_REG`, `GD_ACTA_APPROVED` y `GD_ACTA_DESESTIMADA`.
- **Desestimada no revive**: aprobar un acta desestimada responde 409 (no se reactiva por la puerta de firmas), y el `PUT` no puede forzar el estado `desestimada`: solo lo escribe la desestimación.
- **La proclama no se recalcula**: los números del acta presencial son la evidencia que el papel firmado respalda; el contraste lee lo proclamado contra la regla registrada en el acuerdo. Si la sala proclamó sin mayoría, el acuerdo queda `rechazado` y así se conserva.
- **El acta del libro no es la firma**: son dos 409 distintos — uno pide el acta publicada con folio, el otro el escaneo subido al archivo legal. Publicar el acta no reemplaza la firma, y subir el escaneo no publica el acta.

## 🔗 Dependencias

- Usa las firmas de `datosGobernanza` registradas en **AD - Gestión Administrativa**.
- Los papeles del acuerdo presencial viven en el **Archivo de Documentos** de **AD - Gestión Administrativa** (`Documento` legal, tipo `otros`), servidos por la ruta de ese archivo con el guard `doc`.
- Respeta los controles de visibilidad de actas (`controlesPropiedades`) de AD.
- Notifica vía la bandeja simulada transversal (**ST - Capa de Datos Persistente**, D3).
