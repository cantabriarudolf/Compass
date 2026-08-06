# 08 - Dashboard de Control de Avance y Tareas

Este documento detalla en español chileno el funcionamiento del **Dashboard de Control de Desarrollo (Dev Dashboard)** de **Compass**, una herramienta de desarrollo para monitorear en vivo las tareas de OpenSpec y el avance del proyecto.

---

## 🖥️ ¿Dónde encontrar el Dashboard en la App?

El dashboard vive en el frontend (`k0mp4ss_fe`) y está accesible en la siguiente ruta:

- **Ruta en la aplicación**: `/admin/dev-dashboard`
- **Archivo fuente (UI)**: `apps/web/app/admin/dev-dashboard/page.tsx`
- **Capa de datos (server)**: `apps/web/lib/dev-dashboard.ts`
- **Endpoint API**: `apps/web/app/api/dev-dashboard/route.ts`

---

## 🎯 ¿Cómo se alimenta el dashboard?

El dashboard **no tiene datos manuales**. Es un lector pasivo del repositorio: lee el filesystem y deriva todo desde tres fuentes:

| Fuente | Qué aporta |
|---|---|
| `Data/NSGC/docs/especificaciones/*.md` | El listado completo de módulos (código, nombre, fase) |
| `openspec/changes/<change>/tasks.md` | Las tareas del change activo (secciones + checkboxes `[ ]` / `[x]`) |
| `openspec/changes/archive/` y `openspec/specs/` | El estado histórico: qué se completó y qué está documentado |

El estado de cada módulo se deriva automáticamente:

1. **En Proceso**: existe un change activo cuyo id empieza con el código del módulo (ej. `VU-...`).
2. **Completado**: existe un change archivado asociado (mapeo por override o palabras clave).
3. **Documentado**: existe la capability en `openspec/specs/<codigo>-.../`.
4. **Pendiente**: no tiene spec ni change.

---

## ✅ Marcar tareas persiste en el repositorio

Al tildar un checkbox (o botón "Completar"), el dashboard hace un `PATCH` al endpoint y **escribe el cambio en el propio `tasks.md`** del change. Es decir: el estado vive en el repo, no en la interfaz. Recargar la página (o abrirla en otra máquina) muestra el mismo avance.

---

## 🔄 Comportamiento en el ciclo de vida de OpenSpec

| Evento | Reacción del dashboard |
|---|---|
| Se agrega una spec nueva en `Data/NSGC/docs/especificaciones/` | Aparece una fila nueva de módulo → "Pendiente" |
| Se crea un change activo en `openspec/changes/` | Aparece como change activo con sus tareas; el módulo del código pasa a "En Proceso" |
| Se marcan tareas en la UI | Se escribe `[x]` en `tasks.md`; el porcentaje se recalcula |
| `openspec change archive` | El change sale de "Activo"; el módulo asociado pasa a "Completado" |
| Se agrega/elimina una capability en `openspec/specs/` | El módulo cambia a "Documentado" (si no tiene change) |

> [!TIP]
> No hay que mantener ningún estado manual: el "estado" es el propio repositorio. La UI solo lo refleja.

---

## 🧩 Componentes del Dashboard

1. **KPIs**: Módulos completados/total, change activo, tareas completadas y agente configurado.
2. **Pestaña "Change Activo"**: tareas reales del `tasks.md`, con selector si hay más de un change activo. Destaca la primera tarea pendiente con la insignia "SIGUIENTE A EJECUTAR".
3. **Pestaña "Contexto"** (Sheet): genera automáticamente el prompt para Hermes desde el id de tarea y change.
4. **Pestaña "Mapa de Módulos"**: tabla completa con estado derivado.
5. **Pestaña "Prompts Hermes"**: comandos rápidos generados según el change activo.

---

## 🚀 Cómo usarlo

1. **Lanzar la app localmente**:
   ```bash
   cd k0mp4ss_fe
   npm run dev
   ```
2. **Ingresar al Dashboard**: Entrar a `http://localhost:3000/admin/dev-dashboard`.
3. **Seleccionar la tarea a ejecutar**: abrir "Contexto" para copiar el prompt pre-armado.
4. **Pegar en Hermes**: ejecutar la tarea y marcarla en la interfaz (el `[x]` se persiste en `tasks.md`).

---

## 🧹 Cómo remover el dashboard

Es una herramienta exclusiva de desarrollo y no tiene acoplamiento con el dominio del negocio. Para sacarla:

1. Borrar `apps/web/app/admin/dev-dashboard/page.tsx` y `apps/web/app/api/dev-dashboard/route.ts`.
2. Borrar `apps/web/lib/dev-dashboard.ts`.
3. Quitar el link en `apps/web/components/app-sidebar.tsx`.

No queda ningún efecto colateral: las specs y changes de OpenSpec son independientes.
