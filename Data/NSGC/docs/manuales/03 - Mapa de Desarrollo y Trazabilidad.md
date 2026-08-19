# 03 - Mapa de Desarrollo y Trazabilidad

Este documento vincula la arquitectura del menú con los archivos de especificación y el orden lógico de construcción. Úsalo para saber qué estamos construyendo, de dónde viene la información y qué falta. 

> [!IMPORTANT]
> Este documento es actualizado por el Agente al finalizar cada hito de desarrollo para garantizar la trazabilidad del proyecto.

## 🚥 Leyenda de Estados
- 🟢 **Completado**: El código está implementado, probado y en la rama principal.
- 🔵 **En Proceso**: Se está trabajando actualmente en este módulo (Change activo).
- ⏳ **Pendiente**: El módulo está planificado pero aún no se ha iniciado.
- 🔴 **Bloqueado**: Falta información o una dependencia previa para avanzar.

## 🗺️ Trazabilidad: Documento -> Menú -> Ruta

| Orden | Fase | Módulo | Documento Fuente (Data/NSGC/docs/) | Etiqueta Menú | Ruta Kebab-case | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **01** | **0** | **RG** | `RG - Reglas Generales.md` | (Lógica Base) | N/A | 🟢 |
| **00** | **0** | **ST** | `ST - Capa de Datos Persistente.md` | (Capa de Datos) | `lib/store.ts` | 🟢 |
| **00** | **0** | **UI** | `UI - Interfaz Principal.md`, `UI - Navegacion Lateral.md` | (Interfaz) | (transversal) | 🟢 |
| **02** | **1** | **TU** | `TU - Tipos de Unidad.md` | Infraestructura | `/inventario/tipos` | 🟢 |
| **03** | **1** | **EF** | `EF - Estructura Física.md` | Estructura Física | `/inventario/estructura` | 🔵 |
| **04** | **1** | **ES** | `ES - Estacionamientos.md` | Estacionamientos | `/inventario/estacionamientos` | 🟢 |
| **05** | **2** | **MA** | `MA - Maestros Administrativos.md` | Maestros | `/admin/maestros` | 🟢 |
| **06** | **2** | **MP** | `MP - Maestro de Personas.md` | Directorio Personas | `/comunidad/personas` | 🟢 |
| **07** | **2** | **VU** | `VU - Vinculacion Unidades.md` | Pestaña Unidades | `/comunidad/personas/[id]` | ⏳ Pendiente |
| **09** | **2** | **CF** | `CF - Configuración Global.md` | Configuración | `/admin/configuracion` | ⏳ Pendiente |
| **10** | **3** | **FI** | `FI - Finanzas y Morosidad.md` | Gastos Comunes | `/finanzas/gastos-comunes` | ⏳ Pendiente |
| **11** | **3** | **AD** | `AD - Gestión Administrativa.md` | Resumen | `/dashboard` | ⏳ Pendiente |
| **12** | **3** | **GD** | `GD - Gestión de Directiva.md` | Directiva | `/comunidad/directiva` | ⏳ Pendiente |
| **13** | **3** | **CO** | `CO - Comunicación Vecinos.md` | Comunicación | `/comunidad/comunicacion` | ⏳ Pendiente |
| **14** | **3** | **GE** | `GE - Gestión de Solicitudes.md` | Solicitudes | `/operaciones/solicitudes` | ⏳ Pendiente |
| **15** | **4** | **PE** | `PE - Personal y Servicios.md` | Personal / Bitácora | `/personas/personal` | ⏳ Pendiente |
| **16** | **4** | **PE** | `PE - Liquidaciones...md` | Remuneraciones | `/finanzas/remuneraciones` | ⏳ Pendiente |
| **17** | **4** | **RA** | `RA - Reservas y Amenities.md` | Reservas | `/operaciones/reservas` | ⏳ Pendiente |
| **18** | **4** | **IR** | `IR - Inventario y Recursos.md` | Recursos y EPP | `/inventario/recursos` | ⏳ Pendiente |
| **19** | **4** | **IN** | `IN - Infracciones y Multas.md` | Multas | `/finanzas/multas` | ⏳ Pendiente |
| **20** | **4** | **MT** | `MT - Mantenimiento y Proyectos.md` | Mantenimiento | `/inventario/proyectos` | ⏳ Pendiente |
| **21** | **5** | **AM** | `AM - Auditoría y Métricas.md` | Auditoría | `/admin/auditoria` | ⏳ Pendiente |
| **22** | **5** | **RE** | `RE - Reportería y Dashboards.md` | Informes | `/admin/informes` | ⏳ Pendiente |
| **23** | **5** | **CT** | `CT - Certificados.md` | Certificados | `/comunidad/certificados` | ⏳ Pendiente |
| **24** | **5** | **PI** | `PI - Portal Inmobiliario.md` | Portal Inmobiliario | `/comunidad/portal` | ⏳ Pendiente |

---

## 🛠️ Lógica de Dependencias (Para no "quedar en pana")

Para asegurar un desarrollo fluido, seguiremos estas reglas de oro:

1.  **Fase 1 (Inventario)** debe estar terminada antes de **Fase 2 (Personas)**, porque no podemos registrar a un dueño si no existe el departamento donde vive.
2.  **Fase 2 (Identidad)** debe estar terminada antes de **Fase 3 (Finanzas)**, porque no podemos cobrar gastos comunes si no sabemos quién es el dueño y qué porcentaje de copropiedad tiene.
3.  **Fase 3 (Operaciones)** debe estar terminada antes de **Fase 5 (Reportería)**, porque los reportes necesitan datos históricos de las operaciones para mostrar algo útil.

---

## 🗒️ Notas de Implementación
- El componente **AppSidebar.tsx** ya tiene configuradas todas estas rutas.
- Las carpetas en `apps/web/app/` deben crearse siguiendo exactamente la columna **Ruta Kebab-case**.
