# Módulo de Roles y Permisos (Control de Acceso)

Este módulo gestiona quién puede ver, editar o ejecutar acciones dentro de la plataforma, garantizando la seguridad y privacidad de la información del condominio.

## 1. Concepto Base (RBAC)

El sistema utiliza un Control de Acceso Basado en Roles (Role-Based Access Control). A una Persona (del [Maestro de Personas](<MP - Maestro de Personas.md>)) se le asigna uno o más Roles, y cada Rol tiene un conjunto de Permisos específicos.

## 2. Roles Estándar del Sistema

El sistema debe venir con roles predefinidos, pero con la capacidad de crear roles personalizados.

### Roles Sugeridos:
- **Administrador Maestro:** Acceso total a todos los módulos, configuraciones globales y reportes financieros.
- **Miembro del Comité:** Acceso de lectura a reportes financieros y auditorías. Capacidad de aprobar gastos.
- **Conserjería / Seguridad:** Acceso a la bitácora, registro de visitas, control de encomiendas y visualización básica de residentes (en caso de emergencias). Sin acceso a finanzas.
- **Propietario / Residente:** Acceso a su estado de cuenta personal, pago de GC, reserva de áreas comunes, buzón de reclamos y votaciones.
- **Personal de Mantención:** Acceso a la lista de tareas asignadas y reporte de incidentes físicos.

## 3. Matriz de Permisos (Ejemplos)

Los permisos se dividen por módulo y tipo de acción (Ver, Crear, Editar, Eliminar, Ejecutar).

| Módulo | Funcionalidad | Admin | Comité | Conserjería | Residente |
| :--- | :--- | :---: | :---: | :---: | :---: |
| Finanzas (FI) | Ver Balance Mensual | ✅ | ✅ | ❌ | ❌ |
| Finanzas (FI) | Emitir Gasto Común | ✅ | ❌ | ❌ | ❌ |
| Personas (MP) | Editar datos propios | ✅ | ✅ | ✅ | ✅ |
| Personas (MP) | Ver morosidad vecinos | ✅ | ✅ | ❌ | ❌ |
| Estructura (ES)| Asignar estacionamiento | ✅ | ❌ | ❌ | ❌ |
| Conserjería (PE)| Ejecutar Cierre de Turno | ❌ | ❌ | ✅ | ❌ |

### 3.1 Permisos Contextuales o por Atributo (ABAC)
Existen acciones donde el permiso no depende solo del módulo, sino del **tipo de recurso** o el **contexto** de la solicitud.
- **Ejemplo - Solicitud de Insumos (`IR`):** 
  - *Todos los roles* (Admin, Residente, Conserje) tienen permiso para la acción "Solicitar Insumo Mantenimiento" (ej: ampolleta para su piso o área común).
  - *Solo el Personal de Servicio* tiene permiso para la acción "Solicitar Insumo Uso Interno" (ej: papel higiénico, café para la conserjería). El residente verá bloqueada esta categoría de productos.

## 4. Protocolo de Activación de Cuentas y Credenciales

El registro de una persona en el maestro (`MP`) no implica la creación automática de sus credenciales de acceso. Este es un proceso consciente de la administración.

### 4.1 Proceso de Activación:
- **Tarjeta de Activación:** En la ficha del perfil del usuario (Admin Panel), aparecerá un botón/opción destacada de **"Activar Cuenta de Acceso"**.
- **Confirmación de Onboarding:** Al presionar el botón, el sistema preguntará mediante un pop-up: *"¿Desea enviar el mensaje de Onboarding con las instrucciones de acceso ahora?"*. 
    - Este mensaje utiliza la plantilla `onboarding` definida en el [Módulo de Comunicación (CO)](<CO - Comunicacion Vecinos.md>#2-maestro-de-mensajes-prefijados-plantillas).
    - Si el usuario no recibe el correo, el administrador puede reenviarlo en cualquier momento desde el módulo `CO`.
- **Credenciales por Defecto:**
    - **Usuario:** Dirección de correo electrónico registrada.
    - **Password Genérica:** El sistema asignará automáticamente el **RUT del usuario (sin puntos, sin guiones y sin dígito verificador)** como contraseña inicial. Se obligará al cambio de contraseña en el primer inicio de sesión.

### 4.2 Métodos de Autenticación Futuros:
- **Google SSO:** El sistema permitirá el acceso mediante "Iniciar sesión con Google". 
    - **Restricción:** Solo será funcional si el correo electrónico `@gmail.com` ha sido registrado y validado previamente en el maestro de la cuenta por la administración.

## 5. Reglas de Negocio
- **Principio de Menor Privilegio:** Si a un usuario no se le ha concedido explícitamente un permiso, el sistema asume que no lo tiene.
- **Roles Múltiples:** Una misma persona puede ser "Propietario" y "Miembro del Comité" al mismo tiempo, sumando los permisos de ambos roles.
- **Delegación Temporal:** (Deseable) Un administrador puede delegar sus permisos temporalmente a un reemplazante por vacaciones.

## 5. Integración con Auditoría y Métricas (AM)

- **Evento:** `RP_ROLE_ASSIGNED`, `RP_ROLE_REVOKED`, `RP_PERMISSION_DENIED`.
- **Data Cuantificable:** Número de intentos de acceso no autorizados.
- **Métrica:** Usuarios activos por rol.
