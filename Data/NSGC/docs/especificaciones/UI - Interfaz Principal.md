# UI - Interfaz Principal

Este módulo define la estructura visual base de la aplicación: un layout compartido que envuelve todas las páginas, con sidebar y topbar persistentes.

## 1. Layout Persistente

- La aplicación usa un layout compartido que envuelve todas las páginas.
- Al navegar entre rutas, el Sidebar y la Topbar permanecen montados y visibles sin parpadeo.

## 2. Sidebar Responsive

- En pantallas mayores a 1024px, el Sidebar se muestra expandido por defecto.
- En pantallas menores a 768px, el Sidebar se oculta y se accede mediante un menú hamburguesa.

## 3. Reglas de Navegación

- La navegación lateral sigue la jerarquía definida en la documentación del proyecto.
- La ruta activa se resalta visualmente en el menú (ej: en `/dashboard` el ítem "Inicio" se resalta).