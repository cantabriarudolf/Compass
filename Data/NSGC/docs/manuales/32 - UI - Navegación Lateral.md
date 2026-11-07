# 🧭 32 - Navegación Lateral (UI)

La barra lateral es el centro de navegación de GECOS. Desde acá accedés a todos los módulos agrupados por categoría.

## 🚀 Funcionalidad Principal

Navegar rápidamente entre módulos, identificar la página activa y plegar la barra para ganar espacio en pantalla.

## 🛠️ Operaciones

- **Expandir/Contraer**: Apretá el botón de menú en el header. En escritorio la barra se contrae mostrando solo los iconos con tooltip. En móvil se oculta por completo.
- **Grupos del Menú**: Los módulos están organizados en 7 grupos (`SIDEBAR_GROUPS` en `components/app-sidebar.tsx`):
  - Inicio
  - Operaciones (una sola entrada de **Accesos**: visitas, encomiendas y trabajos en la misma puerta)
  - Finanzas
  - Comunidad
  - Inventario
  - Personas
  - Sistema (incluye los paneles del administrador: Mantenciones Preventivas, Elementos y Alerta de reservas)
- **Ruta Activa**: El ítem correspondiente a la página donde estás se resalta automáticamente.
 - **Visibilidad por Rol (RP-unión)**: La barra muestra solo lo que tu **unión de membresías** autoriza (fuente: `Membresia.rol` en `lib/auth.ts` → `session.user.roles`). Regla: grupo/ítem visible si `tuRoles ∩ rolesDeclarados ≠ ∅`. Ítems sin `roles` heredan la visibilidad del grupo. Alias normalizados a `RP` (`administrador`/`comite`/`conserjeria`/`residente`/`mantencion`).
  - **Administrador** (`admin@test.cl` — membresías A+B): ve 7/7 grupos (todo; `Remuneraciones`/`Estructura`/`Tipos`/`Gestión`/`Mantenciones Preventivas`/`Elementos`/`Alerta de reservas` solo admin).
  - **Comité** (`comite@test.cl`): ve Inicio, Finanzas (Gastos/Recaudación/Multas, no Remuneraciones), Comunidad, Sistema (solo Reportería) — 4/7.
  - **Conserjería** (`conserjeria@test.cl`): ve Inicio, Operaciones (2/7).
  - **Residente** (`residente@test.cl`): ve Inicio, Operaciones, Finanzas, Comunidad (4/7); `Remuneraciones` solo admin queda oculto, `Gastos Comunes` hereda grupo.
  - **Mantención** (`mantencion@test.cl`): ve Inicio, Operaciones (Accesos), Inventario (Recursos/Mantenimiento, no Estructura/Tipos) — 3/7.
  - **Personas**: solo `administrador` (menor privilegio: `mp:propios` es contextual con `personaId`, no habilita listado global).
  - Sesión sin roles = 0 grupos. Vía técnica: `app/layout.tsx` (server, `auth()`) pasa `roles` por props a `AppSidebar` (client) — opción (a) elegida por menor fricción vs `SessionProvider`/`fetch`. Infra: `e2e/auth.setup.ts` genera 5 `storageStates` (`e2e/.auth/<rol>.json`, `test1234`) y specs usan `test.use({ storageState })` sin 5 proyectos.
  - **Navegación post-login dura** (2026-09-23): `/ingresar` navega con recarga completa tras login exitoso para que el layout server re-ejecute `auth()` con la cookie ya fijada — el `router.push` client dejaba el menú vacío (roles `[]` cacheados). Destino por defecto: `/dashboard`.
  - **Una entrada de accesos (2026-11-02)**: el grupo Operaciones dejó de listar Bitácora y Encomiendas. `/operaciones/bitacora` y `/operaciones/paqueteria` siguen existiendo solo para redirigir (en el servidor) a `/operaciones/accesos`, que es la puerta única y la lista consolidada del día. El manual con el detalle es `02 - Estructura de Menu.md`.
  - **Tres entradas nuevas del administrador (2026-11-02)**: `Mantenciones Preventivas` (`/admin/mantenciones`), `Elementos` (`/admin/elementos`) y `Alerta de reservas` (`/admin/reservas`). Las tres llevan portón de rol en el servidor (`auth()` + `redirect`), porque ocultar el enlace no es el permiso.
  - **Dos entradas nuevas en Comunidad (2026-11-07)**: `Archivo` (`/comunidad/archivo`, AD) para administración, comité y residente, y `Mis Liquidaciones` (`/comunidad/mis-liquidaciones`, PL) para administración y conserjería. Las dos abren con el permiso en el servidor (no con una lista de roles copiada): `doc` ver y `pl`/`pl:propia` ver, respectivamente. `Avisos de Cobro` (`/comunidad/avisos-cobro`, FI) ya estaba en el menú desde F27 y en esta serie ganó la lectura del residente con `fi:aviso:propio`. El detalle está en `02 - Estructura de Menu.md`.

## 💡 Tips de Oro

- **Plegado inteligente**: Si necesitás más espacio para trabajar, dejá la barra contraída. Los iconos siguen disponibles con tooltip.
- **Navegación rápida**: Los grupos colapsables se abren automáticamente si estás en alguna de sus subrutas.

## 🔗 Dependencias

- La estructura del menú se sincroniza con las capabilities documentadas en `specs/`.
- El logo y nombre de la comunidad en la cabecera de la barra lateral vienen de **CF - Configuración Global**.
