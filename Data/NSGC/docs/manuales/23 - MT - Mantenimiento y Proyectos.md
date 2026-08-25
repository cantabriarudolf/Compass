# 🔧 23 - Mantenimiento y Proyectos (MT)

La bitácora técnica y financiera de la copropiedad: trabajos correctivos, mantenciones preventivas que se re-programan solas, garantías con alerta de expiración y proyectos de largo plazo con cuota sugerida.

## 🚀 Funcionalidad Principal

Cada intervención es un registro `MT-####` con descripción técnica, ubicación precisa (unidad EF, sub-sector o equipo crítico del catálogo IR), responsable (personal interno MP o proveedor externo), prioridad (Baja/Media/Alta/Emergencia) y evidencias D1 tipadas (foto antes/después, presupuesto, factura).

## 🛠️ Secciones

- **Trabajos**: grilla completa con acciones Iniciar → Finalizar → Cancelar según estado; costo total y estado de pago (Pendiente/Parcial/Pagado) con transiciones validadas; origen de fondos documental (Gasto Común / Fondo Reserva / Fondo Especial) con cargo FI pendiente.
- **Prevención**: tablero de próximos vencimientos ordenado por fecha programada (vencidos destacados); al finalizar un preventivo el sistema genera automáticamente la próxima mantención Planificada (+periodicidad) y avisa a administración. Botón *Verificar garantías*: alerta garantías ≤30 días o vencidas, una sola vez por trabajo.
- **Proyectos**: planes futuros (ej. "Mantención de techos") con presupuesto estimado y plazo; cuota sugerida mensual derivable = presupuesto ÷ meses.

## 💡 Tips de Oro

- **Preventivo sin manos**: Hidropack mensual, CCTV semestral — configura la periodicidad una vez y cada finalización crea el siguiente registro con su fecha programada.
- **Correctivo no engendra**: solo los trabajos con configuración preventiva generan ciclo.
- **Garantías idempotentes**: la alerta `MT_GUARANTEE_EXPIRED` sale una única vez por trabajo (flag interno), aunque verifiques mil veces.
- **Pagos sin saltos raros**: Pendiente → Parcial → Pagado; volver atrás requiere pasar por Pendiente.
- **Ubicación obligatoria**: sin unidad ni sub-sector el trabajo no se guarda; vincular el activo IR habilita histórico por equipo crítico.
- **Auditoría**: `MT_WORK_CREATED`, `MT_WORK_STARTED`, `MT_WORK_FINISHED`, `MT_PREVENTIVE_GENERATED`, `MT_GUARANTEE_EXPIRED`.

## 🔗 Dependencias

- Unidades/sub-sectores de **EF** y responsables internos de **MP**.
- Equipos críticos del catálogo de **IR - Inventario y Recursos** (`activoIRId`).
- Notificaciones con `notify()` (**ST**, D3).

