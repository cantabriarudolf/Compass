# Maestro de Tipos de Unidad

Este maestro permite estandarizar las características de las unidades del condominio, facilitando la creación masiva y asegurando la consistencia en los cobros.

## 1. Atributos del Tipo de Unidad

Cada registro en este maestro define un modelo de unidad que luego será asignado a las unidades físicas.

- **Nombre del Tipo:** Identificador descriptivo (ej: "Departamento Tipo A", "Local Grande", "Bodega Estándar").
- **Metraje (m2):** Superficie asociada a este tipo de unidad.
- **Monto Base Gasto Común:** Valor en pesos ($) predefinido para este tipo de unidad (usado en el modo de cálculo "Monto Fijo").
- **Descripción:** Breve detalle de la distribución o características (opcional).

## 2. Reglas de Negocio

- **Herencia de Valores:** Al asignar un "Tipo de Unidad" a una Unidad física, esta heredará automáticamente el metraje y el monto de gasto común definido en este maestro.
- **Modificación Retroactiva y Fecha de Vigencia:** Si se cambia el "Monto Base" en este maestro, el administrador debe definir una **Fecha de Entrada en Vigencia**. 
    - El sistema consultará si se desea actualizar el valor en todas las unidades físicas vinculadas.
    - **Sincronización con [Finanzas (FI)](<FI - Finanzas y Morosidad.md>#21-gestion-de-tarifario-y-aumentos-programados-aumento-diferido):** Al ejecutarse el cambio, se aplicará la lógica de "Actualización de Deuda", donde los morosos que paguen después de la fecha de inicio del nuevo tarifario verán sus saldos históricos reajustados al nuevo valor, incentivando el pago antes de las alzas.
- **Restricción de Eliminación:** No se puede eliminar un "Tipo de Unidad" si existen unidades físicas vinculadas a él.

## 📊 Vínculo con Auditoría y Métricas (AM)
Toda acción administrativa realizada en este módulo (especialmente cambios en el tarifario base) debe ser contabilizada y visibilizada en el **Módulo AM**. Los indicadores de recaudación proyectada de este módulo alimentan el Dashboard de Gestión Operativa, transformando la ejecución técnica en valor cuantificable para la comunidad.

## 4. Integración con Auditoría y Métricas (AM)

Registrar los cambios en las plantillas base de las unidades:
- **Evento:** `TU_CREATE`, `TU_UPDATE_VALUE`.
- **Data Cuantificable:** Variación porcentual en el Monto Base de GC.
- **Métrica:** Cantidad de unidades afectadas por cambios en el maestro, impacto total en la recaudación teórica.
