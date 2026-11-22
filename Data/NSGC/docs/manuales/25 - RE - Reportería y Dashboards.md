# 📊 25 - RE - Reportería y Dashboards

El centro de mando de la comunidad: consolida demografía, operación, gestiones y caja en un solo panel, y permite armar reportes por bloques que se distribuyen con precisión quirúrgica mediante segmentación física × perfil × tenencia.

## 🚀 Funcionalidad Principal

Cada vista abierta del mando queda auditada (`RE_DASHBOARD_VIEW`). **Emitir congela** el informe: número correlativo, autor y fecha quedan fijados y el histórico **no cambia** aunque los datos de origen cambien después. La distribución resuelve los destinatarios **vigentes al momento de enviar**, nunca los congelados.

## 🛠️ Secciones

- **Portada del sistema (`/dashboard`)**: la portada cambia de composición según el perfil, y el corte se decide **en el servidor** (`app/dashboard/page.tsx` → `perfilDeRoles`), no en el navegador (commit `8c80c79`).
  - **Administrador y comité** comparten el *Panel de gestión*: foto del día de Operaciones (visitas, encomiendas pendientes e ingresos de trabajadores de hoy), bloque financiero (ingresos, egresos y caja total de los fondos activos), deuda de las unidades, provisión del mes, nóminas por pagar, gastos estimados por servicio, mantenciones preventivas con enlace «Administrar» a `/admin/mantenciones` y visitas técnicas. La única diferencia es la nómina: `GET /api/liquidaciones` exige `pl`, así que el comité la ve declarada como restringida en vez de recibir un error.
  - **Conserjería y mantención** reciben la *portada operativa*: foto del día y día a día del edificio (mantenciones preventivas y visitas técnicas). **Residente** ve su estado de cuenta y sus reservas.
  - Ningún perfil operativo ve los totales financieros de la comunidad: esa frontera la garantiza el servidor, no la UI.
  - **El contador de cajas cuenta solo fondos activos** (commit `bdcbe12`); si todas las cajas están dadas de baja, lo dice en vez de mostrar un saldo consolidado que no existe.
- **Reportería y Dashboards (`/admin/reporteria`)**:
  - **Centro de Mando**:
    - *Censo*: ratio de ocupación habitable, unidades con propietario/arrendatario vigente y unidades con residentes con condiciones especiales.
    - *Pulso diario*: eficiencia de turnos ("X de Y cerrados hoy" desde cierres PE), visitas pre-agendadas confirmadas y **tasa huérfanos ST** (0 esperado post-carga).
    - *Centro de Gestiones*: embudo GE cuantitativo — total, tasa de resolución, nuevas/pendientes, en revisión, notificadas (en proceso), solucionadas y dadas en conocimiento.
    - *Salud de Caja*: recaudación vs emitido por fondo (GC/reserva/amenities), diferencia de caja (ingresos netos − egresos) y **termómetro de gastos fijos** verde/rojo según si la caja cubre los recurrentes. Estas cifras se calculan sobre el **libro completo** de cobros y egresos, no sobre la primera página: la tarjeta camina las páginas del libro como el resto del panel y, mientras la caminata no terminó, muestra «Cargando el libro completo de cobros y egresos…» en vez de una suma parcial con cara de total (`ae2f73f`). El snapshot del informe emitido lo sigue congelando el servidor.
  - **Reportes y Segmentación**:
    - Bloques extraíbles: Resumen de Gastos del Mes, Novedades de Bitácora, Estado de Morosidad General y Consumo de Insumos (IR).
    - Segmentación granular: edificio/piso/unidad (**EF**) + perfil administración/personal/propietario/residente (**MP/RP**) + tenencia propietarios/arrendatarios (**VU**). Vista previa del alcance antes de distribuir.
    - **Los perfiles y las tenencias son un solo catálogo** (`PERFILES_SEGMENTACION_RE` / `TENENCIAS_SEGMENTACION_RE` en `lib/schemas.ts`, con el contrato `SegmentoReporteRESchema`): la entrada de la API rechaza con 400 un perfil o una tenencia que no esté en el catálogo, y el motor lanza en vez de emitir el reporte a **0 destinatarios** —antes ese caso salía sin error y `distribuidoA` quedaba en 0 mientras el selector decía que se había distribuido—. Dos reglas que se ven al distribuir: una tenencia nombra el rol **titular** (un copropietario u ocupante no entra por «solo propietarios»; sí entra por «residentes» sin tenencia) y una cuenta **inactiva o bloqueada no recibe** el reporte por ningún camino.
    - **Emitir congela**: el snapshot se calcula al emitir (número, autor y fecha incluidos) y nunca se recalcula al abrirlo; reemitir el mismo informe devuelve el congelado, no un duplicado.
    - **Distribuir**: lo publica en el **visor interno** y, si hay servidor de correo disponible, lo deja en cola de envío. Sin correo configurado, el envío queda **pendiente** — nunca aparece como "enviado".
    - **Métrica del ciclo**: **emitidos / distribuidos / leídos**. No existe "tasa de apertura".

## 💡 Tips de Oro

- **Ejemplo canónico**: "Fallas de ascensores Torre A" → segmenta `[Torre A] + [Residentes] + [Propietarios]`; reciben exactamente quienes tienen vínculo vigente hoy en esa torre, sin duplicados.
- **El personal no siempre vive en la comunidad**: los perfiles Administración y Personal se resuelven desde MP aunque no tengan unidad vinculada; Propietarios/Residentes sí pasan por VU+EF.
- **Snapshot ≠ distribución**: el contenido se congela al emitir; los destinatarios se calculan al distribuir (si vendieron/dejaron la unidad después de emitir, no les llegará).
- **Pendiente es honesto**: sin servidor de correo el envío queda marcado pendiente; el informe ya está distribuido en el visor aunque el email no haya partido.
- **Termómetro rojo**: significa que los gastos fijos recurrentes superan la caja disponible proyectada — revisar sueldos y servicios antes de comprometer gastos nuevos.
- **Tasa huérfanos**: debe ser 0% tras la carga técnica; un valor > 0 indica FK colgante que hay que limpiar en qa-lab.
- **Auditoría**: `RE_DASHBOARD_VIEW`, `RE_REPORT_GENERATED`, `RE_REPORT_DISTRIBUTED`.

## 🔗 Dependencias

- Sumidero rank 99: lee de todos — **MP/VU/EF** (censo y segmentación), **PE** (turnos), **GE** (embudo), **FI** (caja/fondos/morosidad), **IR** (insumos), **AM/ST** (tasa huérfanos).
- Notificaciones vía `notify()` (**ST**, D3) con gate de alertas AD para residentes.
