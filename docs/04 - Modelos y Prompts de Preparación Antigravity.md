# 04 - Modelos y Prompts de Preparación Antigravity

Este documento detalla en español chileno las ventajas de pasar el proyecto **Compass** por los distintos modelos de **Antigravity** antes de migrar la copia a **OpenCode (Plan Go)**, junto con los modelos recomendados y los prompts exactos para sacarles el máximo provecho.

---

## ⚡ Ventajas de usar Antigravity ANTES de migrar a OpenCode

Pasar por Antigravity antes de soltar el proyecto a OpenCode/Hermes te da 4 ventajas estratégicas clave para **ahorrar saldo de tu Plan Go** y evitar que OpenCode alucine o quede en pana:

1. **Context Window Gigante sin Costo por Token**: Antigravity puede tragar y analizar todo el monorepo (`k0mp4ss_fe`), los specs en `openspec/` y todas las tablas de mocks de una sola pasada para detectar inconsistencias.
2. **Auditoría Previa de OpenSpec**: Dejar los specs (`design.md`, `tasks.md`) impecables y masticados para que OpenCode solo tenga que picar código sin dudar.
3. **Chequeo de Tipos y Limpieza de Deuda Técnica**: Resolver errores silenciosos de TypeScript en `packages/ui` o `apps/web` antes de la migración.
4. **Generación de Archivos de Contexto (`HERMES.md` / `AGENTS.md`)**: Crear las instrucciones quirúrgicas a la medida para el agente autónomo.

---

## 🧠 Modelos Recomendados en Antigravity y sus Casos de Uso

| Modelo en Antigravity | Especialidad / Cuándo usarlo |
| :--- | :--- |
| **Gemini 3.6 Flash / High Reasoning** | **Análisis Masivo & Auditoría**: Ideal para revisar todos los specs de `openspec/`, chequear consistencia de mocks en `data/` y estructurar documentación. |
| **Claude 3.7 Sonnet (Thinking)** | **Arquitectura & UI Compleja**: Ideal para diseñar lógica de componentes React pesados, hooks dinámicos o refactorizaciones complejas en `apps/web`. |

---

## 🎯 Prompts Quirúrgicos para Ejecutar en Antigravity antes de Migrar

### Prompt 1: Auditoría de Consistencia OpenSpec (Modelo: Gemini 3.6 Flash)
> *"Revisa el change activo en `openspec/changes/VU-vinculacion-unidades/`. Valida que las tareas en `tasks.md` estén alineadas con el diseño en `design.md` y las especificaciones en `specs/`. Si falta alguna validación o caso de borde (edge case) en los formulaciones o mocks de `k0mp4ss_fe`, agrégalo a `tasks.md` antes de empezar a programar."*

### Prompt 2: Verificación de Tipos TypeScript y Mocks (Modelo: Gemini 3.6 Flash)
> *"Analiza los archivos de datos en `k0mp4ss_fe/apps/web/data/` y los componentes en `packages/ui`. Asegúrate de que no existan errores de tipos implícitos ni imports rotos en la app. Entrega un resumen de cualquier corrección necesaria."*

### Prompt 3: Generación del Instruccionario Maestro `HERMES.md` (Modelo: Claude 3.7 Sonnet / Gemini 3.6)
> *"Basándote en `docs/00-index.md` y la arquitectura en `k0mp4ss_fe/`, genera un archivo `HERMES.md` en la raíz del proyecto optimizado para agentes autónomos. Debe incluir las reglas de estilo, rutas de componentes UI y el workflow de OpenSpec."*

---

> [!TIP]
> *Estrategia pro*: Pasa por Antigravity para dejar la cancha 100% rayada y las tareas de `tasks.md` super atomizadas. Así, cuando abras OpenCode con tu Plan Go, el agente irá como avión sin gastar saldo razonando la arquitectura.
