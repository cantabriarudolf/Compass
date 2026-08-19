# 📊 24 - Auditoría y Métricas (AM)

Este módulo centraliza el registro de todo lo que pasa en GECOS: quién hizo qué, cuándo y qué impacto tuvo. Es la base para reportes, KPIs y trazabilidad legal.

## 🚀 Funcionalidad Principal

Registrar eventos significativos del sistema, detectar tareas huérfanas y proyectar indicadores de gestión.

## 🛠️ Secciones

- **Logs de Auditoría**: Lista cronológica de eventos (`CF_UPDATE_PARAM`, `MA_MAESTRO_UPDATE`, `FI_PAGO_RECIBIDO`, etc.). Se pueden filtrar por módulo, usuario o fecha.
- **Tareas Huérfanas**: Alertas automáticas cuando algo quedó pendiente más tiempo del esperado (turnos no cerrados, visitas no registradas, solicitudes fuera de SLA).
- **Dashboard de Métricas**: KPIs como tasa de eficiencia operativa, productividad, uso de amenidades, nivel de servicio y curva de recaudación.
- **Valor Aesthetics**: Contadores visuales del trabajo automatizado y el impacto económico de decisiones administrativas.

## 💡 Tips de Oro

- **Inmutabilidad**: Los logs no se pueden editar ni borrar, ni siquiera por el administrador. Se mantienen por al menos 5 años.
- **Eventos por módulo**: Cada módulo emite sus propios eventos. Si no ves actividad de un módulo, revisá que esté generando los eventos correspondientes.
- **Tareas huérfanas**: No son solo advertencias; expponen ciclos abiertos que el comité debe revisar.

## 🔗 Dependencias

- Recibe eventos de todos los módulos: **CF**, **FI**, **PE**, **CO**, **EF**, **VU**, **MA**, **RP**, etc.
- Los datos se almacenan en la capa de datos persistente **ST**.
