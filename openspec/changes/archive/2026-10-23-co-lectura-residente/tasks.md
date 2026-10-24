# Tasks: co-lectura-residente

Cada tarea cierra con su commit (Conventional Commits, español) y sus tests junto al
comportamiento. TDD: se observa RED antes de implementar.

## Specs

- **S1** — La vista de `/comunidad/comunicacion` se deriva del rol de la sesión; no existe selector de vista en el cliente.
- **S2** — `GET /api/co/envios` y `GET /api/co/envios/[id]` filtran por destinatario para el residente y omiten `destinatarios[]`, `lecturas[]` y totales; el comité recibe solo agregados.
- **S3** — Un residente que pide un envío ajeno recibe 404, indistinguible de «no existe».
- **S4** — El desglose nominativo de lecturas responde solo al rol administrador, emite `CO_LECTURA_CONSULTADA` y no tiene exportación.
- **S5** — La matriz declara `co` (difusión), `co:buzon` y `co:lecturas`: el residente escribe por el buzón y no emite difusiones.
- **S6** — Abrir una comunicación en la bandeja registra la lectura del destinatario, idempotente y sin perder lecturas concurrentes.
- **S7** — La bandeja muestra los tres textos informativos de tratamiento de datos del dictamen, literales.
- **S8** — `EnvioDestinatarioCO` es la única fuente de pertenencia y lectura; el backfill desde las columnas JSON es idempotente y está en los dos schemas (Postgres y SQLite).
- **S9** — El badge «X/Y leídos» del administrador sale de las lecturas reales y declara que es un dato de recepción del canal, no una notificación legal.
- **S10** — El buzón ciudadano respeta la pertenencia y `visibilidadComite`: el residente solo recibe sus propios reportes, el comité solo los visibles, y el reportante se toma de la sesión, nunca del cuerpo del pedido.

## Tasks

- [x] 1.1 — Migración `EnvioDestinatarioCO` en `schema.prisma` y `schema.sqlite.prisma` + backfill SQL idempotente desde `destinatarios`/`lecturas` + test de conteo · Specs S8 · commit `feat(co): modelo relacional de destinatarios y lecturas`
- [x] 1.2 — Matriz de permisos: `co`, `co:buzon`, `co:lecturas`; `mensajes-buzon` usa `co:buzon`; tests de matriz (rojo primero: residente con `crear` en `co`) · Specs S5 · commit `feat(co): separa difusión de buzón en la matriz de permisos`
- [x] 1.3 — `GET /api/co/envios` y `/[id]`: filtro por pertenencia y proyección por rol; 404 indistinguible; **y el buzón ciudadano**: colección y `[id]` sobre `co:buzon`, residente solo sus propios reportes, comité solo `visibilidadComite`, `reportantePersonaId` derivado de la sesión. Tests de API con BD real · Specs S2, S3, S10 · commit `feat(co): el residente solo recibe sus comunicaciones`
- [x] 1.4 — `POST /api/co/envios/[id]/leer` sobre la tabla (update condicional, idempotente) + test de concurrencia con dos lecturas simultáneas · Specs S6, S8 · commit `fix(co): la lectura se registra sin perder lecturas concurrentes`
- [x] 1.5 — `GET /api/co/envios/[id]/lecturas` admin-only + evento `CO_LECTURA_CONSULTADA` + tests de 403/200/evento · Specs S4 · commit `feat(co): desglose nominativo de lecturas auditado`
- [x] 1.6 — `lib/api/use-co.ts`: hook de lectura y de desglose; el alta de envíos escribe tabla + snapshot en `$transaction` · Specs S6, S8 · commit `feat(co): hooks de lectura y desglose`
- [x] 1.7 — `app/comunidad/comunicacion/page.tsx`: elimina el selector `vista`, deriva el rol de la sesión y extrae `components/co/bandeja-residente.tsx` con los textos de S7 · Specs S1, S7 · commit `feat(co): bandeja del residente derivada del rol`
- [x] 1.8 — Badge «X/Y leídos» desde lecturas reales + texto de S9 · Specs S9 · commit `feat(co): el badge de lecturas mide lecturas reales`
- [x] 1.9 — e2e: el residente abre una comunicación y el admin ve 1/N; el residente no ve la consola del admin · Specs S1, S2, S6 · commit `test(co): e2e de lectura del residente`
- [x] 1.10 — Gates: `tsc --noEmit`, `npm run lint`, `npm test`, lane e2e, `npm run audit:desvios`, `openspec validate --all`, `check-delta-coverage co-lectura-residente` · orquestador · commit `chore(co): gates del change`
- [x] 1.11 — Verificación independiente (`gentle-ai-verify`) sobre el diff: alto riesgo por autorización y migración · orquestador
- [x] 1.12 — Docs: manual CO + avance NSGC, `PENDIENTES-FUNCIONALIDAD` F1 → Hecho, `BACKLOG-100` · orquestador · commit `docs(openspec): F1 cerrada y deuda actualizada`

## Orden y dependencias

1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7 → 1.8 → 1.9 → 1.10 → 1.11 → 1.12.

1.2 y 1.3 pueden ir en paralelo solo con superficies de edición disjuntas (`lib/authz*` vs
`app/api/co/**`); si se solapan, secuencial.

## Preguntas abiertas para el owner (no bloquean)

1. Plazo de conservación (TTL) de comunicaciones y registros de lectura: el reglamento de
   la Ley 21.442 no está verificado, así que no se fija un número en este change.
2. ¿El comité debe ver el desglose nominativo o solo el administrador? El diseño lo deja
   en administrador; ampliarlo es un cambio de una línea en la matriz.
3. ¿El responsable del tratamiento es la comunidad, el comité o el administrador externo
   en cada cliente? Define el canal ARCO del texto informativo.
