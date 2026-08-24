# Consolidado de Auditorías — 2026-08-24

**Informes fuente:**

| Fecha | Tema | Informe |
|---|---|---|
| 2026-08-23 | Seguridad (OWASP Top 10 2021) | [auditoria - 2026-08-23 - seguridad.md](auditoria%20-%202026-08-23%20-%20seguridad.md) |
| 2026-08-23 | Validación (Zod) | [auditoria - 2026-08-23 - validacion.md](auditoria%20-%202026-08-23%20-%20validacion.md) |
| 2026-08-24 | Testing (Vitest) | [auditoria - 2026-08-24 - testing.md](auditoria%20-%202026-08-24%20-%20testing.md) |

Contexto del proyecto: Fase 0 — mock, monousuario, sin BD (`k0mp4ss_fe/apps/web`, Zustand + persist v8 sobre localStorage).

---

## 1. Matriz única de hallazgos

21 IDs únicos en 20 filas (VAL-006 y TST-002 fusionados: mismo subsistema, migración/rehidratación de datos legacy). Severidad y Estado tal cual constan en cada informe original; la prioridad de despliegue se añade en §2.

| IDs | Severidad | Estado | Informe | Ubicación principal | Descripción |
|---|---|---|---|---|---|
| SEC-001 | 🔴 Alta | ✅ | Seguridad | `app/api/backup/route.ts`, `app/api/dev-dashboard/route.ts` | APIs con acceso al filesystem activas por defecto en producción; mitigado con `lib/env-guard.ts` + `NEXT_PUBLIC_APP_ENV` (producción → 404). |
| SEC-002 | 🔴 Alta | ✅ | Seguridad | `lib/dev-dashboard.ts` (`toggleTask`) | Path traversal vía `changeId` sin validar; corregido con allowlist `/^[A-Za-z0-9][A-Za-z0-9._-]*$/` + check de directorio. |
| SEC-003 | 🟡 Media | ✅ | Seguridad | `POST /api/backup` | Sin límite de payload (disco lleno con una request); tope 10 MB en dos capas → `413`. |
| SEC-004 | 🟡 Media | ✅ | Seguridad | `catch` de ambos route handlers | Fuga de `error.message` interno al cliente; ahora mensajes fijos, detalle solo en servidor. |
| SEC-005 | 🟡 Media | ⏳ | Seguridad | `data/admin/configuracion.ts`; `lib/store.ts`; exports JSON | Secretos en claro en cliente (`smtpPassword`, `claveEliminacionMaestro`) en localStorage y dentro de cualquier export. Pendiente de mover a servidor (env/bóveda). |
| SEC-006 | 🟡 Media | ⏳ | Seguridad | `app/api/*`; `/admin/*` | Sin autenticación ni autorización. Tolerable en localhost monousuario; bloqueante para multiusuario/despliegue. |
| SEC-007 | 🟢 Baja | ✅ | Seguridad | `app/admin/configuracion/page.tsx` | `console.log` volcaba configuración con secretos; redactado con `***`. |
| SEC-008 | 🟢 Baja | ✅ | Seguridad | `next.config.mjs` | Sin headers de seguridad; añadidos globalmente (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS). |
| SEC-009 | ℹ️ Info | ✔️ | Seguridad | `lib/backup.ts`; `lib/dev-dashboard.ts` | Observación positiva: sanitización de `fileName` y allowlist de lectura sin bypass. Sin acción. |
| SEC-010 | ℹ️ Info | ⏳ | Seguridad | `next.config.mjs` | Sin CSP estricta (defensa en profundidad XSS). React mitiga, falta hardening con nonces/hashes. |
| VAL-001 | 🔴 Alta | ✅ | Validación | `lib/store.ts` (todas las `save*`) | Escrituras sin validar esquema → corrupción silenciosa de localStorage; ahora Zod `safeParse` antes de mutar. |
| VAL-002 | 🟡 Media | ✅ | Validación | `lib/store.ts` / formularios | Fallos de guardado invisibles (`void`); ahora todas las `save*` retornan `StoreResult` visible en UI. |
| VAL-003 | 🟡 Media | ✅ | Validación | `app/admin/qa-lab/page.tsx` | Fixtures con campos inexistentes/incompletos; normalizados a contratos válidos. |
| VAL-004 | 🟢 Baja | ✅ | Validación | `test/store-eliminaciones.test.ts` | Errores TS preexistentes rompían typecheck; corregidos. |
| VAL-005 | ℹ️ Info | ⏳ | Validación | `lib/schemas.ts` (PersonaSchema.rut) | RUT validado solo como string no vacío; sin dígito verificador (módulo 11) ni distinción de pasaporte. |
| VAL-006 + TST-002 | 🟡 Media (efectiva) | ⏳ | Validación + Testing | `lib/store.ts` (`migrate`/rehydrate) | **Fusionado.** Dos fallos del mismo subsistema de datos legacy: (a) VAL-006 — la validación Zod cubre acciones pero no la rehidratación; estado persistido corrupto carga sin `safeParse`. (b) TST-002 — bug lógico verificado: la rama `<8` reconstruye `unidades` con `mergeById` crudo y deshace la conversión `estado` → `estadoId` de la rama `<3`; filtros y `removeMaestro("estadosOcupacion")` rotos con stores ≤v6. |
| VAL-007 | ℹ️ Info | ⏳ | Validación | `lib/store.ts` (`upsert`) | Sin regla de unicidad de nombres en TU/EF/MP (MA sí valida a nivel de página). Requiere criterio de negocio. |
| TST-001 | 🟡 Media | ⏳ | Testing | `lib/store.ts` (`saveVinculo`) | Solo bloquea `estadoCuenta === "inactiva"`; personas con cuenta `"bloqueada"` (p-10, p-54 en seed) pueden vincularse sin restricción. Hueco de regla de negocio que ni esquemas ni tests actuales cubren. |
| TST-003 | 🟢 Baja | ⏳ | Testing | `lib/store.ts` | Sin cobertura: `saveMaestro`, ramas migrate `<2…<6`, autosolapamiento mismo rol, `VU_NEW_TENANT`, `VU_DELETE` histórico. Impide refactorizar con red de seguridad. |
| TST-004 | ℹ️ Info | Observación | Testing | `vitest.config.ts` (provider v8) | Artefacto de atribución de cobertura en suites multi-archivo; afecta el % reportado, no la calidad real. Sin acción (valorar provider alternativo si molesta). |

Resumen: 12 resueltos (✅/✔️), 8 abiertos (⏳), 1 observación sin acción.

---

## 2. Priorización por riesgo y dependencia (qué bloquea qué)

```
D2 proveedor auth ──► SEC-006 (authN/authZ) ──► despliegue multiusuario
D3 multi-comunidad ──► modelo de autorización de SEC-006 (¿roles por comunidad?)
D1 ORM + backend/BD ──► SEC-005 (secretos a servidor) ──┐
TST-002 + VAL-006 (fix migrate v9 + safeParse) ────► primera carga de usuarios reales
TST-003 (cobertura store completa) ──► refactor seguro hacia BD (fase BD)
TST-001 (regla "bloqueada") ──► integridad de vínculos YA (barato, sin dependencias)
SEC-010 (CSP) + re-check SEC-001/002/003 ──► hardening final pre-deploy
VAL-005 (RUT) / VAL-007 (unicidad nombres) ──► decisiones D4/D5 del owner antes de BD
```

Orden crítico:

1. **TST-002 + VAL-006 es lo más urgente abierto**: cualquier usuario real con un store persistido ≤v7 corrompe sus unidades al migrar. No depende de nada técnico — solo de hacerlo.
2. **SEC-006** es el único bloqueante absoluto de Auth/deploy, pero está *bloqueado por decisiones del owner* (proveedor auth D2 y estrategia multi-comunidad D3, porque define el modelo de autorización).
3. **SEC-005** no puede resolverse bien hasta que exista backend/BD donde vivir los secretos (depende de D1); mientras tanto, norma operativa: tratar todo export JSON como sensible.
4. **TST-003** no bloquea funcionalidad pero sí la fase BD: migrar de localStorage a BD será un refactor grande y hoy hay huecos de cobertura justo en `saveMaestro` y ramas de migración.
5. Los resueltos (✅) solo requieren re-verificación puntual pre-deploy (los checks manuales con `curl` del informe de seguridad).

---

## 3. Roadmap por fases

### Fase A — Ahora (próxima sesión sobre store; sin dependencias)

| # | Qué | IDs |
|---|---|---|
| A1 | Fix migración: reaplicar `migrarEstadoUnidades` tras `mergeById` en rama `<8` + test de regresión con persistido v0/v7 real | TST-002 |
| A2 | Subir `STORE_VERSION` a **v9** y aplicar `safeParse` por colección en `migrate`/`onRehydrateStorage` (sanear legacy en la misma versión que arregla el bug) | VAL-006 |
| A3 | Bloquear cuentas `"bloqueada"` en `saveVinculo` + test (decidir semántica: bloqueo duro, ver D6) | TST-001 |
| A4 | Cobertura de `saveMaestro`, ramas migrate `<2…<6`, autosolapamiento, `VU_NEW_TENANT`, `VU_DELETE` histórico | TST-003 |
| A5 | Declarar `NEXT_PUBLIC_APP_ENV`/`APP_ENV` en `turbo.json` (silenciar warnings, patrón `COMPASS_ROOT`) | (seguridad, menor) |

A1+A2 van juntos a propósito: un solo bump de versión que corrige el bug y sanea los datos que ya pasaron por él.

### Fase B — Antes de Auth

| # | Qué | IDs |
|---|---|---|
| B1 | **Decidir D2 (proveedor auth) y D3 (multi-comunidad)** — prerrequisito de todo lo demás | Decisiones |
| B2 | Middleware de sesión + protección de `/admin/*` y de toda ruta API restante | SEC-006 |
| B3 | Autorización con roles (alcance condicionado por D3: ¿roles globales o por comunidad?) | SEC-006 |
| B4 | Cobertura de componentes/hooks con RTL + MSW (objetivo ≥80% comp., ≥85% hooks) antes de tocar formularios para login/UI de sesión | TST-003 (UI) |

### Fase C — Antes de BD

| # | Qué | IDs |
|---|---|---|
| C1 | **Decidir D1 (ORM) y ejecutar D3** (modelo de datos multi-comunidad) | Decisiones |
| C2 | Mover `smtpPassword` y `claveEliminacionMaestro` a variables de entorno/bóveda del backend; excluirlos de exports y de config cliente | SEC-005 |
| C3 | Validar RUT chileno módulo 11 o modelar pasaporte como alternativa explícita (según D4) | VAL-005 |
| C4 | Unicidad de nombres TU/EF/MP vía `superRefine` (solo si D5 lo aprueba) | VAL-007 |
| C5 | Umbrales mínimos de cobertura en `vitest.config.ts` con baseline estable | TST-003 |

### Fase D — Antes de deploy (producción)

| # | Qué | IDs |
|---|---|---|
| D-i | CSP estricta con nonces/hashes para scripts inline de Next.js + auditar orígenes de imágenes/fuentes | SEC-010 |
| D-ii | Revisar headers de SEC-008 contra el dominio definitivo (HSTS, etc.) | SEC-008 |
| D-iii | Re-ejecutar checks manuales: `413` en backup >10MB, `404` con `APP_ENV=production`, PATCH con `changeId: "../../etc"` → `404` | SEC-001/002/003 |
| D-iv | Auditoría OWASP completa de re-verificación → nuevo informe registrado en el índice | (todas SEC) |

---

## 4. Contradicciones entre informes y resolución

| # | Tensión detectada | Resolución y criterio |
|---|---|---|
| 1 | Validación (23-08) verifica "34/34 tests"; Testing (24-08) reporta "39/39" | **No es contradicción: cronología.** La cifra de validación era el estado al cierre de su sesión; la sesión de testing añadió 5 tests. Cifra oficial vigente: **39/39**, cobertura 81.20% stmts / 74.05% branches. |
| 2 | Validación declara "persistencia v8 respetada… `migrate` (v2…v8) sin cambios" y tests confirmando integridad; Testing prueba empíricamente (persistido v0) que la rama `<8` de `migrate` **rompe** la conversión `estado` → `estadoId` (TST-002) | **Prevalce TST-002.** La frase de validación es una declaración de alcance ("no modifiqué ese código en esta sesión"), no de corrección; su suite de entonces no ejercitaba el camino legacy ≤v6→v8 con datos reales. El consolidado trata TST-002 como bug abierto y lo prioriza en Fase A. |
| 3 | SEC-005 y SEC-006 figuran como 🟡 Media, pero este consolidado los trata como críticos de despliegue | **No es contradicción: contexto distinto.** Las severidades originales son correctas para Fase 0 (localhost, monousuario). Este documento añade la dimensión "bloqueante de fase destino" sin reescribir los informes. |
| 4 | Testing reconoce que la cobertura oficial (81.20%) sub-reporta la rama `<8` por artefacto del provider v8 (TST-004) | Coherente internamente; nota metodológica, sin acción. No invalida ningún hallazgo. |

Conclusión: **no hay contradicciones sustantivas entre hallazgos**; los cuatro puntos se resuelven por cronología, distinción alcance-vs-corrección y separación de dimensiones de riesgo.

---

## 5. Decisiones pendientes del owner

Estas elecciones bloquean fases completas; no hay respuesta técnica única sin criterio de producto.

### D1 — ORM / acceso a datos *(bloquea Fase C, SEC-005)*
| Opción | Pros | Contras |
|---|---|---|
| **Prisma** ✅ recomendado | Migraciones maduras, ecosistema enorme, tipado fuerte, curva amable para equipo pequeño | Runtime más pesado, menos control fino del SQL |
| Drizzle | Ligero, cercano a SQL, excelente sinergia con Zod (ya en el proyecto) | Menos baterías incluidas, migraciones más manuales |
| TypeORM / raw SQL | Control total / cero magia | Mantenimiento mayor; TypeORM con historial irregular |

*Recomendación:* **Prisma**, salvo que se anticipe hosting edge/serverless estricto, donde Drizzle gana.

### D2 — Proveedor de autenticación *(bloquea Fase B, SEC-006)*
| Opción | Pros | Contras |
|---|---|---|
| **Auth.js (NextAuth v5)** ✅ recomendado | Nativo de Next.js, self-host, gratis, flexible (credentials/OAuth) | Más configuración manual que un SaaS |
| Clerk | UI y sesión listas en horas | Coste por MAU, dependencia de tercero |
| Supabase Auth | Excelente si la BD termina siendo Supabase (acopla D1+D2) | Amarra el stack completo a un proveedor |
| Custom JWT/sesiones | Control total | Máximo esfuerzo y superficie de error (justo lo que SEC-006 advierte) |

*Recomendación:* **Auth.js**; reconsiderar Supabase Auth solo si D1 cae del lado de Supabase/Postgres gestionado.

### D3 — Estrategia multi-comunidad *(bloquea modelo de datos y autorización)*
| Opción | Pros | Contras |
|---|---|---|
| **Tenant compartido con `comunidadId` + scoping en repos** ✅ recomendado | Una sola BD/esquema, operaciones cruzadas simples (métricas globales), adecuado a decenas de comunidades | Exige disciplina: todo query con scope; riesgo de fuga si se olvida |
| Schema por comunidad (Postgres) | Aislamiento fuerte por tenant | Migraciones × N, conexión/directory management más complejo |
| BD por comunidad | Aislamiento total, borrado limpio | Coste operativo alto, reporting global doloroso |

*Recomendación:* **`comunidadId` compartido con guards centralizados** (el volumen típico de administración de comunidades no justifica isolation por schema/BD). Definir esto ANTES de diseñar la autorización de SEC-006.

### D4 — Identidad: RUT chileno (VAL-005)
| Opción | Implicación |
|---|---|
| **Módulo 11 + pasaporte como tipo explícito** ✅ recomendado | Integridad real de identidades chilenas sin excluir extranjeros |
| Solo RUT estricto | Simple, pero bloquea residentes con pasaporte |
| Dejar string libre (status quo) | Cero garantía; duplicados inevitables en BD |

### D5 — Unicidad de nombres en TU/EF/MP (VAL-007)
| Opción | Implicación |
|---|---|
| **Permitir repetidos + vista de duplicados** ✅ recomendado hoy | Flexible (dos "Depto 101" en edificios distintos es legítimo); avisar en UI en vez de bloquear |
| Único por módulo (`superRefine`) | Datos más limpios, pero puede chocar con realidad operativa |

*Criterio:* decidir con negocio; si luego hay BD, cambiar es barato con constraint opcional.

### D6 — Semántica de cuenta `"bloqueada"` en vínculos (TST-001)
| Opción | Implicación |
|---|---|
| **Bloqueo duro, sin excepciones** ✅ recomendado | Regla simple y auditable; coincide con la expectativa del seed (p-10, p-54) |
| Bloqueo con override de admin | Flexible pero exige trazabilidad extra (evento de auditoría por override) |

---

## 6. Nota de sesión

Consolidación documental exclusivamente; **sin cambios de código**. Próximo hito sugerido: Fase A (A1+A2 como un único cambio versionado a v9, luego A3–A5).
