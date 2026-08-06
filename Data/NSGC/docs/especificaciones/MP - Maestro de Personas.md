# Gestión de Personas (CRUD Maestro)

Este módulo centraliza la información de todas las personas naturales relacionadas con el condominio, permitiendo su reutilización en distintos roles (vecinos, personal, proveedores).

## 1. Atributos del Maestro de Personas

Cada registro debe contener la información base de identificación y contacto.

### Atributos Requeridos:
- **RUT:** Identificador único nacional (clave primaria lógica).
- **Nombre Completo:** Nombres y apellidos por separado para mejor ordenamiento.
- **Fecha de Nacimiento:** (Opcional) Para saludos o validaciones de edad.
- **Sexo/Género:** (Opcional).
- **Teléfonos:** Móvil y fijo.
- **Correo Electrónico:** Validado para notificaciones oficiales.
- **Dirección Particular:** En caso de que el propietario no resida en el condominio.
- **Fotografía de Perfil:** Imagen base del usuario utilizada en todos sus roles dentro del sistema.

## 2. Arquitectura de Identidad (Base + Extensiones)

Para evitar la duplicidad de datos, el sistema utiliza un modelo de **Identidad Única** anclada al **RUT**. Una persona existe una sola vez en el maestro base, pero puede extender sus datos según el rol que desempeñe.

### 2.1 Datos Base (Comunes):
Identidad (RUT, Nombre), Contacto (Email, Teléfono) y Fotografía.

### 2.2 Extensiones por Rol (Tablas Relacionadas):
Cuando una persona asume un rol específico, el sistema habilita "Tablas de Extensión" que contienen los campos únicos para ese contexto:

- **Rol: Personal (`PE`):** Habilita la extensión de **Datos Laborales**. Aquí se guardan las AFPs, Previsiones, Datos Bancarios y Ficha Médica.
- **Rol: Directiva (`GD`):** Habilita la extensión de **Datos de Gobernanza**. Aquí se guarda el **Cargo** y la **Firma Digitalizada**.
- **Rol: Propietario/Residente (`VU`):** Habilita la extensión de **Vinculación con Unidades**. Aquí se guarda la relación con el departamento, estado de morosidad personal y preferencias de privacidad.
- **Rol: Contratista / Técnico Externo (`PE`):** Habilita la extensión de **Datos de Empresa Externa**. Aquí se vincula a la persona con su empresa empleadora, su especialidad técnica y sus registros de seguridad (Mutualidad, certificados de competencia).

### 2.3 Lógica de Detección de Roles:
El sistema identifica el acceso del usuario mediante su RUT. Al iniciar sesión, el motor de permisos (`RP`) consulta en qué tablas de extensión existe ese RUT y "trae" los campos asociados. Una misma persona puede ser, por ejemplo, **Propietario** y **Miembro de la Directiva** simultáneamente, unificando ambas extensiones en su panel.

### 2.4 Maestro de Condiciones Especiales (Vulnerabilidad y Cuidado)
Un sub-registro vital para emergencias y atención personalizada, gestionado a través de una lista de opciones tipificadas:
- **Ejemplos de Condiciones:** Electrodependiente, Usuario en Silla de Ruedas, Persona Mayor (Tercera Edad), Persona Sola, Dificultad Auditiva/Visual.
- **Regla de Interfaz (UX/UI de Alerta):**
  - *Visión Preliminar (Grillas y Listados):* Si una persona posee una o más condiciones especiales, debe aparecer un icono de alerta (ej: ⚠️ o ♿) visible desde la tabla general de residentes o reporte diario, antes de hacer clic.
  - *Ficha de Detalle:* Al abrir el perfil del residente, la condición debe resaltarse visualmente en la parte superior del perfil (ej: con un banner rojo o amarillo) para advertir inmediatamente al administrador o conserje.
  - *Uso Operativo:* Crucial en caso de cortes de luz (priorizar electrodependientes) o evacuaciones (asistir a personas con movilidad reducida).

## 2. Gestión de Estados

- **Estado de Cuenta:** (Activa, Inactiva, Bloqueada por morosidad extrema).
- **Preferencias de Comunicación:** (Email, SMS, WhatsApp).

## 3. Definición de Roles y Privacidad de la Información

El sistema distingue claramente entre la figura del **Propietario** (dueño legal) y el **Residente** (quien habita la unidad).

### 3.1 Privacidad y Restricción de Contenidos:
- **Ocultamiento por Defecto:** Los reportes de morosidad detallados y las actas de asambleas/reuniones de directiva están ocultos para los usuarios con rol de **Residente**.
- **Check de Consentimiento (Propietario):** En el panel del Propietario, existe un control: *"Permitir acceso a actas y reportes financieros al residente"*.
    - **Por defecto:** Desactivado (No compartir).
    - **Al activar:** El propietario acepta explícitamente que su residente esté al tanto de esta información sensible.

### 3.2 Estado de la Propiedad (Trigger Inmobiliario):
El propietario dispone de un selector para definir la situación actual de su unidad, lo cual activa flujos en el [Portal Inmobiliario (PI)](<PI - Portal Inmobiliario.md>):
- **Estado Habitada/Personal:** Uso regular por el dueño o familia.
- **Disponibilidad Próxima:** El residente actual ha notificado su salida pero aún habita la unidad. Activa la publicación en el portal inmobiliario bajo la etiqueta *"Próximamente Disponible"* o *"Entrega Programada"*, permitiendo captar interesados antes de la vacancia efectiva.
- **En Arriendo:** Unidad vacante y disponible para entrega inmediata. Activa la publicación estándar.
- **Arrendado:** Indica que existe un contrato vigente y el residente actual no tiene planes de salida inmediatos.
- **En Venta:** Activa el flujo de venta y visitas coordinadas.

## 4. Seguridad y Privacidad

- **Tratamiento de Datos:** El sistema debe cumplir con la normativa chilena de protección de datos personales.
- **Registro de Auditoría:** Log de quién creó, modificó o consultó la ficha de una persona.

## 5. Integración con Auditoría y Métricas (AM)

Trazabilidad sobre el acceso y manejo de datos personales sensibles:
- **Evento:** `MP_CREATE`, `MP_UPDATE_DATA`, `MP_VIEW_FICHA`.
- **Data Cuantificable:** Cantidad de registros activos, volumen de actualizaciones de perfil por periodo.
- **Métrica:** Tasa de actualización de datos de contacto, registros duplicados prevenidos por RUT.
