---
name: auditoria-decisiones-congeladas
description: "Trigger: no reinterpretar, no tocar, congelado, congelada, decisión del owner, cerrado, deprecated, no cambiar sin, por qué está así, esta decisión sigue vigente. Audita si una decisión escrita sigue teniendo fundamento o si quedó bloqueando el avance, sin desafiar lo que protege integridad de datos."
license: MIT
---

# Auditoría de decisiones congeladas (Compass)

Una decisión escrita es un **artefacto histórico**, no una cláusula pétrea. Pero hay dos cosas muy
distintas que se escriben con la misma palabra, y confundirlas es peor que no auditar.

## Activation Contract

Activar cuando: aparece un comentario o documento que prohíbe revisar algo (`no reinterpretar`,
`no tocar`, `decisión del owner`, `congelado`); algo "está así porque se decidió" y no se sabe por qué;
una mejora se frena por una nota vieja; se mueve arquitectura, permisos o modelo de datos y hay que
revisar qué quedó atrás.

No activar para decisiones de integridad de datos (ver la primera regla dura): ahí el congelamiento
es correcto y no se audita.

## Hard Rules

1. **Distinguir congelado-de-dato de congelado-de-política.** Son dos cosas opuestas:
   - **Dato**: snapshot de emisión (`nunca se recalcula`), nómina cerrada de un período, folio ya
     asignado, documento emitido, consentimiento otorgado. **No se audita. Es correcto.** Reabrirlo
     es corrupción de historia, no mejora.
   - **Política**: `no reinterpretar`, `decisión del owner`, `así se decidió`, `set vacío a
     propósito`. **Sí se audita**: la premisa puede haber cambiado y quien decidió puede haber
     decidido con menos información.
2. **No fabricar consentimiento.** Citar una frase del owner **no** cierra un tema si la frase
   responde otra pregunta. Verificar que la cita contesta exactamente lo que se está discutiendo;
   si contesta otra cosa, no es evidencia y decirlo en voz alta.
3. **No revertir en silencio ni acatar en silencio.** Ni cambiar lo decidido sin el owner, ni dejar
   pasar un bloqueo sin nombrarlo. El agente levanta el caso con evidencia; decide el owner.
4. **Un bloqueo sin motivo explícito es un hallazgo por sí mismo.** Si no se puede reconstruir por
   qué se congeló, ya no es una decisión: es un residuo.
5. **No borrar el comentario.** Se reemplaza por su reemplazo y su motivo nuevo, o se deja igual con
   el motivo actualizado. Borrar destruye la trazabilidad de por qué se pensaba así.
6. **Si protege algo irreversible o legalmente sensible** (datos de producción, cifrado, normativa,
   consentimientos), el bloqueo se respeta sin auditar y se dice por qué.

## Decision Gates

| Situación | Acción |
| --- | --- |
| Marca de congelado sobre un dato emitido o cerrado | No tocar. Confirmar que el mecanismo funciona |
| Marca de congelado sobre una política o una regla de negocio | Levantar las cuatro preguntas |
| `no reinterpretar` sin fecha ni motivo | Hallazgo: bloqueo sin fundamento reconstruible |
| El motivo existe pero la premisa ya no es cierta | Proponer revisión con la evidencia de que cambió |
| La decisión sigue siendo válida | Actualizar el comentario con el motivo actual, para que el próximo no vuelva a preguntar |
| El owner cambió de opinión | Registrar la nueva decisión **y** retirar la vieja, nunca dejar las dos |

## Execution Steps

1. Inventariar las marcas: `grep -rnE 'no reinterpretar|no tocar|no modificar|congelad|decisión del owner|deprecated'`
   sobre `lib/`, `app/`, `components/`, `specs/` y `AGENTS.md`, excluyendo `test/` y artefactos.
2. **Clasificar cada hallazgo** en dato o política (regla dura 1). Descartar los de dato.
3. Para cada hallazgo de política, responder por escrito:
   - **Premisa**: ¿por qué se decidió? ¿existe todavía esa razón?
   - **Vigencia**: ¿está al día con lo construido después?
   - **Bloqueo**: ¿impide algo, o solo ordena?
   - **Información**: ¿se decidió con datos que hoy no daríamos por buenos?
4. Buscar el daño concreto: ¿hay una mejora concreta que esa marca está frenando? Sin un caso
   concreto, es opinión y va como observación, no como hallazgo.
5. Proponer una de tres salidas: **mantener** (con motivo actualizado), **revisar** (con la premisa
   que cambió) o **retirar** (con qué la reemplaza). Nunca dejar el tema sin salida.
6. Escalar al owner las que requieren decisión; registrar el resultado en `references/hallazgos.md`.

## Output Contract

Devolver una tabla `ubicación (path:line) | tipo (dato/política) | por qué se decidió | motivo vigente (sí/no/desconocido) | qué bloquea hoy | salida propuesta`.
Sin recortes: si el motivo no se puede reconstruir, va como **desconocido**, nunca inventado.
Separar siempre lo auditado de lo que se decidió no auditar, y decir por qué.

## References

- `references/hallazgos.md` — inventario cronológico con decisión del owner y estado.
- `references/antipatrones.md` — catálogo de casos reales de Compass.

## Inventario conocido (2026-11-03)

**Política — auditable:**
- `app/api/pe/_acciones.ts:10` — «Decisiones del plan SERIE-FASE2 §V2 (no reinterpretar)»: conserjería
  y mantención pueden horas extra, tareas y enviar proyección de costo.
- `lib/api/use-reportes-re.ts:13` y `lib/api/use-cobros-fi.ts:15` — «Decisiones del plan que se ven en
  la firma (no reinterpretar)».
- `lib/authz.ts` — múltiples «vacío explícito … corta el fallback de prefijo»: son política disfrazada
  de configuración, y por eso el lint las vigila.
- `lib/maestros-nacionales.ts:4`, `lib/cedula-qr.ts:4`, `app/comunidad/comunicacion/consola-comunicacion.tsx:287`.

**Dato — no se audita:**
- `lib/schemas.ts:277` nómina congelada al cerrar; `:2428` snapshot de emisión que nunca se recalcula;
  `app/api/periodos-directiva/[id]/route.ts:7` nómina cerrada responde 409.
- `lib/store.ts` `@deprecated` con `STORE_VERSION` congelado: retiro en curso, no se reabre.
