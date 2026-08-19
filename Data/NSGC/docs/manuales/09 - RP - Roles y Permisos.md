# 🔐 09 - Roles y Permisos (RP)

Acá definís quién puede hacer qué dentro de GECOS. El sistema usa roles predefinidos, pero también permitirá crear roles personalizados.

## 🚀 Funcionalidad Principal

Gestionar el acceso a módulos y acciones mediante un modelo RBAC (Control de Acceso Basado en Roles).

## 🛠️ Secciones

- **Roles Estándar**: El sistema trae roles listos para usar:
  - **Administrador Maestro**: acceso total.
  - **Miembro del Comité**: lectura de reportes financieros y aprobación de gastos.
  - **Conserjería / Seguridad**: bitácora, visitas, encomiendas; sin acceso a finanzas.
  - **Propietario / Residente**: estado de cuenta, pagos, reservas, reclamos.
  - **Personal de Mantención**: tareas asignadas e incidentes físicos.
- **Matriz de Permisos**: Tabla que cruza módulos y acciones (`ver`, `crear`, `editar`, `eliminar`, `ejecutar`) con cada rol.
- **Activación de Cuentas**: Desde la ficha de una persona en **MP - Maestro de Personas**, podés activar su cuenta de acceso. El sistema envía un email de onboarding y asigna una contraseña temporal basada en el RUT.

## 💡 Tips de Oro

- **Menor privilegio**: Si un permiso no está explícitamente asignado, el sistema lo niega.
- **Roles múltiples**: Una misma persona puede tener varios roles y hereda la unión de sus permisos.
- **Auditoría**: Cada asignación o revocación de rol genera eventos `RP_ROLE_ASSIGNED` / `RP_ROLE_REVOKED` en **AM**.

## 🔗 Dependencias

- Las personas a las que se les asignan roles viven en **MP - Maestro de Personas**.
- El email de onboarding usa plantillas de **CO - Comunicación Vecinos**.
- Los intentos de acceso no autorizado se contabilizan en **AM - Auditoría y Métricas**.
