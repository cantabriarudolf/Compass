# Proposal — `st-fuente-verdad-bd`

## Qué

Corrige el corpus de specs para que declare la arquitectura real de la capa de datos:
**la base de datos vía API REST es la fuente de verdad del dominio; el store legacy
`apps/web/lib/store.ts` está `@deprecated`, congelado en `STORE_VERSION` 28 y sin entidades
nuevas.**

## Por qué

Hoy las specs afirman lo contrario de lo que hace el código:

| Spec | Afirma |
| --- | --- |
| `openspec/specs/RG-reglas-generales/spec.md` (Requirement: Capa de datos persistente (ST)) | Todo dato del dominio SHALL vivir en el store global; las páginas leen con `useCompassStore` |
| `openspec/specs/project.md` (Data layer (ST)) | All domain data lives in the global store; pages MUST read via `useCompassStore` |
| `openspec/specs/ST-capa-datos-persistente/spec.md` | El store persiste todas las entidades y versiona con `migrate` |

El código dice lo opuesto:

- `k0mp4ss_fe/apps/web/lib/store.ts:1-10` — «⚠️ DEPRECADO: este store ya NO es la fuente de
  verdad. Todos los datos de dominio persisten en el servidor vía API REST. `STORE_VERSION`
  está congelado en 28; no se migran más datos de dominio.»
- 40 de 44 páginas leen por API (`lib/api/use-*`).
- `useCompassStore` tiene solo dos consumidores: `app/admin/qa-lab/page.tsx` y
  `app/admin/mantenimiento/page.tsx`, ambos del módulo dev en retiro (F9).
- `AGENTS.md:31` todavía ordena subir `STORE_VERSION` al tocar el store: una versión que el
  código declara congelada.

Consecuencia: un agente que siga `AGENTS.md:11` (leer BACKLOG primero) y luego las specs
implementa contra una arquitectura que ya no existe. Este es el riesgo que el change ataca.

## Alcance

Dentro:

- `RG-reglas-generales`: reescribir el requirement «Capa de datos persistente (ST)»
  conservando sus tres escenarios con el nombre exacto (la regla que leen todos los módulos).
- `ST-capa-datos-persistente`: reescribir «Persistencia entre recargas», «Versionado y
  migración del almacenamiento» y «Sembrado inicial desde mocks» para declarar el store como
  capa legacy y a la BD como fuente de verdad.
- `project.md`: corregir la viñeta «Data layer (ST)» de Development Conventions.

Fuera:

- Retirar el módulo dev y el store legacy: eso es F9/F22, con su propio change.
- Tocar código, tests o la base de datos. Este change es solo documentación.
- Las demás specs (`CT`, `PL`, `SG`, …): no afirman nada sobre la capa de datos.

## Riesgo

Ninguno de runtime: ningún artefacto ejecutable depende de la prosa de las specs. El riesgo
real es el inverso — dejar la prosa como está sigue induciendo implementaciones contra el
store. Se mitiga con el gate de deltas antes de archivar.
