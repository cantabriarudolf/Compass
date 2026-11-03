# 👥 05 - Maestro de Personas (MP)

Este módulo es el "Registro Civil" de tu comunidad. Aquí centralizamos a todo el mundo: propietarios, arrendatarios, el conserje y hasta el jardinero. La idea es que una persona sea un solo registro, sin importar cuántos roles tenga.

## 🚀 Funcionalidad Principal
Crear y gestionar las identidades de la comunidad con un enfoque en la seguridad y la ayuda proactiva.

## 🛠️ Campos Críticos
Al registrar a alguien, ponle ojo a estos datos:
- **RUT**: Es la llave única. El sistema valida formato y DV; `repararRut` corrige persistidos legacy.
- **Condiciones Especiales**: 
    *   **3ra Edad**: Marcái esto si el vecino es abuelito.
    *   **Discapacidad**: Fundamental para saber a quién hay que ayudar primero en caso de incendio o terremoto.
- **Datos de Contacto**: Teléfono y correo siempre al día para las notificaciones de gastos comunes o avisos de la directiva.

## ⚠️ Aviso de Duplicados por Nombre Completo (D5 — Plataforma P3)

Repetidos **permitidos** (D5): el sistema no bloquea nombres repetidos, pero te avisa para evitar homónimos accidentales.

- Al guardar en `components/comunidad/formulario-persona.tsx:50` con `nombreCompleto` (`nombres + apellidos` trim, case-insensitive) ya existente en `personas` (excluyendo propio `id` en edición), la UI muestra advisory: *"Ya existe una persona con ese nombre completo. ¿Deseas continuar? (D5: repetidos permitidos, es solo un aviso)"*.
- Confirmar persiste vía `savePersona`; cancelar aborta sin mutar. Llamadas directas a `savePersona` desde código/tests siguen permitiendo repetidos (el aviso es solo formulario).

## 💡 Multiperfil
No te extrañe si ves a la misma persona en distintos lados. El sistema permite que el "Seba" sea el **Propietario** de un departamento, pero que viva como **Residente** en otro. Todo queda amarrado a su mismo RUT.

## 🔎 Búsqueda y filtros en el servidor
El padrón se pagina y las pantallas ya no pueden filtrar «lo que vino»: si el filtro se resuelve en el navegador sobre la primera página, esconde gente (commits `5c62f1d` y `2374011`).

- **La búsqueda por nombre o RUT va al servidor** con un retardo corto (300 ms): quien no venía en la primera página aparece igual. La tabla mantiene las filas anteriores mientras consulta, muestra el **total real** que informa el servidor y pagina en serio.
- **Los filtros de rol y estado también van al servidor**, y los contadores se calculan sobre todo el padrón, no sobre la página. Parámetros opcionales del endpoint `GET /api/personas`:
  - `?q=` texto; `?rut=` identidad exacta; `?esResidente=` vínculo vigente de propietario/arrendatario.
  - `?rol=` roles propios de `Persona.roles` (CSV); `?rolDirectorio=` roles derivados del Directorio de Gestión Administrativa (`propietario` / `residente` / `directiva` / `personal`); `?estadoCuenta=` (`activa` / `inactiva` / `bloqueada`).
  - Se **intersectan** entre sí y con el alcance de permisos: suman condiciones al `where`, nunca lo reemplazan. Un residente sigue viendo solo su ficha, también cuando filtra. Sin parámetros, la respuesta es la misma de antes.
- **El filtro de estado usa los valores reales**: antes comparaba con los plurales «activos / inactivos / bloqueados» cuando la base guarda «activa / inactiva / bloqueada», así que no encontraba a nadie y sus contadores marcaban cero. Hoy el endpoint valida el valor y el filtro de la pantalla (`ACTIVOS / INACTIVOS / BLOQUEADOS`) traduce a la grafía persistida.
- **Medido con el padrón de la demo** (118 personas, página de 100): propietario pasó de mostrar 63 a **74**, residente de 68 a **84**, directiva de 3 a **5** y activa de 95 a **113**.
- **Aplica a las tres pantallas**: `/comunidad/personas` (padrón con filtro rápido por estado), `/personas/residentes` (solo residentes) y el Directorio de **Gestión Administrativa** (`/admin/gestion`, con los cuatro roles del directorio y su conteo).

## 🏠 Vista Residentes (`/personas/residentes` — P2 MENU-100)

Directorio **solo lectura** de residentes y propietarios con vínculo vigente. No duplica la edición — esa vive en `/comunidad/personas`.

- **Filtro**: personas con al menos un `vinculos` vigente (`!fechaFin`) y `rol` en `propietario` / `arrendatario`. Se excluyen `copropietario`/`ocupante` y tramos cerrados.
- **Columnas**: identidad (nombre + RUT + badges de `roles`), unidad vinculada (`Depto 101`, `Local L-01` con badge de rol), contacto (móvil + email), estado de cuenta y acción **Ver Ficha** → `/comunidad/personas/[id]`.
- **Búsqueda**: por nombre o RUT, **resuelta en el servidor** (ver «Búsqueda y filtros en el servidor»): ya no se limita a la página cargada, y la tabla pagina contra el total real.
- **Skeleton**: `animate-pulse` mientras `!hasHydrated`; empty state "Sin residentes con vínculo vigente" si no calza nada.
- **Navegación**: el item "Personas → Residentes" ya no es "Próximamente" — quitado de `RUTAS_PENDIENTES` en `AppSidebar`.

## 🗳️ Ficha de Gobernanza (perfil → pestaña Gobernanza)
    
Si la persona tiene rol `directiva`, su perfil muestra la pestaña **Gobernanza**: cargo (presidente/tesorero/secretario/director), fecha de asunción y firma por URL. Botón **Registrar ficha** si falta, **Editar ficha** si existe (diálogo, cierra solo si guarda bien).
    
- **Coherencia automática**: al quitar el rol `directiva` la ficha se depura sola (evento `AD_DIRECTIVA_DESVINCULADA`) para no dejar miembros fantasmas en el quórum de actas.
- La ficha pertenece al **período de directiva vigente** (ver **14 - GD**); sin período registrado, cuenta como legado hasta regularizar.
    
## ⚠️ Privacidad
Recuerda que estos son datos sensibles. El acceso a este maestro debe estar limitado solo a personal de confianza de la administración.
    
*Actualizado: 23/09/2026 — ficha de gobernanza editable + coherencia rol↔ficha (GD) + P2 MENU-100 + P3 D5*
*Actualizado: 03/11/2026 — búsqueda y filtros de rol y estado resueltos en el servidor; el filtro de estado deja de comparar plurales contra la grafía persistida.*
