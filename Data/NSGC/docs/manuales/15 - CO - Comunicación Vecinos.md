# 📢 15 - Comunicación con Vecinos (CO)

El canal oficial de la comunidad: mensajería masiva por filtros EF/MP, maestro de plantillas con variables dinámicas, buzón ciudadano constructivo y biblioteca documental 24/7.

## 🚀 Funcionalidad Principal

Componer un mensaje (libre o desde plantilla), resolver su alcance combinando filtros sobre personas y estructura física, y enviarlo como notificaciones `email_simulado` con snapshot auditable de destinatarios y confirmación de lectura.

## 🛠️ Secciones

- **Masivos**: redacción con carga de plantilla (auto-completa asunto y cuerpo) + filtros dinámicos combinables: rol de vínculo (propietarios, residentes, ocupantes, copropietarios, personal), macro sector, sub-sector, unidad. Previsualización del alcance resuelto antes de enviar.
- **Confirmación de lectura**: cada envío muestra lecturas/total (tasa de apertura); la lectura se simula con un botón (D3).
- **Plantillas**: maestro prefijado con categorías NSGC (`comunidad`, `urgente`, `cobranza`, `informacion`, `onboarding`). Soporta variables `[Nombre_Usuario]`, `[Nombre_Torre]` y `[Nombre_Comunidad]`; se sustituyen por destinatario al momento del envío.
- **Buzón Ciudadano**: formulario en orden constructivo (1️⃣ Felicitaciones → 2️⃣ Sugerencias → 3️⃣ Reclamos) con folio único `BUZ-####` y ciclo Recibido → En Gestión → Resuelto → Cerrado. El vecino decide si su mensaje es visible para el Comité o solo para la Administración.
- **Biblioteca**: documentos comunales por referencia (nombre, tipo MIME, tamaño KB, URL — D1). Cada apertura registra el evento de descarga.

## 💡 Tips de Oro

- **Snapshot inmutable**: si un vínculo cambia después del envío, el envío conserva quién recibió realmente la comunicación.
- **Gate AD**: los residentes de unidades con alertas silenciadas (`alertasResidentesActivas=false`) no reciben el masivo operativo; el envío no falla por ello.
- **Plantilla en uso no se borra**: si algún envío la referencia, la eliminación se bloquea (integridad referencial).
- **Respuesta auto-transiciona**: responder un ticket en Recibido lo pasa automáticamente a En Gestión y queda auditado.
- **Trazabilidad con GE**: el ciclo ciudadano vive acá; el workflow operativo del ticket lo gestiona **GE - Gestión de Solicitudes** vía el folio/FK.
- **Auditoría**: `CO_SEND_MASSIVE`, `CO_TICKET_CREATED`, `CO_TICKET_RESPONDIDO`, `CO_TICKET_ESTADO`, `CO_DOC_DOWNLOAD`.

## 🔗 Dependencias

- Filtros resueltos contra **MP - Maestro de Personas**, **VU - Vinculación Unidades** y **EF - Estructura Física**.
- Envíos materializados con `notify()` (**ST - Capa de Datos Persistente**, D3).
- Tickets operativos en **GE - Gestión de Solicitudes** (módulo hermano de la misma sesión).

(End of file)
