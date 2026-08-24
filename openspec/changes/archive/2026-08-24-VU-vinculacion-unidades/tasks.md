## 1. Tipos y Mocks Base

- [x] 1.1 Actualizar la interfaz `VinculoUnidad` y tipos en `k0mp4ss_fe/apps/web/data/comunidad/personas.ts` para incluir los roles completos (`propietario`, `arrendatario`, `copropietario`, `ocupante`).

## 2. UI Atómica (Formularios y Modales de Vínculo)

- [x] 2.1 Crear el componente `FormularioVinculoUnidad` en `k0mp4ss_fe/apps/web/components/comunidad/formulario-vinculo.tsx` reutilizable para modos Creación y Edición.
- [x] 2.2 Implementar selector de Unidades dinámico con búsqueda, filtrando las unidades del inventario (`estructura.ts`) y excluyendo unidades ya vinculadas a la persona activa para evitar duplicados.
- [x] 2.3 Implementar selector obligatorio de Roles (`Propietario`, `Arrendatario`, `Copropietario / Familiar`, `Ocupante`).
- [x] 2.4 Agregar campos de Fechas (`fechaInicio` obligatoria, `fechaFin` opcional para registros históricos).

## 3. Lógica Dinámica, Validaciones y Casos de Borde (Edge Cases)

- [x] 3.1 Implementar validación en formulario: `fechaFin` no puede ser anterior a `fechaInicio`.
- [x] 3.2 Implementar validación anti-duplicados: Rechazar la vinculación concurrente de una persona a una misma unidad física activa.
- [x] 3.3 Lógica condicional visual: Mostrar switch de "Privacidad Financiera" (`permiteVerFinanzas`) ÚNICAMENTE cuando el rol seleccionado sea `propietario`.
- [x] 3.4 Lógica condicional visual: Mostrar selector de "Estado Inmobiliario" (`estadoOcupacionPropiedad`) ÚNICAMENTE cuando el rol seleccionado sea `propietario`.

## 4. Integración en Ficha de Identidad y Operaciones CRUD

- [x] 4.1 Añadir botón "Vincular Unidad" en la pestaña `<TabsContent value="unidades">` dentro de `k0mp4ss_fe/apps/web/app/comunidad/personas/[id]/page.tsx`.
- [x] 4.2 Conectar el botón a un `Dialog` modal para creación de vínculo.
- [x] 4.3 Agregar acción de "Editar Vínculo" en cada card de unidad vinculada con modal pre-poblado con los datos del vínculo.
- [x] 4.4 Agregar acción de "Eliminar / Desvincular" en las cards con `AlertDialog` de confirmación antes de la remoción.
- [x] 4.5 Implementar actualización reactiva del estado local `vinculosUnidad` de la persona sin recargar la página.
- [x] 4.6 Sincronización automática de roles de la `Persona` (agregar o actualizar la lista `roles` si se asignan/remueven vínculos de propietario o residente).
- [x] 4.7 Formateo visual y Empty State: Mostrar tarjeta de estado vacío cuando la persona no posea vínculos activos.
