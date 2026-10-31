# 02 - Diagnóstico del Proyecto Compass

Este documento entrega un diagnóstico completo y al grano en español chileno sobre el estado actual del proyecto **Compass (NSGC - Nuevo Sistema de Gestión Comunitaria)**, para que puedas retomar el hilo al toque sin perder tiempo.

---

## 🔎 ¿Qué es Compass y en qué quedamos?

**Compass** es una plataforma de gestión integral para comunidades y condominios. Su desarrollo está organizado por fases y módulos funcionales.

Actualmente el proyecto está construido sobre un **Monorepo Turborepo** alojado en la carpeta `k0mp4ss_fe/`:
- **Aplicación Web**: `k0mp4ss_fe/apps/web` (Next.js App Router).
- **Librería de Componentes UI**: `k0mp4ss_fe/packages/ui` (shadcn/ui + Tailwind CSS).

---

## 🚦 Tablero de Avance por Módulos

### 🟢 Módulos Implementados (Listos y probados)
1. **Fase 0 - Reglas Generales (RG)**: Directrices globales del sistema.
2. **Fase 1 - Tipos de Unidad (TU)**: Ruta `/inventario/tipos` (Categorización de departamentos, bodegas, locales).
3. **Fase 1 - Estructura Física (EF)**: Ruta `/inventario/estructura` (Torres, bloques, niveles y departamentos).
4. **Fase 1 - Estacionamientos (ES)**: Ruta `/inventario/estacionamientos` (Gestión de aparcamientos y asignaciones).
5. **Fase 2 - Maestros Administrativos (MA)**: Ruta `/admin/maestros` (Configuración de tablas maestras).
6. **Fase 2 - Maestro de Personas (MP)**: Ruta `/comunidad/personas` (Directorio centralizado de residentes, propietarios, arrendatarios y personal).

### 🔵 Módulo en Proceso Actual (OpenSpec Change)
- **Vinculación de Unidades (VU)**:
  - Ubicación del Change: `openspec/changes/VU-vinculacion-unidades/`
  - Meta: Conectar la ficha de cada persona en `/comunidad/personas/[id]` con sus unidades físicas correspondientes (definir si es propietario, arrendatario, asignar permisos de privacidad financiera, etc.).
  - Estado: Pendiente de construir la UI del formulario de vínculo y los triggers dinámicos.

### ⏳ Próximos Módulos Planificados
1. Configuración Global (`/admin/configuracion`).
2. Finanzas y Gastos Comunes (`/finanzas/gastos-comunes`).
3. Gestión Administrativa & Dashboard (`/dashboard`).
4. Comunicación Vecinos (`/comunidad/comunicacion`).
5. Personal y Remuneraciones (`/personas/personal` y `/finanzas/remuneraciones`).

---

## 🎯 Plan de Acción Recomendado para OpenCode / Hermes

1. **Abrir la copia preparada** (`Compass-OpenCode`).
2. **Terminar el Change activo (`vinculacion-unidades`)**:
   - Abrir un chat nuevo en OpenCode.
   - Ejecutar la tarea 1.1 de `openspec/changes/VU-vinculacion-unidades/tasks.md` (Crear `FormularioVinculoUnidad`).
3. **Cerrar el ciclo con OpenSpec**:
   - Una vez finalizada la vinculación, archivar la especificación y pasar al siguiente módulo de la lista (Finanzas o Configuración Global).

---

> [!NOTE]
> *Este documento debe actualizarse al cerrar cada hito relevante para mantener la memoria del proyecto viva.*
