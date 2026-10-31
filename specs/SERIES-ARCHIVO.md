# Series de ventanas — archivo

Índice de las series de ventanas de este proyecto. El trabajo multi-ventana se lleva ahora en la
bitácora de la feature ODD, con espejo en Engram. Las carpetas `openspec/SERIE-*/` y los roadmaps
planos son material histórico: el detalle por ventana se consulta en los commits que citan cada
serie (`git log --grep=<serie>`).

| Serie | Propósito | Estado final | Commits que la citan |
|---|---|---|---|
| `SERIE-NSGC` | Implementar los 16 módulos NSGC 1:1 con manuales, mocks y trazabilidad | completa 9/9 (`c0d2690`) | 0 |
| `SERIE-PLATAFORMA` | Testing UI, Prisma multi-tenant, Auth.js, hardening pre-deploy | completa P1–P8 (`205668e`) | 10 |
| `SERIE-BD-FUENTE-VERDAD` | Migrar la persistencia de localStorage a la base vía API REST | completa; fases 5A/5B (`0164873`) | 3 |
| `SERIE-UI-MIGRACION-BD` | Migrar las páginas de `useCompassStore` a los hooks SWR | completa | 1 |
| `SERIE-QA-LAB` | Corregir los 27 hallazgos del Laboratorio QA y dejarlo verde | completa 3/3 | 0 |
| `SERIE-CRUD-E2E` | Cubrir el CRUD interactivo de los 16 módulos con specs Playwright | completa P1–P6 | 0 |
| `SERIE-E2E-FULL-VERDE` | Dejar la suite e2e completa en verde | parcial (P4) | 2 |
| `SERIE-E2E-SIN-GATED` | Quitar el tag GATED y sus scripts del CI | completa | 2 |
| `SERIE-GATED-API-BD` | Independizar los specs GATED del QA-Lab usando la API | parcial (P5) | 1 |
| `SERIE-VALIDACION-PERFILES` | Validar la matriz de perfiles y los 403 por rol | parcial (P3, 2026-09-27) | 4 |
| `SERIE-CUENTAS` | Cerrar la violación del spec de cuentas por caso de uso | completa (2026-09-02) | 5 |
| `SERIE-PUNTO-CERO` | Cargar los datos reales de ingresos/egresos 2023-2024 | completa (2026-09-02) | 2 |
| `SERIE-MENU-100` | Cerrar el 100% de las rutas del menú marcadas incompletas | completa | 13 |
| `SERIE-FRONTERA` | Ejecutar la frontera «futuro» del BACKLOG-100 | completa 6/6, C3 en pausa | 5 |
| `SERIE-REVISION` | Revisión integral de tests, cobertura y documentación | completa | 1 |
| `SERIE-ROJOS-CRUD` | Bajar los rojos de las lanes CRUD | completa | 1 |
| `SERIE-PRODUCCION` | Llevar el producto a infraestructura mínima viable | completa 6/6 | 18 |
| `SERIE-PRODUCCION-FASE2` | Llevar el producto a seguro y compliant | completa 6/6 | 8 |
| `SERIE-PG-FASE3` | CI contra PostgreSQL y deploy con migración previa | completa 2/2 | 2 |
| `SERIE-NOCHE-2` | Deuda viva del store en una corrida nocturna | completa P1–P5 | 11 |
| `SERIE-NOCHE-3` | Limpieza, split y cobertura del store legacy | completa 9/9 | 3 |
| `SERIE-FASE2` | Resto de la deuda del store legacy en modo nocturno autónomo | completa 7/7 (2026-10-22) | 4 |
| `SERIE-DEUDA-1` | Cerrar la deuda viva post-noche-3 | completa P1–P7 | 2 |
| `SERIE-DEUDA-2` | Saldar la deuda viva post-deuda-1 | completa D1–D7 | 2 |
| `SERIE-DEUDA-3` | Cerrar la deuda residual post-deuda-2 | completa 5/5 (2026-10-19) | 2 |
| `SERIE-DEUDA-4` | Desbloquear el merge final del PR #3 | completa | 2 |
| `SERIE-DEUDA-5` | Integrar noche-2 y dejar el repositorio limpio | completa 2/2 | 2 |
| `SERIE-DEUDA-6` | Store legacy en la UI, fase 1: lectura y cableado de hooks | completa | 2 |

Retiradas en este trabajo: 19 carpetas `openspec/SERIE-*/` y los roadmaps planos
`SERIE-NSGC.md` / `SERIE-PLATAFORMA.md`. Quedan siete carpetas porque están citadas por ruta
desde documentación viva, y no pueden retirarse hasta que esas citas se actualicen: `BACKLOG-100.md` (`SERIE-FRONTERA`, `SERIE-NOCHE-2`,
`SERIE-NOCHE-3`, `SERIE-PRODUCCION-FASE2`, `SERIE-BD-FUENTE-VERDAD`, `SERIE-QA-LAB`),
`openspec/changes/archive/**` (`SERIE-CUENTAS`, `SERIE-FRONTERA`, `SERIE-BD-FUENTE-VERDAD`) y
`Data/NSGC/docs/manuales|especificaciones` (`SERIE-PRODUCCION-FASE2`, `SERIE-BD-FUENTE-VERDAD`).
