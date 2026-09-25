# MT - Mantenimiento y Proyectos

> 🔌 **Datos:** este módulo persiste en la base de datos vía API REST; ver endpoints `/api/mt`. La fuente de verdad es Prisma/Servidor.

Este módulo centraliza el registro, seguimiento y planificación financiera de todos los trabajos de mantenimiento, reparaciones y proyectos de infraestructura dentro del condominio.

## 1. Registro de Trabajos y Obras

Permite documentar cualquier intervención técnica o mejora realizada en la copropiedad.

### Atributos del Registro:
- **Descripción:** Detalle técnico del trabajo realizado o por realizar.
- **Ubicación/Referencia:** Vinculación directa con la infraestructura (ej. Hidropack, ascensores, escaleras) o unidades específicas (ej. Depto 402, Piso 5).
- **Responsable:** Empresa externa (Proveedor) o personal interno encargado.
- **Estado:** Planificado, En Curso, Finalizado, Cancelado.
- **Prioridad:** Clasificación de urgencia (Baja, Media, Alta, Emergencia/Crítico).
- **Evidencia:** Repositorio de fotos (antes/después), presupuestos y facturas digitalizadas.

## 2. Garantías y Proveedores

Control de la calidad y respaldo de los trabajos ejecutados por terceros.

- **Ficha del Proveedor:** Datos de contacto y especialidad de la empresa o técnico.
- **Seguimiento de Garantías:**
    - **Vigencia:** Fecha de inicio y término de la garantía del trabajo o repuestos.
    - **Alertas de Expiración:** Notificaciones antes de que venza el plazo de garantía para realizar inspecciones finales.
    - **Histórico de Cumplimiento:** Registro de si el proveedor respondió ante fallas post-trabajo.

## 3. Gestión Financiera de Obras

Integración con el módulo de finanzas para el control de costos y fuentes de financiamiento.

- **Costo Total:** Monto del trabajo incluyendo insumos e impuestos.
- **Origen de Fondos:**
    - **Gasto Común (GC):** Se carga al flujo mensual ordinario.
    - **Fondo de Reserva:** Uso de los ahorros legales del condominio.
    - **Fondo Especial:** Fondos recaudados para fines específicos (ej. Pintura de fachada).
- **Estado de Pago:** Pendiente, Parcial, Pagado.

## 4. Mantenimiento Preventivo y Recurrencias

Planificación automatizada para evitar fallas críticas en equipos esenciales.

- **Configuración de Ciclos:** Definición de periodicidad para equipos críticos (ej. Hidropack: Mensual; CCTV/Cerco Eléctrico: Semestral; Ascensores: Mensual).
- **Generación Automática de Tareas:** El sistema crea automáticamente el próximo registro de mantenimiento una vez finalizado el actual, basado en el intervalo definido.
- **Tablero de Próximos Vencimientos:** Vista calendario para que la administración visualice las mantenciones obligatorias del mes/trimestre.

## 5. Proyectos y Proyecciones a Largo Plazo

Herramienta estratégica para la planificación preventiva y financiera del condominio.

- **Estimación de Proyectos:** Creación de planes de trabajo futuros (ej. "Mantención de techos - 10 años").
- **Cálculo de Cuotas:** Basado en el presupuesto estimado y el plazo (meses/años), el sistema sugiere el monto de la cuota extraordinaria o incremento en el fondo de reserva necesario para cubrir el proyecto al llegar la fecha.
- **Cronograma de Mantenimiento Preventivo:** Alarmas automáticas basadas en la vida útil de los componentes de la infraestructura.

## 6. Integración con Infraestructura (EF)

El módulo debe leer la estructura física definida en el sistema para permitir una selección precisa del lugar de trabajo, permitiendo generar un histórico de mantenimiento por cada zona o equipo crítico.

## 7. Integración con Auditoría y Métricas (AM)

El historial de intervenciones es la base para medir la vida útil de la infraestructura y el desempeño de proveedores:
- **Evento:** `MT_WORK_CREATED`, `MT_WORK_FINISHED`, `MT_GUARANTEE_EXPIRED`, `MT_PREVENTIVE_GENERATED`.
- **Data Cuantificable:** Costo total de obras por periodo, horas de intervención, cantidad de mantenciones preventivas ejecutadas.
- **Métrica:** Desviación presupuestaria por proyecto, tasa de cumplimiento de ciclos preventivos, incidencia de fallas post-garantía.
