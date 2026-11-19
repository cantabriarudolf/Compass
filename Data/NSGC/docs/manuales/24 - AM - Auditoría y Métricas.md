# 📊 24 - Auditoría y Métricas (AM)

Este módulo centraliza el registro de todo lo que pasa en GECOS: quién hizo qué, cuándo y qué impacto tuvo. Es la base para reportes, KPIs y trazabilidad legal.

## 🚀 Funcionalidad Principal

Registrar eventos significativos del sistema, detectar tareas huérfanas y proyectar indicadores de gestión.

## 🛠️ Secciones

- **Logs de Auditoría** (`/admin/logs` — BD, C1.2 2026-09-01): Pista inmutable en solo lectura sobre `GET /api/auditoria` (retención 5 años en BD). Ordenada `timestamp` desc, paginación server-side `page/pageSize=50` con contador "X de Y eventos en BD" y botones anterior/siguiente. Buscá por texto libre (descripción o referencia, debounce 200ms → `q`) y filtrá por módulo (`categoria`) o tipo de acción (`tipoAccion`); los selects se alimentan de la página actual. Con **Exportar CSV** te llevás la página cargada (BOM + header `timestamp,usuario,categoria,tipoAccion,referenciaId,descripcion`). Skeleton "Cargando…" y empty "Sin eventos…" con badge "solo lectura · pista inmutable" y cero mutaciones.
- **La búsqueda no acepta los comodines de LIKE** (`%` y `_`): un término con comodín responde **400 «El parámetro q no acepta los comodines % y _.»** antes de consultar la base, porque `contains` arma `%q%` sin escapar y `q=%%` enumeraba la pista entera de la comunidad (F39, 2026-11-19). Por eso el texto libre ya **no alcanza a un código de acción**: los `tipoAccion` reales llevan `_` (`AD_DIRECTIVA_DESVINCULADA`, `RP_VOLUME_LIMITED`) y el guion bajo se rechaza. Para filtrar por acción están el filtro exacto `tipoAccion` y el select «Tipo de acción», que no cambian.
- **Tareas Huérfanas**: Alertas automáticas cuando algo quedó pendiente más tiempo del esperado (turnos no cerrados, visitas no registradas, solicitudes fuera de SLA).
- **Dashboard de Métricas**: KPIs como tasa de eficiencia operativa, productividad, uso de amenidades, nivel de servicio y curva de recaudación. Las cifras que derivan del padrón de unidades (recaudación mensual, superficie total, servicios) suman el padrón completo de la comunidad: con más de cien unidades el número ya no baja ni se presenta como total estando corto.
- **Valor Aesthetics**: Contadores visuales del trabajo automatizado y el impacto económico de decisiones administrativas.

## 💡 Tips de Oro

- **Inmutabilidad**: Los logs no se pueden editar ni borrar, ni siquiera por el administrador — la vista `/admin/logs` no ofrece ninguna acción de escritura. Se mantienen por al menos 5 años.
- **Export con filtros**: El CSV exporta lo que estás viendo filtrado, no todo el historial. Aplicá primero búsqueda y filtros de módulo/acción.
- **Eventos por módulo**: Cada módulo emite sus propios eventos. Si no ves actividad de un módulo, revisá que esté generando los eventos correspondientes.
- **Tareas huérfanas**: No son solo advertencias; expponen ciclos abiertos que el comité debe revisar.

## 🔗 Dependencias

- Recibe eventos de todos los módulos: **CF**, **FI**, **PE**, **CO**, **EF**, **VU**, **MA**, **RP**, etc.
- Los datos se almacenan en la capa de datos persistente **ST**.
