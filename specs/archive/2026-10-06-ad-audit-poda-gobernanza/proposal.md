# Proposal: Hacer efectiva y auditada la poda de gobernanza en las rutas de la API

Follow-up #1 del ROADMAP, nacido del avance `Data/NSGC/docs/avances/avance - 2026-10-06 19-35.md`
(divergencia encontrada al cerrar `gd-ficha-gobernanza`).

## Problema

El evento de auditoría `AD_DIRECTIVA_DESVINCULADA` documenta la poda de `datosGobernanza`
cuando una persona pierde el rol `directiva`. La regla de coherencia rol↔ficha está
implementada en tres sitios, pero en la práctica **el camino que usa la UI no poda ni audita**.

### Defecto 1 — la poda no se auditaba (corregido en la primera pasada)

El helper compartido `validarYLimpiarPersona` (`app/api/personas/route.ts`) sí borraba la ficha
del payload de validación, pero **nadie emitía el evento** en las rutas de API que usa la UI:
solo lo hacía `lib/store.ts:1331-1340` (`savePersona`), marcado `@deprecated` y sin uso desde el
perfil. La primera pasada agregó `auditarPodaGobernanza` (`app/api/personas/route.ts:246-272`) y
la llamó desde el PUT después de la escritura. Esa parte queda **implementada y verificada**;
este documento no la reabre.

### Defecto 2 (alcance de este ajuste) — la poda no se **persiste** cuando el payload omite la ficha

El helper borra `datosGobernanza` **solo del objeto de validación** (`mergeado`), que el PUT no
persiste; la escritura usa `limpiarPayloadPersona(parcial.data)` (`app/api/personas/[id]/route.ts:104`).
Si el payload **no trae** la clave `datosGobernanza`, Prisma no toca la columna y la ficha vieja
sobrevive. El epílogo del PUT solo actuaba `if ("datosGobernanza" in datos)`, así que un PUT sin la
clave nunca forzaba `null`, y `auditarPodaGobernanza` —que exige que la fila persistida ya no tenga
ficha— tampoco emitía. Neto: **ficha fantasma, sin poda y sin auditoría**.

Evidencia empírica (diagnóstico throwaway sobre la BD de test + tests RED de este change):

- `PUT {roles: […sin directiva]}` **sin** la clave `datosGobernanza` → la ficha **sobrevive**
  (y no hay `AD_DIRECTIVA_DESVINCULADA`).
- `POST` con ficha y sin rol `directiva` sobre una fila **existente** (upsert-update) → la ficha
  **sobrevive**. En el alta (fila nueva) el helper sí descarta la ficha entrante, así que no hay
  fantasma: el agujero del POST es solo la rama `update` del upsert.
- Solo el `PUT` que **portaba** la ficha llegaba a podar (vía el epílogo).

Y ese PUT sin la clave es **exactamente el camino real de la UI**:
`components/comunidad/formulario-persona.tsx:106-111` → `app/comunidad/personas/page.tsx:220`
(`update(id, data)`) → `PUT /api/personas/[id]` sin `datosGobernanza`.
(`FormularioGobernanza` siempre re-agrega `directiva`, `formulario-gobernanza.tsx:55-59`, así que
no es el camino de remoción.)

**Consecuencia**: quien quita el rol `directiva` desde el formulario de persona deja una ficha
fantasma que sigue contando para el quórum y no queda auditada. La spec viva
`AD Directiva y Firma Digitalizada` —escenario `Ficha sin rol directiva se depura y audita`—
afirma lo contrario.

## Por qué ahora

Es un gap de **auditoría y de integridad de datos**, no cosmético: el proyecto tiene contexto
legal (Ley 21.442 — trazabilidad de la composición de la directiva vigente y de quién firmó qué)
y una ficha fantasma altera el quórum. Es chico y self-contained: dos rutas + tests.

## Propuesta

Regla única a garantizar en las rutas: **si la fila persistida tiene ficha de gobernanza y los
roles resultantes no incluyen `directiva`, la columna se fija en `null`, y esa poda efectiva se
audita**.

1. **PUT** (`app/api/personas/[id]/route.ts`): decidir la poda contra la fila **persistida**
   (`existente`, ya leída en `:96`) y/o la ficha entrante —no contra la presencia de la clave en
   el payload— y fijar `datosGobernanza = null` en la misma escritura.
2. **POST** (`app/api/personas/route.ts`): mismo criterio en el upsert. En el alta el helper ya
   depura la ficha entrante; en la rama `update` sobre una fila con ficha hay que forzar `null`.
3. **Auditoría**: reutilizar `auditarPodaGobernanza(scope, anterior, actual)` **después** de la
   escritura, con `anterior` = fila previa y `actual` = fila persistida. Emite a lo sumo un evento
   por request y solo si la poda quedó persistida. En el alta no emite (no había ficha previa que
   desvincular).
4. Persistencia con el patrón server-side ya establecido `prisma.eventoAuditoria.create({ id,
   comunidadId, timestamp, usuario, categoria, tipoAccion, referenciaId, descripcion })`:
   `categoria` `AD`, `tipoAccion` `AD_DIRECTIVA_DESVINCULADA`, `referenciaId` = id de la persona,
   `comunidadId` tomado del scope de la ruta.
5. Actualizar las specs vivas (deltas `AM-auditoria-metricas` y `AD-gestion-administrativa`) para
   que afirmen la verdad: la depuración y su emisión ocurren en **todos** los caminos de escritura
   de la API que la UI usa, decididas contra la fila persistida.

## Decisión de diseño (con evidencia)

- `registrarEvento` (`lib/store.ts:237-244`) es **client-only**: recibe el `set` de zustand y muta
  el store en memoria. **No es importable ni invocable desde una ruta de API.**
- Por eso el fix usa el patrón server-side existente `prisma.eventoAuditoria.create(...)`, ya
  establecido en `app/api/mis-datos/route.ts:44-62`, `app/api/liquidaciones/[id]/confirmar/route.ts:121`
  y `app/api/leads-portal/route.ts:112`. Los campos del evento están en `lib/schemas.ts:1793-1801`
  (`EventoAuditoriaSchema`); el `comunidadId` y la relación multi-tenant vienen del modelo Prisma
  `EventoAuditoria` (`prisma/schema.prisma:256-271`).
- **De dónde sale `comunidadId`** (no se hardcodea): ambas rutas ya operan dentro de
  `withComunidadScope()`, y `scope.comunidadId` es el mismo valor que las rutas ya usan para el 404
  cross-comunidad y para la escritura.
- **Por qué se decide contra la fila persistida**: Prisma omite las columnas ausentes del `data`;
  por eso el default de "no enviada ⇒ no tocar" (correcto para un PUT parcial) es justo lo que
  dejaba viva la ficha fantasma. La condición `existente.datosGobernanza != null || datos.datosGobernanza != null`
  preserva ese contrato (no se toca la columna si no había ni llega ficha) y garantiza la poda
  cuando corresponde.
- El emit del store legacy (`lib/store.ts:1331-1340`) **se deja intacto**: mantiene verdes sus
  tests y no molesta.

## Alcance

- `app/api/personas/route.ts` — decisión de poda en el POST (rama upsert-update) + auditoría.
- `app/api/personas/[id]/route.ts` — decisión de poda anclada a la fila persistida + auditoría.
- `test/api/personas.test.ts` — tests RED→GREEN (test-first) del camino real y del POST.
- Artefactos de este change en `openspec/changes/ad-audit-poda-gobernanza/`.

## No-objetivos

- **Ningún refactor de centralización** de la regla de coherencia rol↔ficha.
- **No se toca `lib/store.ts`**: ni el camino legacy `savePersona` (`:1331-1340`) ni el trigger de
  rotación de período (`lib/store.ts:2499-2501`, semántica distinta y ya archivado).
- **Sin cambios de UI**: diálogo de gobernanza, perfil y hooks quedan igual.
- **Sin rechazo 400 por payload incoherente** (ver `Decisiones` en `tasks.md`): la poda es una
  depuración silenciosa, espejo del store legacy; `datosGobernanza: null` no es client-sendable
  (`lib/schemas.ts:541` es `.optional()`, no nullable), así que los payloads `null` quedan fuera.
- Sin cambios de schema Prisma ni de `STORE_VERSION`.
- Sin cambios en quórum, firmas ni flujo de aprobación de actas.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un mismo PUT que quita el rol **y** envía `datosGobernanza` podría emitir dos eventos | La emisión vive solo después de la escritura (`auditarPodaGobernanza`); el test cuenta exactamente un evento |
| Poda accidental de una ficha por un PUT parcial que no toca roles | La decisión usa los roles **mergeados** (`validado.datos.roles`), que traen los de la fila si el payload no los envía; caso triangulado con test |
| Evento con `comunidadId` incorrecto o ausente (multi-tenant) | `comunidadId` sale de `scope`, no hardcodeado; el test lo compara con la comunidad del actor |
| La auditoría bloquea el guardado | `auditarPodaGobernanza` traga sus errores (patrón `mis-datos`): registra sin alterar la respuesta |
