# 01 - Plan de Avance

Este documento actúa como la hoja de ruta oficial para el desarrollo del Proyecto Compass. Se actualiza conforme se completan las especificaciones y el código. **Fuente de verdad de fases:** `k0mp4ss_fe/apps/web/lib/dev-dashboard.ts:64` (`PHASES`). Los estados se derivan del dashboard (`deriveStatus`): `completado` = archivado sin suciedad, `documentado` = spec existe, `en_proceso` = change activo, `pendiente` = sin spec.

## 📋 Resumen de Progreso
- **Estado Global:** 🟡 Fase 0 Documentado (sucio post-archivo) - Fase 1 En Proceso - Fase 2 En Proceso
- **Módulos:** 0 completado / 4 en proceso / 9 documentado / 15 pendiente (total 28, UI duplicado por 2 specs)
- **Dashboard:** `/admin/dev-dashboard` (PHASES + deriveStatus con detección de spec sucio `isSpecDirtyAfterArchive`)
- **Próximo Hito:** `VU` (cerrar vinculación + historial) → `CF`/`RP` → `FI`

---

## 🚦 Fase 0: Infraestructura y Navegación (cross-cutting)
| ID | Módulo | Estado | Descripción |
| :--- | :--- | :--- | :--- |
| 00 | Base Shell | 🟢 Completado | Layout principal, Sidebar y Theme |
| 01 | Estructura de Menú | 🟢 Completado | Jerarquía de navegación del sistema |
| 02 | RG - Reglas Generales | 🟡 Documentado (sucio) | Lógica transversal — archivado `2026-08-17` pero spec modificado v8 (terminología comunidad) — re-archivar pendiente |
| 03 | ST - Capa de Datos Persistente | 🟡 Documentado (sucio) | Store `compass-store` v8 — archivado `2026-08-16` pero spec sincronizado ES→EF — re-archivar pendiente |
| 04 | RP - Roles y Permisos | 🟡 Documentado | Control de acceso basado en perfiles — spec existe, sin implementación aún |

## 🏢 Fase 1: Inventario Físico
| ID | Módulo | Estado | Descripción |
| :--- | :--- | :--- | :--- |
| 05 | MA - Maestros Admin | 🟡 Documentado | Tablas auxiliares — spec + UI `/admin/maestros` OK, sin change activo (falta archivar) |
| 06 | TU - Tipos de Unidad | 🔵 En Proceso | Categorización de inmuebles — change activo `TU-tipos-unidad` |
| 07 | EF - Estructura Física | 🔵 En Proceso | CRUD Torres/Pisos/Unidades (incluye `u-E-*` estacionamientos) — change `EF-estructura-fisica` |
| 08 | ES - Estacionamientos | 🔵 En Proceso (deprecado v8) | Absorbido como `unidades` en EF — spec histórico, change `ES-estacionamientos` pendiente archivar como absorbido |

## 👥 Fase 2: Identidad, Accesos y Configuración
| ID | Módulo | Estado | Descripción |
| :--- | :--- | :--- | :--- |
| 09 | MP - Maestro Personas | 🟡 Documentado (sucio) | Base de datos residentes — archivado `2026-05-19` pero spec retocado v8 — re-archivar pendiente |
| 10 | VU - Vinculación | 🔵 En Proceso | Relación unidades↔personas — changes `VU-vinculacion-unidades` + `VU-historial-asignaciones-unidad` |
| 11 | CF - Configuración Global | 🟡 Documentado | Parámetros base (SMTP, GC, seguridad) — spec + UI, sin change activo |
| 12 | PI - Portal Inmobiliario | ⏳ Pendiente | Vitrina arriendo/venta — depende de VU |

## 💰 Fase 3: Operación y Finanzas (Core)
| ID | Módulo | Estado | Descripción |
| :--- | :--- | :--- | :--- |
| 13 | FI - Finanzas y Morosidad | ⏳ Pendiente | Gastos comunes, cobranza — depende de TU/EF/VU |
| 14 | AD - Gestión Administrativa | ⏳ Pendiente | Panel administrador |
| 15 | GD - Gestión de Directiva | ⏳ Pendiente | Reuniones, actas |
| 16 | CO - Comunicación Vecinos | ⏳ Pendiente | Mensajería masiva |
| 17 | CV - Visor de Mensajes | ⏳ Pendiente | Carrusel avisos |
| 18 | GE - Gestión de Solicitudes | ⏳ Pendiente | Tickets |
| 19 | AM - Auditoría y Métricas | 🟡 Documentado | Log eventos/KPIs — spec existe, falta implementación Event Log |
| 20 | RE - Reportería y Dashboards | ⏳ Pendiente | Paneles control — depende de Fase3 |

## 🏗️ Fase 4: Operaciones Avanzadas y Cumplimiento
| ID | Módulo | Estado | Descripción |
| :--- | :--- | :--- | :--- |
| 21 | PE - Personal y Servicios | ⏳ Pendiente | Fichas personal, conserjería |
| 22 | PL - Liquidaciones y Remuneraciones | ⏳ Pendiente | Sueldos |
| 23 | RA - Reservas y Amenities | ⏳ Pendiente | Reserva espacios comunes |
| 24 | IR - Inventario y Recursos | ⏳ Pendiente | Activos, insumos, EPP |
| 25 | IN - Infracciones y Multas | ⏳ Pendiente | Multas |
| 26 | MT - Mantenimiento y Proyectos | ⏳ Pendiente | Obras |
| 27 | CT - Certificados | ⏳ Pendiente | Emisión certificados |

---

## 🛠️ Leyenda
- 🔴 Bloqueado
- ⏳ Pendiente
- 🟡 Documentado (spec existe, falta archivar o spec sucio post-archivo)
- 🔵 En Proceso (change activo en `openspec/changes/`)
- 🟢 Completado (archivado sin suciedad)

> Nota: `ES` en Fase1 es histórico — desde v8 ver `EF` filtrado por `u-E-*`. `MA` movido de Fase2→Fase1 y `RP` a Fase0 para alinear `PHASES` con dependencias (MA alimenta EF/TU, RP es transversal).
