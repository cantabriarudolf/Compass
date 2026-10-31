## Context

El Módulo "Maestro de Personas" gestiona la identidad base, pero la relación real entre la infraestructura (unidades, bodegas, estacionamientos) y los individuos se maneja a través de "Vínculos de Unidad". Estos vínculos establecen responsabilidades financieras y derechos de acceso.

Actualmente, existe la estructura de datos para estos vínculos en el mock (`VinculoUnidad`), y se muestran de forma pasiva en la pestaña de Unidades en la ficha de la Persona (`/comunidad/personas/[id]/page.tsx`). Sin embargo, falta la interfaz y la lógica de creación/edición dinámica (CRUD) para que el Administrador pueda gestionar activamente esta relación.

## Goals / Non-Goals

**Goals:**
- Implementar un micro-formulario en la pestaña de "Unidades Vinculadas" para crear, editar o eliminar relaciones entre la Persona actual y cualquier unidad del inventario físico.
- Permitir la asignación de Roles de vinculación (Propietario, Arrendatario, Copropietario/Familiar, Ocupante).
- Integrar la configuración de "Privacidad Financiera" (delegación de vista) y "Estado Inmobiliario" al momento de crear/editar un vínculo como propietario.
- Asegurar que la UI maneje "Vinculación Múltiple" (una persona en N unidades).

**Non-Goals:**
- No se abordarán reglas de cobranza ni cálculos de Gastos Comunes en esta fase.
- No se implementarán las pestañas de Datos Laborales ni Gobernanza en este Change (se manejarán en módulos posteriores).
- No modificaremos el modelo base de "Identidad Única" (Persona).

## Decisions

1. **Gestión de Estado Atómica vs Global**:
   - *Decisión*: El estado de los vínculos se gestionará localmente en el componente de la pestaña "Unidades" (en el contexto de la ficha del usuario), utilizando el modelo de "Tablas de Extensión".
   - *Rationale*: Mantiene la independencia de los componentes y favorece el "Atomic Design". Al ser sub-maestros, sus interacciones (agregar/remover vínculo) no deberían requerir re-renderizar todo el perfil de la persona, solo el contenedor de vínculos.

2. **UI para "Agregar Vínculo"**:
   - *Decisión*: Se utilizará un `Dialog` (Modal) similar al utilizado para crear la Persona, pero con un "Select" combinado con buscador para encontrar la Unidad Física por su etiqueta (Ej: `Depto 101`, `Estacionamiento E-1`).
   - *Rationale*: La cantidad de unidades físicas puede ser muy grande. Un selector básico no es óptimo, pero para la implementación inicial (Mock) se usará un `Select` estándar agrupado por macro sector o con búsqueda.

## Risks / Trade-offs

- [Risk] Un usuario podría ser vinculado dos veces a la misma unidad con el mismo o distinto rol. → Mitigación: Validar en el formulario (o simular validación) que no existan vínculos duplicados para la misma `unidadId` activa.
- [Risk] Falta de sincronización visual entre inventario y vínculos. → Mitigación: Actualizar el estado in-memory del array mock de vínculos del usuario inmediatamente tras la acción.
