# Auditoría - Validación (Zod) - Capa de Datos Persistente

**Fecha:** 2026-08-23
**Especificación de referencia:** `Data/NSGC/docs/especificaciones/ST - Capa de Datos Persistente.md`
**Skill aplicada:** `.agents/skills/zod/` (safeParse, mensajes custom, enums, `z.infer`, validación en boundaries)

## 1. Alcance

- `k0mp4ss_fe/apps/web/lib/store.ts` — acciones CRUD del store global (Zustand + persist v8).
- `k0mp4ss_fe/apps/web/lib/schemas.ts` — **nuevo**: esquemas Zod de las entidades y tipos derivados con `z.infer`.
- Formularios y páginas que consumen las acciones: TU (`inventario/tipos`), EF (`inventario/estructura`, `formulario-unidad`), MP (`comunidad/personas`, `formulario-persona`), VU (`formulario-vinculo`, `personas/[id]`), MA (`admin/maestros`), CF (`admin/configuracion`).
- QA Lab (`app/admin/qa-lab`) — fixtures de siembra sintética.
- Tests de store (`test/*.test.ts`) usados como verificación de regresión.

## 2. Hallazgos

| ID | Severidad | Ubicación | Descripción | Estado |
|---|---|---|---|---|
| VAL-001 | 🔴 Alta | `lib/store.ts` (todas las `save*`) | Las acciones de escritura persistían cualquier objeto sin validar esquema (campos faltantes, tipos incorrectos, fechas malformadas) → corrupción silenciosa de localStorage. | ✅ |
| VAL-002 | 🟡 Media | `lib/store.ts` / formularios | `saveTipoUnidad`, `saveMacroSector`, `saveMicroSector`, `saveUnidad`, `savePersona`, `saveMaestro` y `saveConfiguracion` retornaban `void`: un fallo de validación era invisible para el usuario. Solo `saveVinculo` exponía `StoreResult`. | ✅ |
| VAL-003 | 🟡 Media | `app/admin/qa-lab/page.tsx` | Fixtures de siembra con campos inexistentes o incompletos (`montoBaseGC` vs `montoBaseGc`, `nombre/apellido/telefono/fotoUrl` en vez de `nombres/apellidos/telefonoMovil`, unidades sin `servicios`, vínculos sin `permiteVerFinanzas`, tipo sin `historialTarifas`). Con el store validado, estos pasos habrían fallado. | ✅ |
| VAL-004 | 🟢 Baja | `test/store-eliminaciones.test.ts:184` | Errores de TypeScript preexistentes (`banco` possibly undefined) que rompían `npm run typecheck`. | ✅ |
| VAL-005 | ℹ️ Info | `lib/schemas.ts` (PersonaSchema.rut) | El RUT se valida solo como string no vacío ("RUT o Pasaporte"); no se verifica dígito verificador ni formato chileno. | ⏳ |
| VAL-006 | ℹ️ Info | `lib/store.ts` (`migrate`/rehydrate) | La validación Zod aplica a las **acciones**, no a la rehidratación: datos legacy corruptos en localStorage seguirían cargándose sin `safeParse` sobre el estado persistido. | ⏳ |
| VAL-007 | ℹ️ Info | `lib/store.ts` (`upsert`) | `upsert` reemplaza por `id` sin regla de unicidad de nombres en TU/EF/MP (MA ya la valida a nivel de página). Un mismo nombre puede repetirse entre entidades distintas. | ⏳ |

## 3. Acciones aplicadas en esta sesión

> **Adenda 2026-08-24 (sesión Fase B/C):**
> - **VAL-005 resuelto:** `lib/rut.ts` valida RUT chileno módulo 11 y pasaporte explícito; integrado como `DocumentoIdentidadSchema` en `PersonaSchema.rut`, `rutCondominio` y `rutAdministrador`. 50 RUTs del seed + 2 de CF corregidos (DV ficticio). Migración **STORE_VERSION v10** (`repararRut`) repara DVs históricos antes del saneo, evitando pérdida de la colección personas. Tests: `test/rut.test.ts`, `test/rut-migracion.test.ts`.
> - **C5:** umbrales de cobertura en `vitest.config.ts` (stmts ≥90, branches ≥75, funcs ≥85, lines ≥90).

### 3a. Nuevo módulo `lib/schemas.ts`
- Esquemas Zod para todas las entidades del dominio, con tipos derivados vía `z.infer` y exportados como contratos únicos:
  - **Inventario:** `TarifaHistoricaSchema`, `TipoUnidadSchema`, `MacroSectorSchema`, `MicroSectorSchema`, `UnidadSchema` (+ `ServiciosUnidadSchema`, con `servicios` opcional que defaultea a `{}` para tolerar datos legacy).
  - **Comunidad:** `PersonaSchema` (+ extensiones laboral y gobernanza), `VinculoUnidadSchema` (roles como enum, fechas AAAA-MM-DD, `permiteVerFinanzas` requerido).
  - **Maestros (MA):** los 16 collections (`afps`…`estadosInmobiliarios`) con `MAESTRO_SCHEMAS` como mapa tipado + helper `validarMaestro()`.
  - **Configuración (CF):** `ConfiguracionGlobalSchema` con rangos operativos (día de corte 1–31, puerto SMTP 1–65535, etc.).
  - **Auditoría interna:** `EventoAuditoriaSchema`.
- Utilidades `validarConEsquema()` (safeParse, genérica sobre output) y `formatoErrorZod()` que agrega hasta 3 issues con su `path` en español (`"Datos inválidos: campo: mensaje"`).

### 3b. Integración en el store (`lib/store.ts`)
- Todas las `save*` retornan ahora `StoreResult` y validan con Zod **antes** de mutar; los guardas de hidratación y las reglas de integridad al eliminar (spec §3) quedaron intactos.
- `saveVinculo` valida esquema primero y conserva íntegras las reglas de negocio de la spec §3b: persona existente, persona inactiva, vínculo duplicado activo, cierre automático de tramo anterior, exclusividad titularidad/arriendo y anti-autosolapamiento.
- Persistencia v8 respetada: `name: "compass-store"`, `version: STORE_VERSION = 8`, `partialize`, `migrate` (v2…v8) y `skipHydration` sin cambios.

### 3c. Visibilidad de errores sin cambiar UX
Se reutiliza el patrón visual ya existente en `formulario-vinculo` (caja `bg-destructive/10 … text-destructive`):
- `formulario-vinculo.tsx`: ya consumía `StoreResult`; ahora también muestra fallos de esquema (sin cambios estructurales).
- `formulario-persona.tsx` + `personas/page.tsx`: `onSave` pasa a retornar `StoreResult`; caja de error global dentro del formulario; el modal solo se cierra si `ok`.
- `inventario/tipos/page.tsx`: estado `errorGuardado` renderizado dentro del diálogo; el diálogo permanece abierto ante rechazo.
- `inventario/estructura/page.tsx` + `formulario-unidad.tsx`: misma caja en los diálogos de macro/micro/unidad; `onSave` propaga `StoreResult` y el formulario no se descarta ante error.
- `admin/maestros/page.tsx`: los rechazos del store se muestran en el elemento `duplicateError` ya existente (cero UI nueva).
- `admin/configuracion/page.tsx`: ante rechazo se alerta con el mensaje del store (patrón `alert` ya usado por la página).

### 3d. Otros
- `package.json` (web): dependencia directa `zod: ^3.25.76` (antes solo transitiva).
- QA Lab: fixtures normalizados a contratos válidos (VAL-003).

## 4. Cobertura por entidad

| Módulo | Entidad / colección | Esquema | Validada en acción |
|---|---|---|---|
| TU | Tipos de unidad + tarifas | `TipoUnidadSchema` / `TarifaHistoricaSchema` | `saveTipoUnidad` |
| EF | Macro sectores | `MacroSectorSchema` | `saveMacroSector` |
| EF | Micro sectores | `MicroSectorSchema` | `saveMicroSector` |
| EF | Unidades físicas (incluye u-E-*) | `UnidadSchema` | `saveUnidad` |
| MP | Personas (+ extensiones) | `PersonaSchema` | `savePersona` |
| VU | Vínculos de unidad | `VinculoUnidadSchema` + reglas §3b | `saveVinculo` |
| MA | 16 maestros (AFP…estados inmobiliarios) | `MAESTRO_SCHEMAS` | `saveMaestro` |
| MA | Integridad al eliminar maestros | reglas §3 | `removeMaestro` (sin cambios, testeada) |
| CF | Configuración global | `ConfiguracionGlobalSchema` | `saveConfiguracion` |
| — | Eventos de auditoría | `EventoAuditoriaSchema` (disponible) | generación interna (no expuesta a CRUD) |

## 5. Pendientes

| ID | Condición para abordarlo |
|---|---|
| VAL-005 | Al integrar backend/BD real: validar RUT chileno (módulo 11) o marcar explícitamente pasaporte como alternativa legítima. |
| VAL-006 | Al subir `STORE_VERSION` a v9 (o migrar a BD): aplicar `safeParse` por colección dentro de `migrate`/`onRehydrateStorage` para sanear estado persistido legacy. |
| VAL-007 | Si el negocio exige unicidad de nombres por módulo: `superRefine` en los esquemas de TU/EF/MP con acceso al estado previo. |

## 6. Verificación

| Comando | Resultado |
|---|---|
| `npm run typecheck` (apps/web) | ✅ Sin errores |
| `npm run lint` (apps/web) | ✅ 0 errores (60 warnings, todos preexistentes: `as any` heredados e imports sin uso) |
| `npx vitest run` (test/) | ✅ 34/34 tests pasan (eliminaciones 17, vínculos 9, migración/seed 8) — confirma que integridad §3, negocio §3b y persistencia v8 no cambiaron |
