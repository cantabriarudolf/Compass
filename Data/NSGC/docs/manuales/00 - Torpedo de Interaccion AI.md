# 🤖 Torpedo de Interacción Ágil (AI-Dev Workflow)

Este documento es tu "chuleta" o guía rápida para trabajar con los agentes (como yo) de la forma más rápida, barata (menos tokens) y libre de errores posibles.

## 1. 💬 Regla de Oro sobre los Chats (Tokens)
**NUNCA mantengas un solo chat eterno.**
A medida que la conversación crece, el Agente tiene que "leer" todo el historial en cada mensaje. Esto gasta muchos tokens, vuelve al Agente más lento y aumenta exponencialmente la probabilidad de que "alucine" o cometa errores tontos.

**¿Cuándo crear un chat nuevo?**
- 🟢 **CHAT NUEVO**: Cuando vas a empezar un Módulo Nuevo (Ej: "Vamos a crear el módulo de Finanzas").
- 🟢 **CHAT NUEVO**: Después de haber tirado un `@[/opsx-archive]`. (Borrón y cuenta nueva).
- 🟢 **CHAT NUEVO**: Cuando vayas a hacer "Bugfixing" específico (Ej: "Abre un chat nuevo y dime: Arregla el botón X de la vista Y").
- 🔴 **MANTENER CHAT**: Solo mientras estamos en el proceso de iterar y corregir el módulo que estamos construyendo en ese momento.

## 2. 🔄 El Ciclo de Vida Perfecto (Metodología OpenSpec)

Para mecanizar nuestro trabajo y avanzar como un bulldozer, usa siempre este ciclo:

1. **Diseño (Propose)**: 
   - Comando: `@[/opsx-propose] Crea el change "nombre" basándote en el documento @[archivo.md]`
   - *Qué hace*: El agente arma el plan, los diagramas y la lista de tareas. Lo revisas.
2. **Ejecución (Apply)**:
   - Comando: `@[/opsx-apply]`
   - *Qué hace*: El agente se pone a picar código tarea por tarea. 
3. **Cierre (Archive)**:
   - Comando: `@[/opsx-archive]`
   - *Qué hace*: Borra el andamio. Cierra el ciclo. 
   - **⚠️ Paso Obligatorio Post-Archive**: Abre un CHAT NUEVO.

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

## 5. 🧪 Norma de Documentación de Mocks

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
