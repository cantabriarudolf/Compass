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

## 💡 Tips de Oro

- **Gate Al Día visible**: antes de emitir, la pantalla muestra el saldo actual de la unidad; si está en verde califica, si no, la emisión será rechazada.
- **Verificación externa**: entrega siempre el código VC junto al documento; permite comprobar autenticidad contra el historial.
- **Firma sin imagen**: si CF aún no tiene firma digitalizada configurada, el PDF sale con línea de firma en blanco y el registro igual queda trazado.
- **Media por referencia**: el sistema guarda solo la URL de la firma usada; el binario del PDF vive únicamente en tu descarga.
- **Auditoría**: `CT_GENERATE_RESIDENCE`, `CT_GENERATE_FINANCIAL`, `CT_GENERATE_PAYROLL`, `CT_GENERATE_AL_DIA`.

## 🔗 Dependencias

- **VU**: vínculos vigentes para residencia. **FI**: saldos y libro de cobros para estado de cuenta y Al Día.
- **PL**: liquidaciones confirmadas. **MP**: identidad de solicitantes.
- **CF**: identidad institucional y `firmaDigitalizadaUrl`.
