# 📊 25 - RE - Reportería y Dashboards

El centro de mando de la comunidad: consolida demografía, operación, gestiones y caja en un solo panel, y permite armar reportes por bloques que se distribuyen con precisión quirúrgica mediante segmentación física × perfil × tenencia.

## 🚀 Funcionalidad Principal

Cada vista abierta del mando queda auditada (`RE_DASHBOARD_VIEW`). Los reportes se generan con **snapshot inmutable** (lo que se capturó no cambia aunque la mora o los gastos evolucionen) y la distribución resuelve los destinatarios **vigentes al momento de enviar**, nunca los congelados.

## 🛠️ Secciones

- **Reportería y Dashboards (`/admin/reporteria`)**:
  - **Centro de Mando**:
    - *Censo*: ratio de ocupación habitable, unidades con propietario/arrendatario vigente y unidades con residentes con condiciones especiales.
    - *Pulso diario*: eficiencia de turnos ("X de Y cerrados hoy" desde cierres PE), visitas pre-agendadas confirmadas y **tasa huérfanos ST** (0 esperado post-carga).
    - *Centro de Gestiones*: embudo GE cuantitativo — total, tasa de resolución, nuevas/pendientes, en revisión, notificadas (en proceso), solucionadas y dadas en conocimiento.
    - *Salud de Caja*: recaudación vs emitido por fondo (GC/reserva/amenities), diferencia de caja (ingresos netos − egresos) y **termómetro de gastos fijos** verde/rojo según si la caja cubre los recurrentes.
  - **Reportes y Segmentación**:
    - Bloques extraíbles: Resumen de Gastos del Mes, Novedades de Bitácora, Estado de Morosidad General y Consumo de Insumos (IR).
    - Segmentación granular: edificio/piso/unidad (**EF**) + perfil administración/personal/propietario/residente (**MP/RP**) + tenencia propietarios/arrendatarios (**VU**). Vista previa del alcance antes de distribuir.
    - Distribución idempotente: cada reporte se envía una vez; llega como notificación simulada a cada destinatario resuelto y el alcance queda registrado.

## 💡 Tips de Oro

- **Ejemplo canónico**: "Fallas de ascensores Torre A" → segmenta `[Torre A] + [Residentes] + [Propietarios]`; reciben exactamente quienes tienen vínculo vigente hoy en esa torre, sin duplicados.
- **El personal no siempre vive en la comunidad**: los perfiles Administración y Personal se resuelven desde MP aunque no tengan unidad vinculada; Propietarios/Residentes sí pasan por VU+EF.
- **Snapshot ≠ distribución**: el contenido se congela al generar; los destinatarios se calculan al distribuir (si vendieron/dejaron la unidad después de generar, no les llegará).
- **Termómetro rojo**: significa que los gastos fijos recurrentes superan la caja disponible proyectada — revisar sueldos y servicios antes de comprometer gastos nuevos.
- **Tasa huérfanos**: debe ser 0% tras la carga técnica; un valor > 0 indica FK colgante que hay que limpiar en qa-lab.
- **Auditoría**: `RE_DASHBOARD_VIEW`, `RE_REPORT_GENERATED`, `RE_REPORT_DISTRIBUTED`.

## 🔗 Dependencias

- Sumidero rank 99: lee de todos — **MP/VU/EF** (censo y segmentación), **PE** (turnos), **GE** (embudo), **FI** (caja/fondos/morosidad), **IR** (insumos), **AM/ST** (tasa huérfanos).
- Notificaciones vía `notify()` (**ST**, D3) con gate de alertas AD para residentes.
