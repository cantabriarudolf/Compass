# 📢 15 - Comunicación con Vecinos (CO)

El canal oficial de la comunidad: mensajería masiva por filtros EF/MP, maestro de plantillas con variables dinámicas, buzón ciudadano constructivo y biblioteca documental 24/7.

## 🚀 Funcionalidad Principal

Componer un mensaje (libre o desde plantilla), resolver su alcance combinando filtros sobre personas y estructura física, y enviarlo como notificaciones `email_simulado` con snapshot auditable de destinatarios y confirmación de lectura.

## 🛠️ Secciones

- **Masivos**: redacción con carga de plantilla (auto-completa asunto y cuerpo) + filtros dinámicos combinables: rol de vínculo (propietarios, residentes, ocupantes, copropietarios, personal), macro sector, sub-sector, unidad. Previsualización del alcance resuelto antes de enviar.
- **Bandeja del residente** (change `co-lectura-residente`): cada residente y cada miembro del Comité abren `/comunidad/comunicacion` y ven **solo lo suyo**. La vista la decide el rol de la sesión en el servidor, no un selector de la pantalla. La Administración conserva la consola completa (redacción, plantillas, buzón, biblioteca).
- **Confirmación de lectura**: al abrir la comunicación se registra la lectura de **ese** destinatario, con fecha y hora; el badge del administrador muestra leídos/total (tasa de apertura) y declara que es un dato de recepción del canal. El alta de un envío **no** acepta lecturas declaradas: la única vía es que el destinatario la abra.
- **Plantillas**: maestro prefijado con categorías NSGC (`comunidad`, `urgente`, `cobranza`, `informacion`, `onboarding`). Soporta variables `[Nombre_Usuario]`, `[Nombre_Torre]` y `[Nombre_Comunidad]`; se sustituyen por destinatario al momento del envío.
- **Buzón Ciudadano**: formulario en orden constructivo (1️⃣ Felicitaciones → 2️⃣ Sugerencias → 3️⃣ Reclamos) con folio único `BUZ-####` y ciclo Recibido → En Gestión → Resuelto → Cerrado. El vecino decide si su mensaje es visible para el Comité o solo para la Administración.
- **Privacidad de la comunicación**: el residente nunca ve la nómina de destinatarios, ni el estado de lectura de otros, ni los totales del envío; un envío ajeno responde 404 (igual que uno inexistente, sin delatar que existe). El buzón ciudadano respeta `visibilidadComite`: el residente solo ve sus propios reportes y el Comité solo los marcados como visibles.
- **Desglose nominativo de lecturas**: reservado al **administrador** (`co:lecturas`), en pantalla y sin exportación. Cada consulta emite `CO_LECTURA_CONSULTADA`: el detalle se justifica por la rendición de cuentas ante Comité/Asamblea, así que queda rastro de quién lo miró.
- **Aviso de tratamiento de datos**: la bandeja informa que la lectura se registra, con qué finalidad y que ningún vecino accede a ella (Ley 21.442 deber de informar + Ley 19.628 art. 4).

## 💡 Tips de Oro

- **Snapshot inmutable**: si un vínculo cambia después del envío, el envío conserva quién recibió realmente la comunicación.
- **Gate AD**: los residentes de unidades con alertas silenciadas (`alertasResidentesActivas=false`) no reciben el masivo operativo; el envío no falla por ello.
- **Plantilla en uso no se borra**: si algún envío la referencia, la eliminación se bloquea (integridad referencial).
- **Respuesta auto-transiciona**: responder un ticket en Recibido lo pasa automáticamente a En Gestión y queda auditado.
- **Trazabilidad con GE**: el ciclo ciudadano vive acá; el workflow operativo del ticket lo gestiona **GE - Gestión de Solicitudes** vía el folio/FK.
- **Auditoría**: `CO_SEND_MASSIVE`, `CO_TICKET_CREATED`, `CO_TICKET_RESPONDIDO`, `CO_TICKET_ESTADO`, `CO_DOC_DOWNLOAD`, `CO_LECTURA_CONSULTADA` (desglose nominativo) y `RP_PERMISSION_DENIED` en cada 403 de CO.

## 🔗 Dependencias

- Filtros resueltos contra **MP - Maestro de Personas**, **VU - Vinculación Unidades** y **EF - Estructura Física**.
- Envíos materializados con `notify()` (**ST - Capa de Datos Persistente**, D3).
- Destinatarios y lecturas viven en **`EnvioDestinatarioCO`** (una fila por destinatario, con `leidoEn`): la tabla es la única fuente de pertenencia y de estado de lectura. El JSON `destinatarios` queda como snapshot inmutable de lo enviado y `lecturas` es derivado de la tabla.
- Tickets operativos en **GE - Gestión de Solicitudes** (módulo hermano de la misma sesión).

(End of file)
