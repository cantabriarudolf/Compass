---
name: auditoria-contratos-permisos
description: "Trigger: auditar permisos, matriz de permisos, authz, ruta sin gate, bypass de matriz, ABAC en UI, 403 por rol, migrar acción de UI a API, agregar ruta API, desvío declarado. Audita que el permiso viva en el motor, que el alcance se filtre en el servidor y que ningún rol pueda falsificar datos de otro."
license: MIT
---

# Auditoría de contratos y permisos (Compass)

Contrato de auditoría para que el permiso declarado, el permiso ejecutado y el dato que ve cada rol
sean la misma cosa. Se usa al agregar o migrar rutas, al cerrar un 403 por rol y en revisiones.

## Activation Contract

Activar cuando: se agrega o migra una ruta API, una acción de UI pasa del store a la API, aparece un
403 que "antes no estaba", se toca `lib/authz.ts`, `lib/api/*guard*`, el sidebar o un hook `use-*`.
No activar para permisos ya cubiertos por esta auditoría sin cambios de código.

## Hard Rules

1. **El permiso vive en `lib/authz.ts` (`MATRIZ`)**. Un guard propio que decide permisos fuera de la
   matriz es un hallazgo, no una solución.
2. **El alcance se filtra en el servidor**: comunidad, unidad y persona. "ABAC en la UI" es fuga.
3. **Quien sufre la acción no es quien la registra**: marcar leído, aprobar por otro o firmar por otro
   rol es falsificación, aunque el rol sea administrador.
4. **Un test que dice "desvío" o "solo admin hasta RP" es una decisión postergada**, no código válido.
   Se escala al owner; no se revierte la matriz para complacer al test.
5. **Ante duda de permisos, no tocar la matriz sin decisión del owner.** Proponer matriz + evidencia.
6. **Una ruta no hereda por ausencia.** `puede()` resuelve la clave exacta y, si no existe, cae al
   prefijo antes de `:` (`lib/authz.ts:279` y `:288-292`). Olvidar la clave específica hace que la ruta
   adopte el permiso **más amplio** del módulo: la ausencia resuelve al máximo, no al mínimo. Cada ruta
   de una superficie acotada declara su clave y, donde haga falta, el conjunto vacío explícito.
7. **Un guard con raíz desnuda es hallazgo cuando existen hermanas granulares.** Lo mide
   `scripts/audit-desvios.mjs` (R1). Su lista blanca es **foto del estado actual, no un aval**: existe
   para que la lista no crezca, y cada entrada lo dice con esas palabras.

## Decision Gates

| Situación | Acción |
| --- | --- |
| Recurso usado por una ruta y ausente en la matriz | Reportar rol/ruta/código; proponer matriz al owner |
| Guard propio con lógica de rol | Mover a la matriz; borrar el bypass |
| Filtro por rol solo en la UI | Implementar en el route; test de que un rol no ve lo ajeno |
| Ruta de herramienta interna (QA/dev) sin gate | Marcar como "módulo interno a retirar/aislar antes de producción" |
| Test con "desvío/solo admin hasta" | Actualizarlo al comportamiento decidido, nunca revertir el fix |
| Guard con raíz desnuda en una superficie de otro rol | Dar clave propia declarada por rol y medir el flip con tabla HTTP |
| Se quiere cerrar escritura en una pantalla sin portón de servidor | Gatear la página primero; si no, el rol ve botones que devuelven 403 |
| Todo verde | Cerrar con la tabla de códigos HTTP por rol |

## Execution Steps

1. Listar recursos usados: `puede`/`puedeContextual` en `app/**`, `lib/**`, `components/**`; comparar con
   las claves de `MATRIZ`. Los ausentes que solo pasan por el wildcard del admin son sospechosos.
   **Un grep de `puede(rol, accion, "x")` no alcanza**: hay rutas que usan el wrapper
   `contextoAccionPE(RECURSO, accion)` y otras con `puede(scope.rol, ...)`. Un barrido ingenuo reporta
   "sin guard" donde sí lo hay; confirmar cada ruta leyendo el archivo antes de reportarla.
2. Listar `route.ts` sin `puede`/`authzCheck`: separar público a propósito (health, csp-report, auth, 2FA)
   de hueco real.
3. Verificar alcance: `withComunidadScope` o `where { comunidadId }`; revisar unidad/persona en ABAC.
4. Verificar **quién** hace la acción contra **quién la sufre**.
5. Medir con sesiones reales: para cada rol y ruta, el código HTTP. Nunca declarar por lectura.
6. Buscar desvíos declarados: `desvío`, `solo admin hasta`, `TODO`, `por simplicidad`, `en UI`.
7. Registrar el hallazgo en `references/hallazgos.md` con evidencia y estado.
8. En un barrido de raíces desnudas, medir **por raíz**: la regla aplica a todas (`fi`, `mp`, `co`, `mt`,
   `in`, `pl`, `notificaciones`, `ct`, `re`, `pe`), no solo al módulo donde apareció el síntoma. Contar
   sitios y archivos por raíz antes de proponer un orden de arreglo.
9. Verificar al cerrar que la pantalla y la API coinciden: si la ruta redirige a un rol pero la API le
   responde 200, el portón es cosmético y el hallazgo sigue abierto.

## Orden de migración de permisos

1. Decisión del owner **por ruta** (nunca por módulo): quién escribe, quién lee.
2. Agregar las claves granulares de forma **aditiva**, sin mover ningún guard todavía; incluirlas en
   `RECURSOS_CONOCIDOS`.
3. Flipear los guards **por pares colección + `[id]`**, un commit cada uno. Flipar solo la colección es
   exactamente cómo aparecen las inconsistencias.
4. Que el lint falle ante una raíz desnuda nueva; sin eso el paso 3 se deshace en la ruta siguiente.
5. Desactivar el fallback en el motor solo al final, si alguna vez.

Al flip se rompen pruebas que codifican el contrato viejo (por ejemplo
`test/api/pe-escrituras-auditoria.test.ts` escribe como conserjería): actualizarlas al comportamiento
decidido, nunca revertir el flip para complacerlas.

## Output Contract

Devolver: tabla `rol | ruta | esperado | observado | veredicto` · recursos ausentes con `path:line` ·
bypass detectados · desvíos declarados · matriz propuesta · preguntas abiertas al owner. Sin recortes:
si un punto no se pudo verificar, va como "no verificado", nunca como correcto.

## References

- `references/antipatrones.md` — catálogo con los casos reales de Compass y su forma de cierre.
- `references/hallazgos.md` — registro cronológico de hallazgos, decisión del owner y estado.
