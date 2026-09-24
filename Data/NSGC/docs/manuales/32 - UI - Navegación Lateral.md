# 🧭 32 - Navegación Lateral (UI)

La barra lateral es el centro de navegación de GECOS. Desde acá accedés a todos los módulos agrupados por categoría.

## 🚀 Funcionalidad Principal

Navegar rápidamente entre módulos, identificar la página activa y plegar la barra para ganar espacio en pantalla.

## 🛠️ Operaciones

- **Expandir/Contraer**: Apretá el botón de menú en el header. En escritorio la barra se contrae mostrando solo los iconos con tooltip. En móvil se oculta por completo.
- **Grupos del Menú**: Los módulos están organizados en:
  - Inicio
  - Operaciones
  - Finanzas
  - Comunidad
  - Inventario
  - Personas
  - Desarrollo AI
  - Sistema
- **Ruta Activa**: El ítem correspondiente a la página donde estás se resalta automáticamente.
 - **Visibilidad por Rol (RP-unión)**: La barra muestra solo lo que tu **unión de membresías** autoriza (fuente: `Membresia.rol` en `lib/auth.ts` → `session.user.roles`). Regla: grupo/ítem visible si `tuRoles ∩ rolesDeclarados ≠ ∅`. Ítems sin `roles` heredan la visibilidad del grupo. Alias normalizados a `RP` (`administrador`/`comite`/`conserjeria`/`residente`/`mantencion`).
  - **Administrador** (`admin@test.cl` — membresías A+B): ve 8/8 grupos (todo; `Remuneraciones`/`Estructura`/`Tipos`/`Gestión` solo admin).
  - **Comité** (`comite@test.cl`): ve Inicio, Finanzas (Gastos/Recaudación/Multas, no Remuneraciones), Comunidad, Sistema (solo Reportería) — 4/8.
  - **Conserjería** (`conserjeria@test.cl`): ve Inicio, Operaciones (2/8).
  - **Residente** (`residente@test.cl`): ve Inicio, Operaciones, Finanzas, Comunidad (4/8); `Remuneraciones` solo admin queda oculto, `Gastos Comunes` hereda grupo.
  - **Mantención** (`mantencion@test.cl`): ve Inicio, Operaciones (Bitácora), Inventario (Recursos/Mantenimiento, no Estructura/Tipos) — 3/8.
  - **Personas**: solo `administrador` (menor privilegio: `mp:propios` es contextual con `personaId`, no habilita listado global).
  - Sesión sin roles = 0 grupos. Vía técnica: `app/layout.tsx` (server, `auth()`) pasa `roles` por props a `AppSidebar` (client) — opción (a) elegida por menor fricción vs `SessionProvider`/`fetch`. Infra: `e2e/auth.setup.ts` genera 5 `storageStates` (`e2e/.auth/<rol>.json`, `test1234`) y specs usan `test.use({ storageState })` sin 5 proyectos.
  - **Navegación post-login dura** (2026-09-23): `/ingresar` navega con recarga completa tras login exitoso para que el layout server re-ejecute `auth()` con la cookie ya fijada — el `router.push` client dejaba el menú vacío (roles `[]` cacheados). Destino por defecto: `/dashboard`.

## 💡 Tips de Oro

- **Plegado inteligente**: Si necesitás más espacio para trabajar, dejá la barra contraída. Los iconos siguen disponibles con tooltip.
- **Navegación rápida**: Los grupos colapsables se abren automáticamente si estás en alguna de sus subrutas.

## 🔗 Dependencias

- La estructura del menú se sincroniza con las capabilities documentadas en `openspec/specs/`.
- El logo y nombre de la comunidad en la cabecera de la barra lateral vienen de **CF - Configuración Global**.
