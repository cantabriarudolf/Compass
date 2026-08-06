# 03 - Integración con Hermes y OpenSpec

Este documento explica en español chileno cómo configurar **Hermes** para que lea la carpeta del proyecto **Compass** y ejecute de forma autónoma las tareas definidas bajo la metodología **OpenSpec**.

---

## 🤖 ¿Cómo funciona Hermes con esta carpeta?

**No necesitas crear una estructura compleja de subagentes desde cero.** Hermes está diseñado para trabajar con agentes basados en el contexto del directorio (Workspace Context). 

Para que Hermes trabaje "solito" leyendo tus carpetas yOpenSpec, solo requiere 3 elementos clave que ya están o dejamos preparados en el proyecto:

1. **Contexto del Proyecto (`HERMES.md` / `AGENTS.md`)**: El mapa de navegación y reglas del proyecto.
2. **Workflows de OpenSpec (`.agent/workflows/`)**: Los comandos predefinidos (`/opsx-propose`, `/opsx-apply`, `/opsx-archive`).
3. **Pila de Tareas (`openspec/changes/`)**: La lista de tareas verificables en Markdown (`tasks.md`).

---

## 🛠️ Configuración de Hermes Paso a Paso

### 1. El Archivo de Instrucciones Maestro (`HERMES.md`)
En la raíz del proyecto (`/home/sh1r0l0x/Documentos/Proyectos/Compass`), Hermes busca un archivo `HERMES.md` (o `AGENTS.md`). Este archivo actúa como el "cerebro" del agente.

Creamos/aseguramos que `HERMES.md` tenga las directrices para OpenSpec:

```markdown
# 🧭 Compass - Hermes Agent Instruction

## Agent Role
You are an autonomous senior developer agent working on Compass (NSGC).

## Execution Strategy with OpenSpec
1. Check `openspec/changes/` for active changes.
2. Read `tasks.md` inside the active change directory.
3. Implement tasks iteratively inside `k0mp4ss_fe/apps/web` and `k0mp4ss_fe/packages/ui`.
4. Validate build/types after each task (`npm run build` or `npx tsc`).
5. Update `tasks.md` checkbox `[x]` upon completing each task.
```

---

## 🚀 ¿Cómo poner a Hermes a trabajar "solito"?

### Modo 1: Ejecución Directa por Tareas (Recomendado)
Para lanzar a Hermes a ejecutar el Change activo (`vinculacion-unidades`), abres tu terminal en la carpeta del proyecto y le tiras el siguiente comando:

```bash
hermes run "Lee openspec/changes/VU-vinculacion-unidades/tasks.md e implementa las tareas pendientes una por una en k0mp4ss_fe."
```

### Modo 2: Usar el Workflow `/opsx-apply`
Como ya tenemos configurados los workflows de OpenSpec en `.agent/workflows/opsx-apply.md`, le dices a Hermes:

```bash
hermes run "/opsx-apply vinculacion-unidades"
```

Hermes leerá la especificación, ejecutará el código en `k0mp4ss_fe/apps/web/`, probará los componentes UI de `packages/ui` y marcará los checkboxes de `tasks.md` a medida que avance.

---

## ❓ ¿Se necesitan Subagentes?

**No para empezar.** 
- **Un Agente Principal (Single-Agent Mode)** es más que suficiente para la mayoría de los módulos de la aplicación.
- **¿Cuándo usar Subagentes?**: Solo si vas a ejecutar tareas pesadas en paralelo (por ejemplo: un subagente redactando mocks/datos de prueba mientras otro subagente pica los componentes de la interfaz en Next.js). Hermes puede delegar tareas a subagentes de forma automática si se lo pides en el prompt inicial.

---

> [!TIP]
> *Consejo clave*: Si quieres que Hermes no se detenga a pedirte confirmación en cada archivo, asegúrate de correrlo en modo autónomo o con permisos de escritura activados en la carpeta `k0mp4ss_fe`.
