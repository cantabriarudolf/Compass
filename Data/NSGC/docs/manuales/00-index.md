# 🧭 Índice de Documentación - Proyecto Compass

Bienvenido a la documentación operativa del sistema de administración de condominios **Compass**. Este índice organiza los manuales de cada herramienta según su orden de implementación y dependencia lógica.

## 🏗️ Fase 1: Infraestructura y Bases
- [01 - Tipos de Unidad](<01 - Tipos de Unidad.md>): Gestión de plantillas y modelos base de propiedades.
- [02 - Estructura Física](<02 - Estructura Física.md>): Configuración de torres, niveles y departamentos.
- [03 - Estacionamientos](<03 - Estacionamientos.md>): Inventario de parking y vinculación granulada.

## ⚙️ Fase 2: Configuración Administrativa
- [04 - Auditoría y Métricas](<04 - Auditoría y Métricas.md>): Control de logs y reportes de gestión.
- [04 - Maestros Administrativos](<04 - Maestros Administrativos.md>): Parámetros globales, zonas y estados de ocupación.
- [13 - AD - Gestión Administrativa](<13 - AD - Gestión Administrativa.md>): Panel del administrador con cajones de Comunidad y RRHH, controles de privacidad por unidad y firma digitalizada de directiva.

## 👥 Fase 3: Residentes y Comunidad
- [05 - Maestro de Personas](<05 - Maestro de Personas.md>)
- [06 - Vinculación de Unidades](<06 - Vinculación de Unidades.md>)
- [27 - PI - Portal Inmobiliario](<27 - PI - Portal Inmobiliario.md>): Vitrina de arriendo/venta con trigger automático desde VU, leads con contacto seguro y visibilidad residentes/pública.
- [14 - GD - Gestión de Directiva](<14 - GD - Gestión de Directiva.md>): Actas con asistencia, flujo de aprobación por quórum 100%, publicación formal y privacidad propietario/residente.
- [26 - CT - Certificados](<26 - CT - Certificados.md>): Documentación oficial con firma embebida en el PDF, gates por tipología (Al Día saldo ≤ 0, residencia VU activo) e historial con código de verificación.

## 🔧 Documentación Transversal
- [AU - Autenticación y Sesión](<AU - Autenticacion y Sesion.md>): Login Auth.js (JWT + credentials), usuarios en BD con `passwordHash`, rate limit persistente D-v y guardia `proxy.ts`.
- [SG - Hardening y Despliegue](<SG - Hardening y Despliegue.md>): CSP report-only con nonce (D-i), headers HSTS sin preload + PUBLIC_DOMAIN (D-ii), runbook de re-chequeos 5/5 scripted (D-iii), re-auditoría OWASP final con cero 🔴 abiertos (D-iv, informe `auditorias/auditoria - 2026-08-27 - owasp-final.md`) y runbook backups/restauración de BD `backup:db`/`restore:db` con prueba de restore (D-vi) — listo para `securityheaders.com` y deploy del owner.
- [28 - MK - Catálogo de Mocks](<28 - MK - Catálogo de Mocks.md>): Inventario completo de datos mockeados, ubicación, dependencias y hoja de ruta de migración a backend.
- [29 - MK - Data Dump Inventario](<29 - MK - Data Dump Inventario.md>): Todas las unidades, sectores y tipos resueltos en tablas planas (166 unidades: 80 deptos + 3 locales + 83 plazas `u-E-*`).
- [30 - MK - Data Dump Comunidad](<30 - MK - Data Dump Comunidad.md>): Personas, vínculos y extensiones laborales/gobernanza (ver banner: dump histórico).
- [34 - Historia de Poblamiento - Relato de Uso](<34 - Historia de Poblamiento - Relato de Uso.md>): Crónica humana del poblamiento ordenado (MA/CF → TU/MP → EF → VU → PE/IR/CO → FI → AM) con relato, gear técnico y verificación cruzada.
- [35 - MK - Data Dump Portal, Admin y Directiva](<35 - MK - Data Dump Portal, Admin y Directiva.md>): Colecciones Sesión 1 NSGC (`publicacionesPortal`, `leadsPortal`, `notificaciones`, `controlesPropiedades`, `actasGD`) — vacías por diseño, con estructura, campos y patrones de ID.
- [36 - MK - Data Dump Comunicación y Solicitudes](<36 - MK - Data Dump Comunicación y Solicitudes.md>): Colecciones Sesión 2 NSGC (`plantillasCO` con 5 registros sembrados del NSGC + `enviosCO`, `mensajesBuzonCO`, `documentosCO`, `solicitudesGE`) con workflow GE y patrones de folio BUZ/GE; incluye desde Sesión 4 el dump de `plantillasCV` (4 plantillas rápidas del carrusel).
- [37 - MK - Data Dump Recursos, Multas y Mantenimiento](<37 - MK - Data Dump Recursos, Multas y Mantenimiento.md>): Colecciones Sesión 3 NSGC (`tiposInfraccionIN` con 5 faltas sembradas del NSGC + `activosIR`, `solicitudesInsumoIR`, `entregasEPP`, `infraccionesIN`, `trabajosMT`, `proyectosMT`) con patrones de código IR-A/SI/IN/MT.
- [39 - MK - Data Dump Personal y Servicios](<39 - MK - Data Dump Personal y Servicios.md>): Maestros operativos Sesión 6 NSGC (`asignacionFamiliar` 4 tramos, `jornadas`, `couriers`, `contratistas`) + las 8 colecciones operativas PE (bitácora, encomiendas, contratistas, proveedores, mantenciones, visitas técnicas, cierres de turno, proyecciones) con extensión laboral profunda.
- [38 - MK - Data Dump Finanzas](<38 - MK - Data Dump Finanzas.md>): Colecciones Sesión 5 NSGC (`fondosFI` con 3 fondos sembrados del NSGC + `egresosFI`, `emisionesGC`, `cobrosFI` operativas) con reglas de cálculo (prorrateo, mora pro-rata, vencimientos) y origen de cargos automáticos IN/RA.
- [40 - MK - Data Dump Remuneraciones, Certificados y Reportería](<40 - MK - Data Dump Remuneraciones, Certificados y Reportería.md>): Colecciones transaccionales Sesión 7 NSGC (`liquidacionesPL` folios LIQ, `adelantosPL` folios ADE, `certificadosCT` folios CT+código VC, `reportesRE`) — estructura y patrones, vacías por diseño.
- [19 - PE - Liquidaciones y Remuneraciones](<19 - PE - Liquidaciones y Remuneraciones.md>): Motor de remuneraciones estándar Chile (hora extra §1.1, gratificación tope, AFP/salud/SIS), adelantos ADE, egreso FI Sueldos y PDF firmado.
- [25 - RE - Reportería y Dashboards](<25 - RE - Reportería y Dashboards.md>): Centro de mando (censo, pulso operativo, embudo GE, salud de caja con termómetro) y distribución segmentada EF×perfil×tenencia.

---
*Última actualización: 2026-08-27 - Plataforma P8 (cierre): serie P1–P8 COMPLETA. Engranajes verificados en vivo (sesión login→/admin→API 200→logout→401, 403 por rol, aislamiento A/B, rate limit, migrate desde cero, backup/restore 0 divergencias, re-chequeos 5/5). Fix `/admin` → `/admin/gestion` con test regresivo. 413 tests, store v26.*
