# 📜 26 - CT - Certificados

La documentación oficial de la comunidad: certificados de residencia, estado de cuenta, liquidación de sueldo y "Al Día", emitidos con firma digitalizada del administrador **incrustada en el PDF**, folio correlativo y código de verificación único consultable en el historial.

## 🚀 Funcionalidad Principal

Cada tipología valida sus requisitos **antes** de emitir (gates por fuente): si algo no cumple, el certificado no se genera y el motivo queda claro. El contenido se congela como snapshot al momento de la emisión: aunque las deudas o vínculos cambien después, el certificado emitido conserva lo declarado.

## 🛠️ Secciones

- **Certificados (`/comunidad/certificados`)**:
  - **Generar**: elige tipología y destino dinámico. La lista de tipologías la resuelve **el servidor**: sólo se ofrecen las que tu rol puede emitir.
    - *Residencia*: exige persona con vínculo vigente en la unidad (VU); declara nombre, RUT, unidad y rol.
    - *Estado de Cuenta*: snapshot de cobros, pagos y saldo pendiente de la unidad desde el libro FI.
    - *Liquidación de Sueldo*: solo sobre liquidaciones PL **confirmadas** (control tras cierre de mes); arrastra folio LIQ e imponibles/descuentos/líquido.
    - *"Al Día"*: rechazado automáticamente si la unidad mantiene saldo pendiente (> 0), citando el monto.
  - **Historial de Emisión**: folio **CT-####**, código de verificación **VC-XXXXXXXX**, solicitante, fecha y re-descarga del PDF firmado. El historial es **inmutable**: los certificados emitidos no se eliminan. Cada emisión adjunta automáticamente el snapshot de la directiva vigente (`directivaRef`: período + firmantes con cargo) como trazabilidad histórica, sin bloquear.
- **PDF firmado**: encabezado institucional de CF (nombre, RUT, dirección, administrador), cuerpo desde el snapshot, línea de firma con imagen incrustada y pie con código de verificación.
- **Quién emite qué** (F34, 2026-11-07): la emisión se despacha por tipología a la clave de permiso que la gobierna (`RECURSO_DE_EMISION_POR_TIPO` en `lib/certificados-ct.ts`), una sola tabla para la ruta y la pantalla.
  - **Administración**: las cuatro tipologías, para cualquier unidad o persona de la comunidad.
  - **Residente**: **sólo** su certificado de residencia, y sólo para su vínculo vigente y su propia persona. `estado_cuenta` y «al día» le responden **403**; la liquidación de sueldo es documento del empleador.
  - **Comité**: no emite; lee el historial.
  - **Base legal** (Ley 21.442): el certificado de residencia **no está regulado** por la ley ni reservado al administrador —el boletín 17737-14, en tramitación, busca *facultar* a los administradores para emitirlo, lo que prueba que hoy no lo están—. El **art. 20 N° 4** pone entre las funciones del administrador «emitir certificados en lo relativo al estado de deudas de las unidades», y el **art. 15** manda acreditar la calidad de copropietario hábil «mediante certificado expedido por el administrador»: el estado de cuenta y el «al día» no salen de la mano del residente. El **art. 21** les da acceso a la documentación, y consultar no es certificar. Propietario y arrendatario no se distinguen: la residencia es un hecho del ocupante y el sistema usa el vínculo vigente.
- **La pantalla filtra en el servidor**: `/comunidad/certificados` resuelve las tipologías emisibles con esa misma tabla antes de renderizar, así que el residente ve un botón y no cuatro con tres que respondían 403. Una lista copiada en cada lado sería una segunda verdad: la pantalla ofrecería justo lo que la ruta niega.

## 🔌 Gate e inmutabilidad en la capa de datos (API)

El gate dejó de vivir solo en la pantalla: el servidor lo aplica siempre.

- **Emisión (`POST /api/certificados-ct`)**: con `tipo: "al_dia"` calcula el saldo pendiente de la unidad (scoped por comunidad) y responde **409** si hay deuda; con saldo en cero emite, y el certificado queda visible en `/comunidad/certificados`. **Estado de Cuenta NO pasa por el gate de saldo** — se emite con deuda o sin ella, y por eso el residente no puede emitirlo (art. 20 N° 4: certificar el estado de deudas es del administrador). Orden de compuertas: 404 de emisión ajena → 403 de tipología no emisible → 409 del saldo. El QA-Lab puebla por esta vía con ids `test-*-ct` y verifica saldo 0 en BD.
- **Borrado (`DELETE /api/certificados-ct/[id]`)**: responde **409 documento inmutable** siempre; autenticación, scoping y 404 se evalúan antes del rechazo, así el 409 no revela registros ajenos.
- **Lectura acotada por dueño**: el dueño de un certificado es su `unidadId` o su `personaId`. Administración y comité ven la comunidad completa; el residente lee solo los certificados de sus unidades con vínculo vigente o los emitidos a su persona, y el certificado ajeno responde 404 —no 403— en la colección y en el detalle.
- **El gate de «al día» ya no imprime el saldo ajeno**: la guardia de pertenencia corre **antes** del gate de saldo. Antes, emitir un «Al Día» con la unidad de un tercero devolvía 409 con el saldo pendiente de esa unidad en el texto del error —una fuga dentro de un mensaje— y con una `personaId` ajena creaba el documento a nombre de otra persona. Hoy responde 404 sin monto. El orden completo de las compuertas es `rechazoDeEmisionAjena` (**404**) → tipología no emisible (**403**) → gate de saldo (**409**), y el gate va último porque es el único que imprime un monto de la unidad: así el saldo de una unidad ajena, o el de una tipología que el rol no puede emitir, nunca se calcula.
- **La tipología también se decide en el servidor**: un `tipo` que no existe en el mapa de emisión responde 400, y uno cuya clave el rol no tiene responde 403, sin crear fila. La pantalla y la ruta leen el mismo mapa, así que no pueden divergir.
- **Residuo honesto**: el certificado TEST no se puede borrar por diseño; lo purga la higiene e2e (`e2e:higiene`), no "Borrar todo lo de prueba" del laboratorio.

### Cómo emite el residente, de punta a punta (F34, 2026-11-07)

La pantalla del residente **no pide elegir persona ni unidad**: el servidor resuelve las dos desde su vínculo
vigente, así que no necesita leer el padrón del edificio ni la configuración de la comunidad.

- `GET /api/certificados-ct/mis-vinculos` — **auto-acotada**: devuelve sólo los vínculos vigentes de la sesión
  (unidad, persona, RUT, rol). Nunca acepta ids del cliente.
- `POST /api/certificados-ct` con `tipo: "residencia"` — si hay **un** vínculo vigente no hace falta anclar unidad ni
  persona; si hay **varios**, responde 400 pidiendo elegir entre los propios. El residente no puede emitir las demás
  tipologías (403).
- `GET /api/certificados-ct/[id]/pdf` — el PDF lo sirve el servidor con alcance por fila (404 genérico para la ajena).
  Es el mismo patrón que el aviso de cobro (F27) y la liquidación (T10).

Lo único que el residente necesita para descargar es su propia sesión: ni `pe:bitacora` ni `cf` intervienen.


## 💡 Tips de Oro

- **Gate Al Día visible**: antes de emitir, la pantalla muestra el saldo actual de la unidad; si está en verde califica, si no, la emisión será rechazada.
- **Verificación externa**: entrega siempre el código VC junto al documento; permite comprobar autenticidad contra el historial.
- **Firma sin imagen**: si CF aún no tiene firma digitalizada configurada, el PDF sale con línea de firma en blanco y el registro igual queda trazado.
- **Media por referencia**: el sistema guarda solo la URL de la firma usada; el binario del PDF vive únicamente en tu descarga.
- **Un certificado ajeno no existe**: ni en el historial ni en el detalle ni en el mensaje de rechazo. Si necesitás saber si una unidad está al día, mirá el saldo en su ficha con el permiso que corresponda, no el error de una emisión.
- **El residente certifica dónde vive, no cuánto debe**: su residencia la emite él mismo, pero el «al día» y el estado de cuenta los firma el administrador porque la ley así lo exige. Un 403 ahí no es un defecto de la pantalla: es el reparto legal, y por eso el botón ni siquiera aparece.
- **El residente no ve selects**: si ves un formulario pidiendo persona y unidad es el de administración; para el residente la pantalla muestra su vínculo y un botón. Si aparece «Tenés más de un vínculo vigente», elige entre **los suyos** — nunca del edificio.
- **Auditoría**: `CT_GENERATE_RESIDENCE`, `CT_GENERATE_FINANCIAL`, `CT_GENERATE_PAYROLL`, `CT_GENERATE_AL_DIA`.

## 🔗 Dependencias

- **VU**: vínculos vigentes para residencia. **FI**: saldos y libro de cobros para estado de cuenta y Al Día.
- **PL**: liquidaciones confirmadas. **MP**: identidad de solicitantes.
- **CF**: identidad institucional y `firmaDigitalizadaUrl`.
- **RP**: alcance por fila (`alcanceCertificadosCT` en `app/api/certificados-ct/route.ts`), guardia de emisión (`rechazoDeEmisionAjena`) antes de cualquier gate de negocio y despacho por tipología a la clave de emisión (`RECURSO_DE_EMISION_POR_TIPO` en `lib/certificados-ct.ts`, compartido con la pantalla).
- **Ley 21.442**: el reparto de qué certifica el administrador y qué puede certificar el residente (art. 20 N° 4, art. 15 y art. 21) está en la sección «Quién emite qué» de este manual.
