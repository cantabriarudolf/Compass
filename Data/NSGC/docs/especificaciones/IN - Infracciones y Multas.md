# IN - Infracciones y Multas (CRUD)

> 🔌 **Datos:** este módulo persiste en la base de datos vía API REST; ver endpoints `/api/in`. La fuente de verdad es Prisma/Servidor.

Este módulo permite la gestión y registro de faltas al Reglamento de Copropiedad y la aplicación de sus respectivas sanciones económicas.

## 1. Catálogo de Tipos de Infracciones (Parametrización)

Este submódulo permite predefinir las faltas al reglamento para estandarizar los cobros.

### Atributos:
- **Nombre de la Infracción:** Identificador claro (Ej: Ruidos Molestos).
- **Categoría:** Clasificación de la falta (Leve, Grave, Gravísima).
- **Sanción Base:** Definición de si el cobro es **Monto Fijo** o **Porcentaje (%)** del Gasto Común.
- **Monto/Valor:** Cantidad asociada a la sanción base.

### 1.1 Cobros por Daños y Reparaciones (Responsabilidad Civil)
No todas las multas provienen del reglamento; algunas son por daños materiales.
- **Cobro Directo:** Permite al administrador cargar el costo exacto de una reparación (ej: "Rotura de espejo del ascensor") directamente a la unidad responsable.
- **Detalle y Evidencia:** El formulario exige ingresar la descripción del daño, el costo de la reparación, y permite subir archivos adjuntos (la cotización/factura del contratista en PDF, o fotos del daño). Este respaldo es vital para justificar el cobro ante el copropietario.

## 2. Registro de Infracciones (Operativa)

Módulo para documentar los eventos ocurridos en el condominio.

### Atributos del Registro:
- **Folio:** Identificador único del evento.
- **Tipo de Infracción:** Selección del catálogo predefinido.
- **ID Unidad:** Vínculo con el depto o local infractor.
- **Fecha y Hora:** Momento exacto del suceso.
- **Antecedentes:** Descripción detallada de los hechos.
- **Evidencias:** Archivos adjuntos (fotos, registros de cámaras, testimonios).

## 3. Estados de la Infracción
- **En Revisión:** La falta ha sido reportada pero no validada.
- **Apelada:** El vecino ha presentado sus descargos.
- **Cerrada / Aplicada:** La multa ha sido cargada al Gasto Común del periodo.

## 4. Integración con Reclamos y Panel de Directiva

Para cerrar el ciclo de convivencia, las infracciones pueden nacer directamente de una queja vecinal.

- **Vinculación con Reclamos (CO):** Al gestionar un reclamo en el buzón ciudadano, el administrador puede seleccionar la unidad infractora y, si el reclamo es verídico, convertirlo directamente en una "Infracción en Revisión", arrastrando la evidencia ya subida por el vecino.
- **Panel de Supervisión de la Directiva:** Los miembros del Comité/Directiva tienen una vista especial de todos los incidentes y multas en curso.
    - **Funcionalidad:** Pueden dejar comentarios internos visibles solo para la administración y la directiva.
    - **Voto/Validación:** Capacidad de la directiva para respaldar la aplicación de una multa grave antes de que sea cargada definitivamente al Gasto Común.

## 5. Integración con Auditoría y Métricas (AM)

Cuantificación del comportamiento comunitario y efectividad de las sanciones:
- **Evento:** `IN_REG_EVENT`, `IN_APPLY_FINE`, `IN_APELACION`.
- **Data Cuantificable:** Montos totales por multas, cantidad de infracciones por categoría.
- **Métrica:** Infracciones más recurrentes, porcentaje de multas apeladas con éxito, efectividad disuasoria de las sanciones.
