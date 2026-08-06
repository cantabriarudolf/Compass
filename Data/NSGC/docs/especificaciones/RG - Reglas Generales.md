# Reglas Generales del Proyecto SGC

Estas reglas son de cumplimiento obligatorio para cualquier nuevo desarrollo, modificación de módulos existentes o documentación técnica.

## 1. Trazabilidad Universal (Regla de Oro)
**Todo componente, módulo o funcionalidad que implique una acción de usuario o un proceso automático debe estar vinculado al módulo [AM - Auditoria y Metricas](<AM - Auditoria y Metricas.md>).**

### Requerimientos por cada funcionalidad:
- **Evento Identificable:** Cada acción debe tener un nombre técnico y una descripción clara.
- **Data Cuantificable:** Se debe identificar qué valor numérico o métrica se puede extraer de la acción (ej: CLP, tiempo, cantidad, intentos).
- **Inmutabilidad:** Ningún registro de acción puede ser eliminado.

## 2. Estándares de Documentación
- Seguir el formato `AA - Herramienta.md`.
- Idioma: Español chileno.
- Mantener el `00-index.md` actualizado.
- Cada archivo debe incluir una sección final llamada **"Integración con Auditoría y Métricas"**.

## 3. Consistencia de Datos y UX (Interfaz de Usuario)
- **Principio de Claridad Visual (Campos Obligatorios):** En cualquier parte del sistema donde exista un formulario o ingreso de datos, **todos los campos obligatorios deben estar visualmente marcados** (ej: con un asterisco rojo `*` y validación en tiempo real). Esto informa al usuario qué es lo mínimo necesario para avanzar, reduciendo la fricción y el error humano.
- **Jerarquía de Unidades:** Las unidades siempre deben depender de un **Tipo de Unidad** (Maestro TU).
- **Validación de Configuraciones:** Las configuraciones críticas (SMTP, Cálculos de GC) deben requerir confirmación antes de ser guardadas.
