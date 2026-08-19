# 🖥️ 31 - Interfaz Principal (UI)

Este módulo define la estructura visual persistente de GECOS: el layout compartido, la barra superior (header) y la identidad de la comunidad. Es lo que ves en todo momento mientras navegás.

## 🚀 Funcionalidad Principal

Mantener una experiencia coherente en todas las páginas y personalizar la aplicación con la identidad de la comunidad.

## 🛠️ Secciones

- **Header (Barra Superior)**: Muestra el logo y nombre de la comunidad configurados en **Configuración Global (CF)**. Si no hay logo, aparece el icono por defecto de GECOS.
- **Barra Lateral**: Navegación principal plegable. Ver manual de **Navegación Lateral (UI)**.
- **Área de Contenido**: Donde se renderiza cada módulo del sistema.
- **Tema Claro/Oscuro**: Botón para cambiar entre modos de visualización.

## 💡 Tips de Oro

- **Logo e identidad**: Actualizá el nombre y logo en `Configuración > Identidad Legal` y se reflejarán inmediatamente en el header y la barra lateral.
- **Responsive**: En escritorio la barra lateral es fija; en móvil se contrae y se abre con el menú hamburguesa.

## 🔗 Dependencias

- Los datos de identidad (`nombreComunidad`, `logoUrl`) se leen del store global gestionado por **ST - Capa de Datos Persistente**.
- El módulo **CF - Configuración Global** es el responsable de editar esos valores.
