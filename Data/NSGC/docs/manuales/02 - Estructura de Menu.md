# 02 - Estructura de Menú (Arquitectura por Dominios)

Esta estructura aplica un diseño de **Navegación Basada en Dominios**, agrupando los 26 módulos por objetivos de negocio y roles de usuario.

## 🧭 Mapa de Navegación (Sidebar)

| Categoría (Dominio) | Etiqueta Sidebar | Ruta (kebab-case) | Módulos | Icono (Tabler) |
| :--- | :--- | :--- | :--- | :--- |
| **Inicio** | Resumen | `/dashboard` | RE | `IconDashboard` |
| **Operaciones** | Bitácora Diaria | `/operaciones/bitacora` | PE, CO | `IconBook` |
| | Accesos y Visitas | `/operaciones/accesos` | PE | `IconUserCheck` |
| | Encomiendas | `/operaciones/paqueteria` | PE | `IconPackage` |
| | Reservas | `/operaciones/reservas` | RA | `IconCalendarEvent` |
| | Solicitudes | `/operaciones/solicitudes` | GE | `IconClipboardList` |
| **Finanzas** | Gastos Comunes | `/finanzas/gastos-comunes` | FI | `IconReceipt` |
| | Recaudación | `/finanzas/pagos` | FI | `IconWallet` |
| | Multas | `/finanzas/multas` | IN | `IconGavel` |
| | Remuneraciones | `/finanzas/remuneraciones` | PE | `IconCash` |
| **Comunidad** | Comunicación | `/comunidad/comunicacion` | CO | `IconSpeakerphone` |
| | Directiva | `/comunidad/directiva` | GD | `IconUsersGroup` |
| | Certificados | `/comunidad/certificados` | CT | `IconCertificate` |
| | Portal Inmobiliario| `/comunidad/portal` | PI | `IconSmartHome` |
| **Inventario** | Infraestructura | `/inventario/estructura` | EF, TU, ES | `IconBuildingSkyscraper` |
| | Recursos y EPP | `/inventario/recursos` | IR | `IconTool` |
| | Mantenimiento | `/inventario/proyectos` | MT | `IconSettings` |
| **Personas** | Residentes | `/personas/residentes` | MP, VU | `IconUserHeart` |
| | Personal | `/personas/personal` | PE | `IconUserStar` |
| **Sistema** | Configuración | `/admin/configuracion` | CF, RG, MA | `IconAdjustments` |
| | Roles y Accesos | `/admin/permisos` | RP | `IconLock` |
| | Auditoría | `/admin/auditoria` | AM | `IconHistory` |

---

## 🔑 Lógica de Roles (RBAC)

1.  **Administrador**: Acceso total a todas las categorías.
2.  **Conserjería**: Acceso prioritario a **Operaciones** e **Inicio**. Resto oculto.
3.  **Residente**: Acceso a **Comunidad**, **Gastos Comunes** (vista personal) y **Reservas**.

---

## 🛠️ Reglas de Implementación
*   **Rutas**: Siempre en minúsculas, sin tildes, usando guiones.
*   **Íconos**: Uso exclusivo de `@tabler/icons-react`.
*   **Modularidad**: Cada ruta debe ser independiente y escalable.
