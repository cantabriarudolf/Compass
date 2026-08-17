# ⚙️ 04 - Maestros Administrativos (MA)

Este es el panel de control donde configurái los parámetros generales del sistema. Es como el "diccionario" de tu comunidad.

## 🚀 Funcionalidad Principal
Personalizar las categorías y estados que se usan en todo el software.

## 🛠️ Secciones
- **Zonas y Subdivisiones**: Definí cómo llamái a tus agrupaciones (ej: "Torres", "Parcelas", "Etapas"). Esto cambia las etiquetas en todo el sistema.
- **Categorías Macro y Micro**: Las agrupaciones mayores (Torre, Manzana...) y menores (Piso, Nivel, Pasaje...). Todo lo que definái acá alimenta los selectores de Estructura Física.
- **Tipos de Propiedad**: Agregá si tenís cosas especiales como "Bodega de Vino" o "Local de Bicicletas".
- **Estados de Ocupación**: Configurá los estados de los departamentos (Vacío, Ocupado, En Arriendo, etc.). Cada estado tiene un **Badge** (clase Tailwind) para las etiquetas y un **color hex automático** para el gráfico de dona de Estructura Física — así un estado nuevo nunca sale gris.

## ⚠️ Seguridad de Datos
Al igual que en otros módulos, aquí **nada se borra**. Podís desactivar categorías que ya no ocupís para que no "basureen" los formularios, pero el historial de lo que ya se registró se mantiene intacto por seguridad.
