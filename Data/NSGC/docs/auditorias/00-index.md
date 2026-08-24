# Índice de Auditorías

Esta carpeta centraliza los informes de auditoría del proyecto (seguridad, validación, testing, arquitectura). Cada chat de trabajo genera **un archivo por auditoría** con nombre:

```
auditoria - AAAA-MM-DD - <tema>.md
```

Ejemplo: `auditoria - 2026-08-23 - seguridad.md`

## Estructura obligatoria de cada informe

1. **Alcance** — qué se auditó (rutas, módulos, archivos).
2. **Hallazgos** — tabla con: ID, severidad (🔴 Alta / 🟡 Media / 🟢 Baja / ℹ️ Info), ubicación (`archivo:línea`), descripción.
3. **Acciones aplicadas en esta sesión** — qué se corrigió y dónde.
4. **Pendientes** — lo que NO se arregla ahora, con condición para abordarlo (ej. "al migrar a BD").
5. **Verificación** — comandos corridos (lint, typecheck, tests) y resultado.

## Reglas

- Un tema = un archivo. No mezclar seguridad con testing en el mismo informe.
- Los IDs de hallazgo son estables: `SEC-001`, `VAL-001`, `TST-001`, etc.
- Un hallazgo corregido se marca ✅ en la columna Estado; si reaparece, se reabre con sufijo `-R`.
- El consolidado vive aquí mismo: `consolidado - AAAA-MM-DD.md`.

## Informes registrados

| Fecha | Tema | Archivo |
|---|---|---|
| 2026-08-23 | seguridad | [auditoria - 2026-08-23 - seguridad.md](auditoria%20-%202026-08-23%20-%20seguridad.md) |
| 2026-08-23 | validación (Zod) | [auditoria - 2026-08-23 - validacion.md](auditoria%20-%202026-08-23%20-%20validacion.md) |
| 2026-08-24 | testing | [auditoria - 2026-08-24 - testing.md](auditoria%20-%202026-08-24%20-%20testing.md) — Setup Vitest apps/web, reglas de negocio del store (39 tests), hallazgos TST-001..TST-004 |
| 2026-08-24 | consolidado | [consolidado - 2026-08-24.md](consolidado%20-%202026-08-24.md) — Matriz única de 21 hallazgos SEC/VAL/TST, dependencias, roadmap en 4 fases (ahora/auth/BD/deploy), contradicciones resueltas y decisiones pendientes del owner *(superado por el consolidado -b del mismo día)* |
| 2026-08-24 | consolidado (post-sesiones 23–24) | [consolidado - 2026-08-24-b.md](consolidado%20-%202026-08-24-b.md) — Matriz re-verificada contra código tras Fase A completa y scaffold B/C: 14 resueltos, 3 parciales (SEC-005/006, TST-003-UI), VAL-007 cerrado por D5, SEC-010 abierto; verificación cruzada AU/SG↔código con discrepancias documentales resueltas; roadmap recalculado — resto B: B4 RTL+MSW; resto C: SG §1 + extras AU; Fase D íntegra SG §3. Sin decisiones nuevas del owner |
