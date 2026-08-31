# 📊 24 - Auditoría y Métricas (AM)

Este módulo centraliza el registro de todo lo que pasa en GECOS: quién hizo qué, cuándo y qué impacto tuvo. Es la base para reportes, KPIs y trazabilidad legal.

## 🚀 Funcionalidad Principal

Registrar eventos significativos del sistema, detectar tareas huérfanas y proyectar indicadores de gestión.

## 🛠️ Secciones

- **Logs de Auditoría** (`/admin/logs`): Pista inmutable en solo lectura, ordenada de lo más nuevo a lo más viejo. Buscá por texto libre (descripción, referencia o acción) y filtrá por módulo (`categoria`) o tipo de acción (`tipoAccion`). Con **Exportar CSV** te llevás el resultado filtrado a Excel. La ventana visible conserva los últimos 500 eventos.
- **Tareas Huérfanas**: Alertas automáticas cuando algo quedó pendiente más tiempo del esperado (turnos no cerrados, visitas no registradas, solicitudes fuera de SLA).
- **Dashboard de Métricas**: KPIs como tasa de eficiencia operativa, productividad, uso de amenidades, nivel de servicio y curva de recaudación.
- **Valor Aesthetics**: Contadores visuales del trabajo automatizado y el impacto económico de decisiones administrativas.

## 💡 Tips de Oro

- **Inmutabilidad**: Los logs no se pueden editar ni borrar, ni siquiera por el administrador — la vista `/admin/logs` no ofrece ninguna acción de escritura. Se mantienen por al menos 5 años.
- **Export con filtros**: El CSV exporta lo que estás viendo filtrado, no todo el historial. Aplicá primero búsqueda y filtros de módulo/acción.
- **Eventos por módulo**: Cada módulo emite sus propios eventos. Si no ves actividad de un módulo, revisá que esté generando los eventos correspondientes.
- **Tareas huérfanas**: No son solo advertencias; expponen ciclos abiertos que el comité debe revisar.

## 🔗 Dependencias

- Recibe eventos de todos los módulos: **CF**, **FI**, **PE**, **CO**, **EF**, **VU**, **MA**, **RP**, etc.
- Los datos se almacenan en la capa de datos persistente **ST**.
