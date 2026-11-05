---
name: delegacion-paralela
description: "Trigger: lanzar workers, paralelizar, dos escritores, ir mas rapido, varios subagentes, la maquina se colgo, load alto, subagente trabado o timeout, superficie solapada, evidencia recortada. Decide si dos unidades de trabajo pueden correr a la vez, y como verificarlas sin perder evidencia ni fundir el equipo."
license: MIT
---

# Delegación paralela en este repo

Decidir **si** dos unidades pueden correr juntas y **cómo** verificarlas sin fundir la máquina ni creerle a
evidencia recortada. Nació de una sesión donde se colgó el equipo (load 19 con la RAM sana), dos escritores
se trabaron a mitad de camino y se persiguió dos veces un problema inexistente por leer salida filtrada.

## Regla base (la que va en `AGENTS.md`)

**Dos unidades corren en paralelo solo si sus archivos son disjuntos Y al menos una no ejecuta suites.** Si
comparten un contrato, si una afirma lo que la otra cambia, o si las dos necesitan Playwright o la suite
completa, van en serie. Ante la duda: en serie.

## Tabla de decisión

| Escenario | Qué hacer | Por qué |
|---|---|---|
| Archivos disjuntos + una unidad liviana (datos, docs, un archivo) | **Paralelo** | No compiten por CPU ni por contrato |
| Las dos necesitan tests o Playwright | **Serie** | El paralelismo de suites es lo que funde la máquina |
| Una es exploración/lectura | **Paralelo con lo que sea** | No escribe ni instrumenta |
| Tocan el mismo archivo o el mismo contrato | **Serie** | El segundo corrige lo que el primero está midiendo |
| Una **afirma** (test, e2e) lo que la otra **cambia** | **Serie** | El test mide un blanco móvil |
| El equipo viene de un cuelgue o un timeout | **Serie, un worker** | Se restablece la confianza antes de exigir más |
| Superficies de edición solapadas | **Nunca**: el runtime lo rechaza | Acotar la superficie o serializar |

## Guardas de CPU

- **Un escritor pesado por vez.** Un worker levantando Vitest ya abre varios procesos.
- **`--maxWorkers=1` o `2`** en toda corrida propia: el default abre un worker por núcleo.
- La **suite completa con `--coverage`** es la más cara: **una sola vez por lote**, al cerrar, nunca por corte.
- **Nunca dos suites ni dos Playwright a la vez**, ni propios ni de subagentes.
- Playwright: `--workers=1` y **una sola spec**; si hace falta la base descartable, que la recree el script
  de la lane (`e2e:fresh`), no `migrate deploy` a mano sobre `dev.db`.

## Guardas de evidencia (el error más repetido)

1. **No filtres la salida de una corrida con `| tail`**: guardá el log completo en un archivo y grepealo
   después. Filtrar en el comando es cómo se pierde el stack que importa.
2. **Un run cancelado por un push posterior no es verde ni rojo**: es un run sin veredicto, y no cuenta.
3. **Al vigilar CI, imprimí el SHA del run y comparalo con `HEAD` en el mismo comando**; nunca mezcles el
   `sha` local con la `conclusion` del run en una misma línea.
4. **No leas `$?` después de un pipe**: cuenta el exit del último comando del pipe, no del que importa.
5. **Cero resultados en un `grep` sobre un log truncado no prueba ausencia**: usá el log completo del job
   (`gh api …/actions/jobs/<id>/logs`).
6. Un número que dice **"cero" cuando no pudo mirar** es peor que un error: si no se pudo verificar, se
   escribe "no verificado".

## Procedimiento para lanzar un worker

1. **Derivá superficies de edición acotadas** y no vacías: rutas o globs del repo, nunca `.` ni la raíz.
   Si dos escritores van en paralelo, comprobá que no se solapan **antes** de lanzar.
2. **Decí qué NO tocar**: la suciedad ajena del worktree, y lo que el otro worker está usando.
3. **Fijá el alcance y el presupuesto de prueba**: tests focales, `--maxWorkers`, y "no corras la suite
   completa ni cobertura" cuando corresponda.
4. **Pedí evidencia falsable**: causa con `path:line`, RED/GREEN, `tsc`, y qué quedó afuera.
5. **Instruí contra el cuelgue**: no escribir archivos largos de una vez; si algo supera ~250 líneas,
   entregarlo en dos pasos y reportar en el medio.

## Señales de que hay que serializar ahora

- El worker anterior **se trabó** después de un `write`, o el equipo se colgó.
- El pedido de un worker **depende de un dato que el otro todavía no midió**.
- Los dos "arreglan" el mismo defecto desde ángulos distintos.
- Hay que correr la suite completa para verificar cualquiera de los dos.

## Cómo se verifica un lote (no un corte)

1. Tests focales + `tsc` por unidad, apenas termina cada una.
2. Commit por unidad verificada, sin esperar al resto.
3. **Una** corrida de cobertura por lote, con `--maxWorkers=2`, y comparar contra los pisos.
4. **Un** run de CI por lote, verificado por SHA, y solo después de dejar de pushear.
