# 📜 03 - Reglas Generales (RG)

Este documento no es un módulo operativo, sino el contrato de cumplimiento obligatorio para cualquier desarrollo, modificación o documentación dentro de GECOS.

## 🚀 Funcionalidad Principal

Establecer los estándares que garantizan trazabilidad, consistencia de datos y calidad de UX en todo el sistema.

## 🛠️ Reglas Clave

- **Trazabilidad Universal**: toda acción de usuario o proceso automático debe generar un evento en **AM - Auditoría y Métricas**. Cada evento necesita un nombre técnico, descripción clara y data cuantificable.
- **Inmutabilidad**: los registros de auditoría no pueden eliminarse.
- **Formato de Documentación**: las especificaciones usan el formato `AA - Nombre del Módulo.md` en español chileno, con `00-index.md` actualizado.
- **Plantilla Prisma**: toda spec debe incluir contexto, funcionalidad, reglas de negocio y una sección final de integración con AM.
- **UX Consistente**:
  - Campos obligatorios marcados visualmente (`*`).
  - Paleta canónica de badges para maestros; no se permiten clases Tailwind libres.
  - Terminología oficial: se dice **comunidad**, no "condominio".
- **Capa de Datos (ST)**: todo dato de dominio vive en el store global Zustand. Las páginas leen con `useCompassStore` y mutan solo mediante las acciones CRUD del store.

## 💡 Tips de Oro

- **Antes de desarrollar**: revisá si tu cambio necesita un nuevo evento de auditoría.
- **Antes de documentar**: verificá que la spec tenga la sección de integración con AM como último apartado.
- **Paleta de badges**: si agregás un estado visual nuevo, usá `BADGE_OPTIONS` y normalizá valores legacy con `normalizeBadgeColor`.

## 🔗 Dependencias

- **AM - Auditoría y Métricas**: receptor de todos los eventos.
- **ST - Capa de Datos Persistente**: define dónde y cómo se almacenan los datos.
