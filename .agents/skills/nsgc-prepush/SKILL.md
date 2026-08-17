---
name: nsgc-prepush
description: "Validate NSGC documentation before pushing to GitHub. Use when the user asks to push, subir a github, commit+push, or publish changes to origin. Checks the current change to determine if it requires: (1) updating mock data docs (Catálogo de Mocks + Data Dump per the Mock Documentation Norm), (2) updating the corresponding module manual in Data/NSGC/docs/manuales/, and (3) creating a development avance in Data/NSGC/docs/avances/. Also updates the Trazabilidad map and index when needed."
license: MIT
allowed-tools: Bash
---

# NSGC Pre-Push Validation

Validate that every push to GitHub keeps the NSGC documentation in sync with the code. Run this workflow **before** committing/pushing any change.

## Core Principle

The user's docs (`Data/NSGC/docs/`) are the project's memory. A push is only "clean" when these three are satisfied for the change being pushed:
1. **Mocks**: if any mock file in `k0mp4ss_fe/apps/web/data/` changed → the Mock Documentation Norm applies.
2. **Manual**: the module manual affected by the change is up to date.
3. **Avance**: a development avance exists for this work session.

## Workflow

### 1. Determine the scope of the change

```bash
git status --porcelain
git diff --name-only            # unstaged changes
git diff --staged --name-only   # staged changes
```

If the change was already committed, compare against the last push:

```bash
git log --oneline origin/main..HEAD
git diff --name-only origin/main...HEAD
```

### 2. Detect affected areas

Map the changed paths to their documentation requirements:

| Change touches | Documentation required |
|----------------|------------------------|
| `k0mp4ss_fe/apps/web/data/**` | Mock Documentation Norm (Catálogo + Data Dump + índice) |
| `apps/web/app/inventario/estructura/**` | `02 - Estructura Física.md` |
| `apps/web/app/inventario/tipos/**` | `01 - Tipos de Unidad.md` |
| `apps/web/app/inventario/estacionamientos/**` | `03 - Estacionamientos.md` |
| `apps/web/app/admin/maestros/**` | `04 - Maestros Administrativos.md` |
| `apps/web/app/comunidad/personas/**` | `05 - Maestro de Personas.md` |
| `apps/web/app/comunidad/personas/[id]/**` | `06 - Vinculación de Unidades.md` |
| `apps/web/app/admin/configuracion/**` | `11 - CF - Configuración Global.md` |
| `apps/web/app/admin/metricas/**` | `04 - Auditoría y Métricas.md` |
| Specs / openspec changes | Affected module spec (see `openspec/` or `Data/NSGC/docs/manuales/03 - Mapa de Desarrollo y Trazabilidad.md`) |
| Any application change | A new avance file |

If no file maps to a manual directly, find the closest module by grepping the manuals:

```bash
rg -l "<module keyword>" "Data/NSGC/docs/manuales/"
```

### 3. Check / fill the Mock Documentation Norm

Only if `k0mp4ss_fe/apps/web/data/**` changed. Per Section 5 of the Torpedo:

1. **Catálogo de Mocks** (`Data/NSGC/docs/manuales/28 - MK - Catálogo de Mocks.md`):
   - Add the new/modified file with its path, interfaces, exports and consumers.
   - Update the dependency map if relationships changed.
2. **Data Dump** (`29 - MK - Data Dump Inventario.md`, `30 - MK - Data Dump Comunidad.md`, etc.):
   - Dump ALL resolved records into flat tables (not code).
   - Include the ID pattern so the user can create new records manually.
   - One file per domain (inventario, comunidad, finanzas, ...).
3. **Índice** (`Data/NSGC/docs/manuales/00-index.md`):
   - Link any newly created MK document.

### 4. Check / update the module manual

If the change modifies behavior of a module, update its manual in `Data/NSGC/docs/manuales/`:
- Add the new functionality under the appropriate section (e.g., a new "📊 Gráfico de Distribución por Estado" section).
- Keep the existing tone and emoji formatting conventions used across the manuals.

### 5. Create the development avance

Always required. Create a file in `Data/NSGC/docs/avances/`:

```
avance - YYYY-MM-DD HH-MM.md
```

Using the template seen in existing avances:

```markdown
# Avance de Desarrollo - {Fecha}

## 📋 Resumen: {Título corto}
{Qué se hizo y por qué}

## ✨ Hitos Logrados
{Lista numerada de entregables, con archivos involucrados}

## 📁 Archivos Creados/Modificados
| Acción | Archivo |
|--------|---------|
| ✅ Creado | `...` |
| ✏️ Modificado | `...` |

## ✅ Verificaciones
{tsc, eslint, build, etc.}

## 🚦 Próxima Acción Recomendada
{Siguiente paso}
```

### 6. Update Trazabilidad and index if needed

- If a module status changed (started/completed) update `03 - Mapa de Desarrollo y Trazabilidad.md`.
- If a new manual/MK doc was created, add it to `00-index.md`.

### 7. Report validation summary

Present a checklist to the user BEFORE pushing, e.g.:

```
✅ Catálogo de Mocks actualizado (data/estructura.ts)
✅ Data Dump Inventario actualizado (83 deptos)
✅ Manual 02 - Estructura Física.md actualizado
✅ Avance creado: avance - 2026-08-15 12-45.md
❌ Trazabilidad no actualizada (módulo X quedó en Proceso)
```

If anything is missing, fill it before allowing the push. Do not push until the checklist is complete (or the user explicitly waives an item).

## Best Practices

- Read existing manuals/avances to match tone, format and emoji style before writing.
- Keep manuals concise; they are user-facing "chuletas", not technical specs.
- Avances are per work session, not per commit. Reuse the existing avance file if this session already has one.
- Never invent records in data dumps; dump exactly what is in the mock files.
- If the change has no app code impact (pure docs/chore), the manual update may be skipped, but the avance still applies if it's a work session.
