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

## Decision Gates

| Situación | Acción |
| --- | --- |
| Recurso usado por una ruta y ausente en la matriz | Reportar rol/ruta/código; proponer matriz al owner |
| Guard propio con lógica de rol | Mover a la matriz; borrar el bypass |
| Filtro por rol solo en la UI | Implementar en el route; test de que un rol no ve lo ajeno |
| Ruta de herramienta interna (QA/dev) sin gate | Marcar como "módulo interno a retirar/aislar antes de producción" |
| Test con "desvío/solo admin hasta" | Actualizarlo al comportamiento decidido, nunca revertir el fix |
| Todo verde | Cerrar con la tabla de códigos HTTP por rol |

## Execution Steps

1. Listar recursos usados: `puede`/`puedeContextual` en `app/**`, `lib/**`, `components/**`; comparar con
   las claves de `MATRIZ`. Los ausentes que solo pasan por el wildcard del admin son sospechosos.
2. Listar `route.ts` sin `puede`/`authzCheck`: separar público a propósito (health, csp-report, auth, 2FA)
   de hueco real.
3. Verificar alcance: `withComunidadScope` o `where { comunidadId }`; revisar unidad/persona en ABAC.
4. Verificar **quién** hace la acción contra **quién la sufre**.
5. Medir con sesiones reales: para cada rol y ruta, el código HTTP. Nunca declarar por lectura.
6. Buscar desvíos declarados: `desvío`, `solo admin hasta`, `TODO`, `por simplicidad`, `en UI`.
7. Registrar el hallazgo en `references/hallazgos.md` con evidencia y estado.

## Output Contract

Devolver: tabla `rol | ruta | esperado | observado | veredicto` · recursos ausentes con `path:line` ·
bypass detectados · desvíos declarados · matriz propuesta · preguntas abiertas al owner. Sin recortes:
si un punto no se pudo verificar, va como "no verificado", nunca como correcto.

## References

- `references/antipatrones.md` — catálogo con los casos reales de Compass y su forma de cierre.
- `references/hallazgos.md` — registro cronológico de hallazgos, decisión del owner y estado.
