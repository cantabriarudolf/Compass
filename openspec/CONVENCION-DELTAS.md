# Convención de deltas de spec (openspec)

> Por qué existe este archivo: 3 changes de seguridad (`sg-google-provider-prod-guard`,
> `sg-csp-enforcement`, `sg-jwt-maxage-verify`) quedaron implementados, commiteados y
> **sin poder archivarse** desde el 2026-10-06 porque sus deltas estaban mal formados y
> nada avisaba. El 2026-10-06 se arreglaron a mano y se archivaron.

## Formato canónico

Archivo: `openspec/changes/<change>/specs/<CAPABILITY>/spec.md`

- `<CAPABILITY>` **DEBE** existir ya como `openspec/specs/<CAPABILITY>/spec.md`.
  **Nunca inventar una capacidad.**
- El archivo lleva una o más de estas secciones:
  `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`,
  `## RENAMED Requirements`.
- Cada requirement: `### Requirement: <Nombre>` con prosa que use **SHALL**, seguido de
  **al menos un** `#### Scenario:` con viñetas `- **WHEN**` / `- **THEN**`.
- Nada de `## Modified Requirement: <nombre>` (H2 con el nombre inline) ni de specs
  completas estilo `## Purpose` / `## Requirements` dentro de `changes/`.
- Referencia autoritativa: el template del propio CLI en
  `<openspec>/schemas/spec-driven/templates/spec.md` (donde `<openspec>` es la instalación
  global de `@fission-ai/openspec`).
- Referencia viva en este repo: `openspec/changes/e2e-higiene-determinismo/specs/`.

## Las 3 trampas que rompen el archive

1. **Los nombres de escenario deben ser exactos.** Un `MODIFIED` reemplaza el requirement
   **completo**: todo escenario que ya existe en la spec viva debe viajar en el delta con
   el mismo nombre, carácter por carácter. Renombrar (aunque sea agregando `(default)`) se
   interpreta como pérdida y el archive aborta.
2. **Renombrar un requirement no se hace cambiando el header del `MODIFIED`.** Se usa
   `## RENAMED Requirements` con `- FROM:` / `- TO:`, y el bloque `MODIFIED` referencia el
   nombre **nuevo**. Orden de aplicación del CLI:
   **RENAMED → REMOVED → MODIFIED → ADDED**.
3. **Dos changes que tocan el mismo requirement.** Ambos bloques `MODIFIED` deben llevar la
   **unión** de escenarios y la **misma prosa**, porque el último archive gana. El guard
   protege escenarios, **no prosa**: un párrafo que falte en uno se pierde en silencio.

## El gate real

`openspec validate` — incluso con `--strict` — **no detecta ninguna de las tres trampas**.
El único gate es `openspec archive`, que falla cerrado (aborta sin escribir nada).

Antes de archivar, correr:

```bash
node openspec/scripts/check-delta-coverage.mjs            # todos los changes activos
node openspec/scripts/check-delta-coverage.mjs <change>   # uno solo
```

Sale con código 1 y lista los escenarios que se perderían, más los `MODIFIED` cuyo
requirement no existe en la spec viva.

## Changes que no modifican specs

Si el change no toca ninguna spec (solo docs, tooling o refactor), se marca
`skip_specs: true` en su `.openspec.yaml`. **No** se deja el directorio `specs/` vacío ni
se inventa una capacidad para llenarlo.

## Al archivar

`openspec archive <change> -y` aplica los deltas a `openspec/specs/` y mueve el change a
`openspec/changes/archive/<fecha>-<change>/`. La prosa de bookkeeping de delta
(`(Previously: ...)`) **no** se escribe en las specs vivas: la spec viva describe el estado
actual, y el histórico vive en el change archivado y en git.
