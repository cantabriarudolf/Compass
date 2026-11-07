# 📜 26 - CT - Certificados

La documentación oficial de la comunidad: certificados de residencia, estado de cuenta, liquidación de sueldo y "Al Día", emitidos con firma digitalizada del administrador **incrustada en el PDF**, folio correlativo y código de verificación único consultable en el historial.

## 🚀 Funcionalidad Principal

Cada tipología valida sus requisitos **antes** de emitir (gates por fuente): si algo no cumple, el certificado no se genera y el motivo queda claro. El contenido se congela como snapshot al momento de la emisión: aunque las deudas o vínculos cambien después, el certificado emitido conserva lo declarado.

## 🛠️ Secciones

- **Certificados (`/comunidad/certificados`)**:
  - **Generar**: elige tipología y destino dinámico:
    - *Residencia*: exige persona con vínculo vigente en la unidad (VU); declara nombre, RUT, unidad y rol.
    - *Estado de Cuenta*: snapshot de cobros, pagos y saldo pendiente de la unidad desde el libro FI.
    - *Liquidación de Sueldo*: solo sobre liquidaciones PL **confirmadas** (control tras cierre de mes); arrastra folio LIQ e imponibles/descuentos/líquido.
    - *"Al Día"*: rechazado automáticamente si la unidad mantiene saldo pendiente (> 0), citando el monto.
  - **Historial de Emisión**: folio **CT-####**, código de verificación **VC-XXXXXXXX**, solicitante, fecha y re-descarga del PDF firmado. El historial es **inmutable**: los certificados emitidos no se eliminan. Cada emisión adjunta automáticamente el snapshot de la directiva vigente (`directivaRef`: período + firmantes con cargo) como trazabilidad histórica, sin bloquear.
- **PDF firmado**: encabezado institucional de CF (nombre, RUT, dirección, administrador), cuerpo desde el snapshot, línea de firma con imagen incrustada y pie con código de verificación.

## 🔌 Gate e inmutabilidad en la capa de datos (API)

El gate dejó de vivir solo en la pantalla: el servidor lo aplica siempre.

- **Emisión (`POST /api/certificados-ct`)**: calcula el saldo pendiente de la unidad (scoped por comunidad) y responde **409** cuando la tipología lo exige (Al Día con deuda; Estado de Cuenta con saldo); si está en cero, emite y el certificado queda visible en `/comunidad/certificados`. El QA-Lab puebla por esta vía con ids `test-*-ct` y verifica saldo 0 en BD.
- **Borrado (`DELETE /api/certificados-ct/[id]`)**: responde **409 documento inmutable** siempre; autenticación, scoping y 404 se evalúan antes del rechazo, así el 409 no revela registros ajenos.
- **Lectura acotada por dueño**: el dueño de un certificado es su `unidadId` o su `personaId`. Administración y comité ven la comunidad completa; el residente lee solo los certificados de sus unidades con vínculo vigente o los emitidos a su persona, y el certificado ajeno responde 404 —no 403— en la colección y en el detalle.
- **El gate de «al día» ya no imprime el saldo ajeno**: la guardia de pertenencia corre **antes** del gate de saldo. Antes, emitir un «Al Día» con la unidad de un tercero devolvía 409 con el saldo pendiente de esa unidad en el texto del error —una fuga dentro de un mensaje— y con una `personaId` ajena creaba el documento a nombre de otra persona. Hoy responde 404 sin monto.
- **Residuo honesto**: el certificado TEST no se puede borrar por diseño; lo purga la higiene e2e (`e2e:higiene`), no "Borrar todo lo de prueba" del laboratorio.

## 💡 Tips de Oro

- **Gate Al Día visible**: antes de emitir, la pantalla muestra el saldo actual de la unidad; si está en verde califica, si no, la emisión será rechazada.
- **Verificación externa**: entrega siempre el código VC junto al documento; permite comprobar autenticidad contra el historial.
- **Firma sin imagen**: si CF aún no tiene firma digitalizada configurada, el PDF sale con línea de firma en blanco y el registro igual queda trazado.
- **Media por referencia**: el sistema guarda solo la URL de la firma usada; el binario del PDF vive únicamente en tu descarga.
- **Un certificado ajeno no existe**: ni en el historial ni en el detalle ni en el mensaje de rechazo. Si necesitás saber si una unidad está al día, mirá el saldo en su ficha con el permiso que corresponda, no el error de una emisión.
- **Auditoría**: `CT_GENERATE_RESIDENCE`, `CT_GENERATE_FINANCIAL`, `CT_GENERATE_PAYROLL`, `CT_GENERATE_AL_DIA`.

## 🔗 Dependencias

- **VU**: vínculos vigentes para residencia. **FI**: saldos y libro de cobros para estado de cuenta y Al Día.
- **PL**: liquidaciones confirmadas. **MP**: identidad de solicitantes.
- **CF**: identidad institucional y `firmaDigitalizadaUrl`.
- **RP**: alcance por fila (`alcanceCertificadosCT` en `app/api/certificados-ct/route.ts`) y guardia de emisión (`rechazoDeEmisionAjena`) antes de cualquier gate de negocio.
