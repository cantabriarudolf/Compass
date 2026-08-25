# 01 - Plan de Avance

Este documento actúa como la hoja de ruta oficial para el desarrollo del Proyecto Compass. Se actualiza conforme se completan las especificaciones y el código. **Fuente de verdad de fases:** `k0mp4ss_fe/apps/web/lib/dev-dashboard.ts:64` (`PHASES`). Los estados se derivan del dashboard (`deriveStatus`): `completado` = archivado sin suciedad, `documentado` = spec existe, `en_proceso` = change activo, `pendiente` = sin spec.

## 📋 Resumen de Progreso
- **Estado Global:** 🟢 Fases 0–2 completadas + Sesión 1 NSGC (PI/AD/GD) — sin changes activos
- **Módulos:** 14 completado / 0 en proceso / 5 documentado / 12 pendiente (total 31 filas del plan)
- **Dashboard:** `/admin/dev-dashboard` (PHASES + deriveStatus con detección de spec sucio `isSpecDirtyAfterArchive`)
- **Próximo Hito:** Serie NSGC — Sesión 2 (propuesta pendiente; candidatos CO/CV/GE/FI según roadmap NSGC)

---

## 🚦 Fase 0: Infraestructura y Navegación (cross-cutting)
| ID | Módulo | Estado | Descripción |
| :--- | :--- | :--- | :--- |
| 00 | Base Shell | 🟢 Completado | Layout principal, Sidebar y Theme |
| 01 | Estructura de Menú | 🟢 Completado | Jerarquía de navegación del sistema |
| 02 | RG - Reglas Generales | 🟢 Completado | Lógica transversal — `enhance-rg-st-seed-gears` archivado `2026-08-24` con spec sincronizada |
| 03 | ST - Capa de Datos Persistente | 🟢 Completado | Store `compass-store` v13 — migraciones v11/v12/v13 aditivas (PI/AD/GD) |
| 03b | RG+ST Engranes | 🟢 Completado | Carga ordenada Rank 0..99 + Historia 34 + valida-datos 7 puntos — archivado `2026-08-24` |
| 04 | RP - Roles y Permisos | 🟡 Documentado | Control de acceso basado en perfiles — spec existe, sin implementación aún |

## 🏢 Fase 1: Inventario Físico
| ID | Módulo | Estado | Descripción |
| :--- | :--- | :--- | :--- |
| 05 | MA - Maestros Admin | 🟡 Documentado | Tablas auxiliares — spec + UI `/admin/maestros` OK, sin change propio (spec vía engranes) |
| 06 | TU - Tipos de Unidad | 🟢 Completado | Categorización de inmuebles — `TU-tipos-unidad` archivado `2026-08-24` |
| 07 | EF - Estructura Física | 🟢 Completado | CRUD Torres/Pisos/Unidades (incluye `u-E-*`) — `EF-estructura-fisica` archivado `2026-08-24` |
| 08 | ES - Estacionamientos | 🟢 Completado (deprecado v8) | Absorbido como unidades `u-E-*` en EF — change archivado como absorbido `2026-08-24` |

## 👥 Fase 2: Identidad, Accesos y Configuración
| ID | Módulo | Estado | Descripción |
| :--- | :--- | :--- | :--- |
| 09 | MP - Maestro Personas | 🟡 Documentado | Base de datos residentes (54 personas, RUT DV válido) — spec re-sincronizada `2026-08-24` |
| 10 | VU - Vinculación | 🟢 Completado | Relación unidades↔personas — changes archivados `2026-08-24` |
| 11 | CF - Configuración Global | 🟡 Documentado | Parámetros base + D4 legal Chile en spec — sin change propio |
| 12 | PI - Portal Inmobiliario | 🟢 Completado | Vitrina arriendo/venta con trigger VU y leads D3 — `PI-portal-inmobiliario` archivado `2026-08-25` (Sesión 1 NSGC) |

## 💰 Fase 3: Operación y Finanzas (Core)
| ID | Módulo | Estado | Descripción |
| :--- | :--- | :--- | :--- |
| 13 | FI - Finanzas y Morosidad | ⏳ Pendiente | Gastos comunes, cobranza — depende de TU/EF/VU |
| 14 | AD - Gestión Administrativa | 🟢 Completado | Panel `/admin/gestion`: cajones Comunidad/RRHH, controles por unidad, firma D1 — archivado `2026-08-25` (Sesión 1 NSGC) |
| 15 | GD - Gestión de Directiva | 🟢 Completado | Actas con asistencia, quórum 100%, publicación con notify formal, privacidad AD — archivado `2026-08-25` (Sesión 1 NSGC) |
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

## 🧪 Fase 5: Laboratorio y Automatización (Mejoras)
| ID | Módulo | Estado | Descripción |
| :--- | :--- | :--- | :--- |
| 28 | LAB - Mejoras Lab | 🟢 Completado | `lab-fase-mejoras` archivado `2026-08-24` (backlog restante vive en spec LAB) |
| 29 | QA-Lab | 🟢 Completado | Lab QA con carga ordenada por rank — `qa-lab` archivado `2026-08-24`; pasos 8–10 (PI/AD/GD) en Sesión 1 NSGC |

---

## 🛠️ Leyenda
- 🔴 Bloqueado
- ⏳ Pendiente
- 🟡 Documentado (spec existe, falta archivar o spec sucio post-archivo)
- 🔵 En Proceso (change activo en `openspec/changes/`)
- 🟢 Completado (archivado sin suciedad)

> Nota: `ES` en Fase1 es histórico — desde v8 ver `EF` filtrado por `u-E-*`. `MA` movido de Fase2→Fase1 y `RP` a Fase0 para alinear `PHASES` con dependencias (MA alimenta EF/TU, RP es transversal).
