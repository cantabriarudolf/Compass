# Módulo de Comunicación con el Vecino

El objetivo de este módulo es garantizar que la información fluya de manera clara, profesional y oportuna hacia toda la comunidad.

## 1. Centro de Mensajería Masiva

El sistema debe actuar como el canal oficial de comunicación.

### Funcionalidades:
- **Multicanalidad:** Envío de mensajes vía Correo Electrónico (prioritario) y notificaciones Push o WhatsApp (según integración).
- **Interfaz de Destinatarios (Filtros Dinámicos):** Un buscador/selector inteligente que permite decidir el alcance del mensaje:
    - *A un Grupo Completo:* Ej. "Todos los Residentes", "Todo el Personal de Servicio".
    - *A un Sub-grupo Físico/Lógico:* Filtrar por `EF` o `MP` (Ej. "Solo Propietarios de la Torre B", "Todos los residentes del Piso 3").
    - *A un Individuo Específico:* Buscar directamente a una persona (ej: "Juan Pérez") o a una entidad puntual (ej: "Propietario de la Unidad 101", "Trabajador Pedro").
    - *Combinaciones:* Posibilidad de mezclar filtros (ej: "Aviso de asamblea enviado solo a Propietarios de la Torre A").
- **Confirmación de Lectura:** Registro de quiénes han abierto el correo de comunicación oficial.

## 2. Maestro de Mensajes Prefijados (Plantillas)

La interfaz de composición permite escribir un mensaje libre (manual) o cargar un texto desde el "Maestro de Mensajes", el cual auto-completa el Asunto y el Cuerpo. Soporta variables dinámicas (como `[Nombre_Usuario]`).

### Categorías y Ejemplos de Plantillas:

- **Categoría: `comunidad`**
  - *Plantilla:* Citación a Asamblea Ordinaria
  - *Asunto:* Primera Asamblea General 2024
  - *Cuerpo:* "Se cita a todos los copropietarios a la asamblea que se realizará en el salón de eventos el próximo sábado."

- **Categoría: `urgente`**
  - *Plantilla:* Suspensión de Agua Potable
  - *Asunto:* CORTE DE AGUA EMERGENCIA
  - *Cuerpo:* "Atención: Debido a una rotura de matriz externa, el servicio de agua potable será suspendido por 4 horas."

- **Categoría: `cobranza`**
  - *Plantilla:* Recordatorio Pago Gastos Comunes
  - *Asunto:* Vencimiento Gasto Común
  - *Cuerpo:* "Estimado/a [Nombre_Usuario], le recordamos que el plazo para el pago del gasto común vence el día 5 de este mes."

- **Categoría: `información`**
  - *Plantilla:* Aviso de Mantención de Ascensores
  - *Asunto:* Mantención Programada: Ascensores
  - *Cuerpo:* "Estimados residentes, informamos que mañana se realizará la mantención de los ascensores de la [Nombre_Torre]."

- **Categoría: `onboarding` (Bienvenida)**
  - *Plantilla:* Mensaje de Bienvenida y Activación de Cuenta
  - *Asunto:* Bienvenido a [Nombre_Comunidad] - Instrucciones de Acceso
  - *Cuerpo:* "Estimado/a [Nombre_Usuario], su cuenta de acceso al sistema de gestión ha sido activada. Su usuario es este correo electrónico y su contraseña inicial es su RUT (sin puntos ni guiones). Le recomendamos cambiar su clave al ingresar por primera vez."

## 3. Buzón de Interacción Ciudadana (Felicitaciones, Sugerencias y Reclamos)

Un canal formal para que el residente exprese su opinión, priorizando un enfoque constructivo. La interfaz debe presentar las opciones en un orden que mitigue la negatividad:

### Clasificación (Orden de Visualización):
1. **Felicitaciones:** Espacio para reconocer el buen desempeño del personal (conserjes, aseo, administración) o acciones positivas de la comunidad.
2. **Sugerencias:** Propuestas e ideas para mejorar procesos, espacios comunes o la convivencia.
3. **Reclamos:** Reporte de problemas, fallas de servicio o incumplimientos normativos.

### Flujo de Gestión:
- **Ticket de Atención:** Cada ingreso genera un número de seguimiento único.
- **Estados del Ticket:** (Recibido, En Gestión, Resuelto, Cerrado).
- **Mediación y Respuesta:** Registro de las respuestas dadas por la administración y compromisos adquiridos para cerrar el ciclo de feedback.
- **Privacidad:** Opción para que el usuario decida si su mensaje es visible para el Comité (transparencia) o solo para la Administración.

## 4. Biblioteca de Documentos Comunales

Acceso 24/7 a la documentación legal y operativa.

## 5. Integración con Auditoría y Métricas (AM)

Cada interacción comunicativa debe registrarse para medir el alcance y la efectividad:
- **Evento:** `CO_SEND_MASSIVE`, `CO_TICKET_CREATED`, `CO_DOC_DOWNLOAD`.
- **Data Cuantificable:** Número de destinatarios, tiempo de cierre de ticket (horas/días).
- **Métrica:** Tasa de apertura de correos, volumen de reclamos por categoría, tiempo promedio de respuesta de la administración.
