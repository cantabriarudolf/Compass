## 1. Mocks y Modelos de Datos

- [x] 1.1 Crear `data/comunidad/personas.ts` con la interfaz principal `Persona` (RUT, Nombre, Contacto, Foto, Vulnerabilidades).
- [x] 1.2 Definir la interfaz `VinculoUnidad` (Unidad, Rol, ConsentimientoFinanciero, TriggerInmobiliario).
- [x] 1.3 Generar data mockeada de residentes y propietarios, incluyendo los estados dinámicos del Maestro (MA).

## 2. UI Base y Directorio (Atomic Design)

- [x] 2.1 Crear la ruta principal `/comunidad/personas/page.tsx` para listar el directorio.
- [x] 2.2 Implementar la Tabla de Personas que muestre de forma visual las alertas de vulnerabilidad (⚠️) y roles.
- [x] 2.3 Añadir la nueva ruta al menú lateral en `components/app-sidebar.tsx`.

## 3. Perfil Extensible (Tabs)

- [x] 3.1 Crear la ruta dinámica `/comunidad/personas/[id]/page.tsx` para la Ficha de la Persona.
- [x] 3.2 Construir el contenedor del perfil base y la estructura de Tabs.
- [x] 3.3 Desarrollar el `<TabGobernanza />` y `<TabLaboral />` condicionados al rol de la persona.
- [x] 3.4 Desarrollar el `<TabUnidades />` para visualizar y gestionar las propiedades/residencias vinculadas.

## 4. Validaciones y Privacidad

- [x] 4.1 Implementar selector de Privacidad (Delegación de vista financiera) en el formulario de vínculo de unidad.
- [x] 4.2 Implementar el Selector Inmobiliario ("En Venta", "Próxima Vacancia") en la vista del Propietario.
- [x] 4.3 Actualizar el módulo de Métricas (AM) para simular el log `MP_VIEW_FICHA` al cargar el perfil de un usuario.
