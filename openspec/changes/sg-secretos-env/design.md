# Design: sg-secretos-env — C2-final secretos fuera del store

## Context
Ver `proposal.md` — Why. El store está en `STORE_VERSION 25` (`k0mp4ss_fe/apps/web/lib/store.ts:300`) con `persist` sobre `localStorage` key `compass-store`. `ConfiguracionGlobalSchema` define `smtpPassword: z.string()` y `claveEliminacionMaestro: z.string()` y se sanea via `partialize` vaciando valores (`smtpPassword: "", claveEliminacionMaestro: ""`) como medida SEC-005 temporal. `data/admin/configuracion.ts:27,46,63,81` tipa y siembra esos campos (seed con `""`). La UI `app/admin/configuracion/page.tsx:133,190` renderiza dos `<Input type="password" required>` enlazados a `config.smtpPassword` / `config.claveEliminacionMaestro`. Consolidado `2026-08-24-b` §1 exige C2-final: cliente SHALL NOT conocer secretos; vivirán en env servidor. El migrate patrón v8 (`estacionamientos` legacy, `k0mp4ss_fe/apps/web/lib/store.ts:4675`) hace `delete` de keys legacy sin re-sembrar ni romper resto. SEC-005 y VAL-007/D5 obligan store repository + bump version + test por cambio de esquema.

## Goals / Non-Goals
**Goals:**
- Eliminar `smtpPassword` y `claveEliminacionMaestro` del contrato cliente (schema Zod + interfaz TS + seed) y del persistido via migrate v26.
- Simplificar `partialize` para no referenciar campos inexistentes.
- UI informativa sin inputs editables y `.env.example` documentado.
- Test regresión con persistido v25 real que contenga secretos.

**Non-Goals:**
- No implementar lectura de env en runtime servidor (queda para fase server/fase D o P5 Auth layer); solo documentar vars.
- No tocar `prisma/schema.prisma` para secretos (ConfiguracionGlobal en BD seguirá sin esos campos; el owner gestionará via env).
- No migrar infraestructura SMTP real.

## Decisions
- **Eliminar campos del schema**: quitar `smtpPassword` y `claveEliminacionMaestro` de `ConfiguracionGlobalSchema` (`lib/schemas.ts:1175-1197`). Alternativa de mantenerlos opcionales con `.optional()` se descarta: C2-final exige DEJAN de existir, no opcionalidad.
- **Eliminar de interfaz y seed**: quitar ambos de `ConfiguracionGlobal` interface y `configuracionDefault` en `data/admin/configuracion.ts`. Rationale: fuente única de seed sin secretos; el seed no debe sembrar `""` para secretos que no existen.
- **STORE_VERSION 25→26**: bump en `lib/store.ts:300`. Migrate `if ((version ?? 0) < 26)` hace `if (result.configuracion && typeof === 'object') { delete (result.configuracion as any).smtpPassword; delete (result.configuracion as any).claveEliminacionMaestro }`. Patrón idéntico a v8 limpieza legacy, sin `mergeById` ni re-sembrar. Preserva todo lo demás. Alternativa de no bump se descarta porque VAL-007 exige bump + test por cambio de esquema.
- **partialize simplificado**: cambiar de `configuracion: state.configuracion ? { ...state.configuracion, smtpPassword: "", claveEliminacionMaestro: "" } : ...` a `configuracion: state.configuracion`. Comentario actualizado a "C2-final: secretos gestionados por el servidor (SMTP_PASSWORD / CLAVE_ELIMINACION_MAESTRO) — no persisten en cliente". Alternativa de mantener partialize vaciando se descarta porque campos no existen y el mapeo quedaría muerto.
- **UI**: en `app/admin/configuracion/page.tsx` reemplazar los dos `<Input type="password">` por `<p className="text-xs text-muted-foreground">Gestionado por el servidor (variable de entorno SMTP_PASSWORD / CLAVE_ELIMINACION_MAESTRO)</p>` dentro de `CardContent`, manteniendo layout. `handleSave` deja de enviar `smtpPassword`/`claveEliminacionMaestro` (ya no están en `config`). No se añade lógica server.
- **.env.example**: añadir bloque:
  ```
  # C2-final: secretos SMTP/maestro solo servidor (no cliente)
  SMTP_PASSWORD=
  CLAVE_ELIMINACION_MAESTRO=
  ```
  con comentario explicando uso futuro server-side. Mantener `DATABASE_URL` y `AUTH_SECRET` existentes.
- **Test regresión**: nuevo archivo `test/store-secretos-migracion.test.ts` o ampliación de `store-migracion-seed.test.ts` que construye `persisted v25` con `configuracion` conteniendo `smtpPassword: "secreto"` y `claveEliminacionMaestro: "clave123"` más campos normales, invoca `migrate` (importado via `useCompassStore.persist.getOptions().migrate` o función extraída) y aserta que resultado v26 no tiene esas keys y preserva `nombreComunidad` etc. Alternativa de test manual sin migrate se descarta; debe usar migrate real.

## Risks / Trade-offs
- [Persistido v25 con secretos en localStorage del usuario real] → Mitigación: migrate v26 los borra idempotentemente; si usuario no recarga, partialize viejo aún vaciaba, así que no hay leakage nuevo.
- [UI sin inputs rompe test E2E que espera inputs] → Mitigación: ningún test actual busca `smtpPassword` input por label; verificar con `grep` y actualizar si existe.
- [Bump a 26 y otros cambios futuros en P3 requieren 27] → Mitigación: P3 solo tiene este bump; el siguiente cambio (mp-aviso-duplicados) no toca STORE_VERSION, solo UI Store leitura.
- [Seed sin secretos puede fallar validación si código aún espera campos] → Mitigación: `saveConfiguracion` valida contra schema sin esos campos, así que payloads viejos con campos extra serán stripped por Zod (no falla) o migrate ya los limpió.

## Migration Plan
1. Quitar campos de `lib/schemas.ts` y `data/admin/configuracion.ts`.
2. Bump `STORE_VERSION` a 26, añadir migrate limpieza, simplificar `partialize`.
3. Actualizar `app/admin/configuracion/page.tsx` a informativo.
4. Documentar `.env.example`.
5. Añadir test regresión v25.
6. Validar `npx tsc --noEmit`, `npm run lint`, `npm test -- --run`, `openspec validate --all`.
7. Commit feat, sync, archive.

## Open Questions
- Ninguna bloqueante. El owner definirá en P5/P6 cómo el servidor lee `SMTP_PASSWORD` / `CLAVE_ELIMINACION_MAESTRO` (ej. `process.env` en route handler).
