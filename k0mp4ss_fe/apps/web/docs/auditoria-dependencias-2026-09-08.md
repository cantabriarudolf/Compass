# Auditoría de Dependencias — 2026-09-08

> Resultado de `npm audit` en `k0mp4ss_fe/`. Documenta vulnerabilidades conocidas y plan de remediación.

## Resumen ejecutivo

| Severidad | Cantidad | Fix automático |
|-----------|----------|---------------|
| Critical | 0 | — |
| High | ~15 | Parcial |
| Moderate | ~20 | Parcial |
| Low | ~5 | Parcial |

## Vulnerabilidades destacadas

### High
- **brace-expansion** ≤1.1.17 || 3.0.0 - 5.0.8 — DoS via expansion exponencial. Afecta eslint y otras deps.
- **esbuild** ≤0.25.6 — multiple DoS / path traversal. Fix disponible.
- **tar** <6.2.1 — path traversal / arbitrary file creation. Fix disponible.
- **npm** <10.9.3 — multiple issues. Fix disponible.

### Moderate
- **@babel/core** ≤7.29.0 — Arbitrary File Read via sourceMappingURL.
- **@vitest/mocker** 2.1.0 - 4.1.10 — Path Traversal. **Requiere vitest@5.0.0 (breaking change)**.
- **body-parser** 2.0.0 - 2.2.2 — DoS when invalid limit value.
- **next-auth** ^5.0.0-beta.32 — **Versión beta**. Monitorear releases estables.

### Dependencias en versión beta/inestable
- **next-auth** @5.0.0-beta.32 — Actualizar a versión estable cuando esté disponible.
- **bcryptjs** ^3.0.3 — Considerar migrar a `bcrypt` (binding nativo, más performante).

## Acciones recomendadas

1. **Inmediata**: `npm audit fix` para vulnerabilidades con fix no-breaking.
2. **Corto plazo**: Evaluar upgrade de vitest a v5 (breaking, requiere revisión de tests).
3. **Mediano plazo**: Migrar next-auth de beta a stable cuando Auth.js v5 sea GA.
4. **Continuo**: Integrar `npm audit` en CI (fallar build si hay vulnerabilidades High/Critical).

## Notas

- `pdfmake` y `xlsx` no tienen vulnerabilidades reportadas en este momento.
- `@tabler/icons-react` está actualizado (v3.42.0).
- `zustand` v5.0.15 es estable.
