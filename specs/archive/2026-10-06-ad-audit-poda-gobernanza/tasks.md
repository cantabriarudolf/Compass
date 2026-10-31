# Tasks: ad-audit-poda-gobernanza

Estado (2026-10-06): en apply, sin archivar. Primera pasada (T1–T5) implementada y verificada
para el PUT que porta la ficha. Segunda pasada (T7) cierra el defecto de persistencia del camino
real (PUT/POST que **omiten** `datosGobernanza`). T6 (NSGC/commit/archive) lo ejecuta el
orquestador.

Comandos de test/compilación: `workdir` = `k0mp4ss_fe/apps/web`; los de openspec, desde la raíz
del repo.

## T1 — Propose
- [x] 1.1 `proposal.md` (problema, diseño con evidencia, no-objetivos) y deltas MODIFIED de
      `AM-auditoria-metricas` y `AD-gestion-administrativa`, cada uno arrastrando **todos** los
      escenarios vivos de su requirement.
- [x] 1.2 Gate de deltas: `node openspec/scripts/check-delta-coverage.mjs ad-audit-poda-gobernanza`
      (2 ok: AD 6/6, AM 2/2) y `openspec validate ad-audit-poda-gobernanza --type change`
      (válido).

## T2 — RED (test-first)
- [x] 2.1 Agregar a `test/api/personas.test.ts` el caso "PUT que quita el rol directiva poda la
      ficha y audita AD_DIRECTIVA_DESVINCULADA": persona con `roles: ["directiva"]` y
      `datosGobernanza` persistida; `PUT /api/personas/<id>` con `roles` sin `directiva`.
      Asserts: (a) la fila queda sin `datosGobernanza`; (b) existe un `eventoAuditoria` con
      `tipoAccion = "AD_DIRECTIVA_DESVINCULADA"`, `categoria = "AD"`, `referenciaId = <id>` y
      `comunidadId = <comunidad del actor>`.
- [x] 2.2 ROJO observado y pegado: `npx vitest run test/api/personas.test.ts` (assert (b) falló).

## T3 — GREEN (forma final, distinta a la propuesta original)
- [x] 3.1 Emisión centralizada en el helper exportado `auditarPodaGobernanza`
      (`app/api/personas/route.ts:246-272`), que persiste con `prisma.eventoAuditoria.create`
      usando `comunidadId`/`usuario` del `scope` y traga sus propios errores. Se descartó emitir
      desde `validarYLimpiarPersona`: ese helper no conoce la fila persistida y habría emitido
      podas no persistidas.
- [x] 3.2 Llamada **después** de `prisma.persona.update` (`app/api/personas/[id]/route.ts`), con
      `anterior` = fila previa y `actual` = fila persistida, diff-gated: una request emite a lo
      sumo un evento y solo si la poda quedó persistida.
- [x] 3.3 `npx vitest run test/api/personas.test.ts` verde (16/16).

## T4 — TRIANGULATE
- [x] 4.1 Caso alterno: un guardado que **conserva** el rol `directiva` no emite
      `AD_DIRECTIVA_DESVINCULADA` (test T4.1 + "PUT sin `roles` en el payload…").
- [x] 4.2 Caso negativo: el evento de la poda queda con `comunidadId` de la comunidad del actor
      (aislamiento multi-tenant; assert en el test del camino real).
- [x] 4.3 Caso de conteo: una sola poda deja exactamente un evento (sin doble emisión) — testeado
      tanto en el PUT que porta la ficha como en el que la omite.

## T5 — Gate
- [x] 5.1 `npx vitest run test/api/personas.test.ts` → 16/16 verde.
- [x] 5.2 `npx vitest run` → 90 files / 867 tests verde (baseline 863 + 4 nuevos).
- [x] 5.3 `npx tsc --noEmit` → 0 errores.
- [x] 5.4 `npx eslint .` → 0 errores (warnings preexistentes).
- [x] 5.5 `node openspec/scripts/check-delta-coverage.mjs ad-audit-poda-gobernanza` → exit 0.
- [x] 5.6 `openspec validate ad-audit-poda-gobernanza --type change` → válido.

## T6 — Cierre (NSGC + commit + archive) — orquestador
- [ ] 6.1 NSGC: avance en `Data/NSGC/docs/avances/` (+ manual del módulo si el skill `nsgc-prepush`
      lo pide).
- [ ] 6.2 Commit convencional en español (solo archivos de este change) + push.
- [ ] 6.3 Archive: `openspec archive ad-audit-poda-gobernanza -y` y `openspec validate --all`.

## T7 — Segunda pasada: poda efectiva contra la fila persistida
- [x] 7.1 Extender `proposal.md` con el defecto 2 (evidencia empírica) y afinar los deltas para
      que la poda se decida contra el estado persistido. Gate de deltas re-verificado.
- [x] 7.2 RED: test del **camino real de la UI** — persona con `directiva` + ficha, `PUT` con
      `roles` sin `directiva` y **sin** la clave `datosGobernanza` → assert ficha `null` y
      exactamente un evento. Rojo observado (la ficha sobrevivía).
- [x] 7.3 GREEN PUT: la poda se decide contra `existente.datosGobernanza` (fila leída en
      `app/api/personas/[id]/route.ts:96`) y/o la ficha entrante, con los roles mergeados; sin
      tocar la columna si no había ni llega ficha. Reutiliza `auditarPodaGobernanza` una vez.
- [x] 7.4 POST: decisión tomada — **depuración silenciosa** (ver `Decisiones`). El alta ya la
      aplicaba vía `validarYLimpiarPersona`; se cerró la rama `update` del upsert forzando
      `datosGobernanza = null` cuando la fila persistida tenía ficha, más la auditoría
      post-escritura. Test agregado (alta y upsert) y verde.
- [x] 7.5 TRIANGULATE: se preservaron los negativos (conservar `directiva` → sin poda ni evento;
      PUT sin cambios de rol → ficha intacta) y se agregó el caso "rol conservado sin enviar
      `roles`, ficha enviada → se persiste, sin evento".

## Decisiones

- **Poda POST: silenciosa, no 400.** Es la regla del store legacy (`savePersona` fija
  `datosGobernanza = undefined` y registra el evento, sin error de validación) y el texto del
  delta ("la ficha SHALL depurarse") describe depuración, no rechazo. Rechazar con `400`
  rompería el espejo store↔API y el contrato del formulario de persona (que no conoce la ficha).
  El helper ya descarta la ficha entrante sin rol `directiva`; la rama `update` del upsert ahora
  fija `null` explícito.
- `datosGobernanza: null` no es client-sendable (`lib/schemas.ts:541` es `.optional()`, no
  nullable): los payloads `null` quedan fuera de alcance.
