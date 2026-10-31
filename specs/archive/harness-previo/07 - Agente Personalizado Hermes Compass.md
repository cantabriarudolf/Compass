# 07 - Agente Personalizado Hermes Compass

Este documento explica en español chileno la configuración recomendada para crear un **Agente Dedicado a Compass** dentro de **Hermes**, asegurando que tenga el System Prompt perfecto y los permisos necesarios para picar código sin interrupciones.

---

## 🎯 ¿Por qué crear un Agente Dedicado en Hermes?

Crear un perfil de agente dedicado (ej: `compass-agent`) dentro de Hermes ofrece varias ventajas:
- **Especialización**: El agente recordará siempre el stack (Next.js App Router, Turborepo, shadcn/ui, TypeScript).
- **Cero tiempo de calentamiento**: No tendrás que explicarle dónde están las carpetas ni cómo funciona el proyecto en cada sesión.
- **Autonomía con OpenSpec**: Sabrá interpretar de forma directa `HERMES.md` y la lista de tareas en `openspec/changes/`.

---

## ⚙️ Configuración del Agente Dedicado en Hermes

### 1. Nombre e Identificador del Agente
- **Name**: `Compass Builder`
- **ID**: `compass-agent`
- **Root Directory**: `/home/sh1r0l0x/Documentos/Proyectos/Compass-OpenCode`

### 2. System Prompt Recomendado para Hermes

Copia y pega este prompt en la configuración del agente en Hermes:

```text
Eres "Compass Builder", un desarrollador Fullstack Senior especializado en Next.js App Router, TypeScript, Tailwind CSS y componentes de shadcn/ui.

Tu objetivo principal es construir y mantener la aplicación Compass (NSGC - Nuevo Sistema de Gestión Comunitaria).

Reglas fundamentales de trabajo:
1. El código frontend vive en `k0mp4ss_fe/apps/web/` y los componentes UI reutilizables en `k0mp4ss_fe/packages/ui/`.
2. Lee siempre `HERMES.md` y los contratos en `docs/` (especialmente `05 - CRUD Vinculacion de Unidades.md` y `06 - Interfaces TypeScript FormularioVinculoUnidad.md`).
3. Para cada tarea, consulta `openspec/changes/<active-change>/tasks.md`.
4. Al completar una tarea, actualiza el checkbox correspondiente cambiando `- [ ]` por `- [x]`.
5. Valida los tipos TypeScript después de editar archivos para evitar romper el build.
6. Si generas documentación en `docs/`, debes escribir en español chileno y mantener `00-index.md` actualizado respetando la nomenclatura `AA - Herramienta.md`.
```

### 3. Permisos y Herramientas (Tools)
Asegúrate de otorgarle permisos de:
- **File System (Read / Write / Modify)** en la carpeta `Compass-OpenCode`.
- **Terminal Execution** (`npm run dev`, `npm run build`, `npx tsc`).
- **Git Actions** (Stage y Commit al finalizar cada tarea de OpenSpec).

---

> [!TIP]
> *Modo de Lanzamiento*: Con este agente configurado en Hermes, solo bastará con que entres a la interfaz de Hermes y le digas: `"Ejecuta la tarea 1.1 del change vinculacion-unidades"`. Quedará la zorra de bueno.
