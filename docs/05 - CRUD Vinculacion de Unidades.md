# 🏢 05 - CRUD Vinculación de Unidades

¡Wena! Este documento detalla la especificación, diseño y desglose de tareas para el **CRUD de Vinculación de Unidades** dentro de la Ficha de Identidad (`Maestro de Personas`) en la aplicación **Compass (NSGC)**.

---

## 🎯 Propósito del Módulo

El Módulo de **Vinculación de Unidades** permite a los Administradores gestionar activamente la relación entre una Persona (identidad base) y las unidades físicas del condominio (departamentos, estacionamientos, bodegas). Define las responsabilidades financieras, visibilidad de datos y derechos de residencia u ocupación.

---

## 🛠️ Especificación Técnica y Funcionalidades

### 1. Operaciones CRUD
- **Crear Vínculo (`C`)**: Modal/Dialog para seleccionar una unidad física del inventario, asignar un rol específico, establecer fechas de inicio/fin y configurar privacidad/estado inmobiliario.
- **Leer / Visualizar (`R`)**: Visualización activa en tarjetas dentro del tab `Unidades Vinculadas` de la ficha del usuario (`/comunidad/personas/[id]`).
- **Editar Vínculo (`U`)**: Actualización de roles, fechas, switch de privacidad financiera y selector de estado inmobiliario en un modal pre-poblado.
- **Eliminar Vínculo (`D`)**: Confirmación previa mediante `AlertDialog` para desvincular o finalizar la relación de la unidad con la persona.

### 2. Lógica Condicional por Rol
- **`Propietario`**:
  - Habilita el switch de **Privacidad Financiera** (`permiteVerFinanzas`: permite delegar la vista de Gastos Comunes a los residentes).
  - Habilita el selector de **Estado Inmobiliario** (`estadoOcupacionPropiedad`: *habitada*, *proxima_vacancia*, *en_arriendo*, *arrendada*, *en_venta*).
- **`Arrendatario` / `Copropietario / Familiar` / `Ocupante`**:
  - Los controles de Privacidad Financiera y Estado Inmobiliario se ocultan dinámicamente.

### 3. Validaciones y Casos de Borde (Edge Cases)
- **Prevención de Vínculos Duplicados**: El selector de unidades filtra y excluye las unidades a las que la persona ya se encuentra vinculada actualmente.
- **Coherencia de Fechas**: Validación obligatoria para impedir que `fechaFin` sea anterior a `fechaInicio`.
- **Sincronización Automática de Roles de Persona**: Al agregar/eliminar vínculos, la lista de `roles` de la Persona se sincroniza automáticamente (`propietario`, `residente`) para mantener coherencia en toda la UI.
- **Estado Vacío (Empty State)**: Si la persona no posee unidades vinculadas, se muestra una tarjeta indicativa con opción de vincular.

---

## 📋 Plan de Tareas Aprobado (`openspec/changes/VU-vinculacion-unidades/tasks.md`)

```markdown
1. Tipos y Mocks Base
   - 1.1 Ampliación de la interfaz VinculoUnidad en data/comunidad/personas.ts.

2. UI Atómica (Formularios y Modales)
   - 2.1 Componente FormularioVinculoUnidad (Creación / Edición).
   - 2.2 Selector de Unidades filtrado por inventario activo.
   - 2.3 Selector obligatorio de Roles.
   - 2.4 Inputs para fechas de inicio y término.

3. Validaciones y Casos de Borde
   - 3.1 Validación de rango de fechas.
   - 3.2 Control anti-duplicados por unidad.
   - 3.3 Switches condicionales según el rol seleccionado.

4. Integración en Ficha y Estado Local
   - 4.1 Modales de Alta, Edición y Confirmación de Borrado.
   - 4.2 Actualización in-memory reactiva del estado local.
   - 4.3 Sincronización dinámica de roles del perfil de persona.
```

---

> [!NOTE]
> *Este documento fue generado según las normas del proyecto y está sincronizado con el change `vinculacion-unidades` en OpenSpec.*
