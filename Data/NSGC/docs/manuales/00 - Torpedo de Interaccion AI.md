# 🤖 Torpedo de Interacción Ágil (AI-Dev Workflow)

Este documento es tu "chuleta" o guía rápida para trabajar con los agentes (como yo) de la forma más rápida, barata (menos tokens) y libre de errores posibles.

## 1. 💬 Regla de Oro sobre los Chats (Tokens)
**NUNCA mantengas un solo chat eterno.**
A medida que la conversación crece, el Agente tiene que "leer" todo el historial en cada mensaje. Esto gasta muchos tokens, vuelve al Agente más lento y aumenta exponencialmente la probabilidad de que "alucine" o cometa errores tontos.

**¿Cuándo crear un chat nuevo?**
- 🟢 **CHAT NUEVO**: Cuando vas a empezar un Módulo Nuevo (Ej: "Vamos a crear el módulo de Finanzas").
- 🟢 **CHAT NUEVO**: Después de cerrar un trabajo y dejar spec, manual y avance al día. (Borrón y cuenta nueva).
- 🟢 **CHAT NUEVO**: Cuando vayas a hacer "Bugfixing" específico (Ej: "Abre un chat nuevo y dime: Arregla el botón X de la vista Y").
- 🔴 **MANTENER CHAT**: Solo mientras estamos en el proceso de iterar y corregir el módulo que estamos construyendo en ese momento.

## 2. 🔄 El Ciclo de Vida Perfecto (lifecycle ODD)

Para mecanizar nuestro trabajo y avanzar como un bulldozer, usa siempre este ciclo:

1. **Diseño (spec)**: la spec del módulo vive en `specs/<AA>-<kebab-name>/spec.md`. Si el trabajo cambia un contrato de capacidad, el requirement se edita ahí directo y un requirement reemplazado conserva los nombres exactos de sus escenarios. Lo revisas.
2. **Ejecución**: el agente implementa requirement por requirement, con sus tests al lado del comportamiento.
3. **Cierre**: specs, manual de módulo, avance y trazabilidad al día. El trabajo cerrado queda registrado en git y, cuando dejó material de trabajo (propuesta, diseño, tareas), en `specs/archive/`.
   - **⚠️ Paso Obligatorio Post-Cierre**: Abre un CHAT NUEVO.

## 3. 🎯 Cómo darme instrucciones (Prompting Eficiente)

No trates de hacerme "recordar" cosas del pasado. El código fuente y la carpeta `docs/` son mi memoria. Sé directo y quirúrgico.

**❌ Mal Prompt (Ineficiente):**
*"Oye, te acuerdas que la semana pasada hicimos un módulo de residentes donde pusimos unos botones verdes para los roles? Bueno, resulta que ahora el jefe quiere que..."*

**✅ Buen Prompt (Quirúrgico y Barato):**
*"En la ruta `/comunidad/personas/[id]/page.tsx`, cambia el color del badge 'Residente' a azul y agrega un botón que diga 'Imprimir'. "*

## 4. 📂 La Trazabilidad es tu Seguro de Vida
Si seguimos el paso a paso, tú no tienes que preocuparte del código. Pero para que el Agente no se pierda en el futuro, SIEMPRE debemos mantener actualizados estos dos archivos:
1. `Data/NSGC/docs/manuales/03 - Mapa de Desarrollo y Trazabilidad.md`
2. Crear un archivo en `Data/NSGC/docs/avances/` al cerrar cada módulo.

*Si mantienes esteTorpedo en mente, construirás Compass 10 veces más rápido, gastando el mínimo de saldo y sin "romper" nada en producción.*

## 5. 🚀 Prompts Estándar — una sola variable `SPEC` (Copiar-Pegar)

> Reemplaza **`SPEC`** una sola vez por el nombre del archivo en `Data/NSGC/docs/especificaciones/` (ej: `FI - Finanzas y Morosidad`). El agente deriva la ruta `@` y la carpeta de spec `<AA>-<kebab-name>` automáticamente.

**A. Llevar spec a `specs/`:**
```
Lleva la spec @Data/NSGC/docs/especificaciones/SPEC.md a specs/<AA>-<kebab-name>/spec.md — escribe los requirements con Dependencias de Carga y Seed (Rank 0..99 + Entidades ST + Seed Manifest + Validación FK en save* + Bulk SeedReport + Migración + eventos AM) y deja Historia 34 al día.
# Ej: SPEC = FI - Finanzas y Morosidad → @Data/NSGC/docs/especificaciones/FI - Finanzas y Morosidad.md → specs/FI-finanzas-morosidad/spec.md
```

**B. Validar y cerrar el trabajo:** ya no existen los comandos `/valida-datos` ni `/cierra-modulo` (vivían en el andamiaje del CLI retirado). El lifecycle es ODD: documento de tareas visible, commits por unidad revisable, y la verificación se corre de verdad — `npx tsc --noEmit`, la suite de Vitest, las lanes de Playwright que correspondan y los candados (`npm run audit:desvios`, `npm run audit:store`, `npm run check:rechecks`). Si el trabajo cambia un contrato de capacidad, el requirement se edita directo en `specs/<AA>-<kebab-name>/spec.md` conservando el nombre exacto de los escenarios existentes.

## 6. 🧪 Norma de Documentación de Mocks

**OBLIGATORIO al cerrar cada módulo.** Cuando se creen o modifiquen archivos en `data/`, el Agente DEBE:

1. **Actualizar el Catálogo** (`28 - MK - Catálogo de Mocks.md`):
   - Agregar el archivo nuevo con su ruta, interfaces, exports y consumidores.
   - Actualizar el mapa de dependencias si corresponde.

2. **Crear o actualizar el Data Dump** (`29, 30, 31...`):
   - Volcar TODOS los registros resueltos en tablas planas (no código).
   - Incluir el patrón de IDs para que tú puedas crear registros nuevos manualmente.
   - Un archivo por dominio (inventario, comunidad, finanzas, etc.).

3. **¿Por qué?** Para que tú puedas:
   - Consultar qué datos existen sin gastar tokens preguntándome.
   - Crear registros nuevos copiando el patrón de IDs.
   - Saber exactamente qué reemplazar cuando se conecte al backend real.

**Nomenclatura:**
- Mock en código: `data/{dominio}/{entidad}.ts`
- Data Dump en docs: `{NN} - MK - Data Dump {Dominio}.md`
