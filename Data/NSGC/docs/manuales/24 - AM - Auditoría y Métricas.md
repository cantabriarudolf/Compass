# 📊 24 - Auditoría y Métricas (AM)

Este módulo centraliza el registro de todo lo que pasa en GECOS: quién hizo qué, cuándo y qué impacto tuvo. Es la base para reportes, KPIs y trazabilidad legal.

## 🚀 Funcionalidad Principal

Registrar eventos significativos del sistema, detectar tareas huérfanas y proyectar indicadores de gestión.

## 🛠️ Secciones

- **Logs de Auditoría** (`/admin/logs` — BD, C1.2 2026-09-01): Pista inmutable en solo lectura sobre `GET /api/auditoria` (retención 5 años en BD). Ordenada `timestamp` desc, paginación server-side `page/pageSize=50` con contador "X de Y eventos en BD" y botones anterior/siguiente. Buscá por texto libre (descripción, referencia o acción, debounce 200ms → `q`) y filtrá por módulo (`categoria`) o tipo de acción (`tipoAccion`); los selects se alimentan de la página actual. Con **Exportar CSV** te llevás la página cargada (BOM + header `timestamp,usuario,categoria,tipoAccion,referenciaId,descripcion`). Skeleton "Cargando…" y empty "Sin eventos…" con badge "solo lectura · pista inmutable" y cero mutaciones.
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
