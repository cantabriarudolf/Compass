## Context

`lib/authz.ts` es RBAC puro: `puede(rol, accion, recurso)` + `tienePermiso` + `matrizPermisos`. Los refinamientos ABAC están dispersos inline (store y páginas) sin modelo central. Ver proposal.md — Why.

## Goals / Non-Goals

**Goals:**
- Formalizar ABAC como función pura `puedeContextual(rol, accion, recurso, contexto)` en `lib/authz.ts` con paridad 1:1 testeada.
- Inventariar cada check inline real (archivo:línea + lógica actual) antes de codificar.
- Migrar checks inline a `puedeContextual` solo donde es seguro sin cambio observable.

**Non-Goals:**
- Cambiar decisiones de permiso (estrictamente behavior-preserving).
- UI nueva de matriz contextual (viene en P5 `rp-abac-matriz`).
- Persistencia o API: todo es puro en memoria.

## Decisions

**D1 — Firma `ContextoABAC` y regla `puedeContextual = puede() base + refinamiento`**
```ts
export interface ContextoABAC {
  personaId?: string;
  unidadId?: string;
  unidadIdsVinculadas?: string[];
  privacidad?: { residenteVeMorosidad?: boolean; residenteVeActas?: boolean; alertasResidentesActivas?: boolean }
}
export function puedeContextual(rol: string, accion: string, recurso: string, ctx: ContextoABAC): boolean
```
- Si `puede()` base es false → false (nunca amplía).
- Recursos con refinamiento: `mp:propios`, `pl:propia`, `pl` (exact), `ct:propio`/`ct:residencia`/`ct:al_dia`/`ct:propia`, `gd`/`gd:acta`, `mp:morosidad`, `ct:historial` (si aplica privacidad).
- Resto delega directo a `puede()`.

**D2 — Semántica por recurso (paridad con lógica actual):**
- `mp:propios` (`k0mp4ss_fe/apps/web/lib/authz.ts:35-36,40-41` base matriz): requiere `ctx.personaId` presente (identidad). Sin `personaId` → denegar. No compara target porque el store filtra por vínculo; ABAC solo exige autenticación propia (mismo que hoy: anónimo no edita).
- `pl:propia` (`lib/authz.ts:53-54` base; `lib/store.ts:3807` ficha laboral): requiere `ctx.personaId` presente. Sin ficha laboral real el flujo ya falla en store; ABAC no añade check de ficha (no puro), solo identidad. Paridad: conserje sin `personaId` no ve.
- `ct:propio` / `ct:residencia` (`lib/store.ts:4253` `vinculoVigente = vinculos.find(v=>v.personaId===personaId && v.unidadId===unidadId && !v.fechaFin)`; `app/comunidad/certificados/page.tsx:177` filtro unidades por vínculo): requiere `ctx.unidadId` ∈ `ctx.unidadIdsVinculadas`. Si falta cualquiera → false. Replica `generarCertificadoCT` residencia.
- `ct:al_dia` (`lib/store.ts:4272` `saldoPendienteTotal>0` bloquea; `app/comunidad/certificados/page.tsx:74` gate al día): ABAC solo exige vínculo (`unidadId` ∈ `unidadIdsVinculadas`); el saldo lo sigue decidiendo CT, no ABAC (no cambia decisión).
- `gd` / actas (`app/comunidad/directiva/page.tsx:73` `residenteAutorizado = controlesPropiedades.some(c=>c.residenteVeActas)` + filtro visibles): si rol normalizado es `residente` y recurso `gd`/`gd:*`, requiere `ctx.privacidad?.residenteVeActas === true`. Para no-residente, no refina.
- `mp:morosidad` / visibilidad FI morosidad (`app/admin/gestion/page.tsx:176` switch `residenteVeMorosidad`; `lib/store.ts:1327` not usado para morosidad sino alertas): si rol residente y recurso `mp:morosidad`/`fi:morosidad`/`ct:estado_cuenta` con privacidad, refinado por `residenteVeMorosidad`.
- `notify` residente silenciada (`lib/store.ts:1327` `if (control && !control.alertasResidentesActivas) return`): si recurso es notificación a residente (`ir:notify`/`pe:notify` semántico o `residente` + `alertas`), requiere `alertasResidentesActivas`. Modelado como refinamiento de `gd`/`pe:visita` no; se deja como ejemplo de privacidad que delega pero se documenta y no se migra si implica cambio de canal (ver migración).

Alternativa descartada: pasar `targetPersonaId`/`targetUnidadId` separados — añade complejidad y no existe hoy como parámetro de permiso; el vínculo ya está en `unidadIdsVinculadas` que el caller compone desde `store.vinculos`.

**D3 — Inventario previo obligatorio (fuente: lectura directa del repo, no el plan):**

| # | Recurso granular | Archivo:línea | Lógica actual |
|---|---|---|---|
| 1 | `mp:propios` | `k0mp4ss_fe/apps/web/lib/authz.ts:40-41` matriz `mp:propios` ver/editar para `comite`/`conserjeria`/`residente`/`mantencion`; uso UI `app/comunidad/personas/[id]/page.tsx:80` filtra `vinculosStore.filter(v=>v.personaId===id)` y edición propia sin check central | RBAC base concede; sin check adicional de `personaId` vs target (UI solo muestra propios). Migrable como `personaId` requerido. |
| 2 | `pl:propia` | `lib/authz.ts:53-54` `pl:propia` ver conserjeria; `lib/store.ts:3807` `saveAdelantoPL` exige `trabajador.datosLaborales`; `app/finanzas/remuneraciones/page.tsx:129` filtra `adelantosPL.filter(a=>a.trabajadorPersonaId===trabajadorSel.id)` | RBAC + filtro por `trabajadorPersonaId` == `personaId` implícito en UI. ABAC refinará con `personaId` presente. |
| 3 | `ct:propio` / `ct:residencia` | `lib/store.ts:4253` `vinculoVigente` en `generarCertificadoCT tipo residencia`; `app/comunidad/certificados/page.tsx:177` `unidades.filter(... vinculos.some(v=>personaId===... && unidadId===...))` | Exige vínculo vigente persona-unidad. ABAC: `unidadId` ∈ `unidadIdsVinculadas`. |
| 4 | `ct:al_dia` | `lib/store.ts:4272` `saldoPendienteTotal>0` bloquea al_dia; `app/comunidad/certificados/page.tsx:74` `gateAlDia = saldoUnidad(unidadId)` | Exige unidad vinculada + saldo cero (segundo check queda en store). ABAC solo vinculación. |
| 5 | `residenteVeActas` (GD) | `app/comunidad/directiva/page.tsx:73` `residenteAutorizado = controlesPropiedades.some(c=>c.residenteVeActas)`; `page.tsx:75-77` `visibles = ... residenteAutorizado` | Residente solo ve actas publicadas si algún control autoriza. ABAC: `privacidad.residenteVeActas`. |
| 6 | `residenteVeMorosidad` (FI) | `app/admin/gestion/page.tsx:176` switch `residenteVeMorosidad`; `lib/schemas.ts:282` flag en `ControlPropiedad` | Control de visibilidad morosidad FI para residente (filtrado UI pendiente de migración). ABAC: `privacidad.residenteVeMorosidad`. |
| 7 | `alertasResidentesActivas` | `lib/store.ts:1327-1328` `notify()`: `if (notificacion.destinatarioRol==="residente" && unidadId) { control=find(...); if(control && !control.alertasResidentesActivas) return }` | Silencia notificaciones operativas a residente si propietario desactivó. ABAC: `privacidad.alertasResidentesActivas`. |
| 8 | `pe:propio` / visita propia (no pedido pero existe) | `lib/store.ts:127`-derivado `vinculos` para reservas; `app/comunidad/directiva/page.tsx` no; pero `app/comunidad/certificados` ya cubre | Sin migración adicional; documentado como no granular en matriz. |

**D4 — Migración segura:**
- Migrar `app/comunidad/directiva/page.tsx:73` a `puedeContextual("residente","ver","gd", {privacidad})` envolviendo `residenteAutorizado`.
- Envolver `lib/store.ts:1327` con helper interno `puedeNotificarResidente` que use `puedeContextual` (si es puro y sin side-effect extra, se reemplaza; si requiere lectura de `controlesPropiedades` dentro del store, se deja inline y se anota como no migrable por acoplo a estado).
- No migrar `generarCertificadoCT` validaciones de FK/saldo/folio (no son de permiso, son de integridad); solo añadir check ABAC previo como guarda adicional sin cambiar error message (paridad: si ABAC deniega, retorna mismo error que hoy para no romper tests).
- Si un check resulta no migrable sin cambio de mensaje/error o sin contexto disponible (client-side sin sesión mapeada a `personaId`), NO migrar y anotar en Bitácora.

## Risks / Trade-offs

- [Riesgo: refinamiento excesivo deniega de más] → Mitigación: paridad 1:1 con 12+ asserts que replican casos antiguos; si test existente falla, revertir refinamiento.
- [Riesgo: contexto incompleto en UI client-side (sin personaId)] → Mitigación: UI pasa `personaId` desde `store.personas[0]` mock o deja check inline; anotar pendiente heredado.
- [Riesgo: `unidadIdsVinculadas` desincronizado] → Caller compone desde `store.vinculos.filter(v=>personaId===...&&!v.fechaFin).map(v=>unidadId)` — misma fuente que lógica antigua.
- Trade-off: `puedeContextual` es pura y no lee store; caller debe hidratar `ContextoABAC` — más verboso pero testeable.

## Migration Plan

1. Implementar `ContextoABAC` + `puedeContextual` en `lib/authz.ts` (delegación + refinamientos listados).
2. Añadir suites `puedeContextual` en `lib/authz.test.ts` (o `puede-contextual.test.ts`) con ≥12 asserts.
3. Migrar puntualmente `directiva/page.tsx` y, si seguro, `store.ts:1327` notify; verificar que tests existentes siguen verdes.
4. Validar `tsc --noEmit`, `lint`, `vitest run`, `openspec validate --all`, `playwright test e2e/crud/permisos.spec.ts`.
5. Si algún check no migrable, dejar inline y documentar en Bitácora P4.

## Open Questions

- Ninguna bloqueante: la especificación de privacidad para `fi:morosidad` vs `mp:morosidad` se resuelve en implementación (ambos refinan igual).
