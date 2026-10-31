# Tasks: metricas-reales-backup-descarga

Unidades tomadas de `openspec/PENDIENTES-FUNCIONALIDAD.md` (F2 y F3), ambas con decisión del
owner ya registrada. TDD donde hay lógica pura; en el endpoint, los tests de seguridad
existentes manda.

## Specs

- **S1** — La variación tarifaria de `/admin/metricas` sale de las emisiones; sin dos periodos comparables no se muestra número.
- **S2** — `POST /api/backup` conserva todas sus guardas (404 producción, 401, 403 con `RP_PERMISSION_DENIED`, 413, 400) y devuelve el respaldo como adjunto.
- **S3** — El nombre del archivo lo fecha el servidor; el cliente solo aporta el prefijo semántico, y uno inválido cae al de por defecto.
- **S4** — El endpoint no escribe nada en el disco del servidor.
- **S5** — Las tres pantallas de respaldo descargan desde la respuesta de la API y no prometen una copia en el repo.
- **S6** — `DEV-qa-lab` §Backups JSON auditables describe el comportamiento nuevo, conservando el nombre del requirement y del escenario.

## Tasks

- [x] 1.1 — `lib/metricas-utils.ts` con `variacionTarifaria()` y sus 6 casos de test (RED → GREEN) · S1 · commit `fix(am): la variación tarifaria sale de las emisiones, no del código` (`076c3f1`)
- [x] 1.2 — `/admin/metricas` consume `useEmisionesGC`, pinta `—` sin datos comparables y declara el motivo · S1 · mismo commit
- [x] 1.3 — `POST /api/backup` sin `writeFileSync`; adjunto con `Content-Disposition` fechado por el servidor y `Cache-Control: no-store` · S2, S3, S4 · commit `fix(sg): el respaldo baja como descarga fechada, sin escribir en disco` (`fdfbc37`)
- [x] 1.4 — Retiro de `lib/backup.ts` (único consumidor: el endpoint) · S4 · mismo commit
- [x] 1.5 — Test nuevo del contrato: 200 attachment fechado, cuerpo byte a byte, cero archivos nuevos en `Data/NSGC/backups/` · S2, S3, S4 · mismo commit
- [x] 1.6 — Prefijo semántico del cliente (`compass-seed-report` para el comprobante del QA-Lab) con fecha del servidor y fallback ante prefijo inválido · S3 · mismo commit
- [x] 1.7 — Las tres pantallas descargan desde la API; se elimina el checkbox «Guardar copia en Data/NSGC/backups/» y el texto de la ruta del servidor · S5 · commit `feat(dev): las pantallas descargan el respaldo desde la API` (`261abce`)
- [x] 1.8 — Delta de `DEV-qa-lab` §Backups JSON auditables · S6 · mismo commit que estas tareas
- [x] 1.9 — Guarda del `new URL(request.url)` en la resolución de `comunidadId` (una request malformada devolvía 500 en vez de seguir su flujo) · S2 · commit del endurecimiento
- [ ] 1.10 — Gates completos: `npm test`, `tsc --noEmit`, `npm run lint`, `npm run audit:desvios`, `openspec validate --all`, `check-delta-coverage metricas-reales-backup-descarga`
- [ ] 1.11 — Docs: avance NSGC, manual `SG - Hardening y Despliegue.md`, y pasar F2/F3 a Hecho en `PENDIENTES-FUNCIONALIDAD.md` (ese archivo vive hoy en la rama del PR #11: el pase se hace al mergearlo)

## Preguntas abiertas para el owner (no bloquean)

1. El respaldo actual lo arma el cliente desde el store legacy. Con la fuente de verdad en BD,
   lo correcto sería que el servidor vuelque el estado real (como hace `backup:db`). Queda para
   un change propio: acá solo se arregló que lo que baja sea real y fechado.
2. ¿El QA-Lab y el dev-dashboard sobreviven a producción? Si se retiran (F9), el prefijo
   `compass-seed-report` desaparece con ellos y el endpoint queda con un solo consumidor.
