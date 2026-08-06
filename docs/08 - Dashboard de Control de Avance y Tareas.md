# 08 - Dashboard de Control de Avance y Tareas

Este documento detalla en español chileno las características y el funcionamiento del nuevo **Dashboard de Control de Desarrollo (Dev Dashboard)** de **Compass**, diseñado para monitorear en vivo las tareas de OpenSpec, ejecutar la tarea 1.1 y marcar visualmente el avance del proyecto.

---

## 🖥️ ¿Dónde encontrar el Dashboard en la App?

El dashboard interactivo fue construido directamente en el frontend (`k0mp4ss_fe`) y está accesible en la siguiente ruta:

- **Ruta en la aplicación**: `/admin/dev-dashboard`
- **Archivo fuente**: `apps/web/app/admin/dev-dashboard/page.tsx`

---

## 🎯 Características Principales del Dev Dashboard

1. **Monitoreo en Vivo de Tareas OpenSpec**:
   - Muestra las 10 tareas del Change activo (`VU-vinculacion-unidades`).
   - Cada tarea incluye checkbox interactivo que actualiza el porcentaje de progreso global.
   - Destaca de forma especial la **Tarea 1.1** (Crear `FormularioVinculoUnidad`).

2. **Panel de Contexto Técnico por Tarea**:
   - Cada tarea tiene un botón **"🔍 Ver Contexto"** que despliega un panel (Sheet) con la descripción técnica, los archivos involucrados (`apps/web/components/comunidad/formulario-vinculo.tsx`), las especificaciones de referencia (`docs/05` y `docs/06`) y el prompt exacto para copiar a Hermes con 1 click.

3. **Mapa Global de los 24 Módulos**:
   - Vista completa de las 5 Fases del sistema NSGC con indicadores de estado:
     - 🟢 **Completado**: Fases 0, 1 y 2 (Parcial).
     - 🔵 **En Proceso**: Vinculación de Unidades (`/comunidad/personas/[id]`).
     - ⏳ **Pendiente**: Finanzas, Remuneraciones, Reservas, etc.

4. **Pestaña de Prompts Rápidos**:
   - Comandos de consola listos para copiar y ejecutar en Hermes u OpenCode.

---

## 🚀 Cómo usar el Dashboard con Hermes / OpenCode

1. **Lanzar la app localmente**:
   ```bash
   cd k0mp4ss_fe
   npm run dev
   ```
2. **Ingresar al Dashboard**: Entrar a `http://localhost:3000/admin/dev-dashboard`.
3. **Seleccionar Tarea 1.1**: Hacer clic en "Ver Contexto" para copiar el prompt pre-armado.
4. **Pegar en Hermes**: Indicarle a Hermes que ejecute la tarea y marcarla visualmente como completada en la interfaz.

---

> [!TIP]
> *Ventaja total*: Al tener este dashboard corriendo en vivo antes de hacer la copia, tendrás un panel visual súper claro para dirigir al agente Hermes y controlar exactamente qué tarea se está picando en cada momento.
