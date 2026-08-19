# 🧭 32 - Navegación Lateral (UI)

La barra lateral es el centro de navegación de GECOS. Desde acá accedés a todos los módulos agrupados por categoría.

## 🚀 Funcionalidad Principal

Navegar rápidamente entre módulos, identificar la página activa y plegar la barra para ganar espacio en pantalla.

## 🛠️ Operaciones

- **Expandir/Contraer**: Apretá el botón de menú en el header. En escritorio la barra se contrae mostrando solo los iconos con tooltip. En móvil se oculta por completo.
- **Grupos del Menú**: Los módulos están organizados en:
  - Inicio
  - Operaciones
  - Finanzas
  - Comunidad
  - Inventario
  - Personas
  - Desarrollo AI
  - Sistema
- **Ruta Activa**: El ítem correspondiente a la página donde estás se resalta automáticamente.
- **Visibilidad por Rol**: Según tu rol, algunos grupos o ítems pueden estar ocultos.

## 💡 Tips de Oro

- **Plegado inteligente**: Si necesitás más espacio para trabajar, dejá la barra contraída. Los iconos siguen disponibles con tooltip.
- **Navegación rápida**: Los grupos colapsables se abren automáticamente si estás en alguna de sus subrutas.

## 🔗 Dependencias

- La estructura del menú se sincroniza con las capabilities documentadas en `openspec/specs/`.
- El logo y nombre de la comunidad en la cabecera de la barra lateral vienen de **CF - Configuración Global**.
