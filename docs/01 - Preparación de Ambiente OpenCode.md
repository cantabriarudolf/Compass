# 01 - Preparación de Ambiente OpenCode

Este documento detalla el procedimiento exacto en español chileno para duplicar el proyecto **Compass** y dejar un entorno 100% operativo y optimizado para trabajar con **OpenCode (Plan Go)** o **Hermes**.

---

## 💡 ¿Estamos en condiciones de hacer una copia?

**¡De todas maneras! Estamos impecables para hacer la copia.** 

Actualmente el proyecto está súper bien estructurado:
- Las especificaciones y documentación de módulos residen en la raíz (`docs/`, `openspec/`, `Data/`).
- La aplicación frontend (Next.js + Turborepo + Tailwind + shadcn/ui) reside en la subcarpeta `k0mp4ss_fe/`.
- El control de versiones Git está alojado en `k0mp4ss_fe/`.

---

## 🛠️ Paso a Paso para Duplicar y Configurar para OpenCode / Hermes

### Paso 1: Hacer la copia limpia del proyecto
Para no romper lo que ya está funcionando en tu entorno actual, crea un duplicado completo en una nueva carpeta (por ejemplo `Compass-OpenCode`):

```bash
# Copiar todo el proyecto a una nueva ubicación limpia
cp -r /home/sh1r0l0x/Documentos/Proyectos/Compass /home/sh1r0l0x/Documentos/Proyectos/Compass-OpenCode
```

### Paso 2: Limpiar dependencias y temporales en la copia
Ingresa al proyecto clonado y limpia los módulos pesados de node para que OpenCode / Hermes no se queden pegados indexando carpetas gigantes:

```bash
cd /home/sh1r0l0x/Documentos/Proyectos/Compass-OpenCode/k0mp4ss_fe
rm -rf node_modules .turbo apps/web/.next
npm install
```

### Paso 3: Crear el archivo de contexto para OpenCode / Hermes (`AGENTS.md`)
OpenCode y Hermes leen archivos de instrucciones de proyecto (`AGENTS.md` o `.opencode/instructions.md`) para entender de entrada las reglas del juego sin gastar tokens extras explicando el proyecto en cada prompt.

Crea un archivo `AGENTS.md` en la raíz del nuevo proyecto con lo siguiente:

```markdown
# Instructions for OpenCode & Hermes Agents

Welcome to Compass (NSGC - Nuevo Sistema de Gestión Comunitaria).

## Stack & Architecture
- **Framework**: Next.js 14+ (App Router), Turborepo monorepo inside `k0mp4ss_fe/`.
- **Styling**: Tailwind CSS + shadcn/ui components (`packages/ui`).
- **State & Data**: React hooks + TypeScript typed mocks located in `apps/web/data/`.

## Crucial Workflow Rules
1. Refer to `docs/` and `Data/NSGC/docs/manuales/` for business logic & UI specifications.
2. Use OpenSpec changes inside `openspec/changes/` when planning complex implementations.
3. Keep component modularity intact: generic UI components go to `packages/ui`, feature pages go to `apps/web/app/`.
4. Always follow Chilean Spanish documentation rules for any `.md` file generated in `docs/`.
```

### Paso 4: Probar la ejecución local con OpenCode
Una vez configurado OpenCode con tu **Plan Go**, puedes iniciar el servidor de desarrollo local dentro de `k0mp4ss_fe`:

```bash
cd k0mp4ss_fe
npm run dev
```

Esto levantará la app en `http://localhost:3000` lista para picar código y probar en vivo.

---

> [!TIP]
> *Recomendación del día*: Para no gastar saldo de tu Plan Go de OpenCode en preguntas de "contexto general", dile al agente que lea directamente los archivos en `docs/00-index.md` y `docs/02 - Diagnóstico del Proyecto Compass.md`.
