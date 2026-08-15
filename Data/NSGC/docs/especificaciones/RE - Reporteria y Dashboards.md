# RE - Reportería y Dashboards

Este módulo consolida la información de todos los subsistemas (Finanzas, Operaciones, Estructura) para presentarla de forma digerible, permitiendo la toma de decisiones y la transparencia hacia la comunidad.

## 1. Dashboards por Perfil

Cada usuario, según su rol, accederá a una vista principal (Dashboard) con la información más relevante para su contexto.

### Dashboard de Operaciones (Personal de Servicio)
- Ubicación: `Operaciones -> Reporte Diario`.
- Objetivo: Visibilidad rápida de los relevos.
- Funciones: Tarjetas de jornadas (Mañana, Tarde, Noche) con estados (Informado/No Informado), historial de días anteriores y acceso al detalle del Cierre de Turno.

### Dashboard de Administración / Comité (Centro de Mando)
- **Objetivo:** Visión gerencial de la salud operativa, financiera y demográfica del condominio.
- **Métricas Demográficas (Censo):** 
  - Ratio de ocupación (Propietarios vs Residentes Arrendatarios).
  - Número de unidades con residentes con "Condiciones Especiales".
- **Métricas Operativas (El pulso diario):**
  - Eficiencia de turnos: Ej. "2 de 3 turnos cerrados hoy".
  - Control de accesos: Ej. "4 de 8 visitas pre-agendadas confirmadas".
- **Centro de Gestiones (KPIs de Eficiencia):**
  - Control cuantitativo estricto del embudo de tareas y tickets de la comunidad (`GE`). El sistema debe mostrar en tiempo real:
    - **Total Gestiones:** (Suma histórica o del periodo).
    - **Tasa de Resolución:** Porcentaje de éxito (Ej: 85%).
    - **Nuevas / Pendientes:** (Sin tocar).
    - **En Revisión:** (Asignadas o en análisis).
    - **Notificadas (En Proceso):** (Trabajándose con proveedores/personal).
    - **Solucionadas:** (Cerradas con éxito).
    - **Dadas en Conocimiento:** (Cerradas informativamente, sin acción requerida).
- **Métricas Financieras (Salud de Caja):**
  - **Recaudación por Fondo:** Muestra lo recaudado vs meta, separado por cajas (Fondo Gasto Común, Fondo de Reserva, Cuota Extraordinaria).
  - **Diferencia de Caja:** Flujo de caja actual (Ingresos netos vs Egresos).
  - **Termómetro de Gastos Fijos:** Proyección de gastos recurrentes (Sueldos, Servicios básicos) indicando en verde/rojo si el presupuesto alcanzará para cubrirlos.

## 2. Generador de Reportes Personalizados

El sistema no solo genera reportes fijos, sino que permite extraer "bloques" de información y enviarlos a grupos específicos.

### Tipos de Datos Extraíbles (Bloques):
- Resumen de Gastos del Mes.
- Historial de Novedades de Seguridad (Bitácora).
- Estado de Morosidad General.
- Consumo de Insumos (del módulo `IR`).

### Asignación a Grupos de Interés:
El administrador puede construir un reporte seleccionando bloques y eligiendo quién puede verlo o recibirlo, utilizando una **Segmentación Granular**.

## 3. Segmentación Granular (El Motor de Distribución)

Tanto para la reportería como para la mensajería (Módulo `CO`), el sistema permite seleccionar destinatarios con precisión quirúrgica:

- **Por Estructura Física (`EF`):** Edificio Completo, Piso Específico, o Unidad particular.
- **Por Perfil de Persona (`MP` / `RP`):** Administrador, Trabajador de Servicio, Directiva/Comité.
- **Por Tipo de Tenencia:** Solo Propietarios, Solo Residentes (Arrendatarios).

*Ejemplo de Uso:* Generar un reporte de "Fallas en Ascensores de la Torre A" y enviarlo **solo** al grupo: `[Torre A] + [Residentes] + [Propietarios]`.

## 4. Integración con Auditoría y Métricas (AM)

Todo acceso a información sensible y cada distribución de reportes debe quedar registrado:
- **Evento:** `RE_DASHBOARD_VIEW`, `RE_REPORT_GENERATED`, `RE_REPORT_DISTRIBUTED`.
- **Data Cuantificable:** Cantidad de reportes generados por periodo, alcance (audiencia) de cada distribución, frecuencia de acceso por perfil.
- **Métrica:** Tasa de consumo de reportes por rol, exactitud de la segmentación, tiempo de generación de reportes.
