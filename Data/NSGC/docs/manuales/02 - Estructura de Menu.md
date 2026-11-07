# 02 - Estructura de Menú (Arquitectura por Dominios)

Esta estructura aplica un diseño de **Navegación Basada en Dominios**, agrupando los módulos por objetivos de negocio y roles de usuario. La fuente de verdad es el arreglo `data.navMain` de `k0mp4ss_fe/apps/web/components/app-sidebar.tsx`: si esta tabla y el sidebar no coinciden, manda el código.

## 🧭 Mapa de Navegación (Sidebar)

| Categoría (Dominio) | Etiqueta Sidebar | Ruta (kebab-case) | Módulos | Icono (Tabler) |
| :--- | :--- | :--- | :--- | :--- |
| **Inicio** | Resumen | `/dashboard` | RE | `IconLayoutDashboard` |
| **Operaciones** | Accesos | `/operaciones/accesos` | PE | `IconBook` (grupo) |
| | Reservas y Amenities | `/operaciones/reservas` | RA | |
| | Solicitudes | `/operaciones/solicitudes` | GE | |
| | Proveedores y Servicios | `/operaciones/proveedores` | PE | |
| **Finanzas** | Gastos Comunes | `/finanzas/gastos-comunes` | FI | `IconReceipt` |
| | Recaudación | `/finanzas/pagos` | FI | |
| | Multas | `/finanzas/multas` | IN | |
| | Remuneraciones | `/finanzas/remuneraciones` | PE, PL | |
| **Comunidad** | Directorio de Personas | `/comunidad/personas` | MP | `IconSpeakerphone` |
| | Comunicación | `/comunidad/comunicacion` | CO | |
| | Archivo | `/comunidad/archivo` | AD | |
| | Visor de Mensajes | `/comunidad/visor` | CV | |
| | Directiva | `/comunidad/directiva` | GD | |
| | Certificados | `/comunidad/certificados` | CT | |
| | Avisos de Cobro | `/comunidad/avisos-cobro` | FI | |
| | Mis Liquidaciones | `/comunidad/mis-liquidaciones` | PL | |
| | Portal Inmobiliario | `/comunidad/portal` | PI | |
| **Inventario** | Estructura Física | `/inventario/estructura` | EF, ES | `IconBuildingSkyscraper` |
| | Tipos de Unidad | `/inventario/tipos` | TU | |
| | Recursos y EPP | `/inventario/recursos` | IR | |
| | Mantenimiento | `/inventario/proyectos` | MT | |
| **Personas** | Residentes | `/personas/residentes` | MP, VU | `IconUserHeart` |
| | Personal | `/personas/personal` | PE | |
| **Sistema** | Reportería y Dashboards | `/admin/reporteria` | RE | `IconSettings` |
| | Auditoría y Métricas | `/admin/metricas` | AM | |
| | Mantenciones Preventivas | `/admin/mantenciones` | PE | |
| | Elementos | `/admin/elementos` | RA | |
| | Alerta de reservas | `/admin/reservas` | RA | |
| | Gestión Administrativa | `/admin/gestion` | AD, MP | |
| | Maestros Administrativos | `/admin/maestros` | MA | |
| | Configuración | `/admin/configuracion` | CF, RG | |
| | Permisos | `/admin/permisos` | RP | |
| | Logs de Auditoría | `/admin/logs` | AM | |
| | Carga inicial | `/admin/carga-inicial` | EF, MP, VU | |

### 🚪 Operaciones tiene una sola entrada de accesos

Desde la puerta única (`/operaciones/accesos`) el conserje registra **visitas, encomiendas y trabajos** en un mismo formulario y abajo ve la **lista consolidada del día**. Por eso el grupo Operaciones lista **una** entrada de accesos y no tres:

- `/operaciones/bitacora` y `/operaciones/paqueteria` están **retiradas**: sobreviven como enlaces viejos y redirigen en el servidor a `/operaciones/accesos` (`app/operaciones/bitacora/page.tsx`, `app/operaciones/paqueteria/page.tsx`).
- **Proveedores y Servicios** se queda en Operaciones (catálogo de empresas, visitas técnicas y directorio de emergencias), pero el **calendario preventivo** se fue a `/admin/mantenciones`.

### 🧰 Los paneles del administrador viven en Sistema

Tres pantallas nacieron como pestañas de otros módulos y ahora son entradas propias del grupo **Sistema**, todas con portón de rol en el servidor:

| Entrada | Ruta | Qué se hace ahí |
| :--- | :--- | :--- |
| **Mantenciones Preventivas** | `/admin/mantenciones` | CRUD del calendario preventivo (antes dentro de `/operaciones/proveedores`) |
| **Elementos** | `/admin/elementos` | Catálogo de amenities reservables, incluido el interruptor «Requiere autorización del administrador» |
| **Alerta de reservas** | `/admin/reservas` | Cola de solicitudes para autorizar o rechazar con motivo |

### 🗂️ Las dos entradas nuevas de Comunidad (2026-11-07)

| Entrada | Ruta | Roles del menú | Qué se hace ahí |
| :--- | :--- | :--- | :--- |
| **Archivo** | `/comunidad/archivo` | administrador, comité, residente | Archivo de Documentos de la Comunidad (AD): legales append-only y comunitarios reemplazables, con envío y constancia por destinatario. Reemplaza la pestaña «Biblioteca» que se retiró de Comunicación. |
| **Mis Liquidaciones** | `/comunidad/mis-liquidaciones` | administrador, conserjería | La liquidación de sueldo de la propia persona, en solo lectura y con descarga del PDF. La administración la usa para consultar cualquier liquidación de la comunidad. |

Las dos abren con el permiso en el servidor, no con la lista de roles copiada: `doc` ver para el Archivo y `pl` ver (gestión) o `pl:propia` ver (trabajador) para Mis Liquidaciones. El aviso de cobro (`/comunidad/avisos-cobro`, FI) ya estaba en el menú desde F27 y usa su propio par de claves: `fi:gasto_comun` ver para administración y comité, `fi:aviso:propio` ver para el residente.

---

## 🔑 Lógica de Roles (RBAC)

Cinco roles (`administrador`, `comite`, `conserjeria`, `residente`, `mantencion`). Un grupo o ítem se ve si **tu unión de membresías** intersecta los roles declarados; los ítems sin `roles` heredan la visibilidad del grupo.

1.  **Administrador**: ve los 7 grupos y todas sus entradas; además es el único con `Remuneraciones`, `Estructura Física`, `Tipos de Unidad`, `Gestión Administrativa`, `Maestros`, `Configuración`, `Permisos`, `Logs de Auditoría`, `Carga inicial`, `Auditoría y Métricas`, `Mantenciones Preventivas`, `Elementos` y `Alerta de reservas`.
2.  **Comité**: Inicio, Finanzas (sin Remuneraciones), Comunidad y Sistema (solo Reportería y Dashboards).
3.  **Conserjería**: Inicio y Operaciones. No ve el grupo Sistema, así que los paneles del administrador no aparecen en su menú.
4.  **Residente**: Inicio, Operaciones, Finanzas y Comunidad.
5.  **Mantención**: Inicio, Operaciones e Inventario (Recursos y Mantenimiento, sin Estructura ni Tipos).
6.  **Sin roles** = menú vacío. Ocultar una entrada **no** es el permiso: cada panel de `/admin` revalida el rol en el servidor (`auth()` + `redirect`) y cada API valida con `lib/authz`.

---

## 🛠️ Reglas de Implementación
*   **Rutas**: Siempre en minúsculas, sin tildes, usando guiones.
*   **Íconos**: Uso exclusivo de `@tabler/icons-react`.
*   **Modularidad**: Cada ruta debe ser independiente y escalable.
*   **Rutas pendientes**: `RUTAS_PENDIENTES` en `components/app-sidebar.tsx` está **vacío** desde SERIE-MENU-100: no hay entradas «Próximamente». Una ruta nueva sin `page.tsx` no se agrega al menú.
*   **Nombres de pantalla**: los del grupo siguen las palabras del usuario (Accesos, Alerta de reservas), no las del modelo de datos.
