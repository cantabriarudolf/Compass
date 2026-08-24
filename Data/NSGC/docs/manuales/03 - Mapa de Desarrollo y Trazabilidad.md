# 03 - Mapa de Desarrollo y Trazabilidad

Este documento vincula la arquitectura del menú con los archivos de especificación y el orden lógico de construcción. Úsalo para saber qué estamos construyendo, de dónde viene la información y qué falta. 
**Fuente de fases y estados:** `k0mp4ss_fe/apps/web/lib/dev-dashboard.ts:64` (`PHASES`) + `deriveStatus` (detecta spec sucio post-archivo vía `isSpecDirtyAfterArchive`). Este archivo se regenera desde el dashboard.

> [!IMPORTANT]
> Este documento es actualizado por el Agente al finalizar cada hito de desarrollo para garantizar la trazabilidad del proyecto.

## 🚥 Leyenda de Estados
- 🟢 **Completado**: Archivado en `openspec/changes/archive/` sin suciedad (spec no modificado después).
- 🟡 **Documentado**: Spec en `openspec/specs/` existe (o archivado sucio — spec modificado tras archivar, requiere re-archivar).
- 🔵 **En Proceso**: Change activo en `openspec/changes/`.
- ⏳ **Pendiente**: Sin spec ni change.
- 🔴 **Bloqueado**: Falta información o dependencia previa.

## 🗺️ Trazabilidad: Documento -> Menú -> Ruta

| Orden | Fase | Módulo | Documento Fuente (Data/NSGC/docs/) | Etiqueta Menú | Ruta Kebab-case | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **00** | **0** | **RG** | `RG - Reglas Generales.md` | (Lógica Base) | N/A | 🟡 Documentado (sucio post `2026-08-17`) |
| **01** | **0** | **ST** | `ST - Capa de Datos Persistente.md` | (Capa de Datos) | `lib/store.ts` v8 | 🟡 Documentado (sucio post `2026-08-16`) |
| **02** | **0** | **UI** | `UI - Interfaz Principal.md`, `UI - Navegacion Lateral.md` | (Interfaz) | (transversal) | 🟡 Documentado (sucio) |
| **03** | **0** | **RP** | `RP - Roles y Permisos.md` | Permisos | `/admin/permisos` | 🟡 Documentado |
| **04** | **1** | **MA** | `MA - Maestros Administrativos.md` | Maestros | `/admin/maestros` | 🟡 Documentado |
| **05** | **1** | **TU** | `TU - Tipos de Unidad.md` | Infraestructura | `/inventario/tipos` | 🔵 En Proceso (`TU-tipos-unidad`) |
| **06** | **1** | **EF** | `EF - Estructura Física.md` | Estructura Física | `/inventario/estructura` | 🔵 En Proceso (`EF-estructura-fisica`) |
| **07** | **1** | **ES** | `ES - Estacionamientos.md` | Estacionamientos | `/inventario/estacionamientos` (deprecado v8) | 🔵 En Proceso (deprecado, absorbido como `u-E-*` en EF) |
| **08** | **2** | **MP** | `MP - Maestro de Personas.md` | Directorio Personas | `/comunidad/personas` | 🟡 Documentado (sucio post `2026-05-19`) |
| **09** | **2** | **VU** | `VU - Vinculacion Unidades.md` | Pestaña Unidades | `/comunidad/personas/[id]` | 🔵 En Proceso (`VU-vinculacion-unidades` + `VU-historial-asignaciones-unidad`) |
| **10** | **2** | **CF** | `CF - Configuración Global.md` | Configuración | `/admin/configuracion` | 🟡 Documentado |
| **11** | **2** | **PI** | `PI - Portal Inmobiliario.md` | Portal Inmobiliario | `/comunidad/portal` | ⏳ Pendiente |
| **12** | **3** | **FI** | `FI - Finanzas y Morosidad.md` | Gastos Comunes | `/finanzas/gastos-comunes` | ⏳ Pendiente |
| 13 | 3 | AD | `AD - Gestión Administrativa.md` | Resumen | `/dashboard` | ⏳ Pendiente |
| 14 | 3 | GD | `GD - Gestión de Directiva.md` | Directiva | `/comunidad/directiva` | ⏳ Pendiente |
| 15 | 3 | CO | `CO - Comunicación Vecinos.md` | Comunicación | `/comunidad/comunicacion` | ⏳ Pendiente |
| 16 | 3 | CV | `CV - Visor de Mensajes.md` | Visor | `/comunidad/visor-mensajes` | ⏳ Pendiente |
| 17 | 3 | GE | `GE - Gestión de Solicitudes.md` | Solicitudes | `/operaciones/solicitudes` | ⏳ Pendiente |
| 18 | 3 | AM | `AM - Auditoría y Métricas.md` | Auditoría | `/admin/metricas` | 🟡 Documentado |
| 19 | 3 | RE | `RE - Reportería y Dashboards.md` | Informes | `/reportes` | ⏳ Pendiente |
| 20 | 4 | PE | `PE - Personal y Servicios.md` | Personal / Bitácora | `/personas/personal` | ⏳ Pendiente |
| 21 | 4 | PL | `PL - Liquidaciones y Remuneraciones.md` | Remuneraciones | `/finanzas/remuneraciones` | ⏳ Pendiente |
| 22 | 4 | RA | `RA - Reservas y Amenities.md` | Reservas | `/operaciones/reservas` | ⏳ Pendiente |
| 23 | 4 | IR | `IR - Inventario y Recursos.md` | Recursos y EPP | `/inventario/recursos` | ⏳ Pendiente |
| 24 | 4 | IN | `IN - Infracciones y Multas.md` | Multas | `/finanzas/multas` | ⏳ Pendiente |
| 25 | 4 | MT | `MT - Mantenimiento y Proyectos.md` | Mantenimiento | `/inventario/proyectos` | ⏳ Pendiente |
| 26 | 4 | CT | `CT - Certificados.md` | Certificados | `/comunidad/certificados` | ⏳ Pendiente |
| **27** | **0** | **34 - Historia** | `34 - Historia de Poblamiento - Relato de Uso.md` | (Transversal) | (manual) | 🟢 Completado (`enhance-rg-st-seed-gears`) |
| **28** | **5** | **LAB** | `LAB - Mejoras Lab` (Fase 5) | Laboratorio QA | `/admin/qa-lab` | 🔵 En Proceso (`lab-fase-mejoras` backlog) |
| 29 | 5 | QA-Lab | `DEV-qa-lab` | Laboratorio QA | `/admin/qa-lab` | 🔵 En Proceso (`qa-lab` 11/11) |

> Cambios v8: `MA` movido Fase2→Fase1 y `RP` a Fase0 para alinear `PHASES` con dependencias (MA alimenta EF/TU, RP transversal). `ES` marcado deprecado (ver `ES - ...md` y `ST` v8). `PI` queda Fase2 (no Fase5) y `AM/RE` Fase3 (no Fase5) para unificar Dashboard ↔ Plan.

---

## 🛠️ Lógica de Dependencias (Para no "quedar en pana")

Para asegurar un desarrollo fluido, seguiremos estas reglas de oro:

1.  **Fase 1 (Inventario)** debe estar terminada antes de **Fase 2 (Personas)**, porque no podemos registrar a un dueño si no existe el departamento donde vive.
2.  **Fase 2 (Identidad)** debe estar terminada antes de **Fase 3 (Finanzas)**, porque no podemos cobrar gastos comunes si no sabemos quién es el dueño y qué porcentaje de copropiedad tiene.
3.  **Fase 3 (Operaciones)** debe estar terminada antes de **Fase 4 (Reportería/Avanzado)**, porque los reportes necesitan datos históricos de las operaciones para mostrar algo útil.

---

## 🗒️ Notas de Implementación
- El componente **AppSidebar.tsx** ya tiene configuradas todas estas rutas (ES como filtrado de EF `u-E-*` desde v8).
- Las carpetas en `apps/web/app/` deben crearse siguiendo exactamente la columna **Ruta Kebab-case**.
- Los estados `🟡 Documentado (sucio)` indican spec más nuevo que su archive — ejecutar `/cierra-modulo` para re-archivar o revertir.
