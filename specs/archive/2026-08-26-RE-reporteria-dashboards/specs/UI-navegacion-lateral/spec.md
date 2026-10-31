# UI-navegacion-lateral (delta del change RE-reporteria-dashboards)

## MODIFIED Requirements

### Requirement: Categorized Navigation
The navigation menu MUST follow the hierarchy implemented in `AppSidebar` and reflect the modules documented in `openspec/specs/`.

#### Scenario: Menu Structure
- **WHEN** the user opens the Sidebar
- **THEN** they MUST see the following groups and items:
  - **Inicio**
    - Resumen (`/dashboard`)
  - **Operaciones**
    - Bitácora Diaria (`/operaciones/bitacora`)
    - Accesos y Visitas (`/operaciones/accesos`)
    - Encomiendas (`/operaciones/paqueteria`)
    - Reservas (`/operaciones/reservas`)
    - Solicitudes (`/operaciones/solicitudes`)
    - Proveedores y Servicios (`/operaciones/proveedores`)
  - **Finanzas**
    - Gastos Comunes (`/finanzas/gastos-comunes`)
    - Recaudación (`/finanzas/pagos`)
    - Multas (`/finanzas/multas`)
    - Remuneraciones (`/finanzas/remuneraciones`, roles admin)
  - **Comunidad**
    - Directorio de Personas (`/comunidad/personas`)
    - Comunicación (`/comunidad/comunicacion`)
    - Visor de Mensajes (`/comunidad/visor`)
    - Directiva (`/comunidad/directiva`)
    - Certificados (`/comunidad/certificados`)
    - Portal Inmobiliario (`/comunidad/portal`)
  - **Inventario**
    - Estructura Física (`/inventario/estructura` — incluye estacionamientos como `u-E-*`)
    - Tipos de Unidad (`/inventario/tipos`)
    - Recursos y EPP (`/inventario/recursos`)
    - Mantenimiento (`/inventario/proyectos`)
  - **Personas**
    - Residentes (`/personas/residentes`)
    - Personal (`/personas/personal`)
  - **Desarrollo AI**
    - Dashboard OpenSpec (`/admin/dev-dashboard`)
    - Laboratorio QA (`/admin/qa-lab`)
  - **Sistema**
    - Reportería y Dashboards (`/admin/reporteria`)
    - Auditoría y Métricas (`/admin/metricas`)
    - Gestión Administrativa (`/admin/gestion`)
    - Maestros Administrativos (`/admin/maestros`)
    - Configuración (`/admin/configuracion`)
    - Logs de Auditoría (`/admin/logs`)
