# CF - Configuración Global de la Aplicación

> 🔌 **Datos:** este módulo persiste en la base de datos vía API REST; ver endpoints `/api/configuracion`. La fuente de verdad es Prisma/Servidor.

Este módulo define los parámetros base que rigen el comportamiento de todo el sistema de gestión.

## 1. Identidad y Representación Legal

Define la imagen corporativa del condominio y los datos necesarios para documentos legales y facturación.

### Identidad Visual:
- **Nombre de la Comunidad:** Nombre oficial del condominio (ej: "Edificio Plaza Central").
- **Logo Principal:** Imagen en formato PNG o SVG para reportes y plataforma.
- **Favicon:** Icono para la pestaña del navegador.

### Datos Legales:
- **RUT del Condominio:** Identificador tributario de la copropiedad.
- **Dirección Oficial:** Ubicación física del condominio.
- **Administrador Responsable:** Nombre completo de la persona a cargo.
- **RUT Administrador:** RUN del administrador responsable.
- **Teléfono Admin:** Número de contacto directo de la administración.
- **Firma Digitalizada:** Imagen de la firma del administrador para documentos automáticos (certificados, circulares).

## 2. Parametrización del Gasto Común (GC)

El administrador debe poder definir a nivel de sistema cómo se calcula el cobro base para las unidades.

### Modos de Cálculo:
- **Monto Fijo (por Tipo de Unidad):** El sistema aplica a cada unidad el valor estipulado en el [Maestro de Tipos de Unidad](<TU - Tipos de Unidad.md>). Ignora egresos variables del mes.
- **Variable por Metraje/Prorrateo:** El total de egresos mensuales se divide entre las unidades según su coeficiente de copropiedad (Prorrateo), el cual también se hereda del Tipo de Unidad pero puede ser ajustado manualmente.

### Parámetros de Morosidad (Cálculo Automático):
- **Día de Corte de Pago:** Día exacto del mes (ej: día 5) en el que vence el pago sin multas.
- **Límite de Meses para Aviso de Corte:** Cantidad máxima de meses impagos (ej: 3 meses) permitidos antes de que el sistema proponga el corte de servicios básicos.

## 3. Configuración de Correo Electrónico (SMTP)

Este parámetro es crítico para el funcionamiento de los módulos de Comunicación y Cobranza.

### Atributos Requeridos:
- **Servidor (Host) SMTP:** Dirección del servidor de correo.
- **Puerto SMTP:** Puerto de salida (ej: 587 para TLS).
- **Usuario de Autenticación:** Cuenta de correo para loguearse.
- **Contraseña o Token de App:** Credencial de acceso (almacenamiento encriptado).
- **Seguridad:** Selección entre SSL, TLS o sin seguridad.
- **Correo Remitente (From):** Dirección que figurará como emisor (ej: `gdcuentas@sgc.cl`).
- **Nombre Remitente:** Nombre comercial que verá el vecino.
- **Correo en Copia (BCC - Auditoría):** Email oculto para respaldo de todas las comunicaciones.
- **Correo de Conserjería / Recepción:** Email para notificaciones específicas de la operación diaria.

## 4. Reglas y Opt-in de Módulos

Define qué funciones del sistema dispararán correos automáticos hacia los residentes o la administración.

### Notificaciones Disponibles:
- **Emisión de Gastos Comunes:** Avisa a residentes cuando un GC es emitido o pagado.
- **Registro de Visitas:** Notifica al residente cuando llega una visita a conserjería.
- **Recepción de Encomiendas:** Envía un aviso al residente tras registrar un paquete.
- **Confirmación de Reservas:** Notifica el estado de reserva de áreas comunes (Quinchos, Salones, etc.).
- **Avisos de Sistema:** Notificaciones masivas de la comunidad (Cortes de agua, luz, mantenimientos).
- **Sugerencias y Reclamos:** Avisa a la administración sobre la creación de nuevos tickets de ayuda.

## 5. Parámetros Operativos y Seguridad

Configuraciones críticas para la lógica de negocio y protección de datos.

### Parámetros Operativos:
- **Días Mes Comercial:** Define la base de días para el cálculo de sueldos y prorrateos (ej: 30 días). Este valor estandariza los cálculos independientemente de si el mes tiene 28, 31 o bisiesto.
- **Días Vacaciones / Mes:** Factor de cálculo para feriado legal del personal (ej: 1.25 días).
- **Jornada Semanal Estándar:** Horas semanales base para el cálculo de horas ordinarias y extras (ej: 44 o 45 hrs). Este valor se utiliza por defecto a menos que la ficha individual del trabajador especifique otra jornada.

### Seguridad y Auditoría:
- **Clave de Eliminación Maestro:** Clave especial requerida para borrados críticos en el sistema.
- **Log de Auditoría:** El cambio de cualquier parámetro global debe quedar registrado indicando quién, cuándo y qué valor cambió.
- **Validaciones:**
    - **Formato:** Validación de RUT, correo electrónico y valores numéricos (montos, días, porcentajes).
    - **Coherencia:** El **Día de Corte** debe estar dentro del rango 1-31; los **Días Mes Comercial** entre 28-31; la **Jornada Semanal** entre 35-48 horas.
    - **Confirmación Crítica:** Los cambios sobre SMTP, cálculo de GC y parámetros de seguridad exigen confirmación explícita (según `RG`).
## 6. Integración con Auditoría y Métricas (AM)

Cada cambio en la configuración global debe generar un evento en el log:
- **Evento:** `CF_UPDATE_PARAM`.
- **Data Cuantificable:** No aplica directamente (valor booleano de éxito).
- **Métrica:** Frecuencia de cambios en parámetros críticos (seguridad).
- **Acción:** Registro del valor anterior y el valor nuevo en la descripción.
